use std::collections::HashSet;
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

/// Uid/gid every judged process runs as, cold or warm.
const SANDBOX_UID: u32 = 65534;

/// Memory ceiling a warm container starts with. `docker update` lowers this to
/// the submission's real limit when the container is adopted, so it only needs
/// to be >= any per-submission limit the judge will ask for.
const WARM_CEILING_MEMORY_MB: u32 = 1024;

/// How far a warm run's reported duration may sit from the problem's time
/// limit before the result is considered too close to call.
///
/// Cold measures `State.FinishedAt - State.StartedAt`; warm measures
/// `exec_die - exec_start` from the same daemon's event stream (see
/// [`exec_duration_ms_from_events`]). Both are stamped by the daemon around
/// the process, so both exclude the CLI round trip — but they do not bracket
/// it at exactly the same instant, and by how much they differ turns out to
/// depend on the daemon version. Measured against two live daemons with a
/// workload that also timed ITSELF with `CLOCK_MONOTONIC`, so the overhead
/// each clock adds is directly visible:
///
/// | daemon | cold − self | warm − self |
/// |--------|-------------|-------------|
/// | 29.6.2 | +20…+53 ms  | +11…+34 ms  |
/// | 26.1.5 | +0…+3 ms    | +29…+47 ms  |
///
/// So warm can over-report relative to cold by up to ~46 ms, and (on another
/// daemon) under-report by ~20 ms. This floor is ~3× the worst observed
/// difference, which is the headroom that keeps the residual error from
/// deciding a verdict. Anything landing inside this band of the limit is
/// handed back to the cold path, which is authoritative.
const WARM_TIMING_UNCERTAINTY_MS: u64 = 150;

/// Relative form of [`WARM_TIMING_UNCERTAINTY_MS`], applied as the larger of
/// the two so long limits get a proportionate band.
const WARM_UNCERTAINTY_PERCENT: u64 = 10;

/// How close a warm run's peak memory may come to the submission's memory
/// limit before the result is considered too close to call, in KiB.
///
/// An adopted container's cgroup is not pristine: it still holds the idle
/// `sleep infinity` process and whatever the image start-up charged to it, so
/// a warm run always has slightly LESS headroom than the cold run it stands in
/// for. Near the limit that difference could decide whether the kernel OOM
/// killer fires, which is exactly what produces a MemoryLimit verdict. An
/// idle warm container's peak was measured at 3.6–13.7 MiB against a live
/// daemon (the spread is image page cache); this floor covers the worst of
/// that with headroom.
const WARM_MEMORY_UNCERTAINTY_KB: u64 = 32 * 1024;

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

/// Host paths that may hold a container's cgroup v2 memory event counters,
/// most likely first. Ordered to match [`cgroup_memory_peak_paths`]; there is
/// no cgroup v1 entry because v1 has no equivalent cumulative `oom_kill`
/// counter (`memory.oom_control` reports state, not a count).
fn cgroup_memory_events_paths(container_id: &str) -> [String; 2] {
    [
        format!("/sys/fs/cgroup/system.slice/docker-{container_id}.scope/memory.events"),
        format!("/sys/fs/cgroup/docker/{container_id}/memory.events"),
    ]
}

/// Cumulative count of processes the kernel OOM-killed in this container's
/// cgroup, or `None` when the counter is not readable from this host.
///
/// This is how the warm path detects a MemoryLimit. A cold run gets its OOM
/// signal from `docker inspect`'s `State.OOMKilled`, but that flag describes
/// the CONTAINER, and an adopted container survives its exec being OOM-killed
/// (its `sleep infinity` PID 1 is not the process the kernel picked). Verified
/// against a live daemon: an exec that allocates past a 64 MiB limit exits 137
/// while the container still reports `OOMKilled=false`, and `memory.events`
/// goes from `oom_kill 0` to `oom_kill 1`. Taking the delta across the exec
/// restores exact parity with the cold flag.
async fn read_cgroup_oom_kill_count(container_id: &str) -> Option<u64> {
    for path in cgroup_memory_events_paths(container_id) {
        let Ok(content) = tokio::fs::read_to_string(&path).await else {
            continue;
        };
        return parse_cgroup_oom_kill_count(&content);
    }
    None
}

/// Pull the `oom_kill` counter out of a cgroup v2 `memory.events` file.
fn parse_cgroup_oom_kill_count(content: &str) -> Option<u64> {
    content.lines().find_map(|line| {
        let (key, value) = line.split_once(' ')?;
        (key == "oom_kill").then(|| value.trim().parse::<u64>().ok())?
    })
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

    // A warm container owns a host staging directory (its `/workspace`); it
    // dies with the container. Hooked in here rather than at the call sites so
    // that EVERY destruction path — the pool's drain, a failed creation, and
    // the post-run removal inside `run_and_measure` — cleans it up.
    if container_name.starts_with(crate::pool::WARM_CONTAINER_PREFIX) {
        remove_warm_staging_dir(container_name).await;
    }
}

/// Per-container host directory that serves as an adopted warm container's
/// `/workspace`.
///
/// Created empty and bind-mounted READ-ONLY at container creation; the
/// submission's files are written into it from the HOST side at adopt time,
/// exactly the way the cold path prepares `options.workspace_dir`, and the
/// container sees them through the live bind mount. Nothing is ever written
/// from inside the container, which is what makes the warm `/workspace`
/// W^X: the mount is genuinely read-only rather than locked down after the
/// fact.
///
/// It lives under `std::env::temp_dir()` — the same base `SandboxWorkspace`
/// uses for cold workspaces — deliberately, on two counts:
///   * the daemon already resolves bind mounts from that directory for every
///     cold run, so no new host-path handling is introduced; and
///   * a bind mount inherits its source filesystem's mount options, `noexec`
///     included (verified against a live daemon: staging a compiled binary on
///     a `noexec` tmpfs makes `./solution` fail with EACCES). Sharing the cold
///     path's filesystem means a warm run can execute a compiled binary
///     exactly when a cold run can.
///
/// `None` for a name that is not a plain container name, so the returned path
/// can never escape the temp directory.
fn warm_staging_dir(container: &str) -> Option<std::path::PathBuf> {
    if container.is_empty()
        || !container
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
        || container.contains("..")
    {
        return None;
    }
    Some(warm_staging_root().join(format!("{WARM_STAGING_PREFIX}{container}")))
}

/// Filename prefix that marks a directory under [`warm_staging_root`] as a warm
/// container's staging directory. The container name follows verbatim, which is
/// what lets the startup sweep map a leftover directory back to the container
/// that owned it.
const WARM_STAGING_PREFIX: &str = "judgekit-warm-";

/// Directory the per-container staging directories live in — the same base the
/// cold path's `SandboxWorkspace` uses, deliberately (see [`warm_staging_dir`]).
fn warm_staging_root() -> std::path::PathBuf {
    std::env::temp_dir()
}

/// Create a warm container's staging directory, owned and moded exactly like
/// the cold path's `options.workspace_dir` (uid/gid 65534, 0700) so an adopted
/// container's `/workspace` is indistinguishable from a cold one's.
async fn create_warm_staging_dir(container: &str) -> Result<std::path::PathBuf, String> {
    let dir = warm_staging_dir(container)
        .ok_or_else(|| format!("unsafe warm container name {container:?}"))?;

    let target = dir.clone();
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        let _ = std::fs::remove_dir_all(&target);
        std::fs::create_dir(&target)?;
        std::os::unix::fs::chown(&target, Some(SANDBOX_UID), Some(SANDBOX_UID))?;
        std::fs::set_permissions(
            &target,
            <std::fs::Permissions as std::os::unix::fs::PermissionsExt>::from_mode(0o700),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| format!("warm staging dir task failed: {e}"))?
    .map_err(|e| format!("warm staging dir {}: {e}", dir.display()))?;

    Ok(dir)
}

/// Destroy a warm container's staging directory.
///
/// The tree is owned by the sandbox uid, so a worker that is not root reclaims
/// it first — the same chown-back-then-remove dance `SandboxWorkspace` does on
/// drop. Best effort: a leaked staging directory wastes disk, it cannot
/// affect a verdict.
async fn remove_warm_staging_dir(container: &str) {
    let Some(dir) = warm_staging_dir(container) else {
        return;
    };
    let _ = tokio::task::spawn_blocking(move || reclaim_and_remove_staging_dir(&dir)).await;
}

/// Blocking teardown of one staging directory: take ownership back, then
/// delete. Shared by the per-container removal above and the startup sweep.
fn reclaim_and_remove_staging_dir(dir: &std::path::Path) {
    if !dir.exists() {
        return;
    }
    // SAFETY: getuid/getgid are async-signal-safe with no side effects.
    let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
    let _ = crate::workspace::chown_recursive(dir, uid, gid);
    if let Err(e) = std::fs::remove_dir_all(dir) {
        tracing::warn!(
            error = %e,
            path = %dir.display(),
            "failed to remove warm staging directory",
        );
    }
}

/// Copy a prepared cold workspace into a warm container's staging directory,
/// preserving every entry's mode and ownership byte for byte.
///
/// This is the whole injection mechanism, and it is deliberately the same
/// filesystem operation the cold path already depends on: the files a warm
/// container sees are the files `executor.rs` produced, with the ownership and
/// modes it set (workspace 0700 65534:65534, source 0600, compiled artifacts
/// whatever the compile container left). The previous tar-through-a-root-exec
/// injection rewrote all of that and left `/workspace` unreadable to the run
/// user.
///
/// Symlinks are recreated as symlinks and never followed: a compile phase runs
/// as the sandbox user in a writable workspace and can plant
/// `ln -s /etc/shadow loot`, which a dereferencing copy would happily read as
/// the worker (root) and hand to the submission.
fn copy_workspace_into_staging(
    source: &std::path::Path,
    dest: &std::path::Path,
) -> std::io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    use std::os::unix::fs::PermissionsExt;

    // Depth-first PREORDER: a parent always precedes its children, so walking
    // the list backwards later applies ownership/modes to children first. That
    // ordering matters — a directory chowned to 65534 and chmodded to 0700 is
    // no longer writable by a non-root worker, so it must be finished last.
    let mut pending: Vec<std::path::PathBuf> = vec![std::path::PathBuf::new()];
    let mut created: Vec<(std::path::PathBuf, std::fs::Metadata)> = Vec::new();

    while let Some(rel) = pending.pop() {
        let from = source.join(&rel);
        let to = dest.join(&rel);
        let meta = std::fs::symlink_metadata(&from)?;
        let file_type = meta.file_type();

        if file_type.is_dir() {
            if !rel.as_os_str().is_empty() {
                std::fs::create_dir(&to)?;
            }
            for entry in std::fs::read_dir(&from)? {
                pending.push(rel.join(entry?.file_name()));
            }
        } else if file_type.is_file() {
            std::fs::copy(&from, &to)?;
        } else if file_type.is_symlink() {
            std::os::unix::fs::symlink(std::fs::read_link(&from)?, &to)?;
        } else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "refusing to stage non-regular workspace entry {}",
                    from.display()
                ),
            ));
        }

        created.push((rel, meta));
    }

    for (rel, meta) in created.iter().rev() {
        let to = dest.join(rel);
        // chown before chmod: chowning clears setuid/setgid bits.
        std::os::unix::fs::lchown(&to, Some(meta.uid()), Some(meta.gid()))?;
        if !meta.file_type().is_symlink() {
            std::fs::set_permissions(&to, std::fs::Permissions::from_mode(meta.mode() & 0o7777))?;
        }
    }

    Ok(())
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

    run_and_measure(&mut child, options, &container_name, &Measurement::Cold).await
}

/// Everything the warm path needs in order to measure an adopted container's
/// exec the way the cold path measures a container's lifetime.
struct WarmMeasurement {
    /// Container ID, not name: cgroup paths and `docker events` actor filters
    /// are keyed by ID.
    container_id: String,
    /// `--since` bound for the post-run `docker events` query, captured just
    /// before the exec was spawned.
    events_since: String,
    /// Cumulative cgroup `oom_kill` count sampled before the exec, so the
    /// delta afterwards attributes an OOM to THIS run and not to the
    /// container's past.
    oom_kill_before: Option<u64>,
    /// Set once the run has been measured: `true` when the daemon told us when
    /// the exec started and stopped, `false` when the reported duration is CLI
    /// wall clock and therefore not comparable with a cold run's.
    daemon_timed: std::sync::atomic::AtomicBool,
}

/// Where a run's duration, OOM status and peak memory come from. Everything
/// else about a judged run — output capping, stdin, the timeout, the
/// exit-status mapping — is shared verbatim by both variants.
enum Measurement<'a> {
    /// The container was created for this run, so Docker's own `StartedAt` /
    /// `FinishedAt` bracket exactly the submission and exclude container
    /// creation and cgroup setup overhead, and `State.OOMKilled` describes the
    /// process that ran.
    Cold,
    /// The container was already running (warm path). Its `StartedAt` predates
    /// the submission by the whole idle period and its `State.OOMKilled`
    /// describes a `sleep infinity` that outlives the submission, so BOTH have
    /// to come from elsewhere: the daemon's `exec_start`/`exec_die` events and
    /// the container's cgroup counters.
    Warm(&'a WarmMeasurement),
}

/// Counters that only exist while the container is alive, sampled before any
/// kill. Verified against a live daemon: a container's cgroup directory is
/// gone the instant its last process exits, so `memory.peak` MUST be read
/// while the warm container is still up.
struct LiveCgroupSample {
    memory_peak_kb: Option<u64>,
    oom_killed: bool,
}

impl Measurement<'_> {
    /// Read whatever must be read before the container can be killed.
    async fn sample_live_cgroup(&self) -> Option<LiveCgroupSample> {
        match self {
            Measurement::Cold => None,
            Measurement::Warm(warm) => {
                let memory_peak_kb = read_cgroup_memory_peak(&warm.container_id).await;
                let oom_after = read_cgroup_oom_kill_count(&warm.container_id).await;
                let oom_killed = match (warm.oom_kill_before, oom_after) {
                    (Some(before), Some(after)) => after > before,
                    // Unreadable counter: fall back to "no OOM observed". The
                    // caller refuses any run whose peak lands near the limit,
                    // and an OOM-killed process still exits 137, which the
                    // verdict classifier treats as MemoryLimit on its own.
                    _ => false,
                };
                Some(LiveCgroupSample {
                    memory_peak_kb,
                    oom_killed,
                })
            }
        }
    }

    /// Turn the run into the OOM / duration / peak-memory triple the result
    /// reports. `wall_ms` is the wall clock measured around the child process.
    async fn finish(
        &self,
        container_name: &str,
        live: Option<LiveCgroupSample>,
        wall_ms: u64,
    ) -> ContainerInspect {
        match self {
            Measurement::Cold => inspect_container_state(container_name).await,
            Measurement::Warm(warm) => {
                let live = live.unwrap_or(LiveCgroupSample {
                    memory_peak_kb: None,
                    oom_killed: false,
                });
                let exec_ms = exec_duration_ms_from_events(
                    &warm.container_id,
                    &warm.events_since,
                    &unix_timestamp_arg(std::time::SystemTime::now()),
                )
                .await;
                warm.daemon_timed
                    .store(exec_ms.is_some(), std::sync::atomic::Ordering::Relaxed);
                ContainerInspect {
                    oom_killed: live.oom_killed,
                    duration_ms: Some(exec_ms.unwrap_or(wall_ms)),
                    memory_peak_kb: live.memory_peak_kb,
                    // An adopted container is running by definition, so the
                    // "container never started" heuristic cannot apply.
                    started: true,
                }
            }
        }
    }
}

/// Format a `SystemTime` the way `docker events --since/--until` wants it:
/// unix seconds with a nanosecond fraction.
fn unix_timestamp_arg(t: std::time::SystemTime) -> String {
    let d = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}.{:09}", d.as_secs(), d.subsec_nanos())
}

/// Runtime of the single `docker exec` this container ever served, taken from
/// the daemon's own event stream.
///
/// This is the warm path's answer to the cold path's `StartedAt`/`FinishedAt`:
/// both timestamps are stamped by the daemon around the process itself, so
/// neither includes the CLI round trip. Measured against a live daemon on
/// identical CPU-bound work, `exec_die - exec_start` came out 5–7 ms below the
/// `docker exec` wall clock and inside the cold clock's own run-to-run spread,
/// whereas the naive wall clock is inflated by the whole CLI round trip
/// (50–150 ms on a loaded daemon) that the cold clock deliberately excludes.
///
/// Returns `None` unless EXACTLY one `exec_start`/`exec_die` pair is found. A
/// pool container is single-use and the worker execs into it exactly once, so
/// anything else means the daemon's event buffer had already evicted the pair,
/// or something else is exec'ing into the container — in either case the
/// caller must refuse the warm result rather than report a duration it cannot
/// stand behind.
async fn exec_duration_ms_from_events(container_id: &str, since: &str, until: &str) -> Option<u64> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args([
                "events",
                "--since",
                since,
                "--until",
                until,
                "--filter",
                &format!("container={container_id}"),
                "--filter",
                "event=exec_start",
                "--filter",
                "event=exec_die",
                "--format",
                "{{json .}}",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;

    if !output.status.success() {
        tracing::warn!(
            container_id,
            stderr = %String::from_utf8_lossy(&output.stderr).trim(),
            "docker events lookup for warm exec timing failed"
        );
        return None;
    }

    parse_exec_window_ns(&String::from_utf8_lossy(&output.stdout))
        .map(|elapsed_ns| elapsed_ns / 1_000_000)
}

/// Extract the elapsed nanoseconds between the one `exec_start` and the one
/// `exec_die` in a `docker events --format '{{json .}}'` stream.
fn parse_exec_window_ns(events: &str) -> Option<u64> {
    let mut start: Option<u64> = None;
    let mut die: Option<u64> = None;

    for line in events.lines().filter(|l| !l.trim().is_empty()) {
        let value: serde_json::Value = serde_json::from_str(line).ok()?;
        let time_ns = value.get("timeNano")?.as_u64()?;
        let action = value.get("Action")?.as_str()?;
        // The action carries the command: "exec_start: python3 sol.py".
        let slot = if action.starts_with("exec_start") {
            &mut start
        } else if action.starts_with("exec_die") {
            &mut die
        } else {
            continue;
        };
        if slot.is_some() {
            return None; // more than one exec in the window: not ours to time
        }
        *slot = Some(time_ns);
    }

    match (start, die) {
        (Some(start), Some(die)) if die >= start => Some(die - start),
        _ => None,
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
    measurement: &Measurement<'_>,
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
            let live = measurement.sample_live_cgroup().await;
            let state = measurement
                .finish(container_name, live, wall_duration_ms)
                .await;
            remove_container(container_name).await;
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
            kill_container(container_name).await;
            remove_container(container_name).await;
            Err(e)
        }
        Err(_) => {
            // Timeout
            let wall_duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
            // Sample the cgroup BEFORE the kill: the container's cgroup
            // directory disappears the moment its last process exits, so
            // `memory.peak` is unreadable a millisecond later.
            let live = measurement.sample_live_cgroup().await;
            kill_container(container_name).await;
            let state = measurement
                .finish(container_name, live, wall_duration_ms)
                .await;
            remove_container(container_name).await;
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
        // The adopted `/workspace` is a `:ro` bind mount of the container's
        // staging directory (see `warm_staging_dir`). A caller that asked for
        // a writable workspace would silently get a read-only one.
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

/// `docker exec` arguments that run the submission command inside an adopted
/// warm container with the same user and workdir the cold path uses.
///
/// No `--ulimit` here, and none is needed: `docker exec` does not accept the
/// flag, but the container's rlimits DO apply to an exec'd process. Verified
/// against a live daemon (Docker 29.6.1) — in a container created with
/// `--ulimit nofile=1024:1024`, `docker exec … cat /proc/self/limits` reports
/// `Max open files 1024 1024`, while the same exec in a container created
/// without the flag reports the daemon default of 1048576. So the fd ceiling a
/// submission sees is identical on the warm and cold paths; please do not
/// re-litigate this.
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
/// this run reflects only this run: the container has been idling, and
/// `memory.peak` is monotonic.
///
/// Returns false when the counter exists but could not be reset (cgroup v2
/// `memory.peak` is only writable from Linux 6.8; on 5.19–6.7 it is read-only).
/// That is NOT a reason to refuse the warm path: `memory_peak_kb` is reported
/// to the user but is never an input to a verdict — MemoryLimit comes from the
/// kernel OOM killer, which the cgroup limit governs identically either way.
/// On such a kernel the reported peak is simply an over-estimate by the
/// container's idle baseline, and an over-estimate only ever makes the
/// near-limit guard refuse MORE runs.
async fn reset_cgroup_memory_peak(container_id: &str) -> bool {
    for path in cgroup_memory_peak_paths(container_id) {
        if tokio::fs::read_to_string(&path).await.is_err() {
            continue; // not the cgroup layout this host uses
        }
        // Writing any value resets cgroup v2 `memory.peak` and cgroup v1
        // `memory.max_usage_in_bytes`.
        return tokio::fs::write(&path, b"0").await.is_ok();
    }
    // No counter is readable at all, so nothing can be over-reported: cold and
    // warm both report `memory_peak_kb: None` on this host.
    true
}

/// Log the un-resettable `memory.peak` condition once per process rather than
/// once per judged test case.
static WARM_PEAK_RESET_WARNED: std::sync::Once = std::sync::Once::new();

/// Run one short Docker command for the warm path, mapping EVERY failure mode
/// — spawn error, wedged daemon, non-zero exit, missing container — onto
/// `WarmUnavailable` so the caller falls back to a cold run.
async fn warm_docker_step(args: &[String], step: &str) -> Result<Vec<u8>, DockerError> {
    let mut command = tokio::process::Command::new("docker");
    command
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    // Timeout-guarded like every other Docker invocation in this file: a wedged
    // daemon must not hold the executor's concurrency slot. kill_on_drop tears
    // down the CLI child when this future is dropped.
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        command.output(),
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

/// Stderr fragments that mean `docker exec` never got as far as running the
/// submission's command.
///
/// Verified against a live daemon: exec'ing into a container that was removed
/// exits 1 with "No such container", a stopped one exits 1 with "is not
/// running", and a command that is not there exits 127 with "OCI runtime exec
/// failed". None of those are the submission's doing, and reporting the exit
/// code as a verdict turned a container reaped between inspect and exec into a
/// RuntimeError for the user.
const EXEC_MACHINERY_ERROR_SNIPPETS: &[&str] = &[
    "Error response from daemon",
    "OCI runtime exec failed",
    "No such container",
    "is not running",
    "cannot exec in a stopped",
    "exec failed:",
];

/// Whether a finished `docker exec` failed as MACHINERY rather than as a
/// submission.
///
/// Deliberately conservative in the safe direction: the worst case for a false
/// positive is one wasted cold re-run (which then produces the real verdict),
/// while a false negative reports the daemon's own diagnostic as the
/// submission's RuntimeError.
fn exec_machinery_failure(result: &DockerRunResult) -> Option<String> {
    if result.timed_out {
        // The command ran; we killed it. That is a verdict, not a failure.
        return None;
    }
    if !result.stdout.is_empty() {
        return None; // the submission produced output, so it ran
    }
    // `docker exec` uses these itself when it cannot start the command; a
    // submission exiting with one of them is re-run cold, which is harmless.
    if !matches!(
        result.exit_code,
        Some(1) | Some(125) | Some(126) | Some(127)
    ) {
        return None;
    }
    EXEC_MACHINERY_ERROR_SNIPPETS
        .iter()
        .find(|snippet| result.stderr.contains(**snippet))
        .map(|_| result.stderr.trim().to_string())
}

/// Half-width of the band around a limit inside which a warm measurement is
/// not trusted to decide a verdict.
fn warm_uncertainty_band(limit: u64, floor: u64) -> u64 {
    floor.max(limit / 100 * WARM_UNCERTAINTY_PERCENT)
}

/// Why this warm result is too close to a limit to stand behind, if it is.
///
/// The warm and cold clocks are comparable but not identical, and an adopted
/// container's cgroup starts with slightly less headroom than a fresh one's.
/// Neither difference is large, but "not large" is not "zero", so any result
/// whose duration or peak memory lands close enough to a limit that the
/// difference could flip the verdict is handed back for a cold re-run. A
/// borderline submission getting re-run is cheap; a wrong verdict is not.
fn warm_result_is_too_close_to_call(
    result: &DockerRunResult,
    effective_time_limit_ms: u64,
    memory_limit_mb: u32,
) -> Option<String> {
    let time_band = warm_uncertainty_band(effective_time_limit_ms, WARM_TIMING_UNCERTAINTY_MS);
    if result.duration_ms >= effective_time_limit_ms.saturating_sub(time_band)
        && result.duration_ms <= effective_time_limit_ms.saturating_add(time_band)
    {
        return Some(format!(
            "duration {}ms is within {}ms of the {}ms limit",
            result.duration_ms, time_band, effective_time_limit_ms
        ));
    }

    let memory_limit_kb = u64::from(get_memory_limit_mb(memory_limit_mb)) * 1024;
    let memory_band = warm_uncertainty_band(memory_limit_kb, WARM_MEMORY_UNCERTAINTY_KB);
    match result.memory_peak_kb {
        Some(peak) if peak.saturating_add(memory_band) >= memory_limit_kb => {
            return Some(format!(
                "peak memory {peak}KiB is within {memory_band}KiB of the {memory_limit_kb}KiB limit"
            ));
        }
        // No readable counter means this host's cgroups are out of reach (the
        // worker is containerised away from the daemon, say), and a kill can
        // then be attributed neither to the submission nor to the adopted
        // container's residual footprint. A cold run still gets its OOM flag
        // from `docker inspect`, so hand these back rather than report a
        // different memory figure than cold would. Exit 137 is included
        // because that is the OOM killer's signature and the verdict
        // classifier treats it as a MemoryLimit on its own.
        // (When the peak IS known an OOM always trips the band above, because
        // an OOM-killed cgroup peaks at its limit.)
        None if result.oom_killed || result.exit_code == Some(137) => {
            return Some("possible OOM with no readable peak-memory counter".to_string());
        }
        _ => {}
    }

    None
}

/// Execute one test case inside an ALREADY-RUNNING warm container.
///
/// `effective_time_limit_ms` is the problem's time limit as the verdict
/// classifier will apply it — NOT `options.timeout_ms`, which carries the
/// wall-clock overhead budget on top. It is needed here because a warm result
/// that lands too close to that limit is refused rather than reported.
///
/// Caller contract: `container` came from `PoolManager::acquire` (so it is
/// single-use), and the caller destroys it afterwards regardless of outcome.
/// EVERY `Err` from this function is [`DockerError::WarmUnavailable`] and means
/// the caller must re-run the same test case through [`run_docker`]; the warm
/// path may never fail a submission on its own.
///
/// The measurement half is [`run_and_measure`], shared verbatim with the cold
/// path, so adopting a warm container cannot change a verdict.
pub async fn run_docker_warm(
    options: &DockerRunOptions,
    container: &str,
    effective_time_limit_ms: u64,
) -> Result<DockerRunResult, DockerError> {
    if let Some(reason) = warm_refusal_reason(options) {
        return Err(DockerError::WarmUnavailable(reason));
    }

    // Resolve the container's real ID (cgroup paths and event filters are keyed
    // by ID, not by name) and its liveness in one call: a pruned or dead
    // container answers "No such container" here and falls back to cold
    // instead of failing the submission.
    let inspected = warm_docker_step(
        &[
            "inspect".into(),
            "-f".into(),
            "{{.Id}} {{.State.Running}}".into(),
            container.to_string(),
        ],
        "docker inspect (warm)",
    )
    .await?;
    let inspected = String::from_utf8_lossy(&inspected);
    let mut fields = inspected.split_whitespace();
    let container_id = fields
        .next()
        .unwrap_or_default()
        .trim_matches('"')
        .to_string();
    let running = fields.next().unwrap_or_default() == "true";
    if container_id.is_empty() || !running {
        return Err(DockerError::WarmUnavailable(format!(
            "warm container {container} is not running"
        )));
    }

    // 1) Retune limits down to this submission's.
    warm_docker_step(
        &warm_update_args(container, options.memory_limit_mb),
        "docker update (warm)",
    )
    .await?;

    // 2) Inject the prepared workspace from the HOST side, into the staging
    //    directory this container already has bind-mounted read-only at
    //    /workspace. Nothing is written from inside the container, so the run
    //    user cannot create, modify, chmod or chown anything under /workspace
    //    no matter what the files' modes are — and the files keep exactly the
    //    ownership and modes the cold path gives them, so a submission can
    //    read its own source and execute its own compiled binary.
    inject_warm_workspace(container, &options.workspace_dir).await?;

    // 3) Zero the peak-memory counter so the post-run reading is this run's and
    //    not the idle period's. Report-only, so a kernel that cannot reset it
    //    degrades the number instead of disabling the feature.
    if !reset_cgroup_memory_peak(&container_id).await {
        WARM_PEAK_RESET_WARNED.call_once(|| {
            tracing::warn!(
                "cgroup memory.peak is not resettable on this kernel (needs Linux 6.8+); \
                 warm runs will over-report peak memory by the container's idle baseline"
            );
        });
    }

    let measurement = WarmMeasurement {
        events_since: unix_timestamp_arg(std::time::SystemTime::now()),
        oom_kill_before: read_cgroup_oom_kill_count(&container_id).await,
        container_id,
        daemon_timed: std::sync::atomic::AtomicBool::new(false),
    };

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

    let result = run_and_measure(
        &mut child,
        options,
        container,
        &Measurement::Warm(&measurement),
    )
    .await
    .map_err(|e| match e {
        already @ DockerError::WarmUnavailable(_) => already,
        other => DockerError::WarmUnavailable(format!("warm run failed: {other}")),
    })?;

    // A `docker exec` that never started the command must not become a
    // verdict: exit 126/127 from the OCI runtime, or exit 1 from the daemon,
    // is the pool's problem, not the submission's.
    if let Some(reason) = exec_machinery_failure(&result) {
        return Err(DockerError::WarmUnavailable(format!(
            "docker exec (warm) did not run the command: {reason}"
        )));
    }

    // Without the daemon's own exec timestamps the reported duration is CLI
    // wall clock, which includes overhead the cold clock excludes. Refuse
    // rather than report a duration that is not comparable with cold's.
    if !measurement
        .daemon_timed
        .load(std::sync::atomic::Ordering::Relaxed)
        && !result.timed_out
    {
        return Err(DockerError::WarmUnavailable(
            "daemon did not report exec_start/exec_die for this run".to_string(),
        ));
    }

    if let Some(reason) =
        warm_result_is_too_close_to_call(&result, effective_time_limit_ms, options.memory_limit_mb)
    {
        return Err(DockerError::WarmUnavailable(format!(
            "warm measurement too close to call: {reason}"
        )));
    }

    Ok(result)
}

/// Populate an adopted warm container's staging directory with the prepared
/// workspace. Every failure maps to `WarmUnavailable`: a half-injected
/// workspace would judge as a wrong answer.
async fn inject_warm_workspace(container: &str, workspace_dir: &str) -> Result<(), DockerError> {
    let staging = warm_staging_dir(container).ok_or_else(|| {
        DockerError::WarmUnavailable(format!("unsafe warm container name {container:?}"))
    })?;
    let source = std::path::PathBuf::from(workspace_dir);

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        // The staging directory belongs to exactly one container and one run;
        // anything already in it means the pool handed out a container that
        // had already been used.
        match std::fs::read_dir(&staging) {
            Ok(mut entries) => {
                if entries.next().is_some() {
                    return Err(format!(
                        "staging directory {} is not empty",
                        staging.display()
                    ));
                }
            }
            Err(e) => return Err(format!("staging directory {}: {e}", staging.display())),
        }
        copy_workspace_into_staging(&source, &staging).map_err(|e| {
            format!(
                "staging {} into {}: {e}",
                source.display(),
                staging.display()
            )
        })
    })
    .await
    .map_err(|e| DockerError::WarmUnavailable(format!("workspace injection task failed: {e}")))?
    .map_err(|e| DockerError::WarmUnavailable(format!("workspace injection (warm): {e}")))
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
///   * `/workspace` is a read-only bind mount of a dedicated, initially empty
///     host staging directory instead of the submission's workspace (there is
///     no submission yet). The files are written into that directory from the
///     host when the container is adopted and appear through the live mount;
///     see [`warm_staging_dir`]. The mount is `:ro` exactly like a cold run's
///     workspace mount, so the run user can never write to `/workspace`.
///   * memory starts at a generous ceiling and is tightened to the
///     submission's real limit with `docker update` when the container is
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

    // Created before `docker run` so the bind mount has something to point at.
    // Every failure path below force-removes by name, and `remove_container`
    // destroys the staging directory along with the container.
    let staging = match create_warm_staging_dir(name).await {
        Ok(staging) => staging,
        Err(e) => {
            // Nothing was started yet, but a partially created directory must
            // not outlive this call.
            remove_warm_staging_dir(name).await;
            return Err(format!("warm staging directory setup failed: {e}"));
        }
    };
    let staging = match staging.to_str() {
        Some(staging) => staging.to_string(),
        None => {
            remove_warm_staging_dir(name).await;
            return Err("warm staging directory path is not valid UTF-8".to_string());
        }
    };

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
        // Same shape as the cold run-phase workspace mount: read-only, so the
        // submission cannot write to /workspace, and a real host directory, so
        // its contents keep the ownership and modes the executor set.
        "-v".into(),
        format!("{staging}:/workspace:ro"),
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

/// Decide which directory names under [`warm_staging_root`] are orphaned warm
/// staging directories, given the set of container names that must be spared.
///
/// Pure so the selection rule — the only part that can destroy data — is unit
/// testable without a daemon. A name is swept only when ALL of these hold:
///   * it carries the `judgekit-warm-` prefix, so nothing else in the shared
///     temp directory (cold workspaces included) is ever a candidate;
///   * the remainder is a warm container name (`oj-warm-…`) that
///     [`warm_staging_dir`] itself accepts, so a hostile or malformed entry
///     that could not have been created by this code is left alone; and
///   * that container name is not in `spare`.
fn select_orphaned_staging_dirs(entries: &[String], spare: &HashSet<String>) -> Vec<String> {
    entries
        .iter()
        .filter(|name| {
            let Some(container) = name.strip_prefix(WARM_STAGING_PREFIX) else {
                return false;
            };
            if !container.starts_with(crate::pool::WARM_CONTAINER_PREFIX) {
                return false;
            }
            // Round-trip through the path builder: only a name it would itself
            // produce this exact directory for is eligible for deletion.
            if warm_staging_dir(container).as_deref()
                != Some(&warm_staging_root().join(name.as_str()))
            {
                return false;
            }
            !spare.contains(container)
        })
        .cloned()
        .collect()
}

/// One-shot startup sweep for the OTHER half of a warm container: its host
/// staging directory.
///
/// [`remove_container`] tears the directory down on every in-process path, but
/// the container sweeps above remove containers by ID through a bulk
/// `docker rm -f` and never go through it. A worker SIGKILLed with eight warm
/// containers live therefore strands eight full workspace copies — compiled
/// binaries included — in the temp directory, and nothing ever reclaimed them.
///
/// Safety rests on two independent sources of "in use", unioned:
///   * every name `pool` tracks (idle plus Docker-call-in-flight). The pool
///     records a name BEFORE `docker run`, and the staging directory is created
///     inside that call, so a concurrent create is always covered — the
///     warm-pool seed task really does run alongside this sweep.
///   * every `oj-warm-*` container the daemon still knows about, which covers
///     containers already handed out to a run and any other worker process
///     sharing the host.
///
/// Ordering is what makes that airtight: the directory listing is taken FIRST
/// and both spare-sets AFTER. A directory that appears after the listing is not
/// a candidate at all, and one that was already listed had its name tracked
/// before it was created, so it is necessarily in the later snapshot. Whichever
/// way the race falls, a live container's directory survives.
///
/// Fail-soft throughout: any failure to establish the spare-set skips the whole
/// sweep (leaking disk is always preferable to deleting a live workspace), and
/// no error is propagated — a worker must start even if the sweep cannot run.
pub async fn cleanup_orphaned_warm_staging_dirs(pool: &crate::pool::PoolManager) {
    let root = warm_staging_root();
    let listing_root = root.clone();
    let entries = match tokio::task::spawn_blocking(move || -> std::io::Result<Vec<String>> {
        let mut names = Vec::new();
        for entry in std::fs::read_dir(&listing_root)? {
            let entry = entry?;
            // Only directories, and never follow a symlink into one.
            if !entry.file_type()?.is_dir() {
                continue;
            }
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
        Ok(names)
    })
    .await
    {
        Ok(Ok(entries)) => entries,
        Ok(Err(e)) => {
            tracing::warn!(
                error = %e,
                path = %root.display(),
                "Startup sweep: cannot list staging root; skipping staging reclaim"
            );
            return;
        }
        Err(e) => {
            tracing::warn!(error = %e, "Startup sweep: staging listing task failed");
            return;
        }
    };
    if entries.is_empty() {
        return;
    }

    let Some(mut spare) = live_warm_container_names().await else {
        tracing::warn!("Startup sweep: cannot enumerate warm containers; skipping staging reclaim");
        return;
    };
    spare.extend(pool.tracked_names().await);

    let orphans = select_orphaned_staging_dirs(&entries, &spare);
    if orphans.is_empty() {
        return;
    }

    let count = orphans.len();
    let _ = tokio::task::spawn_blocking(move || {
        for name in orphans {
            reclaim_and_remove_staging_dir(&root.join(name));
        }
    })
    .await;
    tracing::info!(
        count,
        "Startup sweep: reclaimed orphaned warm staging directories"
    );
}

/// Names of every `oj-warm-*` container the daemon still knows about, any
/// status. `None` when the listing could not be obtained, which callers must
/// treat as "spare everything" rather than "nothing is live".
async fn live_warm_container_names() -> Option<HashSet<String>> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args([
                "ps",
                "-a",
                "--filter",
                &format!("name={}", crate::pool::WARM_CONTAINER_PREFIX),
                "--format",
                "{{.Names}}",
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&output.stdout)
            // Docker renders a multi-named container as a comma-separated cell.
            .split(['\n', ','])
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .map(String::from)
            .collect(),
    )
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

    /// W^X, part 1: the staging directory a warm container gets as
    /// `/workspace` is bind-mounted READ-ONLY, exactly like a cold run's
    /// workspace mount. Nothing is ever written from inside the container, so
    /// there is no "lock it down afterwards" step that could be got wrong.
    #[test]
    fn warm_container_workspace_is_a_read_only_bind_mount() {
        let body = create_warm_container_source();
        assert!(
            body.contains("{staging}:/workspace:ro"),
            "warm /workspace must be a read-only bind mount of the staging dir"
        );
        assert!(
            !body.contains("/workspace:rw"),
            "warm /workspace must never be writable"
        );
        assert!(
            !body.contains("--tmpfs\".into(),\n        \"/workspace"),
            "warm /workspace must not be a tmpfs"
        );
    }

    fn create_warm_container_source() -> &'static str {
        let src = include_str!("docker.rs");
        let start = src
            .find("pub async fn create_warm_container(")
            .expect("create_warm_container present");
        let end = src[start..]
            .find("\n/// Force-remove a container by name")
            .expect("create_warm_container body is delimited")
            + start;
        &src[start..end]
    }

    /// The staging path is derived from a container name that the pool
    /// generates, but it must not be possible to aim it anywhere else.
    #[test]
    fn warm_staging_dir_rejects_names_that_could_escape_the_temp_dir() {
        for bad in [
            "",
            "../../etc",
            "oj-warm-../x",
            "oj-warm-a/b",
            "oj-warm-$(id)",
            "oj-warm-a b",
        ] {
            assert!(
                super::warm_staging_dir(bad).is_none(),
                "must refuse container name {bad:?}"
            );
        }

        let good = super::warm_staging_dir("oj-warm-3f2a-9b1c").expect("plain name is accepted");
        assert!(good.starts_with(std::env::temp_dir()));
        assert!(
            good.to_string_lossy().contains("oj-warm-3f2a-9b1c"),
            "got {}",
            good.display()
        );
    }

    /// Selection rule for the startup staging-directory reclaim. This is the
    /// only code in the worker that deletes a directory it did not create in
    /// the same process, so the rule is pinned here without needing a daemon.
    #[test]
    fn orphaned_staging_dirs_spare_live_containers_and_foreign_entries() {
        let entries: Vec<String> = [
            // Two leaked staging dirs from a SIGKILLed predecessor.
            "judgekit-warm-oj-warm-dead-1",
            "judgekit-warm-oj-warm-dead-2",
            // A live one: this process tracks it / the daemon still has it.
            "judgekit-warm-oj-warm-live",
            // Not ours: cold workspaces and unrelated temp junk share the root.
            "judgekit-ws-1234",
            "oj-warm-not-prefixed",
            "systemd-private-abc",
            // Prefixed, but the remainder is not a warm container name.
            "judgekit-warm-oj-4f1c-per-run",
            "judgekit-warm-",
            // Prefixed, but the remainder is a name `warm_staging_dir` would
            // refuse — never produced by this code, so never deleted by it.
            "judgekit-warm-oj-warm-..",
            "judgekit-warm-oj-warm-a b",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();

        let spare: super::HashSet<String> = ["oj-warm-live".to_string()].into_iter().collect();
        let mut swept = super::select_orphaned_staging_dirs(&entries, &spare);
        swept.sort();

        assert_eq!(
            swept,
            vec![
                "judgekit-warm-oj-warm-dead-1".to_string(),
                "judgekit-warm-oj-warm-dead-2".to_string(),
            ],
        );

        // With nothing spared, the live one is swept too — proving the spare
        // set, not some incidental filter, is what protected it above.
        let swept_all = super::select_orphaned_staging_dirs(&entries, &super::HashSet::new());
        assert!(swept_all.contains(&"judgekit-warm-oj-warm-live".to_string()));
        assert_eq!(swept_all.len(), 3);

        // Every swept name resolves back under the staging root, never outside.
        for name in swept_all {
            let path = super::warm_staging_root().join(&name);
            assert_eq!(path.parent(), Some(super::warm_staging_root().as_path()));
        }
    }

    /// The staging directory shares the cold workspace's base directory on
    /// purpose: a bind mount inherits its source filesystem's mount options, so
    /// staging somewhere `noexec` would make every compiled submission fail to
    /// start on the warm path only.
    #[test]
    fn warm_staging_dir_shares_the_cold_workspace_filesystem() {
        let cold = tempfile::TempDir::new().expect("cold workspace");
        let warm = super::warm_staging_dir("oj-warm-x").expect("staging path");
        assert_eq!(
            cold.path().parent(),
            warm.parent(),
            "warm staging must live beside the cold workspaces"
        );
    }

    fn fixture_mode(path: &std::path::Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        std::fs::symlink_metadata(path)
            .expect("stat fixture")
            .permissions()
            .mode()
            & 0o7777
    }

    /// Build the workspace the executor actually hands to a run-phase
    /// container: directory 0700, source 0600, compiled artifact 0755, all
    /// owned by the sandbox uid (only chownable as root, hence the `chown`
    /// flag).
    fn executor_shaped_workspace(chown: bool) -> tempfile::TempDir {
        use std::os::unix::fs::PermissionsExt;
        let ws = tempfile::TempDir::new().expect("workspace");
        let root = ws.path();

        std::fs::write(root.join("solution.py"), b"print(input())").expect("write source");
        std::fs::write(
            root.join("solution"),
            b"#!/bin/sh\ncat solution.py >/dev/null && echo ran\n",
        )
        .expect("write artifact");
        std::fs::create_dir(root.join("build")).expect("create nested dir");
        std::fs::write(root.join("build").join("obj.o"), b"\0\0").expect("write nested artifact");

        std::fs::set_permissions(
            root.join("solution.py"),
            std::fs::Permissions::from_mode(0o600),
        )
        .expect("chmod source");
        std::fs::set_permissions(
            root.join("solution"),
            std::fs::Permissions::from_mode(0o755),
        )
        .expect("chmod artifact");
        std::fs::set_permissions(root.join("build"), std::fs::Permissions::from_mode(0o755))
            .expect("chmod nested dir");
        std::fs::set_permissions(
            root.join("build").join("obj.o"),
            std::fs::Permissions::from_mode(0o644),
        )
        .expect("chmod nested artifact");

        if chown {
            for p in [
                root.join("build").join("obj.o"),
                root.join("build"),
                root.join("solution"),
                root.join("solution.py"),
                root.to_path_buf(),
            ] {
                std::os::unix::fs::chown(&p, Some(super::SANDBOX_UID), Some(super::SANDBOX_UID))
                    .expect("chown fixture to the sandbox uid");
            }
        }
        std::fs::set_permissions(root, std::fs::Permissions::from_mode(0o700)).expect("chmod root");
        ws
    }

    /// The injection must reproduce the workspace bit for bit. The previous
    /// implementation unpacked a root-owned `--mode=go-w` tar as uid 0, which
    /// left the 0700 workspace and 0600 source owned by root and therefore
    /// unreadable to the run user — every warm run would have failed. Assert
    /// on the modes and owners that actually come out.
    #[test]
    fn injection_reproduces_the_executor_s_ownership_and_modes() {
        use std::os::unix::fs::MetadataExt;

        let is_root = unsafe { libc::getuid() == 0 };
        let source = executor_shaped_workspace(is_root);
        let dest = tempfile::TempDir::new().expect("staging");
        // The real staging directory starts empty and 0700, like the source.
        std::fs::set_permissions(
            dest.path(),
            <std::fs::Permissions as std::os::unix::fs::PermissionsExt>::from_mode(0o700),
        )
        .expect("chmod staging");

        super::copy_workspace_into_staging(source.path(), dest.path()).expect("inject");

        for rel in ["", "solution.py", "solution", "build", "build/obj.o"] {
            let from = source.path().join(rel);
            let to = dest.path().join(rel);
            assert_eq!(
                fixture_mode(&to),
                fixture_mode(&from),
                "mode mismatch for {rel:?}"
            );
            let from_meta = std::fs::symlink_metadata(&from).expect("stat source");
            let to_meta = std::fs::symlink_metadata(&to).expect("stat staged");
            assert_eq!(to_meta.uid(), from_meta.uid(), "uid mismatch for {rel:?}");
            assert_eq!(to_meta.gid(), from_meta.gid(), "gid mismatch for {rel:?}");
        }
        assert_eq!(
            std::fs::read(dest.path().join("solution.py")).expect("read staged source"),
            b"print(input())"
        );

        if is_root {
            assert_eq!(
                std::fs::symlink_metadata(dest.path())
                    .expect("stat staged root")
                    .uid(),
                super::SANDBOX_UID,
                "the staged /workspace must belong to the run user, or it cannot read it"
            );
        }
    }

    /// A compile phase runs as the sandbox user in a WRITABLE workspace and can
    /// plant `ln -s /etc/shadow loot`. Dereferencing that during injection
    /// would have the worker (root) copy a host secret straight into the
    /// submission's `/workspace`.
    #[test]
    fn injection_never_follows_symlinks_out_of_the_workspace() {
        let outside = tempfile::TempDir::new().expect("outside dir");
        let secret = outside.path().join("host-secret");
        std::fs::write(&secret, b"host secret").expect("write secret");

        let source = tempfile::TempDir::new().expect("workspace");
        std::os::unix::fs::symlink(&secret, source.path().join("loot")).expect("plant symlink");
        std::os::unix::fs::symlink("/nonexistent/target", source.path().join("dangling"))
            .expect("plant dangling symlink");

        let dest = tempfile::TempDir::new().expect("staging");
        super::copy_workspace_into_staging(source.path(), dest.path()).expect("inject");

        let staged = std::fs::symlink_metadata(dest.path().join("loot")).expect("stat staged loot");
        assert!(
            staged.file_type().is_symlink(),
            "a workspace symlink must be staged as a symlink, not as its target's contents"
        );
        assert!(
            std::fs::symlink_metadata(dest.path().join("dangling"))
                .expect("stat staged dangling")
                .file_type()
                .is_symlink()
        );
    }

    /// A workspace whose entries are neither files, directories nor symlinks
    /// cannot be reproduced faithfully, so it must fall back to cold rather
    /// than be staged approximately.
    #[test]
    fn injection_refuses_entries_it_cannot_reproduce() {
        let source = tempfile::TempDir::new().expect("workspace");
        let fifo = source.path().join("fifo");
        let c_path = std::ffi::CString::new(fifo.to_string_lossy().as_bytes()).expect("cstring");
        // SAFETY: mkfifo takes a NUL-terminated path and a mode; no aliasing.
        if unsafe { libc::mkfifo(c_path.as_ptr(), 0o600) } != 0 {
            return; // the test filesystem does not support FIFOs
        }

        let dest = tempfile::TempDir::new().expect("staging");
        let err = super::copy_workspace_into_staging(source.path(), dest.path())
            .expect_err("a FIFO must not be staged");
        assert!(err.to_string().contains("non-regular"), "got {err}");
    }

    /// The one thing that mattered and was never tested before: what the run
    /// user can actually DO with the injected workspace inside a real
    /// container. Needs root (to chown the fixture to the sandbox uid) and a
    /// Docker daemon that can bind-mount the temp directory.
    #[tokio::test]
    async fn warm_workspace_is_readable_by_the_run_user_and_never_writable() {
        // SAFETY: getuid is async-signal-safe and has no side effects.
        if unsafe { libc::getuid() } != 0 {
            return; // chown to the sandbox uid needs root
        }
        if !docker_is_usable().await {
            return;
        }

        let name = format!(
            "{}{}",
            crate::pool::WARM_CONTAINER_PREFIX,
            uuid::Uuid::new_v4()
        );
        let settings = super::WarmContainerSettings {
            seccomp_profile_path: std::path::PathBuf::from("/nonexistent"),
            disable_custom_seccomp: true,
        };
        if let Err(e) = super::create_warm_container(WARM_TEST_IMAGE, &name, &settings).await {
            panic!("could not create a warm container: {e}");
        }

        let workspace = executor_shaped_workspace(true);
        let injected = super::inject_warm_workspace(
            &name,
            workspace.path().to_str().expect("utf-8 workspace path"),
        )
        .await;

        let probe = |args: Vec<&'static str>| {
            let name = name.clone();
            async move {
                let mut full: Vec<String> = vec![
                    "exec".into(),
                    "--user".into(),
                    "65534:65534".into(),
                    "--workdir".into(),
                    "/workspace".into(),
                    name,
                ];
                full.extend(args.into_iter().map(String::from));
                let out = tokio::process::Command::new("docker")
                    .args(&full)
                    .output()
                    .await
                    .expect("docker exec");
                (
                    out.status.success(),
                    String::from_utf8_lossy(&out.stdout).trim().to_string(),
                    String::from_utf8_lossy(&out.stderr).trim().to_string(),
                )
            }
        };

        let outcome = async {
            injected.map_err(|e| format!("injection failed: {e}"))?;

            // Readable: the run user must be able to read its own 0600 source
            // through the 0700 workspace. This is exactly what the previous
            // root-owned tar injection broke.
            let (ok, stdout, stderr) = probe(vec!["cat", "solution.py"]).await;
            if !ok || stdout != "print(input())" {
                return Err(format!("run user cannot read its own source: {stderr}"));
            }

            // Executable: the mount must not be noexec, or every compiled
            // language would fail on the warm path only.
            let (ok, stdout, stderr) = probe(vec!["./solution"]).await;
            if !ok || stdout != "ran" {
                return Err(format!("run user cannot execute its artifact: {stderr}"));
            }

            // ...and W^X: not writable, in any of the ways a submission could
            // try. `--cap-drop=ALL` empties the capability bounding set, so
            // there is nothing left to override the read-only mount with.
            for attempt in [
                vec!["sh", "-c", "touch /workspace/pwn"],
                vec!["sh", "-c", "echo x >> /workspace/solution.py"],
                vec!["sh", "-c", "chmod 777 /workspace/solution"],
                vec!["sh", "-c", "chown 65534:65534 /workspace/solution"],
                vec!["sh", "-c", "rm -f /workspace/solution.py"],
                vec!["sh", "-c", "mkdir /workspace/sub"],
                vec!["sh", "-c", "ln -s /etc/passwd /workspace/link"],
            ] {
                let label = attempt.join(" ");
                let (ok, _, _) = probe(attempt).await;
                if ok {
                    return Err(format!("run user was able to `{label}` under /workspace"));
                }
            }
            Ok(())
        }
        .await;

        super::remove_container_by_name(&name).await;
        assert!(
            !super::warm_staging_dir(&name)
                .expect("staging path")
                .exists(),
            "destroying a warm container must destroy its staging directory"
        );
        outcome.expect("warm workspace contract");
    }

    const WARM_TEST_IMAGE: &str = "alpine:3.21";

    async fn docker_is_usable() -> bool {
        tokio::process::Command::new("docker")
            .args(["image", "inspect", WARM_TEST_IMAGE])
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// The warm clock: `exec_die - exec_start`, straight from the daemon, so it
    /// excludes the CLI round trip exactly the way the cold clock excludes
    /// container creation.
    #[test]
    fn exec_window_is_measured_between_the_daemon_s_own_timestamps() {
        let events = concat!(
            r#"{"Type":"container","Action":"exec_start: ./solution","timeNano":1784561828678533469}"#,
            "\n",
            r#"{"Type":"container","Action":"exec_die","timeNano":1784561829202495552}"#,
            "\n"
        );
        assert_eq!(super::parse_exec_window_ns(events), Some(523_962_083));
    }

    /// Anything but exactly one exec in the window means the pair cannot be
    /// attributed to this run — the daemon's event buffer may have evicted it,
    /// or something else is exec'ing into the container. Refuse rather than
    /// report a duration that might belong to another run.
    #[test]
    fn exec_window_is_refused_unless_exactly_one_exec_is_found() {
        let start = r#"{"Action":"exec_start: x","timeNano":100}"#;
        let die = r#"{"Action":"exec_die","timeNano":200}"#;
        assert_eq!(super::parse_exec_window_ns(""), None);
        assert_eq!(super::parse_exec_window_ns(start), None);
        assert_eq!(super::parse_exec_window_ns(die), None);
        assert_eq!(
            super::parse_exec_window_ns(&format!("{start}\n{die}\n{start}\n{die}")),
            None
        );
        assert_eq!(
            super::parse_exec_window_ns(
                "{\"Action\":\"exec_start: x\",\"timeNano\":300}\n\
                 {\"Action\":\"exec_die\",\"timeNano\":200}"
            ),
            None,
            "an exec_die that predates its exec_start is not a measurement"
        );
    }

    #[test]
    fn events_timestamps_are_formatted_as_unix_seconds_with_nanoseconds() {
        let t = std::time::UNIX_EPOCH + std::time::Duration::new(1_784_561_828, 42);
        assert_eq!(super::unix_timestamp_arg(t), "1784561828.000000042");
    }

    /// An adopted container survives its exec being OOM-killed (its
    /// `sleep infinity` PID 1 is not what the kernel picks), so
    /// `State.OOMKilled` stays false and the cgroup counter is the only honest
    /// source. Verified against a live daemon.
    #[test]
    fn oom_kill_count_is_parsed_from_cgroup_memory_events() {
        let events = "low 0\nhigh 0\nmax 38\noom 1\noom_kill 1\noom_group_kill 0\n";
        assert_eq!(super::parse_cgroup_oom_kill_count(events), Some(1));
        assert_eq!(
            super::parse_cgroup_oom_kill_count("low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n"),
            Some(0)
        );
        assert_eq!(super::parse_cgroup_oom_kill_count("low 0\nhigh 0\n"), None);
        assert_eq!(super::parse_cgroup_oom_kill_count(""), None);
    }

    fn warm_result(exit_code: Option<i32>, stdout: &str, stderr: &str) -> super::DockerRunResult {
        super::DockerRunResult {
            stdout: stdout.as_bytes().to_vec(),
            stderr: stderr.to_string(),
            stdout_truncated: false,
            stderr_truncated: false,
            exit_code,
            timed_out: false,
            oom_killed: false,
            duration_ms: 10,
            memory_peak_kb: Some(1024),
            container_started: true,
        }
    }

    /// The Critical this replaces: a container reaped between inspect and exec
    /// made `docker exec` exit non-zero, and that exit code was reported as the
    /// submission's — a pool hiccup became the user's RuntimeError.
    #[test]
    fn a_failed_exec_is_never_a_verdict() {
        for (exit_code, stderr) in [
            (
                Some(1),
                "Error response from daemon: No such container: oj-warm-x",
            ),
            (
                Some(1),
                "Error response from daemon: container 51415be is not running",
            ),
            (
                Some(127),
                "OCI runtime exec failed: exec failed: unable to start container process: \
                 exec: \"/workspace/solution\": stat /workspace/solution: no such file or directory",
            ),
            (
                Some(126),
                "OCI runtime exec failed: exec failed: permission denied",
            ),
        ] {
            assert!(
                super::exec_machinery_failure(&warm_result(exit_code, "", stderr)).is_some(),
                "exit {exit_code:?} with {stderr:?} must fall back to cold"
            );
        }
    }

    /// ...but a submission that merely fails must still be judged, or every
    /// runtime error would cost a pointless second run.
    #[test]
    fn an_ordinary_failing_submission_is_still_a_verdict() {
        assert!(super::exec_machinery_failure(&warm_result(Some(0), "42", "")).is_none());
        assert!(
            super::exec_machinery_failure(&warm_result(Some(1), "", "Traceback: KeyError"))
                .is_none()
        );
        assert!(super::exec_machinery_failure(&warm_result(Some(139), "", "")).is_none());
        assert!(
            super::exec_machinery_failure(&warm_result(Some(137), "", "")).is_none(),
            "an OOM kill is a MemoryLimit verdict, not a broken exec"
        );
        // Output means the command ran, whatever it then printed to stderr.
        assert!(
            super::exec_machinery_failure(&warm_result(
                Some(1),
                "partial",
                "Error response from daemon"
            ))
            .is_none()
        );
        let mut timed_out = warm_result(None, "", "");
        timed_out.timed_out = true;
        assert!(super::exec_machinery_failure(&timed_out).is_none());
    }

    fn timed_result(duration_ms: u64) -> super::DockerRunResult {
        let mut result = warm_result(Some(0), "42", "");
        result.duration_ms = duration_ms;
        result
    }

    /// The safety net: a submission whose measured runtime lands near the limit
    /// is handed back to the cold path, which is authoritative. Warm and cold
    /// clocks agree to within their own jitter, but "within jitter" is exactly
    /// the region where jitter decides the verdict.
    #[test]
    fn a_run_near_the_time_limit_is_handed_back_to_the_cold_path() {
        for duration in [851, 1_000, 1_149] {
            assert!(
                super::warm_result_is_too_close_to_call(&timed_result(duration), 1_000, 256)
                    .is_some(),
                "{duration}ms against a 1000ms limit must fall back to cold"
            );
        }
        for duration in [10, 800, 1_200] {
            assert_eq!(
                super::warm_result_is_too_close_to_call(&timed_result(duration), 1_000, 256),
                None,
                "{duration}ms against a 1000ms limit is decided by the warm run"
            );
        }
    }

    /// The band scales with the limit, so a 10 s problem is not judged on a
    /// 50 ms margin.
    #[test]
    fn the_uncertainty_band_scales_with_the_limit() {
        assert_eq!(super::warm_uncertainty_band(1_000, 150), 150);
        assert_eq!(super::warm_uncertainty_band(10_000, 150), 1_000);
        assert_eq!(super::warm_uncertainty_band(100, 150), 150);
    }

    /// An adopted container's cgroup still holds its idle process and whatever
    /// the image start-up charged to it, so it has slightly less headroom than
    /// the fresh container it stands in for. Near the limit that difference
    /// could decide whether the OOM killer fires, which IS the MemoryLimit
    /// verdict.
    #[test]
    fn a_run_near_the_memory_limit_is_handed_back_to_the_cold_path() {
        let mut result = warm_result(Some(0), "42", "");
        result.memory_peak_kb = Some(230 * 1024);
        assert!(
            super::warm_result_is_too_close_to_call(&result, 1_000, 256).is_some(),
            "230MiB against a 256MiB limit must fall back to cold"
        );

        result.memory_peak_kb = Some(64 * 1024);
        assert_eq!(
            super::warm_result_is_too_close_to_call(&result, 1_000, 256),
            None
        );

        // No counter to check: a kill cannot be attributed to the submission
        // rather than to the adopted container's residual footprint, and cold
        // would still have reported an OOM flag from `docker inspect`.
        result.memory_peak_kb = None;
        result.oom_killed = true;
        assert!(super::warm_result_is_too_close_to_call(&result, 1_000, 256).is_some());
        result.oom_killed = false;
        result.exit_code = Some(137);
        assert!(
            super::warm_result_is_too_close_to_call(&result, 1_000, 256).is_some(),
            "exit 137 is the OOM killer's signature; without a counter it must go cold"
        );
        result.exit_code = Some(0);
        assert_eq!(
            super::warm_result_is_too_close_to_call(&result, 1_000, 256),
            None
        );
    }

    /// Warm and cold must be measured and classified by the SAME code, or a
    /// submission's verdict could depend on which container it happened to get.
    #[test]
    fn warm_and_cold_share_the_whole_measurement_half() {
        let src = include_str!("docker.rs");
        assert_eq!(
            src.matches("\nasync fn run_and_measure(").count(),
            1,
            "there must be exactly one measurement implementation"
        );
        for caller in ["run_docker_once", "run_docker_warm"] {
            let start = src
                .find(&format!("async fn {caller}("))
                .unwrap_or_else(|| panic!("{caller} present"));
            let body = &src[start..];
            let end = body.find("\n}\n").expect("body is delimited");
            assert!(
                body[..end].contains("run_and_measure("),
                "{caller} must measure through run_and_measure"
            );
        }
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
