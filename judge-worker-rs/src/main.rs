mod api;
mod comparator;
mod config;
mod docker;
mod executor;
mod languages;
mod types;

use api::ApiClient;
use config::Config;

#[tokio::main]
async fn main() {
    // Initialize tracing with RUST_LOG env filter, default to "info"
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    // Parse config
    let config = match Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Configuration error: {e}");
            std::process::exit(1);
        }
    };

    // Verify seccomp profile exists if not disabled
    if !config.disable_custom_seccomp && !config.seccomp_profile_path.exists() {
        tracing::error!(
            "Run-phase seccomp profile is missing at {}. Execution will fail closed.",
            config.seccomp_profile_path.display()
        );
    }

    let client = ApiClient::new(config.poll_url.clone(), config.auth_token.clone());

    tracing::info!("Judge worker started");
    tracing::info!(
        "Polling {} every {}ms",
        config.poll_url,
        config.poll_interval.as_millis()
    );

    // Graceful shutdown via SIGTERM/SIGINT
    let shutdown = async {
        let mut sigterm =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("failed to register SIGTERM handler");
        let sigint = tokio::signal::ctrl_c();
        tokio::select! {
            _ = sigterm.recv() => tracing::info!("Received SIGTERM"),
            _ = sigint => tracing::info!("Received SIGINT"),
        }
    };

    tokio::pin!(shutdown);

    let mut cleanup_counter = 0;
    const CLEANUP_INTERVAL: usize = 100;

    loop {
        // Check for shutdown or poll for work
        tokio::select! {
            _ = &mut shutdown => {
                tracing::info!("Shutting down gracefully");
                break;
            }
            result = client.poll() => {
                match result {
                    Ok(Some(submission)) => {
                        tracing::info!("Processing submission {}", submission.id);
                        executor::execute(&client, &config, submission).await;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        tracing::error!("Poll failed: {e}");
                    }
                }
            }
        }

        // Periodic cleanup of orphaned containers
        cleanup_counter += 1;
        if cleanup_counter >= CLEANUP_INTERVAL {
            docker::cleanup_orphaned_containers().await;
            cleanup_counter = 0;
        }

        // Sleep before next poll, but still respect shutdown
        tokio::select! {
            _ = &mut shutdown => {
                tracing::info!("Shutting down gracefully");
                break;
            }
            _ = tokio::time::sleep(config.poll_interval) => {}
        }
    }
}
