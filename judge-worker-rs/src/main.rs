mod api;
mod comparator;
mod config;
mod docker;
mod executor;
mod languages;
mod runner;
mod types;

use api::ApiClient;
use config::Config;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Detect CPU model name from the system.
fn detect_cpu_model() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(contents) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in contents.lines() {
                if let Some(value) = line.strip_prefix("model name") {
                    if let Some(name) = value.trim_start().strip_prefix(':') {
                        let name = name.trim();
                        if !name.is_empty() {
                            return Some(name.to_string());
                        }
                    }
                }
            }
        }
        None
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .ok()
            .and_then(|o| {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            })
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        None
    }
}

/// Detect CPU architecture (e.g. "x86_64", "aarch64").
fn detect_architecture() -> Option<String> {
    let arch = std::env::consts::ARCH;
    if arch.is_empty() { None } else { Some(arch.to_string()) }
}

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
            tracing::error!(error = %e, "Configuration error");
            std::process::exit(1);
        }
    };

    // Verify seccomp profile exists if not disabled
    if !config.disable_custom_seccomp && !config.seccomp_profile_path.exists() {
        tracing::error!(
            path = %config.seccomp_profile_path.display(),
            "Run-phase seccomp profile is missing. Execution will fail closed."
        );
    }

    let concurrency = config.judge_concurrency;
    let client = Arc::new(match ApiClient::new(
        config.claim_url.clone(),
        config.report_url.clone(),
        config.register_url.clone(),
        config.heartbeat_url.clone(),
        config.deregister_url.clone(),
        config.auth_token.clone(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "Failed to create API client");
            std::process::exit(1);
        }
    });

    let worker_hostname = config.worker_hostname.clone();
    let config = Arc::new(config);
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let active_tasks = Arc::new(AtomicUsize::new(0));
    let start_time = std::time::Instant::now();

    tracing::info!(concurrency = concurrency, "Judge worker started");
    tracing::info!(
        claim_url = %config.claim_url,
        report_url = %config.report_url,
        poll_interval_ms = config.poll_interval.as_millis() as u64,
        hostname = %worker_hostname,
        "Worker configuration"
    );

    // Detect CPU info for registration
    let cpu_model = detect_cpu_model();
    let cpu_architecture = detect_architecture();

    // Register with the app server
    let (worker_id, worker_secret): (Option<String>, Option<String>) =
        match client.register(&worker_hostname, concurrency, cpu_model.as_deref(), cpu_architecture.as_deref()).await {
            Ok(resp) => {
                tracing::info!(
                    worker_id = %resp.data.worker_id,
                    heartbeat_interval_ms = resp.data.heartbeat_interval_ms,
                    "Registered with app server"
                );
                (Some(resp.data.worker_id), resp.data.worker_secret)
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Failed to register with app server — running without registration"
                );
                (None, None)
            }
        };

    // Spawn heartbeat task if registered
    let heartbeat_handle = if let Some(ref wid) = worker_id {
        let client = Arc::clone(&client);
        let wid = wid.clone();
        let wsecret = worker_secret.clone();
        let active_tasks = Arc::clone(&active_tasks);
        let heartbeat_cancel = tokio_util::sync::CancellationToken::new();
        let heartbeat_cancel_clone = heartbeat_cancel.clone();

        let handle = tokio::spawn(async move {
            let mut consecutive_failures: u32 = 0;
            loop {
                tokio::select! {
                    _ = heartbeat_cancel_clone.cancelled() => {
                        tracing::debug!("Heartbeat task cancelled");
                        break;
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {}
                }

                let current_active = active_tasks.load(Ordering::Relaxed);
                let available = concurrency.saturating_sub(current_active);
                let uptime = start_time.elapsed().as_secs();

                match client.heartbeat(&wid, wsecret.as_deref(), current_active, available, uptime).await {
                    Ok(()) => {
                        if consecutive_failures > 0 {
                            tracing::info!("Heartbeat recovered after {} failures", consecutive_failures);
                        }
                        consecutive_failures = 0;
                    }
                    Err(e) => {
                        consecutive_failures += 1;
                        if consecutive_failures >= 3 {
                            tracing::warn!(
                                error = %e,
                                consecutive_failures,
                                "Heartbeat failing repeatedly — server may mark this worker as stale"
                            );
                        } else {
                            tracing::debug!(error = %e, "Heartbeat failed");
                        }
                    }
                }
            }
        });

        Some((handle, heartbeat_cancel))
    } else {
        None
    };

    // Start runner HTTP server if enabled
    let runner_handle = if config.runner_enabled {
        let runner_state = Arc::new(runner::RunnerState {
            config: Arc::clone(&config),
            semaphore: Arc::new(Semaphore::new(config.runner_concurrency)),
        });
        let app = runner::create_router(runner_state);
        let addr = format!("{}:{}", config.runner_host, config.runner_port);
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!(error = %e, addr = %addr, "Failed to bind runner HTTP server");
                std::process::exit(1);
            }
        };
        tracing::info!(
            addr = %addr,
            concurrency = config.runner_concurrency,
            "Runner HTTP server started"
        );
        Some(tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                tracing::error!(error = %e, "Runner HTTP server error");
            }
        }))
    } else {
        tracing::info!("Runner HTTP server disabled");
        None
    };

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
            result = client.poll(worker_id.as_deref()) => {
                match result {
                    Ok(Some(submission)) => Some(submission),
                    Ok(None) => None,
                    Err(e) => {
                        tracing::error!(error = %e, "Poll failed");
                        None
                    }
                }
            }
        };

        match submission {
            Some(submission) => {
                tracing::info!(submission_id = %submission.id, "Processing submission");
                let client = Arc::clone(&client);
                let config = Arc::clone(&config);
                let active_tasks = Arc::clone(&active_tasks);

                active_tasks.fetch_add(1, Ordering::Relaxed);

                let handle = tokio::task::spawn(async move {
                    // The permit is moved into this task and dropped when done,
                    // releasing the semaphore slot for a new job.
                    let _permit = permit;
                    executor::execute(&client, &config, submission).await;
                    active_tasks.fetch_sub(1, Ordering::Relaxed);
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

    // Cancel heartbeat task
    if let Some((handle, cancel)) = heartbeat_handle {
        cancel.cancel();
        let _ = handle.await;
    }

    // Graceful shutdown: await all in-flight tasks
    let in_flight = task_handles.len();
    if in_flight > 0 {
        tracing::info!(in_flight = in_flight, "Waiting for in-flight submissions to complete");
        for handle in task_handles {
            if let Err(e) = handle.await {
                tracing::error!(error = %e, "Task panicked during shutdown");
            }
        }
        tracing::info!("All in-flight submissions completed");
    }

    // Deregister from the app server
    if let Some(ref wid) = worker_id {
        if let Err(e) = client.deregister(wid, worker_secret.as_deref()).await {
            tracing::warn!(error = %e, "Failed to deregister — server will mark as stale");
        } else {
            tracing::info!("Deregistered from app server");
        }
    }

    // Abort runner HTTP server
    if let Some(handle) = runner_handle {
        handle.abort();
        tracing::info!("Runner HTTP server stopped");
    }

    tracing::info!("Judge worker shut down gracefully");
}
