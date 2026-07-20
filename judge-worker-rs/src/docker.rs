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
/// submission workspace to bind-mount yet, so it gets a tmpfs; the submission's
/// files are unpacked into it when the container is adopted.
///
/// Owned by ROOT (no `uid=`/`gid=`) and mode 0755, which is what makes the
/// adopted container W^X-equivalent to a cold run's read-only bind mount:
///   * the run user (uid 65534, `--cap-drop=ALL`) is "other" here, so it can
///     neither create, rename nor unlink anything under this exec-allowed
///     mount, and cannot `chmod`/`chown` its way back in (that needs
///     CAP_FOWNER / CAP_CHOWN, and the bounding set is empty);
///   * the injection exec — which runs as uid 0 but ALSO with an empty
///     capability bounding set, so it has no CAP_DAC_OVERRIDE — is the owner
///     and can therefore unpack into it.
///
/// A tmpfs owned by 65534 would invert both properties: the submission could
/// chmod the directory back to writable, and the root injection exec would get
/// EACCES. Both were verified against a live Docker daemon.
const WARM_WORKSPACE_TMPFS: &str = "/workspace:rw,exec,size=64m,mode=0755";

/// Largest workspace archive that can be unpacked into `WARM_WORKSPACE_TMPFS`.
/// A bigger one would ENOSPC mid-extraction and leave a half-populated
/// workspace, which judges as a wrong answer instead of falling back; refusing
/// up front turns that into a cold run. Kept in step with the tmpfs `size=` by
/// `warm_archive_budget_matches_the_workspace_tmpfs_size`.
const WARM_WORKSPACE_ARCHIVE_MAX_BYTES: u64 = 64 * 1024 * 1024;

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
    /// The warm path could not be used for this run; the caller must retry
    /// cold. This is never a submission failure — every warm-path failure mode
    /// (refused adoption, dead container, wedged daemon, failed injection)
    /// funnels here so the caller can re-run the same test case on the cold
    /// path and report a real verdict.
    #[error("warm container unavailable: {0}")]
    WarmUnavailable(String),
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

/// Host paths that may hold a container's peak-memory counter, most likely
/// first. Shared by the reader and the reset so that the counter a run resets
/// is exactly the counter the same run reads back.
fn cgroup_memory_peak_paths(container_id: &str) -> [String; 3] {
    [
        // cgroupv2: system.slice path (most Linux distros with systemd + Docker)
        format!("/sys/fs/cgroup/system.slice/docker-{container_id}.scope/memory.peak"),
        format!("/sys/fs/cgroup/docker/{container_id}/memory.peak"),
        format!("/sys/fs/cgroup/memory/docker/{container_id}/memory.max_usage_in_bytes"),
    ]
}

/// Try to read peak memory usage from the container's cgroup on the host.
/// Works when the judge worker runs on bare metal (not inside Docker).
/// Returns peak memory in KB, or None if cgroup files are inaccessible.
async fn read_cgroup_memory_peak(container_id: &str) -> Option<u64> {
    let paths = cgroup_memory_peak_paths(container_id);

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

    run_and_measure(
        &mut child,
        options,
        &container_name,
        RunClock::ContainerLifetime,
    )
    .await
}

/// Which clock measures the submission's runtime.
#[derive(Clone, Copy, PartialEq, Debug)]
enum RunClock {
    /// The container was created for this run, so Docker's own `StartedAt` /
    /// `FinishedAt` bracket exactly the submission and exclude container
    /// creation and cgroup setup overhead. Preferred when available.
    ContainerLifetime,
    /// The container was already running when this run started (warm path).
    /// Its `StartedAt` predates the submission by the whole idle period, so the
    /// container lifetime is not a measurement of anything the submission did —
    /// only the wall clock around the `docker exec` is. Verified against a live
    /// daemon: a warm container idle for 3 s then killed 1 s into its exec
    /// reports a 4.1 s lifetime.
    ExecWallClock,
}

/// Runtime to report, given the clock in use, what `docker inspect` said, and
/// the wall clock measured around the child process.
fn resolve_duration_ms(clock: RunClock, inspected_ms: Option<u64>, wall_ms: u64) -> u64 {
    match clock {
        RunClock::ContainerLifetime => inspected_ms.unwrap_or(wall_ms),
        RunClock::ExecWallClock => wall_ms,
    }
}

/// Drive an already-spawned judging child to completion and turn it into a
/// [`DockerRunResult`].
///
/// This is the ENTIRE measurement half of a judged run — output capping, stdin
/// delivery, the timeout, the exit-status mapping, OOM detection and peak
/// memory — and it is deliberately the only copy. `run_docker_once` (cold) and
/// `run_docker_warm` (warm) differ only in how they get a running process;
/// from here on a warm run and a cold run of the same submission are measured
/// and classified by identical code, so which one a submission happens to get
/// can never change its verdict.
///
/// `container_name` is used for inspect/kill/remove; the container is removed
/// before returning in every path, warm or cold (a warm container is
/// single-use, so this is also its destruction).
async fn run_and_measure(
    child: &mut tokio::process::Child,
    options: &DockerRunOptions,
    container_name: &str,
    clock: RunClock,
) -> Result<DockerRunResult, DockerError> {
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
            let state = inspect_container_state(container_name).await;
            remove_container(container_name).await;
            Ok(DockerRunResult {
                stdout,
                stderr,
                stdout_truncated,
                stderr_truncated,
                exit_code: exit_status.code(),
                timed_out: false,
                oom_killed: state.oom_killed,
                duration_ms: resolve_duration_ms(clock, state.duration_ms, wall_duration_ms),
                memory_peak_kb: state.memory_peak_kb,
                container_started: state.started,
            })
        }
        Ok(Err(e)) => {
            kill_container(container_name).await;
            remove_container(container_name).await;
            Err(e)
        }
        Err(_) => {
            // Timeout
            let wall_duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
            kill_container(container_name).await;
            let state = inspect_container_state(container_name).await;
            remove_container(container_name).await;
            Ok(DockerRunResult {
                stdout: Vec::new(),
                stderr: String::new(),
                stdout_truncated: false,
                stderr_truncated: false,
                exit_code: None,
                timed_out: true,
                oom_killed: state.oom_killed,
                duration_ms: resolve_duration_ms(clock, state.duration_ms, wall_duration_ms),
                memory_peak_kb: state.memory_peak_kb,
                container_started: state.started,
            })
        }
    }
}

/// Why an adopted warm container cannot serve `options`, if it cannot.
///
/// A warm container's seccomp profile, tmpfs layout, pids limit and memory
/// CEILING are all fixed when it is created, and `docker update` can only
/// retune a subset of them. Anything a pre-started container cannot honour
/// exactly must be refused here so the caller re-runs it cold — a warm run that
/// silently differs from the cold run it stands in for is a wrong verdict.
///
/// Pure, so every refusal is unit-tested without a Docker daemon.
fn warm_refusal_reason(options: &DockerRunOptions) -> Option<String> {
    if options.phase != Phase::Run {
        // Seccomp and the tmpfs layout are create-time only, and the compile
        // phase also wants a writable workspace and a higher pids limit.
        return Some("warm containers only serve the compile-free run phase".to_string());
    }

    if !options.read_only_workspace {
        // The adopted `/workspace` is deliberately unwritable by the run user
        // (see WARM_WORKSPACE_TMPFS). A caller that asked for a writable
        // workspace would silently get a read-only one.
        return Some("run needs a writable workspace; warm /workspace is not".to_string());
    }

    if options.needs_exec_tmp {
        // Cold runs of these toolchains (.NET/Mono JIT) get COMPILE_TMPFS;
        // warm containers always get the strict RUN_TMPFS, and `--tmpfs` is a
        // create-time mount option.
        return Some("run needs an exec-allowed /tmp; warm /tmp is noexec".to_string());
    }

    let requested = get_memory_limit_mb(options.memory_limit_mb);
    if requested > WARM_CEILING_MEMORY_MB {
        // `docker update` will happily RAISE a limit (verified against a live
        // daemon), so nothing but this check stops an adopted container from
        // being handed more memory than it was created with.
        return Some(format!(
            "requested memory {requested}m exceeds warm ceiling {WARM_CEILING_MEMORY_MB}m"
        ));
    }

    None
}

/// `docker update` arguments that retune an adopted warm container to the
/// submission's real limits. Memory is the one limit that must be corrected —
/// the container started at `WARM_CEILING_MEMORY_MB`, while cpus and pids were
/// created at their run-phase values already. Only ever called after
/// [`warm_refusal_reason`] has confirmed the new limit is a reduction.
fn warm_update_args(container: &str, memory_limit_mb: u32) -> Vec<String> {
    let mem = get_memory_limit_mb(memory_limit_mb);
    vec![
        "update".into(),
        "--memory".into(),
        format!("{}m", mem),
        "--memory-swap".into(),
        format!("{}m", mem),
        container.into(),
    ]
}

/// Host `tar` arguments that pack a prepared workspace for injection.
///
/// This is where W^X is established, because it is the only point at which the
/// judge controls the ownership and mode of the files that land on the
/// exec-allowed `/workspace` tmpfs:
///   * `--owner=0 --group=0 --numeric-owner` — everything is unpacked as root,
///     so the run user (uid 65534) can never `chmod`/`chown` it back
///     (CAP_FOWNER / CAP_CHOWN are not in the container's bounding set);
///   * `--mode=go-w` — strips group/other write from every member while
///     leaving the executable bits alone, so a compiled binary stays runnable
///     but nothing under `/workspace` is writable by the run user. Without it
///     a mode-0777 file produced during the compile phase would survive as a
///     writable AND executable path.
fn warm_archive_args(workspace_dir: &str) -> Vec<String> {
    vec![
        "-C".into(),
        workspace_dir.to_string(),
        "--owner=0".into(),
        "--group=0".into(),
        "--numeric-owner".into(),
        "--mode=go-w".into(),
        "-cf".into(),
        "-".into(),
        ".".into(),
    ]
}

/// `docker exec` arguments that unpack the workspace archive into an adopted
/// warm container.
///
/// Runs as root because `/workspace` is a root-owned tmpfs — that is what stops
/// the submission from writing there. This exec is NOT privileged: the
/// container was created with `--cap-drop=ALL`, so its capability bounding set
/// is empty and this uid-0 process has no CAP_DAC_OVERRIDE, CAP_CHOWN or
/// CAP_FOWNER (verified against a live daemon). It can write to `/workspace`
/// only because it owns it.
///
/// `docker cp` is not an alternative: the daemon rejects it outright for
/// `--read-only` containers ("container rootfs is marked read-only"), and warm
/// containers are `--read-only` like every judged container.
fn warm_extract_args(container: &str) -> Vec<String> {
    vec![
        "exec".into(),
        "-i".into(),
        "--user".into(),
        "0:0".into(),
        container.to_string(),
        "tar".into(),
        "-xf".into(),
        "-".into(),
        "-C".into(),
        "/workspace".into(),
    ]
}

/// `docker exec` arguments that run the submission command inside an adopted
/// warm container with the same user and workdir the cold path uses.
fn warm_exec_args(container: &str, command: &[String], has_input: bool) -> Vec<String> {
    let mut args: Vec<String> = vec!["exec".into()];
    if has_input {
        args.push("-i".into());
    }
    args.extend([
        "--user".into(),
        "65534:65534".into(),
        "--workdir".into(),
        "/workspace".into(),
        container.to_string(),
    ]);
    args.extend(command.iter().cloned());
    args
}

/// Reset the container's cgroup peak-memory counter so the reading taken after
/// this run reflects only this run: the container was idling (and was just
/// written to) before it was adopted, and `memory.peak` is monotonic.
///
/// Returns false only when the counter this host WOULD read back exists but
/// could not be reset (cgroup v2 `memory.peak` is only resettable from Linux
/// 6.8, and the worker must be able to write it). A host where no counter is
/// readable at all returns true: cold and warm runs then both report
/// `memory_peak_kb: None`, so there is nothing to over-report.
async fn reset_cgroup_memory_peak(container_id: &str) -> bool {
    for path in cgroup_memory_peak_paths(container_id) {
        if tokio::fs::read_to_string(&path).await.is_err() {
            continue; // not the cgroup layout this host uses
        }
        // Writing any value resets cgroup v2 `memory.peak` and cgroup v1
        // `memory.max_usage_in_bytes`.
        return tokio::fs::write(&path, b"0").await.is_ok();
    }
    true
}

/// Run one short Docker command for the warm path, mapping EVERY failure mode
/// — spawn error, wedged daemon, non-zero exit, missing container — onto
/// `WarmUnavailable` so the caller falls back to a cold run.
async fn warm_docker_step(
    args: &[String],
    stdin_bytes: Option<&[u8]>,
    step: &str,
) -> Result<Vec<u8>, DockerError> {
    let mut command = tokio::process::Command::new("docker");
    command
        .args(args)
        .stdin(if stdin_bytes.is_some() {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let run = async {
        let mut child = command.spawn()?;
        if let Some(bytes) = stdin_bytes {
            let mut stdin = child.stdin.take().expect("stdin not captured");
            stdin.write_all(bytes).await?;
            let _ = stdin.shutdown().await;
            drop(stdin);
        }
        child.wait_with_output().await
    };

    // Timeout-guarded like every other Docker invocation in this file: a wedged
    // daemon must not hold the executor's concurrency slot. kill_on_drop tears
    // down the CLI child when this future is dropped.
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        run,
    )
    .await
    {
        Ok(Ok(output)) if output.status.success() => Ok(output.stdout),
        Ok(Ok(output)) => Err(DockerError::WarmUnavailable(format!(
            "{step}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))),
        Ok(Err(e)) => Err(DockerError::WarmUnavailable(format!("{step}: {e}"))),
        Err(_elapsed) => Err(DockerError::WarmUnavailable(format!(
            "{step}: timed out after {DOCKER_CLEANUP_TIMEOUT_SECS}s"
        ))),
    }
}

/// Pack the prepared workspace into a tar stream ready to unpack inside an
/// adopted warm container. See [`warm_archive_args`] for the W^X properties
/// this archive carries.
async fn build_workspace_archive(workspace_dir: &str) -> Result<Vec<u8>, DockerError> {
    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("tar")
            .args(warm_archive_args(workspace_dir))
            .kill_on_drop(true)
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            return Err(DockerError::WarmUnavailable(format!(
                "workspace archive failed to spawn tar: {e}"
            )));
        }
        Err(_elapsed) => {
            return Err(DockerError::WarmUnavailable(format!(
                "workspace archive timed out after {DOCKER_CLEANUP_TIMEOUT_SECS}s"
            )));
        }
    };

    if !output.status.success() {
        return Err(DockerError::WarmUnavailable(format!(
            "workspace archive failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    // An archive that cannot fit in the tmpfs would ENOSPC part-way through
    // extraction, leaving a workspace that judges as a wrong answer instead of
    // falling back. Refuse before anything is injected.
    if u64::try_from(output.stdout.len()).unwrap_or(u64::MAX) > WARM_WORKSPACE_ARCHIVE_MAX_BYTES {
        return Err(DockerError::WarmUnavailable(format!(
            "workspace archive is {} bytes; /workspace tmpfs holds {WARM_WORKSPACE_ARCHIVE_MAX_BYTES}",
            output.stdout.len()
        )));
    }

    Ok(output.stdout)
}

/// Execute one test case inside an ALREADY-RUNNING warm container.
///
/// Caller contract: `container` came from `PoolManager::acquire` (so it is
/// single-use), and the caller destroys it afterwards regardless of outcome.
/// EVERY `Err` from this function is [`DockerError::WarmUnavailable`] and means
/// the caller must re-run the same test case with `run_docker_once`; the warm
/// path may never fail a submission on its own.
///
/// The measurement half is [`run_and_measure`], shared verbatim with the cold
/// path, so adopting a warm container cannot change a verdict.
// Wired into the run path by the adopt-side task; kept `pub` for that caller.
#[allow(dead_code)]
pub async fn run_docker_warm(
    options: &DockerRunOptions,
    container: &str,
) -> Result<DockerRunResult, DockerError> {
    if let Some(reason) = warm_refusal_reason(options) {
        return Err(DockerError::WarmUnavailable(reason));
    }

    // Built before anything is done to the container, so a bad workspace costs
    // nothing but a cold fallback.
    let archive = build_workspace_archive(&options.workspace_dir).await?;

    // Resolve the container's real ID (the cgroup paths are keyed by ID, not by
    // name). This doubles as the liveness check required of the warm path: a
    // pruned or dead container answers "No such container" here and falls back
    // to cold instead of failing the submission.
    let inspected = warm_docker_step(
        &[
            "inspect".into(),
            "-f".into(),
            "{{.Id}}".into(),
            container.to_string(),
        ],
        None,
        "docker inspect (warm)",
    )
    .await?;
    let container_id = String::from_utf8_lossy(&inspected)
        .trim()
        .trim_matches('"')
        .to_string();
    if container_id.is_empty() {
        return Err(DockerError::WarmUnavailable(
            "docker inspect (warm): empty container id".to_string(),
        ));
    }

    // 1) Retune limits down to this submission's.
    warm_docker_step(
        &warm_update_args(container, options.memory_limit_mb),
        None,
        "docker update (warm)",
    )
    .await?;

    // 2) Inject the prepared workspace. The warm container has an empty tmpfs
    //    /workspace; it could not bind-mount a workspace that did not exist
    //    when it was created, and `docker cp` is refused for --read-only
    //    containers. Unpacking a root-owned, go-w archive as root restores W^X:
    //    from here on nothing under the exec-allowed /workspace is writable by
    //    the uid-65534, zero-capability process that runs the submission.
    warm_docker_step(
        &warm_extract_args(container),
        Some(&archive),
        "workspace injection (warm)",
    )
    .await?;

    // 3) Zero the peak-memory counter so the post-run reading is this run's and
    //    not the idle period's (or the injection's). After injection on
    //    purpose: the unpacked tmpfs pages are charged to this cgroup.
    if !reset_cgroup_memory_peak(&container_id).await {
        return Err(DockerError::WarmUnavailable(
            "kernel does not support resetting memory.peak".to_string(),
        ));
    }

    // 4) Execute, then hand over to the shared measurement logic.
    let mut child = tokio::process::Command::new("docker")
        .args(warm_exec_args(
            container,
            &options.command,
            options.input.is_some(),
        ))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| DockerError::WarmUnavailable(format!("docker exec (warm): {e}")))?;

    run_and_measure(&mut child, options, container, RunClock::ExecWallClock)
        .await
        .map_err(|e| match e {
            already @ DockerError::WarmUnavailable(_) => already,
            other => DockerError::WarmUnavailable(format!("warm run failed: {other}")),
        })
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
            // container. Force-remove by name before giving up: the caller drops
            // this name from `pending` as soon as this call returns Err, and
            // records nothing in `idle`, so returning without removing would
            // leave it untracked.
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
        // `created` state. The caller never records that name in `idle` and
        // drops it from `pending` the moment this call returns Err, and the
        // orphan sweep only matches `status=exited`, so nothing else would ever
        // reap it. Force-remove it here before returning.
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

    fn warm_run_options() -> super::DockerRunOptions {
        super::DockerRunOptions {
            image: "judge-python:latest".to_string(),
            workspace_dir: "/tmp/ws".to_string(),
            command: vec!["python3".to_string(), "sol.py".to_string()],
            phase: Phase::Run,
            input: None,
            timeout_ms: 1000,
            memory_limit_mb: 256,
            read_only_workspace: true,
            needs_exec_tmp: false,
        }
    }

    #[test]
    fn warm_update_args_apply_submission_limits() {
        let args = super::warm_update_args("oj-warm-x", 256);
        assert!(args.contains(&"update".to_string()));
        assert!(args.contains(&"--memory".to_string()));
        assert!(args.contains(&"256m".to_string()));
        assert!(args.contains(&"--memory-swap".to_string()));
        assert!(args.contains(&"oj-warm-x".to_string()));
    }

    /// `docker update` must never hand out MORE than the container was created
    /// with, and must respect the same floor the cold path applies.
    #[test]
    fn warm_update_args_apply_the_shared_memory_floor() {
        let args = super::warm_update_args("oj-warm-x", 1);
        assert!(args.contains(&"16m".to_string()), "got {args:?}");
    }

    #[test]
    fn warm_exec_args_run_as_nobody_in_workspace() {
        let args = super::warm_exec_args("oj-warm-x", &["python3".into(), "sol.py".into()], false);
        assert!(args.starts_with(&["exec".to_string()]));
        assert!(args.contains(&"--user".to_string()));
        assert!(args.contains(&"65534:65534".to_string()));
        assert!(args.contains(&"--workdir".to_string()));
        assert!(args.contains(&"/workspace".to_string()));
        assert!(args.contains(&"python3".to_string()));
    }

    #[test]
    fn warm_exec_args_request_stdin_when_input_present() {
        let args = super::warm_exec_args("oj-warm-x", &["cat".into()], true);
        assert!(args.contains(&"-i".to_string()));
    }

    #[test]
    fn warm_exec_args_omit_stdin_without_input() {
        let args = super::warm_exec_args("oj-warm-x", &["cat".into()], false);
        assert!(!args.contains(&"-i".to_string()));
    }

    #[test]
    fn warm_accepts_an_ordinary_run() {
        assert_eq!(super::warm_refusal_reason(&warm_run_options()), None);
    }

    /// A warm container is created at `WARM_CEILING_MEMORY_MB`; `docker update`
    /// may lower that but must never be used to grant more than the container
    /// was created with (Docker itself happily raises it).
    #[test]
    fn warm_refuses_memory_above_the_creation_ceiling() {
        let mut options = warm_run_options();
        options.memory_limit_mb = super::WARM_CEILING_MEMORY_MB + 1;
        let reason = super::warm_refusal_reason(&options).expect("must refuse");
        assert!(reason.contains("memory"), "got {reason}");
    }

    #[test]
    fn warm_accepts_memory_exactly_at_the_creation_ceiling() {
        let mut options = warm_run_options();
        options.memory_limit_mb = super::WARM_CEILING_MEMORY_MB;
        assert_eq!(super::warm_refusal_reason(&options), None);
    }

    /// Warm containers always get the strict `RUN_TMPFS`; .NET/Mono need an
    /// exec-allowed `/tmp`, which is a create-time mount option.
    #[test]
    fn warm_refuses_languages_that_need_an_exec_tmp() {
        let mut options = warm_run_options();
        options.needs_exec_tmp = true;
        let reason = super::warm_refusal_reason(&options).expect("must refuse");
        assert!(reason.contains("/tmp"), "got {reason}");
    }

    /// Seccomp and the tmpfs layout are create-time only, and the compile phase
    /// wants a writable workspace and a higher pids limit.
    #[test]
    fn warm_refuses_the_compile_phase() {
        let mut options = warm_run_options();
        options.phase = Phase::Compile;
        let reason = super::warm_refusal_reason(&options).expect("must refuse");
        assert!(reason.contains("compile"), "got {reason}");
    }

    /// The adopted `/workspace` is deliberately unwritable by the run user, so
    /// a caller asking for a writable workspace must get the cold path.
    #[test]
    fn warm_refuses_a_writable_workspace() {
        let mut options = warm_run_options();
        options.read_only_workspace = false;
        let reason = super::warm_refusal_reason(&options).expect("must refuse");
        assert!(reason.contains("writable"), "got {reason}");
    }

    /// W^X: the archive that is injected into the warm container must strip
    /// group/other write from every member and own everything as root, so the
    /// run user (uid 65534, no capabilities) can neither create nor modify a
    /// file under the exec-allowed `/workspace`.
    #[test]
    fn warm_archive_is_root_owned_and_not_writable_by_the_run_user() {
        let args = super::warm_archive_args("/tmp/ws");
        assert!(args.contains(&"--owner=0".to_string()), "got {args:?}");
        assert!(args.contains(&"--group=0".to_string()), "got {args:?}");
        assert!(
            args.contains(&"--numeric-owner".to_string()),
            "got {args:?}"
        );
        assert!(args.contains(&"--mode=go-w".to_string()), "got {args:?}");
        assert!(args.contains(&"/tmp/ws".to_string()), "got {args:?}");
    }

    /// The injection exec must run as root: `/workspace` is a root-owned tmpfs
    /// precisely so the run user cannot write to it, and `docker cp` is not an
    /// option (the daemon refuses it for `--read-only` containers).
    #[test]
    fn warm_extract_args_unpack_as_root_into_workspace() {
        let args = super::warm_extract_args("oj-warm-x");
        assert!(args.starts_with(&["exec".to_string()]));
        assert!(args.contains(&"-i".to_string()));
        assert!(args.contains(&"--user".to_string()));
        assert!(args.contains(&"0:0".to_string()));
        assert!(args.contains(&"tar".to_string()));
        assert!(args.contains(&"/workspace".to_string()));
        assert!(args.contains(&"oj-warm-x".to_string()));
    }

    /// The whole W^X argument rests on `/workspace` being owned by root: a
    /// tmpfs owned by uid 65534 would let the submission chmod it back to
    /// writable, and would also block the root injection exec (which has an
    /// EMPTY capability bounding set and so cannot override DAC).
    #[test]
    fn warm_workspace_tmpfs_is_root_owned_and_unwritable_by_the_run_user() {
        let tmpfs = super::WARM_WORKSPACE_TMPFS;
        assert!(!tmpfs.contains("uid="), "got {tmpfs}");
        assert!(!tmpfs.contains("gid="), "got {tmpfs}");
        assert!(tmpfs.contains("mode=0755"), "got {tmpfs}");
    }

    /// An archive larger than the tmpfs cannot be unpacked; catching it here
    /// turns a half-extracted workspace (which would produce a bogus verdict)
    /// into a clean cold fallback.
    #[test]
    fn warm_archive_budget_matches_the_workspace_tmpfs_size() {
        assert!(
            super::WARM_WORKSPACE_TMPFS.contains(&format!(
                "size={}m",
                super::WARM_WORKSPACE_ARCHIVE_MAX_BYTES / (1024 * 1024)
            )),
            "archive budget must track the tmpfs size: {}",
            super::WARM_WORKSPACE_TMPFS
        );
    }

    /// Cold path: Docker's own `StartedAt`/`FinishedAt` bracket exactly the
    /// submission, so they are preferred over the wall clock.
    #[test]
    fn owned_container_timing_prefers_docker_timestamps() {
        assert_eq!(
            super::resolve_duration_ms(super::RunClock::ContainerLifetime, Some(120), 350),
            120
        );
        assert_eq!(
            super::resolve_duration_ms(super::RunClock::ContainerLifetime, None, 350),
            350
        );
    }

    /// Warm path: the container's `StartedAt` predates the submission by the
    /// whole idle period. Trusting it would report minutes of idling as the
    /// submission's runtime and turn every warm timeout into a bogus duration.
    #[test]
    fn adopted_container_timing_ignores_the_container_lifetime() {
        assert_eq!(
            super::resolve_duration_ms(super::RunClock::ExecWallClock, Some(3_600_000), 42),
            42
        );
    }

    /// Every warm failure must be recoverable by re-running cold; nothing in
    /// the warm path may fail a submission outright.
    #[test]
    fn warm_unavailable_is_a_distinct_error_variant() {
        let err = super::DockerError::WarmUnavailable("no such container".to_string());
        assert!(matches!(err, super::DockerError::WarmUnavailable(_)));
        assert!(err.to_string().contains("no such container"));
    }
}
