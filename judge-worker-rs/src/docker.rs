use std::path::Path;
use std::time::Instant;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;

/// Wall-clock cap on best-effort Docker cleanup calls (inspect/kill/rm) that
/// run after a submission's run+drain envelope. The container `wait` is already
/// wrapped in a timeout; without one here, a wedged Docker daemon can hold the
/// executor's concurrency slot indefinitely (the documented 2026-05-17 14h
/// `compile_error` fleet sweep). A timed-out call only leaves a leaked
/// container name, which the orphan sweep reaps on the next pass.
const DOCKER_CLEANUP_TIMEOUT_SECS: u64 = 10;
use uuid::Uuid;

const EXECUTION_CPU_LIMIT: &str = "1";
const MIN_MEMORY_LIMIT_MB: u32 = 16;
const COMPILE_TMPFS: &str = "/tmp:rw,exec,nosuid,size=1024m";
const RUN_TMPFS: &str = "/tmp:rw,noexec,nosuid,size=64m";
const MIN_TIMEOUT_MS: u64 = 100;

/// Writable `/workspace` for a warm container. A pre-started container has no
/// submission workspace to bind-mount yet, so it gets a tmpfs owned by the
/// same unprivileged uid/gid the run phase uses; the submission's files are
/// copied in when the container is adopted.
const WARM_WORKSPACE_TMPFS: &str = "/workspace:rw,exec,size=64m,uid=65534,gid=65534";

/// Memory ceiling a warm container starts with. `docker update` lowers this to
/// the submission's real limit when the container is adopted, so it only needs
/// to be >= any per-submission limit the judge will ask for.
const WARM_CEILING_MEMORY_MB: u32 = 1024;

const SECCOMP_INIT_ERROR_SNIPPETS: &[&str] = &[
    "OCI runtime create failed",
    "error during container init",
    "fsmount:fscontext:proc: operation not permitted",
];

pub struct DockerRunOptions {
    pub image: String,
    pub workspace_dir: String,
    pub command: Vec<String>,
    pub phase: Phase,
    pub input: Option<String>,
    pub timeout_ms: u64,
    pub memory_limit_mb: u32,
    pub read_only_workspace: bool,
    /// When true, use tmpfs without noexec even during the run phase
    /// (.NET/Mono JIT needs to execute code from /tmp)
    pub needs_exec_tmp: bool,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Phase {
    Compile,
    Run,
}

pub struct DockerRunResult {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub oom_killed: bool,
    pub duration_ms: u64,
    /// Peak memory usage in KB from cgroup stats. None if unavailable.
    pub memory_peak_kb: Option<u64>,
    /// Whether the container process actually started (see
    /// [`ContainerInspect::started`]). Used to distinguish Docker's own
    /// pre-start diagnostics from submission-controlled stderr.
    pub container_started: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum DockerError {
    #[error("failed to spawn docker: {0}")]
    SpawnFailed(#[from] std::io::Error),
    #[error("failed to write stdin: {0}")]
    StdinFailed(std::io::Error),
    #[error("docker process error: {0}")]
    ProcessError(String),
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct JudgeEnvironmentError(pub String);

fn get_memory_limit_mb(limit: u32) -> u32 {
    limit.max(MIN_MEMORY_LIMIT_MB)
}

/// Optional OCI runtime for judged containers, read from `JUDGE_OCI_RUNTIME`
/// (e.g. `runsc` for gVisor). Unset/empty → the Docker daemon's default runtime
/// (runc), preserving current behavior. This is a no-op until the host has the
/// runtime installed and registered in `/etc/docker/daemon.json`; see
/// `docs/judge-worker-gvisor.md` for setup + the disposable-worker validation
/// protocol that MUST pass before enabling this in production.
fn oci_runtime() -> Option<String> {
    match std::env::var("JUDGE_OCI_RUNTIME") {
        Ok(v) if !v.trim().is_empty() => Some(v.trim().to_string()),
        _ => None,
    }
}

struct ContainerInspect {
    oom_killed: bool,
    duration_ms: Option<u64>,
    memory_peak_kb: Option<u64>,
    /// Whether the container process actually started (`State.StartedAt` is a
    /// real timestamp, not Docker's zero time). `false` means the runtime
    /// failed before the submission ever ran — the only state in which
    /// captured stderr is guaranteed to be Docker's own diagnostics rather
    /// than submission-controlled output. Defaults to `true` when inspect
    /// fails/times out so unknown states are never classified as
    /// environment failures on the strength of stderr text alone.
    started: bool,
}

/// Parse a Docker RFC 3339 timestamp into epoch milliseconds.
/// Accepts `2024-01-15T10:30:45.123456789Z`.
fn parse_timestamp_epoch_ms(s: &str) -> Option<u64> {
    // Split into date and time at 'T'
    let (date_part, rest) = s.split_once('T')?;
    let date_parts: Vec<&str> = date_part.split('-').collect();
    if date_parts.len() != 3 {
        return None;
    }
    let year: i64 = date_parts[0].parse().ok()?;
    let month: i64 = date_parts[1].parse().ok()?;
    let day: i64 = date_parts[2].parse().ok()?;

    // Strip timezone suffix to get time portion
    let end = rest
        .find(|c: char| !c.is_ascii_digit() && c != ':' && c != '.')
        .unwrap_or(rest.len());
    let time_part = &rest[..end];

    let mut parts = time_part.split(':');
    let hours: i64 = parts.next()?.parse().ok()?;
    let minutes: i64 = parts.next()?.parse().ok()?;
    let sec_frac = parts.next()?;

    let (secs, millis) = if let Some(dot) = sec_frac.find('.') {
        let secs: i64 = sec_frac[..dot].parse().ok()?;
        let frac = &sec_frac[dot + 1..];
        let padded = format!("{:0<3}", &frac[..frac.len().min(3)]);
        let millis: i64 = padded.parse().ok()?;
        (secs, millis)
    } else {
        (sec_frac.parse().ok()?, 0i64)
    };

    // Days from Unix epoch using a simplified calculation (sufficient for 2000-2100)
    let mut y = year;
    let mut m = month;
    if m <= 2 {
        y -= 1;
        m += 12;
    }
    let days = 365 * y + y / 4 - y / 100 + y / 400 + (153 * (m - 3) + 2) / 5 + day - 719469;
    let total_ms = ((days * 86400 + hours * 3600 + minutes * 60 + secs) * 1000) + millis;
    if total_ms < 0 {
        return None;
    }

    Some(total_ms as u64)
}

/// Try to read peak memory usage from the container's cgroup on the host.
/// Works when the judge worker runs on bare metal (not inside Docker).
/// Returns peak memory in KB, or None if cgroup files are inaccessible.
async fn read_cgroup_memory_peak(container_id: &str) -> Option<u64> {
    // cgroupv2: system.slice path (most Linux distros with systemd + Docker)
    let paths = [
        format!("/sys/fs/cgroup/system.slice/docker-{container_id}.scope/memory.peak"),
        format!("/sys/fs/cgroup/docker/{container_id}/memory.peak"),
        format!("/sys/fs/cgroup/memory/docker/{container_id}/memory.max_usage_in_bytes"),
    ];

    for path in &paths {
        if let Ok(content) = tokio::fs::read_to_string(path).await
            && let Ok(bytes) = content.trim().parse::<u64>()
        {
            return Some(bytes / 1024);
        }
    }

    None
}

/// Inspect a stopped container for OOM status, actual runtime, and memory.
/// Runtime is derived from Docker's `State.StartedAt` / `State.FinishedAt`
/// timestamps, excluding container creation and cgroup setup overhead.
async fn inspect_container_state(container_name: &str) -> ContainerInspect {
    let result = match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args([
                "inspect",
                "--format",
                "{{json .State.OOMKilled}} {{.State.StartedAt}} {{.State.FinishedAt}} {{.Id}}",
                container_name,
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(output_result) => output_result,
        Err(_elapsed) => {
            tracing::warn!(
                container = container_name,
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "docker inspect timed out; returning default state"
            );
            return ContainerInspect {
                oom_killed: false,
                duration_ms: None,
                memory_peak_kb: None,
                started: true,
            };
        }
    };

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stdout.trim().splitn(4, ' ').collect();

            let oom_killed = parts.first().is_some_and(|s| s.trim() == "true");

            // Docker reports the zero time (0001-01-01T00:00:00Z) for
            // StartedAt when the container never started (e.g. OCI runtime
            // create failure). parse_timestamp_epoch_ms returns None for it.
            let started = parts
                .get(1)
                .is_some_and(|s| parse_timestamp_epoch_ms(s).is_some());

            let duration_ms = if parts.len() >= 3 {
                match (
                    parse_timestamp_epoch_ms(parts[1]),
                    parse_timestamp_epoch_ms(parts[2]),
                ) {
                    (Some(start), Some(end)) if end >= start => Some(end - start),
                    _ => None,
                }
            } else {
                None
            };

            // Try to read peak memory from cgroup (works on bare-metal workers)
            let memory_peak_kb = if parts.len() >= 4 {
                let container_id = parts[3].trim().trim_matches('"');
                read_cgroup_memory_peak(container_id).await
            } else {
                None
            };

            ContainerInspect {
                oom_killed,
                duration_ms,
                memory_peak_kb,
                started,
            }
        }
        Err(_) => ContainerInspect {
            oom_killed: false,
            duration_ms: None,
            memory_peak_kb: None,
            started: true,
        },
    }
}

async fn kill_container(container_name: &str) {
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(["kill", container_name])
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(_) => {}
        Err(_) => tracing::warn!(
            container = container_name,
            secs = DOCKER_CLEANUP_TIMEOUT_SECS,
            "docker kill timed out; orphan sweep will reap"
        ),
    }
}

async fn remove_container(container_name: &str) {
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(["rm", "-f", container_name])
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(_) => {}
        Err(_) => tracing::warn!(
            container = container_name,
            secs = DOCKER_CLEANUP_TIMEOUT_SECS,
            "docker rm timed out; orphan sweep will reap"
        ),
    }
}

fn should_retry_without_seccomp(stderr: &str) -> bool {
    SECCOMP_INIT_ERROR_SNIPPETS
        .iter()
        .any(|snippet| stderr.contains(snippet))
}

fn resolve_seccomp_profile(
    phase: Phase,
    seccomp_profile_path: &Path,
    disable_custom_seccomp: bool,
    allow_default_compile_seccomp: bool,
) -> Result<Option<&Path>, JudgeEnvironmentError> {
    // Compile containers now use the custom seccomp profile by default.
    // If a toolchain genuinely requires Docker's default compile seccomp,
    // operators must opt in explicitly with JUDGE_ALLOW_DEFAULT_COMPILE_SECCOMP.
    if disable_custom_seccomp {
        return Ok(None);
    }

    if phase == Phase::Compile && allow_default_compile_seccomp {
        return Ok(None);
    }

    if !seccomp_profile_path.exists() {
        return Err(JudgeEnvironmentError(format!(
            "Seccomp profile not found: {}",
            seccomp_profile_path.display()
        )));
    }

    Ok(Some(seccomp_profile_path))
}

async fn run_docker_once(
    options: &DockerRunOptions,
    seccomp_profile: Option<&Path>,
) -> Result<DockerRunResult, DockerError> {
    let container_name = format!("oj-{}", Uuid::new_v4());
    let mem_limit = get_memory_limit_mb(options.memory_limit_mb);
    // Compile-phase toolchains may legitimately spawn many processes (e.g.
    // C++ template instantiation, Java/Maven dependency resolution). Run phase
    // gets a tighter limit because user code should not need many threads.
    let pids_limit = match options.phase {
        Phase::Compile => "128",
        Phase::Run => "64",
    };

    let workspace_volume = if options.read_only_workspace {
        format!("{}:/workspace:ro", options.workspace_dir)
    } else {
        format!("{}:/workspace", options.workspace_dir)
    };

    let mut args: Vec<String> = vec![
        "run".into(),
        "--name".into(),
        container_name.clone(),
        "--network".into(),
        "none".into(),
        "--memory".into(),
        format!("{}m", mem_limit),
        "--memory-swap".into(),
        if options.phase == Phase::Compile {
            // Match the runtime budget — same swap cap as memory. Earlier the
            // compile phase allowed up to 4 GiB of swap (mem_limit * 2 capped
            // at 4096 MiB), which let a malicious build (e.g. infinite C++
            // template instantiation, Rust trait recursion) consume host
            // swap and starve neighbouring containers. Special-cased VM-based
            // toolchains (JVM / .NET / pwsh) can request more via memory_limit_mb
            // upstream if their compile profile genuinely needs it.
            format!("{}m", mem_limit)
        } else {
            format!("{}m", mem_limit) // strict limit during execution
        },
        "--cpus".into(),
        EXECUTION_CPU_LIMIT.into(),
        "--pids-limit".into(),
        pids_limit.into(),
        "--read-only".into(),
        "--tmpfs".into(),
        if options.phase == Phase::Compile || options.needs_exec_tmp {
            COMPILE_TMPFS
        } else {
            RUN_TMPFS
        }
        .into(),
        "--cap-drop=ALL".into(),
        "--security-opt=no-new-privileges".into(),
        "--ulimit".into(),
        "nofile=1024:1024".into(),
        "--user".into(),
        "65534:65534".into(),
        "-v".into(),
        workspace_volume,
        "-w".into(),
        "/workspace".into(),
    ];

    if let Some(profile) = seccomp_profile {
        args.push(format!("--security-opt=seccomp={}", profile.display()));
    }

    // Optional stronger OCI runtime (e.g. gVisor's `runsc`) for defense in depth
    // against a container/kernel escape reaching the host or docker socket.
    // Unset = the daemon default (runc), preserving current behavior. Validate
    // on a disposable worker first (judge correctness + overhead) per
    // docs/judge-worker-gvisor.md before enabling in production.
    if let Some(runtime) = oci_runtime() {
        args.push(format!("--runtime={}", runtime));
    }

    if options.input.is_some() {
        args.push("-i".into());
    }

    args.push("--init".into());
    args.push(options.image.clone());
    for part in &options.command {
        args.push(part.clone());
    }

    tracing::info!(
        container = %container_name,
        command = %args.join(" "),
        "Docker run command"
    );

    // kill_on_drop: if this future is dropped mid-run (client disconnect
    // aborts the axum handler, or worker shutdown aborts the task), the
    // `docker run` CLI must die with it. Without this the container — which
    // is launched without --rm and only reaped once status=exited — was
    // abandoned and an infinite-loop submission kept CPU/RAM forever
    // (RPF cycle-1 RW-H1). Matches every other Docker Command in this file.
    let mut child = tokio::process::Command::new("docker")
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(DockerError::SpawnFailed)?;

    let timeout_duration = std::time::Duration::from_millis(options.timeout_ms.max(MIN_TIMEOUT_MS));

    // Per-stream output cap. Bounds worker RAM under an output flood (a
    // malicious submission printing gigabytes). 128 MiB default — generous so it
    // never truncates a legitimate large-output problem — but configurable via
    // JUDGE_MAX_OUTPUT_BYTES so RAM-constrained operators can lower it
    // (worst-case RAM ≈ cap × 2 streams × concurrent jobs). Keep aligned with
    // the local compiler runner's truncation so behavior matches across runners.
    let max_output_bytes: u64 = std::env::var("JUDGE_MAX_OUTPUT_BYTES")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(134_217_728); // 128 MiB

    // After the cap is reached, keep draining (into /dev/null) so the writer
    // doesn't get EPIPE on its next write. Without this drain, a submission
    // that prints a few MiB more than the cap gets `write /dev/stdout: broken
    // pipe` from its runtime (Go, Python, etc.), and the user sees a
    // misleading runtime-error stderr message that has nothing to do with
    // their actual bug — the real signal is "your output exceeded the limit".
    let stdout_handle = {
        let stdout = child.stdout.take().expect("stdout not captured");
        tokio::spawn(async move {
            let mut take = stdout.take(max_output_bytes.saturating_add(1));
            let mut buf = Vec::new();
            let _ = take.read_to_end(&mut buf).await;
            let truncated = u64::try_from(buf.len()).unwrap_or(u64::MAX) > max_output_bytes;
            if truncated {
                let cap = usize::try_from(max_output_bytes).unwrap_or(usize::MAX);
                buf.truncate(cap);
            }
            let mut inner = take.into_inner();
            let _ = tokio::io::copy(&mut inner, &mut tokio::io::sink()).await;
            (buf, truncated)
        })
    };

    let stderr_handle = {
        let stderr = child.stderr.take().expect("stderr not captured");
        tokio::spawn(async move {
            let mut take = stderr.take(max_output_bytes.saturating_add(1));
            let mut buf = Vec::new();
            let _ = take.read_to_end(&mut buf).await;
            let truncated = u64::try_from(buf.len()).unwrap_or(u64::MAX) > max_output_bytes;
            if truncated {
                let cap = usize::try_from(max_output_bytes).unwrap_or(usize::MAX);
                buf.truncate(cap);
            }
            let mut inner = take.into_inner();
            let _ = tokio::io::copy(&mut inner, &mut tokio::io::sink()).await;
            (String::from_utf8_lossy(&buf).into_owned(), truncated)
        })
    };

    let start = Instant::now();

    let wait_result = tokio::time::timeout(timeout_duration, async {
        if let Some(ref input) = options.input
            && let Some(mut stdin) = child.stdin.take()
        {
            if let Err(e) = stdin.write_all(input.as_bytes()).await {
                // EPIPE means the child closed stdin (exited or stopped reading)
                // before we finished writing — a normal outcome for submissions
                // that don't consume all input or that crash early. Surface the
                // child's actual exit status and output instead of failing the
                // whole run with an environment error.
                if e.kind() == std::io::ErrorKind::BrokenPipe {
                    tracing::debug!(
                        container = %container_name,
                        "child closed stdin before all input was written; continuing to wait for exit"
                    );
                } else {
                    tracing::error!(error = %e, container = %container_name, "Failed to write stdin to container");
                    drop(stdin);
                    return Err(DockerError::StdinFailed(e));
                }
            }
            drop(stdin);
        }

        child
            .wait()
            .await
            .map_err(|e| DockerError::ProcessError(e.to_string()))
    }).await;

    match wait_result {
        Ok(Ok(exit_status)) => {
            let wall_duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
            let (stdout, stdout_truncated) = stdout_handle.await.unwrap_or_default();
            let (stderr, stderr_truncated) = stderr_handle.await.unwrap_or_default();
            let state = inspect_container_state(&container_name).await;
            remove_container(&container_name).await;
            Ok(DockerRunResult {
                stdout,
                stderr,
                stdout_truncated,
                stderr_truncated,
                exit_code: exit_status.code(),
                timed_out: false,
                oom_killed: state.oom_killed,
                duration_ms: state.duration_ms.unwrap_or(wall_duration_ms),
                memory_peak_kb: state.memory_peak_kb,
                container_started: state.started,
            })
        }
        Ok(Err(e)) => {
            kill_container(&container_name).await;
            remove_container(&container_name).await;
            Err(e)
        }
        Err(_) => {
            // Timeout
            let wall_duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
            kill_container(&container_name).await;
            let state = inspect_container_state(&container_name).await;
            remove_container(&container_name).await;
            Ok(DockerRunResult {
                stdout: Vec::new(),
                stderr: String::new(),
                stdout_truncated: false,
                stderr_truncated: false,
                exit_code: None,
                timed_out: true,
                oom_killed: state.oom_killed,
                duration_ms: state.duration_ms.unwrap_or(wall_duration_ms),
                memory_peak_kb: state.memory_peak_kb,
                container_started: state.started,
            })
        }
    }
}

pub async fn run_docker(
    options: &DockerRunOptions,
    seccomp_profile_path: &Path,
    disable_custom_seccomp: bool,
    allow_default_compile_seccomp: bool,
) -> Result<DockerRunResult, JudgeEnvironmentError> {
    let seccomp_profile = resolve_seccomp_profile(
        options.phase,
        seccomp_profile_path,
        disable_custom_seccomp,
        allow_default_compile_seccomp,
    )?;

    let result = run_docker_once(options, seccomp_profile)
        .await
        .map_err(|e| JudgeEnvironmentError(e.to_string()))?;

    // Only classify a seccomp/OCI init failure when the container never
    // started: in that state the captured stderr is Docker's own pre-start
    // diagnostics. Once the container has started, stderr is
    // submission-controlled — a program printing "error during container
    // init" previously turned its whole submission into a judge-environment
    // error and aborted the remaining test cases (RPF cycle-1 M2).
    if seccomp_profile.is_some()
        && !result.container_started
        && should_retry_without_seccomp(&result.stderr)
    {
        tracing::warn!(
            stderr = %result.stderr,
            image = %options.image,
            "seccomp_init_failure: custom seccomp profile rejected by Docker runtime"
        );
        return Err(JudgeEnvironmentError(
            "refusing to retry without custom seccomp".into(),
        ));
    }

    Ok(result)
}

/// Sandbox settings a warm container needs at creation time.
///
/// These are threaded from the process `Config` rather than re-read from the
/// environment so a warm container can never resolve a different seccomp
/// posture than the run-phase container it stands in for (`Config` validates
/// the profile path and fail-closes on unconfirmed seccomp weakening; a raw
/// `std::env::var` read here would bypass both).
#[derive(Debug, Clone)]
pub struct WarmContainerSettings {
    pub seccomp_profile_path: std::path::PathBuf,
    pub disable_custom_seccomp: bool,
}

/// Create a pre-started, idle sandbox container for `image`.
///
/// Flags mirror the `Phase::Run` container in `run_docker_once` — same network,
/// filesystem, capability, user, ulimit, seccomp and OCI-runtime posture —
/// EXCEPT:
///   * `/workspace` is a writable tmpfs (there is no submission workspace to
///     bind-mount yet; files arrive later), and
///   * memory/cpu/pids start at generous ceilings and are tightened to the
///     submission's real limits with `docker update` when the container is
///     adopted.
///
/// The container idles on `sleep infinity` and is destroyed after one use.
///
/// `name` is chosen by the caller (the pool) and recorded in pool state BEFORE
/// this function is called, so a container can never exist without something
/// tracking it — not even if the calling task is aborted mid-`docker run`.
pub async fn create_warm_container(
    image: &str,
    name: &str,
    settings: &WarmContainerSettings,
) -> Result<(), String> {
    // The only early return that needs no cleanup: it runs before `docker` is
    // ever invoked, so no container can exist under `name` yet. Every later
    // failure path below force-removes by name, because once the CLI has been
    // launched the daemon may hold a container the pool no longer tracks.
    let seccomp = resolve_seccomp_profile(
        Phase::Run,
        &settings.seccomp_profile_path,
        settings.disable_custom_seccomp,
        false,
    )
    .map_err(|e| e.to_string())?;

    let mut args: Vec<String> = vec![
        "run".into(),
        "-d".into(),
        "--name".into(),
        name.to_string(),
        "--network".into(),
        "none".into(),
        "--memory".into(),
        format!("{}m", WARM_CEILING_MEMORY_MB),
        "--memory-swap".into(),
        format!("{}m", WARM_CEILING_MEMORY_MB),
        "--cpus".into(),
        EXECUTION_CPU_LIMIT.into(),
        // Same cap as `Phase::Run` in run_docker_once.
        "--pids-limit".into(),
        "64".into(),
        "--read-only".into(),
        "--tmpfs".into(),
        RUN_TMPFS.into(),
        "--tmpfs".into(),
        WARM_WORKSPACE_TMPFS.into(),
        "--cap-drop=ALL".into(),
        "--security-opt=no-new-privileges".into(),
        "--ulimit".into(),
        "nofile=1024:1024".into(),
        "--user".into(),
        "65534:65534".into(),
        "-w".into(),
        "/workspace".into(),
    ];

    if let Some(profile) = seccomp {
        args.push(format!("--security-opt=seccomp={}", profile.display()));
    }
    if let Some(runtime) = oci_runtime() {
        args.push(format!("--runtime={}", runtime));
    }
    args.push("--init".into());
    args.push(image.to_string());
    args.extend(["sleep".to_string(), "infinity".to_string()]);

    // Timeout-guarded like every other Docker invocation in this file: a wedged
    // daemon must not stall the reconciler (and through it the heartbeat task).
    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(&args)
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            // `output()` also fails on an I/O error AFTER the child was
            // spawned, at which point the daemon may already have created the
            // container. Force-remove by name before giving up: the caller has
            // dropped this name from `pending`, so this is the last chance to
            // destroy it.
            remove_container_by_name(name).await;
            return Err(format!("docker run (warm) failed to spawn: {e}"));
        }
        Err(_elapsed) => {
            // The CLI child is killed on drop, but the daemon may still have
            // created the container; force-remove by name so it cannot leak as
            // an untracked long-running container.
            remove_container_by_name(name).await;
            return Err(format!(
                "docker run (warm) timed out after {DOCKER_CLEANUP_TIMEOUT_SECS}s"
            ));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // A non-zero exit does NOT mean nothing was created: `docker run -d`
        // creates the container object first and only then starts it, so a
        // rejected `--runtime`/`--security-opt` leaves a container sitting in
        // `created` state. That name is absent from the pool's `idle` and
        // already dropped from `pending`, and the orphan sweep only matches
        // `status=exited`, so nothing else would ever reap it. Force-remove it
        // here before returning.
        remove_container_by_name(name).await;
        return Err(format!("docker run (warm) failed: {}", stderr.trim()));
    }

    // `docker run -d` exits 0 once the container has STARTED, even if its
    // command died an instant later (e.g. an image whose `sleep` rejects
    // `infinity`). Without this check the pool would record a name that is
    // already dead, report itself full, and hand the corpse to a real run.
    if !container_is_running(name).await {
        remove_container_by_name(name).await;
        return Err("warm container was not running after creation".to_string());
    }

    tracing::info!(container = %name, image = %image, "created warm container");
    Ok(())
}

/// Force-remove a container by name, ignoring "already gone" errors.
pub async fn remove_container_by_name(name: &str) {
    remove_container(name).await;
}

/// Whether Docker reports `name` as currently running.
///
/// Every failure mode (wedged daemon, container already gone, unexpected
/// output) answers `false`. Callers use this only to reject a just-created
/// container, and they force-remove the name on a `false` answer, so a wrong
/// "not running" costs one wasted create — never an untracked leak.
pub async fn container_is_running(name: &str) -> bool {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(["inspect", "-f", "{{.State.Running}}", name])
            .kill_on_drop(true)
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim() == "true"
        }
        Ok(Ok(_)) => false,
        Ok(Err(e)) => {
            tracing::warn!(container = %name, error = %e, "docker inspect failed to spawn");
            false
        }
        Err(_elapsed) => {
            tracing::warn!(container = %name, "docker inspect timed out");
            false
        }
    }
}

/// Names of every warm container Docker currently reports as running.
///
/// `None` means the daemon could not be queried — the caller must then leave
/// pool state alone rather than assume the whole pool died, which on a briefly
/// wedged daemon would destroy a perfectly good pool.
pub async fn running_warm_container_names() -> Option<std::collections::HashSet<String>> {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args([
                "ps",
                "--filter",
                &format!("name={}", crate::pool::WARM_CONTAINER_PREFIX),
                "--filter",
                "status=running",
                "--format",
                "{{.Names}}",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await;

    let output = match result {
        Ok(Ok(output)) if output.status.success() => output,
        Ok(Ok(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!(stderr = %stderr.trim(), "docker ps for warm pool liveness failed");
            return None;
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "docker ps for warm pool liveness failed to spawn");
            return None;
        }
        Err(_elapsed) => {
            tracing::warn!("docker ps for warm pool liveness timed out");
            return None;
        }
    };

    Some(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(String::from)
            .collect(),
    )
}

pub async fn cleanup_orphaned_containers() {
    // The periodic sweep runs on the hot loop, so every docker invocation is
    // wrapped in the cleanup timeout + kill_on_drop. Without these a wedged
    // dockerd blocks the sweep indefinitely, freezing polling AND blocking the
    // shutdown select below it (debugger N1). `status=exited` is intentional
    // here: reaping `running` containers mid-loop would race in-flight
    // judgements. The startup sweep (`cleanup_all_oj_containers_at_startup`)
    // reaps every `oj-*` regardless of status, and
    // `cleanup_stale_running_containers` reaps `running` containers old
    // enough to be provably orphaned.
    let ps_output = match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args([
                "ps",
                "-a",
                "--filter",
                "name=oj-",
                "--filter",
                "status=exited",
                "-q",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Failed to list orphaned containers");
            return;
        }
        Err(_elapsed) => {
            tracing::warn!(
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "docker ps during orphan sweep timed out; skipping this tick"
            );
            return;
        }
    };

    let ids = String::from_utf8_lossy(&ps_output.stdout);
    let container_ids: Vec<String> = ids
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    if container_ids.is_empty() {
        return;
    }
    // Batch remove all orphaned containers in a single docker rm call.
    let mut args = vec!["rm".to_string()];
    args.extend(container_ids.iter().map(|s| s.to_string()));
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(&args)
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(_)) => {
            tracing::debug!(
                count = container_ids.len(),
                "Cleaned up orphaned containers"
            );
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Failed to batch-remove orphaned containers");
        }
        Err(_elapsed) => {
            tracing::warn!(
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "docker rm during orphan sweep timed out; containers may leak until next tick"
            );
        }
    }
}

/// Decide whether one `docker ps` row is a stale running container.
///
/// Warm-pool containers are never stale: an idle warm container is
/// long-running BY DESIGN, so reaping it here would destroy the pool the
/// reconciler just built and put the worker in a create/reap loop.
///
/// `names` is the raw `{{.Names}}` cell, which Docker renders as a
/// comma-separated list when a container has several names.
fn is_stale_running_row(names: &str, status: &str) -> bool {
    if names
        .split(',')
        .any(|n| n.trim().starts_with(crate::pool::WARM_CONTAINER_PREFIX))
    {
        return false;
    }
    // `docker ps` renders uptime as "Up 5 minutes" / "Up About an hour" /
    // "Up 3 hours" / "Up 2 days"; any hour-or-larger unit means the container
    // has outlived every legitimate timeout.
    let status = status.trim();
    status.starts_with("Up")
        && ["hour", "day", "week", "month", "year"]
            .iter()
            .any(|unit| status.contains(unit))
}

/// Second periodic pass: reap `running` oj-* containers that have been up for
/// an hour or more. Every legitimate container is bounded by the compile/run
/// timeouts (minutes at most), but a `docker run` future dropped mid-flight —
/// runner client disconnect, task abort — SIGKILLs only the CLI child; the
/// daemon-side container keeps running, never matches `status=exited`, and
/// previously held its CPU/memory until the next process restart's startup
/// sweep. An hour of uptime is far past any legitimate bound, so force-remove.
///
/// Warm-pool containers are exempt — see [`is_stale_running_row`].
pub async fn cleanup_stale_running_containers() {
    let ps_output = match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args([
                "ps",
                "--filter",
                "name=oj-",
                "--filter",
                "status=running",
                "--format",
                "{{.ID}}\t{{.Names}}\t{{.Status}}",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Failed to list running containers for stale sweep");
            return;
        }
        Err(_elapsed) => {
            tracing::warn!(
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "docker ps during stale-running sweep timed out; skipping this tick"
            );
            return;
        }
    };

    let listing = String::from_utf8_lossy(&ps_output.stdout);
    let stale_ids: Vec<String> = listing
        .lines()
        .filter_map(|line| {
            let (id, rest) = line.split_once('\t')?;
            let (names, status) = rest.split_once('\t')?;
            is_stale_running_row(names, status).then(|| id.to_string())
        })
        .collect();
    if stale_ids.is_empty() {
        return;
    }

    let mut args = vec!["rm".to_string(), "-f".to_string()];
    args.extend(stale_ids.iter().cloned());
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(&args)
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(_)) => {
            tracing::warn!(
                count = stale_ids.len(),
                "Force-removed stale running containers leaked by dropped runs"
            );
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Failed to remove stale running containers");
        }
        Err(_elapsed) => {
            tracing::warn!(
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "docker rm during stale-running sweep timed out; containers may leak until next tick"
            );
        }
    }
}

/// One-shot startup sweep: force-remove EVERY `oj-*` container regardless of
/// status. At startup there are no in-flight judgements, so nuking every
/// `oj-*` container is safe and reaps the `running` containers leaked by a
/// forced restart (deploy SIGTERM→SIGKILL, OOM-kill, host reboot) that the
/// periodic `status=exited` sweep cannot touch (R2 / feature-dev F2).
pub async fn cleanup_all_oj_containers_at_startup() {
    let ps_output = match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(["ps", "-a", "--filter", "name=oj-", "-q"])
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Startup sweep: failed to list oj-* containers");
            return;
        }
        Err(_elapsed) => {
            tracing::warn!(
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "Startup sweep: docker ps timed out; skipping (running containers may persist)"
            );
            return;
        }
    };

    let ids = String::from_utf8_lossy(&ps_output.stdout);
    let container_ids: Vec<String> = ids
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    if container_ids.is_empty() {
        tracing::debug!("Startup sweep: no oj-* containers to reap");
        return;
    }
    let mut args = vec!["rm".to_string(), "-f".to_string()];
    args.extend(container_ids.iter().map(|s| s.to_string()));
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(&args)
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(_)) => {
            tracing::info!(
                count = container_ids.len(),
                "Startup sweep: reaped leftover oj-* containers"
            );
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Startup sweep: failed to force-remove oj-* containers");
        }
        Err(_elapsed) => {
            tracing::warn!(
                secs = DOCKER_CLEANUP_TIMEOUT_SECS,
                "Startup sweep: docker rm -f timed out; some oj-* containers may persist"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{JudgeEnvironmentError, Phase, parse_timestamp_epoch_ms, resolve_seccomp_profile};
    use std::path::PathBuf;
    use tempfile::NamedTempFile;

    #[test]
    fn pids_limit_is_phase_specific() {
        let src = include_str!("docker.rs");
        assert!(
            src.contains("Phase::Compile => \"128\""),
            "compile phase must allow 128 PIDs"
        );
        assert!(
            src.contains("Phase::Run => \"64\""),
            "run phase must limit PIDs to 64"
        );
    }

    #[test]
    fn compile_phase_uses_custom_seccomp_by_default() {
        let profile = NamedTempFile::new().expect("temp seccomp profile");
        let resolved = resolve_seccomp_profile(Phase::Compile, profile.path(), false, false)
            .expect("compile phase should accept the custom seccomp profile by default");

        assert_eq!(resolved, Some(profile.path()));
    }

    #[test]
    fn compile_phase_can_opt_out_to_default_seccomp() {
        let profile = NamedTempFile::new().expect("temp seccomp profile");
        let resolved = resolve_seccomp_profile(Phase::Compile, profile.path(), false, true)
            .expect("compile phase should allow explicit default-seccomp opt-out");

        assert!(resolved.is_none());
    }

    #[test]
    fn run_phase_requires_existing_profile_when_custom_seccomp_is_enabled() {
        let missing = PathBuf::from("/tmp/nonexistent-seccomp-profile.json");
        let result = resolve_seccomp_profile(Phase::Run, &missing, false, false);

        assert!(
            matches!(result, Err(JudgeEnvironmentError(message)) if message.contains("Seccomp profile not found"))
        );
    }

    #[test]
    fn run_phase_uses_profile_when_available() {
        let profile = NamedTempFile::new().expect("temp seccomp profile");
        let resolved = resolve_seccomp_profile(Phase::Run, profile.path(), false, false)
            .expect("run phase should accept an existing seccomp profile");

        assert_eq!(resolved, Some(profile.path()));
    }

    #[test]
    fn disabled_custom_seccomp_skips_profile_for_run_phase() {
        let missing = PathBuf::from("/tmp/nonexistent-seccomp-profile.json");
        let resolved = resolve_seccomp_profile(Phase::Run, &missing, true, false)
            .expect("disabled seccomp should skip profile lookup");

        assert!(resolved.is_none());
    }

    #[test]
    fn parse_timestamp_handles_unix_epoch() {
        assert_eq!(parse_timestamp_epoch_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_timestamp_epoch_ms("1970-01-01T00:00:00.123456789Z"),
            Some(123)
        );
    }

    #[test]
    fn parse_timestamp_rejects_pre_epoch_docker_zero_time() {
        assert_eq!(parse_timestamp_epoch_ms("0001-01-01T00:00:00Z"), None);
    }

    // Source-grep contract for the cleanup-hardening bundle (debugger N1 + R2 +
    // R4 / feature-dev F2). A wedged dockerd must not freeze the worker.
    #[test]
    fn cleanup_sweep_and_startup_reap_are_timeout_guarded_with_kill_on_drop() {
        let src = include_str!("docker.rs");

        // Periodic sweep is timeout-wrapped (N1).
        assert!(
            src.contains("tokio::time::timeout(\n        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),\n        tokio::process::Command::new(\"docker\")\n            .args([\n                \"ps\","),
            "periodic sweep must timeout-wrap the docker ps call"
        );
        // Startup reap-all function exists and force-removes every oj-* (R2).
        assert!(
            src.contains("pub async fn cleanup_all_oj_containers_at_startup()"),
            "startup reap-all sweep must exist"
        );
        assert!(
            src.contains("\"rm\".to_string(), \"-f\".to_string()"),
            "startup sweep must force-remove (rm -f) every oj-* container"
        );
        // kill_on_drop on the cleanup Commands so a dropped handle tears down
        // the docker CLI child (R4).
        assert!(
            src.matches(".kill_on_drop(true)").count() >= 5,
            "inspect/kill/rm + sweep ps/rm + startup ps/rm must all chain kill_on_drop (>=5 sites)"
        );
    }

    #[test]
    fn stale_sweep_reaps_long_running_per_run_containers() {
        assert!(super::is_stale_running_row(
            "oj-2f1c9a3e-0000-4000-8000-000000000000",
            "Up About an hour"
        ));
        assert!(super::is_stale_running_row("oj-abc", "Up 3 hours"));
        assert!(super::is_stale_running_row("oj-abc", "Up 2 days"));
    }

    #[test]
    fn stale_sweep_leaves_short_lived_containers_alone() {
        assert!(!super::is_stale_running_row("oj-abc", "Up 5 minutes"));
        assert!(!super::is_stale_running_row(
            "oj-abc",
            "Exited (0) 2 hours ago"
        ));
    }

    /// An idle warm container is long-running BY DESIGN. Without this exclusion
    /// the stale sweep would destroy the pool the reconciler just built, in a
    /// loop (create → reaped at 1 h → recreate, forever).
    #[test]
    fn stale_sweep_never_reaps_idle_warm_containers() {
        let warm = format!("{}abc", crate::pool::WARM_CONTAINER_PREFIX);
        assert!(!super::is_stale_running_row(&warm, "Up 3 hours"));
        assert!(!super::is_stale_running_row(&warm, "Up 2 days"));
        // `docker ps` can render several comma-separated names for one
        // container; a warm name anywhere in the list protects the row.
        assert!(!super::is_stale_running_row(
            &format!("some-alias,{warm}"),
            "Up 3 hours"
        ));
    }

    /// Warm containers must carry the same run-phase sandbox posture as a real
    /// judging container. A deviation here is a sandbox-escape risk, so the
    /// flag set is pinned by a source contract.
    #[test]
    fn warm_container_mirrors_run_phase_security_flags() {
        let src = include_str!("docker.rs");
        let start = src
            .find("pub async fn create_warm_container(")
            .expect("create_warm_container present");
        let end = src[start..]
            .find("\n/// Force-remove a container by name")
            .expect("create_warm_container body is delimited")
            + start;
        let body = &src[start..end];

        for flag in [
            "\"--network\"",
            "\"none\"",
            "\"--read-only\"",
            "\"--cap-drop=ALL\"",
            "\"--security-opt=no-new-privileges\"",
            "\"--user\"",
            "\"65534:65534\"",
            "\"nofile=1024:1024\"",
            "RUN_TMPFS",
            "\"--init\"",
            "--security-opt=seccomp=",
            "--runtime=",
        ] {
            assert!(
                body.contains(flag),
                "warm container must mirror the run-phase flag {flag}"
            );
        }
    }
}
