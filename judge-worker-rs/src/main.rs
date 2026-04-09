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

/// Map ARM CPU implementer + part to a human-readable name.
fn lookup_arm_cpu_part(implementer: &str, part: &str) -> Option<&'static str> {
    // ARM Ltd (0x41) parts
    if implementer == "0x41" {
        return match part {
            "0xd03" => Some("Cortex-A53"),
            "0xd04" => Some("Cortex-A35"),
            "0xd05" => Some("Cortex-A55"),
            "0xd07" => Some("Cortex-A57"),
            "0xd08" => Some("Cortex-A72"),
            "0xd09" => Some("Cortex-A73"),
            "0xd0a" => Some("Cortex-A75"),
            "0xd0b" => Some("Cortex-A76"),
            "0xd0c" => Some("Neoverse-N1"),
            "0xd0d" => Some("Cortex-A77"),
            "0xd40" => Some("Neoverse-V1"),
            "0xd41" => Some("Cortex-A78"),
            "0xd44" => Some("Cortex-X1"),
            "0xd46" => Some("Cortex-A510"),
            "0xd47" => Some("Cortex-A710"),
            "0xd48" => Some("Cortex-X2"),
            "0xd49" => Some("Neoverse-N2"),
            "0xd4a" => Some("Neoverse-E1"),
            "0xd4f" => Some("Neoverse-V2"),
            "0xd80" => Some("Cortex-A520"),
            "0xd81" => Some("Cortex-A720"),
            "0xd82" => Some("Cortex-X3"),
            "0xd84" => Some("Neoverse-V3"),
            "0xd85" => Some("Cortex-X4"),
            _ => None,
        };
    }
    // Apple (0x61) parts
    if implementer == "0x61" {
        return match part {
            "0x022" => Some("Apple M1 Icestorm"),
            "0x023" => Some("Apple M1 Firestorm"),
            "0x024" => Some("Apple M1 Pro"),
            "0x028" => Some("Apple M2 Blizzard"),
            "0x029" => Some("Apple M2 Avalanche"),
            "0x032" => Some("Apple M3"),
            "0x036" => Some("Apple M4"),
            _ => None,
        };
    }
    None
}

/// Detect CPU model name from the system.
fn detect_cpu_model() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let mut model_name: Option<String> = None;
        let mut implementer: Option<String> = None;
        let mut part: Option<String> = None;

        if let Ok(contents) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in contents.lines() {
                // x86: "model name : ..."
                if let Some(value) = line.strip_prefix("model name") {
                    if let Some(name) = value.trim_start().strip_prefix(':') {
                        let name = name.trim();
                        if !name.is_empty() {
                            return Some(name.to_string());
                        }
                    }
                }
                // ARM64: "CPU implementer : 0x41"
                if implementer.is_none() {
                    if let Some(value) = line.strip_prefix("CPU implementer") {
                        if let Some(v) = value.trim_start().strip_prefix(':') {
                            implementer = Some(v.trim().to_string());
                        }
                    }
                }
                // ARM64: "CPU part : 0xd4f"
                if part.is_none() {
                    if let Some(value) = line.strip_prefix("CPU part") {
                        if let Some(v) = value.trim_start().strip_prefix(':') {
                            part = Some(v.trim().to_string());
                        }
                    }
                }
            }
        }

        // Try ARM part lookup
        if let (Some(imp), Some(prt)) = (&implementer, &part) {
            if let Some(name) = lookup_arm_cpu_part(imp, prt) {
                return Some(name.to_string());
            }
            model_name = Some(format!("ARM ({} / {})", imp, prt));
        }

        // Fallback to lscpu
        if model_name.is_none() {
            if let Ok(output) = std::process::Command::new("lscpu").output() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if let Some(rest) = line.strip_prefix("Model name:") {
                        let name = rest.trim();
                        if !name.is_empty() {
                            return Some(name.to_string());
                        }
                    }
                }
            }
        }

        model_name
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
    let (worker_id, worker_secret, heartbeat_interval): (Option<String>, Option<String>, std::time::Duration) =
        match client.register(&worker_hostname, concurrency, cpu_model.as_deref(), cpu_architecture.as_deref()).await {
            Ok(resp) => {
                tracing::info!(
                    worker_id = %resp.data.worker_id,
                    heartbeat_interval_ms = resp.data.heartbeat_interval_ms,
                    "Registered with app server"
                );
                (
                    Some(resp.data.worker_id),
                    resp.data.worker_secret,
                    std::time::Duration::from_millis(resp.data.heartbeat_interval_ms.max(1_000)),
                )
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Failed to register with app server — running without registration"
                );
                (None, None, std::time::Duration::from_secs(30))
            }
        };

    // Spawn heartbeat task if registered
    let heartbeat_handle = if let Some(ref wid) = worker_id {
        let client = Arc::clone(&client);
        let wid = wid.clone();
        let wsecret = worker_secret.clone();
        let active_tasks = Arc::clone(&active_tasks);
        let heartbeat_interval = heartbeat_interval;
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
                    _ = tokio::time::sleep(heartbeat_interval) => {}
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
    let cleanup_interval = std::time::Duration::from_secs(300);
    let mut last_cleanup_at = std::time::Instant::now();

    loop {
        // Reap completed tasks to avoid unbounded handle accumulation
        task_handles.retain(|h| !h.is_finished());

        if last_cleanup_at.elapsed() >= cleanup_interval {
            docker::cleanup_orphaned_containers().await;
            last_cleanup_at = std::time::Instant::now();
        }

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
