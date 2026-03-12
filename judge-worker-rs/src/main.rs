mod api;
mod comparator;
mod config;
mod docker;
mod executor;
mod languages;
mod types;

use api::ApiClient;
use config::Config;
use std::sync::Arc;
use tokio::sync::Semaphore;

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

    let concurrency = config.judge_concurrency;
    let client = Arc::new(match ApiClient::new(
        config.claim_url.clone(),
        config.report_url.clone(),
        config.auth_token.clone(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to create API client: {e}");
            std::process::exit(1);
        }
    });
    let config = Arc::new(config);
    let semaphore = Arc::new(Semaphore::new(concurrency));

    tracing::info!("Judge worker started (concurrency={})", concurrency);
    tracing::info!(
        "Claim URL: {}, Report URL: {}, interval: {}ms",
        config.claim_url,
        config.report_url,
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

    let mut task_handles: Vec<tokio::task::JoinHandle<()>> = Vec::new();
    let mut cleanup_counter: usize = 0;
    const CLEANUP_INTERVAL: usize = 100;

    loop {
        // Reap completed tasks to avoid unbounded handle accumulation
        task_handles.retain(|h| !h.is_finished());

        // Wait for a semaphore permit before polling for work.
        // This ensures we only claim jobs we can actually process.
        let permit = tokio::select! {
            _ = &mut shutdown => {
                tracing::info!("Shutdown signal received, stopping polling");
                break;
            }
            permit = semaphore.clone().acquire_owned() => {
                match permit {
                    Ok(p) => p,
                    Err(_) => {
                        tracing::error!("Semaphore closed unexpectedly");
                        break;
                    }
                }
            }
        };

        // Poll for work (with shutdown check)
        let submission = tokio::select! {
            _ = &mut shutdown => {
                tracing::info!("Shutdown signal received, stopping polling");
                // Drop the permit so it doesn't stay acquired
                drop(permit);
                break;
            }
            result = client.poll() => {
                match result {
                    Ok(Some(submission)) => Some(submission),
                    Ok(None) => None,
                    Err(e) => {
                        tracing::error!("Poll failed: {e}");
                        None
                    }
                }
            }
        };

        match submission {
            Some(submission) => {
                tracing::info!("Processing submission {}", submission.id);
                let client = Arc::clone(&client);
                let config = Arc::clone(&config);

                let handle = tokio::task::spawn(async move {
                    // The permit is moved into this task and dropped when done,
                    // releasing the semaphore slot for a new job.
                    let _permit = permit;
                    executor::execute(&client, &config, submission).await;
                });
                task_handles.push(handle);
            }
            None => {
                // No work available — release the permit and sleep before next poll
                drop(permit);

                // Periodic cleanup of orphaned containers
                cleanup_counter += 1;
                if cleanup_counter >= CLEANUP_INTERVAL {
                    docker::cleanup_orphaned_containers().await;
                    cleanup_counter = 0;
                }

                // Sleep before next poll, but still respect shutdown
                tokio::select! {
                    _ = &mut shutdown => {
                        tracing::info!("Shutdown signal received, stopping polling");
                        break;
                    }
                    _ = tokio::time::sleep(config.poll_interval) => {}
                }
            }
        }
    }

    // Graceful shutdown: await all in-flight tasks
    let in_flight = task_handles.len();
    if in_flight > 0 {
        tracing::info!(
            "Waiting for {} in-flight submission(s) to complete...",
            in_flight
        );
        for handle in task_handles {
            if let Err(e) = handle.await {
                tracing::error!("Task panicked during shutdown: {e}");
            }
        }
        tracing::info!("All in-flight submissions completed");
    }

    tracing::info!("Judge worker shut down gracefully");
}
