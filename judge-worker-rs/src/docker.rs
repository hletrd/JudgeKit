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
        if let Ok(content) = tokio::fs::read_to_string(path).await {
            if let Ok(bytes) = content.trim().parse::<u64>() {
                return Some(bytes / 1024);
            }
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
            };
        }
    };

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stdout.trim().splitn(4, ' ').collect();

            let oom_killed = parts.first().is_some_and(|s| s.trim() == "true");

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
            }
        }
        Err(_) => ContainerInspect {
            oom_killed: false,
            duration_ms: None,
            memory_peak_kb: None,
        },
    }
}

async fn kill_container(container_name: &str) {
    match tokio::time::timeout(
        std::time::Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS),
        tokio::process::Command::new("docker")
            .args(["kill", container_name])
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

fn resolve_seccomp_profile<'a>(
    phase: Phase,
    seccomp_profile_path: &'a Path,
    disable_custom_seccomp: bool,
    allow_default_compile_seccomp: bool,
) -> Result<Option<&'a Path>, JudgeEnvironmentError> {
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
    // VM-based languages (JVM, BEAM, .NET, pwsh) spawn many threads even at
    // runtime, so the run-phase limit must accommodate them.
    let pids_limit = if options.phase == Phase::Compile {
        "128"
    } else {
        "128"
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

    let mut child = tokio::process::Command::new("docker")
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
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
        if let Some(ref input) = options.input {
            if let Some(mut stdin) = child.stdin.take() {
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

    if seccomp_profile.is_some() && should_retry_without_seccomp(&result.stderr) {
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

#[cfg(test)]
mod tests {
    use super::{JudgeEnvironmentError, Phase, parse_timestamp_epoch_ms, resolve_seccomp_profile};
    use std::path::PathBuf;
    use tempfile::NamedTempFile;

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
}

pub async fn cleanup_orphaned_containers() {
    let output = tokio::process::Command::new("docker")
        .args([
            "ps",
            "-a",
            "--filter",
            "name=oj-",
            "--filter",
            "status=exited",
            "-q",
        ])
        .output()
        .await;

    if let Ok(output) = output {
        let ids = String::from_utf8_lossy(&output.stdout);
        let container_ids: Vec<&str> = ids.lines().filter(|l| !l.is_empty()).collect();
        if container_ids.is_empty() {
            return;
        }
        // Batch remove all orphaned containers in a single docker rm call
        let mut args = vec!["rm".to_string()];
        args.extend(container_ids.iter().map(|s| s.to_string()));
        match tokio::process::Command::new("docker")
            .args(&args)
            .output()
            .await
        {
            Ok(_) => {
                tracing::debug!(
                    count = container_ids.len(),
                    "Cleaned up orphaned containers"
                );
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to batch-remove orphaned containers");
            }
        }
    }
}
