mod api;
mod comparator;
mod config;
mod docker;
mod executor;
mod languages;
mod pool;
mod runner;
mod types;
mod validation;
mod workspace;

use api::ApiClient;
use config::Config;
use futures_util::FutureExt;
use std::any::Any;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::Semaphore;

/// RAII guard for the `active_tasks` heartbeat counter. Increments on
/// construction and decrements on drop, so the count is released on ANY exit
/// from the submission task — normal completion, executor panic, and even a
/// panic inside the panic-recovery branch itself (a trailing `fetch_sub`
/// statement would be skipped by that second unwind, permanently over-counting
/// and starving the worker of routed work).
struct ActiveTaskGuard(Arc<AtomicUsize>);

impl ActiveTaskGuard {
    fn new(counter: Arc<AtomicUsize>) -> Self {
        counter.fetch_add(1, Ordering::Relaxed);
        Self(counter)
    }
}

impl Drop for ActiveTaskGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Best-effort string rendering of a panic payload caught by `catch_unwind`.
/// Used by the executor spawn body's panic recovery (AGG-15 / C3-AGG-9) and
/// unit-tested independently of the network report path.
fn panic_payload_message(payload: Box<dyn Any + Send>) -> String {
    payload
        .downcast_ref::<String>()
        .map(|s| s.as_str())
        .or_else(|| payload.downcast_ref::<&'static str>().copied())
        .unwrap_or("<non-string panic>")
        .to_owned()
}

/// Map ARM CPU implementer + part to a human-readable name.
#[cfg(target_os = "linux")]
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
    if arch.is_empty() {
        None
    } else {
        Some(arch.to_string())
    }
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("JudgeKit judge worker");
        println!();
        println!("Runs the JudgeKit worker loop using configuration from environment variables.");
        println!("Use --version to print the package version.");
        return;
    }
    if args.iter().any(|arg| arg == "--version" || arg == "-V") {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return;
    }

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

    // Verify seccomp profile exists if not disabled. This must be FATAL, not
    // a warning: with the profile missing, every judgement fails closed with
    // a runtime_error while /health (which only reflects the docker
    // capability probe) stays green — the worker would silently claim and
    // fail the whole queue. Mirror the docker-capability probe's exit(1).
    if !config.disable_custom_seccomp && !config.seccomp_profile_path.exists() {
        tracing::error!(
            path = %config.seccomp_profile_path.display(),
            "Run-phase seccomp profile is missing. Refusing to start: every \
             judgement would fail closed while the healthcheck stays green. \
             Mount the profile or set JUDGE_DISABLE_CUSTOM_SECCOMP explicitly."
        );
        std::process::exit(1);
    }

    let concurrency = config.judge_concurrency;
    let client = Arc::new(
        match ApiClient::new(
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
        },
    );

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

    // Warm container pool. Created before registration so the poll loop, the
    // heartbeat task and shutdown all share one instance. The sandbox settings
    // are threaded from Config so a warm container can never resolve a weaker
    // seccomp posture than the run-phase container it stands in for.
    let warm_pool = pool::PoolManager::new(
        config.warm_pool_disabled,
        docker::WarmContainerSettings {
            seccomp_profile_path: config.seccomp_profile_path.clone(),
            disable_custom_seccomp: config.disable_custom_seccomp,
        },
    );

    // Detect CPU info for registration
    let cpu_model = detect_cpu_model();
    let cpu_architecture = detect_architecture();

    // Register with the app server
    let (worker_id, worker_secret, heartbeat_interval, warm_pool_targets): (
        Option<String>,
        Option<String>,
        std::time::Duration,
        types::WarmPoolTargets,
    ) = match client
        .register(
            &worker_hostname,
            concurrency,
            cpu_model.as_deref(),
            cpu_architecture.as_deref(),
        )
        .await
    {
        Ok(resp) => {
            tracing::info!(
                worker_id = %resp.data.worker_id,
                heartbeat_interval_ms = resp.data.heartbeat_interval_ms,
                "Registered with app server"
            );
            // Fire-and-forget: bring popular language images into the OS
            // page cache so the FIRST submission targeting each language
            // doesn't pay the cold-disk read cost on top of docker spawn.
            // Each prewarm is a one-shot `docker run --rm <image> true`
            // capped at 10 s; failures are logged and ignored so a missing
            // image (or a worker host that doesn't have the popular set
            // locally) doesn't block the main poll loop.
            if !config.prewarm_images.is_empty() {
                let images = config.prewarm_images.clone();
                tokio::spawn(async move {
                    for image in images {
                        let started = std::time::Instant::now();
                        let res = tokio::time::timeout(
                            std::time::Duration::from_secs(10),
                            tokio::process::Command::new("docker")
                                .args([
                                    "run",
                                    "--rm",
                                    "--cpus=0.5",
                                    "--memory=16m",
                                    "--security-opt=no-new-privileges",
                                    &image,
                                    "true",
                                ])
                                .output(),
                        )
                        .await;
                        match res {
                            Ok(Ok(output)) if output.status.success() => {
                                tracing::info!(
                                    image = %image,
                                    elapsed_ms = started.elapsed().as_millis() as u64,
                                    "Prewarmed language image"
                                );
                            }
                            Ok(Ok(output)) => {
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                tracing::warn!(
                                    image = %image,
                                    stderr = %stderr.trim(),
                                    "Prewarm dummy-run exited non-zero (image probably missing locally)"
                                );
                            }
                            Ok(Err(e)) => {
                                tracing::warn!(image = %image, error = %e, "Prewarm docker invocation failed");
                            }
                            Err(_) => {
                                tracing::warn!(image = %image, "Prewarm timed out after 10s");
                            }
                        }
                    }
                });
            }
            (
                Some(resp.data.worker_id),
                resp.data.worker_secret,
                std::time::Duration::from_millis(resp.data.heartbeat_interval_ms.max(1_000)),
                resp.data.warm_pool,
            )
        }
        Err(e) => {
            // Post C4-2, /claim requires a registered workerId + workerSecret
            // (the shared-token fallback was removed). An unregistered worker
            // can therefore never claim work: it would spin in the poll loop
            // forever, with every /claim rejected as `workerIdRequired` while
            // submissions pile up unjudged. A registration failure is now
            // ALWAYS fatal, regardless of JUDGE_ALLOW_UNREGISTERED_MODE. The
            // flag is still parsed (back-compat) but no longer enables a
            // broken silent-polling mode (C5-N1).
            if config.allow_unregistered_mode {
                tracing::error!(
                    error = %e,
                    "Failed to register with app server. JUDGE_ALLOW_UNREGISTERED_MODE is set, \
                     but unregistered mode is no longer functional: /claim requires a registered \
                     workerId + workerSecret (C4-2), so an unregistered worker can never claim \
                     work. Exiting. (Remove JUDGE_ALLOW_UNREGISTERED_MODE and ensure registration \
                     succeeds.)"
                );
            } else {
                tracing::error!(
                    error = %e,
                    "Failed to register with app server — exiting because unregistered mode is disabled"
                );
            }
            std::process::exit(1);
        }
    };

    // Seed the warm pool from the register response, then fill it in the
    // background so a slow `docker run` never delays polling. The handle lets
    // shutdown stop the fill instead of racing a half-finished reconcile.
    warm_pool.set_targets(warm_pool_targets).await;
    let warm_pool_seed = {
        let warm_pool = Arc::clone(&warm_pool);
        tokio::spawn(async move { warm_pool.reconcile().await })
    };

    // Spawn heartbeat task if registered
    let heartbeat_handle = if let Some(ref wid) = worker_id {
        let client = Arc::clone(&client);
        let wid = wid.clone();
        let wsecret = worker_secret.clone();
        let active_tasks = Arc::clone(&active_tasks);
        let hb_pool = Arc::clone(&warm_pool);
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

                match client
                    .heartbeat(&wid, wsecret.as_deref(), current_active, available, uptime)
                    .await
                {
                    Ok(targets) => {
                        if consecutive_failures > 0 {
                            tracing::info!(
                                "Heartbeat recovered after {} failures",
                                consecutive_failures
                            );
                        }
                        consecutive_failures = 0;
                        // The app server's targets are authoritative and can
                        // change at any time (including being switched off),
                        // so every heartbeat re-reconciles the live pool.
                        hb_pool.set_targets(targets).await;
                        hb_pool.reconcile().await;
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
        // SEC ops fix: probe the docker socket at boot. Catches a
        // misconfigured docker-socket-proxy (e.g. POST=0) before the
        // first submission lands and lets `docker compose up -d` fail
        // visibly instead of silently emitting compile_error for hours.
        let docker_capability_ok = Arc::new(std::sync::atomic::AtomicBool::new(false));
        match runner::probe_docker_capability().await {
            Ok(()) => {
                docker_capability_ok.store(true, std::sync::atomic::Ordering::Relaxed);
                tracing::info!("Docker capability probe passed at startup");
            }
            Err(err) => {
                tracing::error!(
                    error = %err,
                    "Docker capability probe failed at startup. The worker would \
                     emit compile_error on every submission. Refusing to start. \
                     Check docker-socket-proxy ACL (POST, DELETE, ALLOW_START)."
                );
                std::process::exit(1);
            }
        }

        // Periodic re-probe so a mid-life socket-proxy regression
        // surfaces on the /health endpoint within ~60s.
        let probe_flag = Arc::clone(&docker_capability_ok);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(60));
            ticker.tick().await; // skip immediate tick; startup already probed
            loop {
                ticker.tick().await;
                match runner::probe_docker_capability().await {
                    Ok(()) => {
                        if !probe_flag.swap(true, std::sync::atomic::Ordering::Relaxed) {
                            tracing::warn!("Docker capability probe recovered");
                        }
                    }
                    Err(err) => {
                        probe_flag.store(false, std::sync::atomic::Ordering::Relaxed);
                        tracing::error!(error = %err, "Docker capability probe failed");
                    }
                }
            }
        });

        let runner_state = Arc::new(runner::RunnerState {
            config: Arc::clone(&config),
            semaphore: Arc::new(Semaphore::new(config.runner_concurrency)),
            docker_capability_ok,
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
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
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

    // One-shot startup sweep: force-remove every leftover `oj-*` container
    // (any status). At startup there are no in-flight judgements, so this is
    // safe and reaps the `running` containers leaked by a forced restart
    // (deploy SIGTERM→SIGKILL, OOM-kill, host reboot) that the periodic
    // `status=exited` sweep cannot touch (R2 / feature-dev F2). Wrapped in the
    // shutdown select so a deploy SIGTERM during the (internally
    // timeout-bounded) sweep is honoured immediately instead of queued for up
    // to ~20 s (C5-N3 / debugger-N6).
    //
    // The shutdown arm returns from `main` outright, skipping the shutdown
    // sequence at the bottom of this function, so it has to tear the warm pool
    // down itself: the seed fill was spawned above and may already have started
    // containers that nothing else would ever destroy.
    tokio::select! {
        _ = &mut shutdown => {
            tracing::info!("Shutdown signal received during startup sweep, exiting");
            warm_pool_seed.abort();
            let _ = warm_pool_seed.await;
            warm_pool.drain_all().await;
            return;
        }
        _ = docker::cleanup_all_oj_containers_at_startup() => {}
    }

    // Exponential backoff for idle polling.
    // After consecutive empty polls the sleep doubles up to MAX_BACKOFF,
    // reducing CPU and network overhead when no submissions are queued.
    // Resets immediately when work is claimed.
    let mut consecutive_empty_polls: u32 = 0;
    const MAX_BACKOFF_MS: u64 = 3000;
    const BACKOFF_SHIFT_LIMIT: u32 = 5; // 2^5 = 32x base interval

    loop {
        // Reap completed tasks to avoid unbounded handle accumulation
        task_handles.retain(|h| !h.is_finished());

        // Periodic orphan sweep. The sweep is internally timeout-bounded and
        // also wrapped in a shutdown select so a wedged dockerd can neither
        // freeze polling nor block graceful shutdown (debugger N1).
        if last_cleanup_at.elapsed() >= cleanup_interval {
            tokio::select! {
                _ = &mut shutdown => {
                    tracing::info!("Shutdown signal received during cleanup sweep, stopping polling");
                    break;
                }
                _ = async {
                    docker::cleanup_orphaned_containers().await;
                    docker::cleanup_stale_running_containers().await;
                } => {}
            }
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
            result = client.poll(worker_id.as_deref(), worker_secret.as_deref()) => {
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
                consecutive_empty_polls = 0;
                tracing::info!(submission_id = %submission.id, "Processing submission");
                let client = Arc::clone(&client);
                let config = Arc::clone(&config);
                let worker_secret = worker_secret.clone();

                // Increment in the poll loop (before the task runs) so the
                // heartbeat never under-reports; the guard's Drop decrements
                // on any task exit, including nested panics.
                let task_guard = ActiveTaskGuard::new(Arc::clone(&active_tasks));

                let handle = tokio::task::spawn(async move {
                    // The permit is moved into this task and dropped when done,
                    // releasing the semaphore slot for a new job.
                    let _permit = permit;
                    let _task_guard = task_guard;
                    // Capture id + claim_token before moving `submission` into
                    // the executor future: if that future panics we need them
                    // to report a runtime_error verdict (AGG-15 / C3-AGG-9).
                    let submission_id = submission.id.clone();
                    let claim_token = submission.claim_token.clone();
                    let worker_secret_opt = worker_secret.as_deref();
                    let exec_fut =
                        executor::execute(&client, &config, submission, worker_secret_opt);
                    if let Err(panic_payload) =
                        std::panic::AssertUnwindSafe(exec_fut).catch_unwind().await
                    {
                        let panic_msg = panic_payload_message(panic_payload);
                        tracing::error!(
                            submission_id = %submission_id,
                            panic = %panic_msg,
                            "executor panicked; reporting runtime_error"
                        );
                        executor::report_panic(
                            &client,
                            &config,
                            &submission_id,
                            &claim_token,
                            &panic_msg,
                            worker_secret_opt,
                        )
                        .await;
                    }
                });
                task_handles.push(handle);
            }
            None => {
                // No work available — release the permit and sleep before next poll
                drop(permit);

                consecutive_empty_polls += 1;
                let sleep_duration = if consecutive_empty_polls <= 1 {
                    config.poll_interval
                } else {
                    let base_ms = (config.poll_interval.as_millis() as u64).max(1);
                    let multiplier = 1u64 << (consecutive_empty_polls - 1).min(BACKOFF_SHIFT_LIMIT);
                    let backoff_ms = base_ms.saturating_mul(multiplier).min(MAX_BACKOFF_MS);
                    std::time::Duration::from_millis(backoff_ms)
                };

                // Sleep before next poll, but still respect shutdown
                tokio::select! {
                    _ = &mut shutdown => {
                        tracing::info!("Shutdown signal received, stopping polling");
                        break;
                    }
                    _ = tokio::time::sleep(sleep_duration) => {}
                }
            }
        }
    }

    // Signal the heartbeat to stop, but do NOT await it yet: cancelling first
    // means the loop cannot start one more reconcile in the window below.
    let heartbeat_join = heartbeat_handle.map(|(handle, cancel)| {
        cancel.cancel();
        handle
    });

    // Stop the register-time seed fill BEFORE anything is awaited. The seed can
    // be many minutes deep in `docker run` calls against a slow daemon, and
    // everything after it (heartbeat join, in-flight tasks, `drain_all`) would
    // then run late or not at all — a SIGKILL landing before `drain_all` is
    // exactly the survive-shutdown leak this ordering exists to prevent.
    //
    // Aborting (rather than waiting the fill out) is safe because the pool
    // claims a container's name in its own state BEFORE issuing `docker run`,
    // and `drain_all` destroys those in-flight names too. An abort landing
    // mid-create can therefore not strand a container the process never
    // recorded. Awaiting the aborted handle returns as soon as the task
    // unwinds, so this await is bounded.
    warm_pool_seed.abort();
    let _ = warm_pool_seed.await;

    // Now join the heartbeat task. It is already cancelled, and a reconcile it
    // may still be inside is bounded by the per-call Docker timeouts — it can
    // no longer be queued behind the seed's single-flight guard.
    if let Some(handle) = heartbeat_join {
        let _ = handle.await;
    }

    // Graceful shutdown: await all in-flight tasks
    let in_flight = task_handles.len();
    if in_flight > 0 {
        tracing::info!(
            in_flight = in_flight,
            "Waiting for in-flight submissions to complete"
        );
        for handle in task_handles {
            if let Err(e) = handle.await {
                tracing::error!(error = %e, "Task panicked during shutdown");
            }
        }
        tracing::info!("All in-flight submissions completed");
    }

    // Destroy every idle warm container. Runs last of the pool steps: the seed
    // is aborted, the heartbeat task is gone and in-flight submissions have
    // finished, so nothing can refill the pool or still be holding a container
    // handed out by `acquire`. An idle container left behind would otherwise
    // hold memory until the next startup sweep.
    warm_pool.drain_all().await;

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::AssertUnwindSafe;

    /// A panicking executor future must be caught by `catch_unwind` and its
    /// payload rendered by `panic_payload_message`. This is the exact
    /// recovery mechanism the spawn body in `main` relies on so a panic
    /// reports a `runtime_error` verdict instead of wedging the slot
    /// (AGG-15 / C3-AGG-9).
    #[tokio::test]
    async fn catch_unwind_traps_executor_panic_and_renders_message() {
        let panicking = async {
            panic!("boom from executor");
        };
        let result = AssertUnwindSafe(panicking).catch_unwind().await;
        assert!(result.is_err(), "catch_unwind must trap the panic");
        let msg = panic_payload_message(result.unwrap_err());
        assert_eq!(msg, "boom from executor");
    }

    #[tokio::test]
    async fn catch_unwind_renders_string_panic_payload() {
        let panicking = async {
            panic!("{}", String::from("owned string panic"));
        };
        let result = AssertUnwindSafe(panicking).catch_unwind().await;
        let msg = panic_payload_message(result.unwrap_err());
        assert!(msg.contains("owned string panic"));
    }

    #[test]
    fn panic_payload_message_handles_non_string_payload() {
        // A non-string panic payload falls back to the placeholder rather than
        // panicking again inside the recovery path.
        let payload: Box<dyn Any + Send> = Box::new(42i32);
        assert_eq!(panic_payload_message(payload), "<non-string panic>");
    }

    /// C5-N1 regression guard: a registration failure must ALWAYS be fatal.
    /// Post-C4-2, /claim requires a registered workerId + workerSecret, so an
    /// unregistered worker can never claim work and would silently spin. The
    /// JUDGE_ALLOW_UNREGISTERED_MODE flag is still parsed (back-compat) but no
    /// longer enables a poll-forever mode. Reverting to the old silent-spin
    /// tuple shape flips this red.
    #[test]
    fn registration_failure_is_always_fatal_post_c4_2() {
        let src = include_str!("main.rs");
        // Locate the registration-failure handling by its unique flag check
        // (first occurrence is the production site, well before this test mod).
        let flag = src
            .find("config.allow_unregistered_mode")
            .expect("registration flag check present");
        let after_flag = &src[flag..];
        let exit = after_flag
            .find("std::process::exit(1)")
            .expect("fatal exit after registration flag check");
        // Both branches must fall through to exit: in the region between the
        // flag check and the fatal exit, the old silent-spin 30 s tuple must
        // NOT reappear.
        let window = &after_flag[..exit];
        let spin = ["Duration", "::from_secs(30)"].join("");
        assert!(
            !window.contains(&spin),
            "registration failure must be fatal, not a silent-spin tuple (C5-N1)"
        );
    }

    /// C5-N3 / debugger-N6 guard: the startup reap-all sweep must be wrapped in
    /// a shutdown `tokio::select!` so a deploy SIGTERM during the sweep is
    /// honoured immediately. Reverting to a bare `.await` flips this red.
    #[test]
    fn startup_sweep_is_shutdown_select_wrapped() {
        let src = include_str!("main.rs");
        // First occurrence is the production call site in main, before this
        // test module.
        let call = src
            .find("docker::cleanup_all_oj_containers_at_startup()")
            .expect("startup sweep call present");
        // Generous backward window covers the shutdown branch + tracing line
        // that precede the sweep call inside the select block.
        let start = call.saturating_sub(400);
        let region = &src[start..call];
        assert!(
            region.rfind("tokio::select!").is_some(),
            "startup sweep must be tokio::select!-wrapped against shutdown (C5-N3)"
        );
    }
}
