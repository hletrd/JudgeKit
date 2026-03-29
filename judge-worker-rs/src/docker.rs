use std::path::Path;
use std::time::Instant;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
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

#[derive(PartialEq)]
pub enum Phase {
    Compile,
    Run,
}

pub struct DockerRunResult {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub oom_killed: bool,
    pub duration_ms: u64,
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

struct ContainerInspect {
    oom_killed: bool,
    duration_ms: Option<u64>,
}

/// Parse the time-of-day portion of a Docker RFC 3339 timestamp into
/// nanoseconds since midnight.  Accepts `2024-01-15T10:30:45.123456789Z`.
fn parse_timestamp_nanos_since_midnight(s: &str) -> Option<u128> {
    let after_t = s.split('T').nth(1)?;
    let end = after_t
        .find(|c: char| !c.is_ascii_digit() && c != ':' && c != '.')
        .unwrap_or(after_t.len());
    let time_part = &after_t[..end];

    let mut parts = time_part.split(':');
    let hours: u64 = parts.next()?.parse().ok()?;
    let minutes: u64 = parts.next()?.parse().ok()?;
    let sec_frac = parts.next()?;

    let (secs, nanos) = if let Some(dot) = sec_frac.find('.') {
        let secs: u64 = sec_frac[..dot].parse().ok()?;
        let frac = &sec_frac[dot + 1..];
        let padded = format!("{:0<9}", &frac[..frac.len().min(9)]);
        let nanos: u64 = padded.parse().ok()?;
        (secs, nanos)
    } else {
        (sec_frac.parse().ok()?, 0u64)
    };

    Some(u128::from(hours * 3600 + minutes * 60 + secs) * 1_000_000_000 + u128::from(nanos))
}

/// Inspect a stopped container for OOM status and actual runtime (from
/// Docker's `State.StartedAt` / `State.FinishedAt` timestamps).  This
/// excludes container creation and namespace/cgroup setup overhead.
async fn inspect_container_state(container_name: &str) -> ContainerInspect {
    let result = tokio::process::Command::new("docker")
        .args([
            "inspect",
            "--format",
            "{{json .State.OOMKilled}} {{.State.StartedAt}} {{.State.FinishedAt}}",
            container_name,
        ])
        .output()
        .await;

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stdout.trim().splitn(3, ' ').collect();

            let oom_killed = parts.first().is_some_and(|s| s.trim() == "true");

            let duration_ms = if parts.len() >= 3 {
                match (
                    parse_timestamp_nanos_since_midnight(parts[1]),
                    parse_timestamp_nanos_since_midnight(parts[2]),
                ) {
                    (Some(start), Some(end)) if end >= start => {
                        Some(((end - start) / 1_000_000) as u64)
                    }
                    _ => None,
                }
            } else {
                None
            };

            ContainerInspect {
                oom_killed,
                duration_ms,
            }
        }
        Err(_) => ContainerInspect {
            oom_killed: false,
            duration_ms: None,
        },
    }
}

async fn kill_container(container_name: &str) {
    let _ = tokio::process::Command::new("docker")
        .args(["kill", container_name])
        .output()
        .await;
}

async fn remove_container(container_name: &str) {
    let _ = tokio::process::Command::new("docker")
        .args(["rm", "-f", container_name])
        .output()
        .await;
}

fn should_retry_without_seccomp(stderr: &str) -> bool {
    SECCOMP_INIT_ERROR_SNIPPETS.iter().all(|snippet| stderr.contains(snippet))
}

async fn run_docker_once(
    options: &DockerRunOptions,
    seccomp_profile: Option<&Path>,
) -> Result<DockerRunResult, DockerError> {
    let container_name = format!("oj-{}", Uuid::new_v4());
    let mem_limit = get_memory_limit_mb(options.memory_limit_mb);
    // VM-based languages (JVM, BEAM, .NET, pwsh) spawn many threads even at
    // runtime, so the run-phase limit must accommodate them.
    let pids_limit = if options.phase == Phase::Compile { "128" } else { "128" };

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
            format!("{}m", mem_limit * 4) // allow swap during compilation for heavy languages (qemu)
        } else {
            format!("{}m", mem_limit) // strict limit during execution
        },
        "--cpus".into(),
        EXECUTION_CPU_LIMIT.into(),
        "--pids-limit".into(),
        pids_limit.into(),
        "--read-only".into(),
        "--tmpfs".into(),
        if options.phase == Phase::Compile || options.needs_exec_tmp { COMPILE_TMPFS } else { RUN_TMPFS }.into(),
        "--cap-drop=ALL".into(),
        "--security-opt=no-new-privileges".into(),
        "--ulimit".into(),
        "nofile=1024:1024".into(),
        "-v".into(),
        workspace_volume,
        "-w".into(),
        "/workspace".into(),
    ];

    if let Some(profile) = seccomp_profile {
        args.push(format!("--security-opt=seccomp={}", profile.display()));
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

    if let Some(ref input) = options.input {
        if let Some(mut stdin) = child.stdin.take() {
            if let Err(e) = stdin.write_all(input.as_bytes()).await {
                tracing::error!(error = %e, container = %container_name, "Failed to write stdin to container");
                drop(stdin);
                kill_container(&container_name).await;
                remove_container(&container_name).await;
                return Err(DockerError::StdinFailed(e));
            }
            drop(stdin);
        }
    }

    let timeout_duration =
        std::time::Duration::from_millis(options.timeout_ms.max(MIN_TIMEOUT_MS));

    const MAX_OUTPUT_BYTES: u64 = 1_048_576; // 1MB

    let stdout_handle = {
        let stdout = child.stdout.take().expect("stdout not captured");
        tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = stdout.take(MAX_OUTPUT_BYTES).read_to_end(&mut buf).await;
            buf
        })
    };

    let stderr_handle = {
        let stderr = child.stderr.take().expect("stderr not captured");
        tokio::spawn(async move {
            let mut buf = String::new();
            let _ = stderr.take(MAX_OUTPUT_BYTES).read_to_string(&mut buf).await;
            buf
        })
    };

    let start = Instant::now();

    let wait_result = tokio::time::timeout(timeout_duration, child.wait()).await;

    match wait_result {
        Ok(Ok(exit_status)) => {
            let wall_duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
            let stdout = stdout_handle.await.unwrap_or_default();
            let stderr = stderr_handle.await.unwrap_or_default();
            let state = inspect_container_state(&container_name).await;
            remove_container(&container_name).await;
            Ok(DockerRunResult {
                stdout,
                stderr,
                exit_code: exit_status.code(),
                timed_out: false,
                oom_killed: state.oom_killed,
                duration_ms: state.duration_ms.unwrap_or(wall_duration_ms),
            })
        }
        Ok(Err(e)) => {
            kill_container(&container_name).await;
            remove_container(&container_name).await;
            Err(DockerError::ProcessError(e.to_string()))
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
                exit_code: None,
                timed_out: true,
                oom_killed: state.oom_killed,
                duration_ms: state.duration_ms.unwrap_or(wall_duration_ms),
            })
        }
    }
}

pub async fn run_docker(
    options: &DockerRunOptions,
    seccomp_profile_path: &Path,
    disable_custom_seccomp: bool,
) -> Result<DockerRunResult, JudgeEnvironmentError> {
    let use_custom_seccomp = !disable_custom_seccomp;

    let seccomp_profile = if use_custom_seccomp {
        if !seccomp_profile_path.exists() {
            return Err(JudgeEnvironmentError(format!(
                "Seccomp profile not found: {}",
                seccomp_profile_path.display()
            )));
        }
        Some(seccomp_profile_path)
    } else {
        None
    };

    let result = run_docker_once(options, seccomp_profile)
        .await
        .map_err(|e| JudgeEnvironmentError(e.to_string()))?;

    if use_custom_seccomp && should_retry_without_seccomp(&result.stderr) {
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

pub async fn cleanup_orphaned_containers() {
    let output = tokio::process::Command::new("docker")
        .args(["ps", "-a", "--filter", "name=oj-", "--filter", "status=exited", "-q"])
        .output()
        .await;

    if let Ok(output) = output {
        let ids = String::from_utf8_lossy(&output.stdout);
        for id in ids.lines().filter(|l| !l.is_empty()) {
            match tokio::process::Command::new("docker")
                .args(["rm", id])
                .output()
                .await
            {
                Ok(_) => {
                    tracing::debug!(container_id = %id, "Cleaned up orphaned container");
                }
                Err(e) => {
                    tracing::warn!(error = %e, container_id = %id, "Failed to remove orphaned container");
                }
            }
        }
    }
}
