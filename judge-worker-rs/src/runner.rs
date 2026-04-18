use std::sync::Arc;
use std::path::Path;

use axum::extract::{DefaultBodyLimit, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Semaphore;

use crate::config::Config;
use crate::docker::{self, DockerRunOptions, Phase};
use crate::languages;
use crate::types::Language;

const MEMORY_LIMIT_MB: u32 = 256;
const MAX_SOURCE_CODE_BYTES: usize = 64 * 1024; // 64KB
const MAX_STDIN_BYTES: usize = 64 * 1024; // 64KB
const DEFAULT_TIME_LIMIT_MS: u64 = 10_000;
const MIN_COMPILE_TIMEOUT_MS: u64 = 30_000;
// Upper bound on the raw request body size accepted by the runner HTTP
// server. Prevents an authenticated caller (or a compromised app server)
// from OOM-ing the worker before the per-field size checks fire.
const MAX_RUNNER_BODY_BYTES: usize = 4 * 1024 * 1024;

pub struct RunnerState {
    pub config: Arc<Config>,
    pub semaphore: Arc<Semaphore>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DockerImageSummary {
    repository: String,
    tag: String,
    id: String,
    created: String,
    size: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub source_code: String,
    #[serde(default)]
    pub stdin: String,
    pub extension: String,
    pub docker_image: String,
    pub compile_command: Option<String>,
    pub run_command: String,
    #[serde(default)]
    pub time_limit_ms: Option<u64>,
    /// Optional language identifier for static config lookup (needs_exec_tmp)
    #[serde(default)]
    pub language: Option<Language>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub execution_time_ms: u64,
    pub timed_out: bool,
    pub oom_killed: bool,
    pub compile_output: Option<String>,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DockerImagesQuery {
    filter: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DockerImageRequest {
    image_tag: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DockerBuildRequest {
    image_name: String,
    dockerfile_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskUsageResponse {
    total: String,
    used: String,
    available: String,
    use_percent: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DockerBuildResponse {
    logs: String,
}

use crate::validation::{
    validate_admin_image_tag, validate_docker_image, validate_dockerfile_path_for_build,
    validate_extension, validate_image_filter,
};

fn validate_shell_command(cmd: &str) -> bool {
    if cmd.is_empty() || cmd.len() > 10_000 {
        return false;
    }
    if cmd.contains('\0') {
        return false;
    }
    // Block command/process substitution, I/O redirection, piping, control
    // characters, and the `eval` word. `&&` and `;` are intentionally permitted:
    // trust-boundary note — compile/run commands come from admin-configured
    // language_configs rows and frequently legitimately chain steps
    // (e.g. `mkdir -p out && javac …`). Aligned with
    // src/lib/compiler/execute.ts#validateShellCommand so the TS and Rust
    // paths accept the same set of admin-supplied commands.
    let dangerous_patterns = [
        "`", "$(", "${", "<(", ">(", "||", "|", ">", "<", "\n", "\r",
    ];
    for pat in &dangerous_patterns {
        if cmd.contains(pat) {
            return false;
        }
    }
    // Block eval as a word
    if cmd.split_whitespace().any(|w| w == "eval") {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::validate_shell_command;

    #[test]
    fn accepts_simple_commands() {
        assert!(validate_shell_command("python3 /workspace/main.py"));
        assert!(validate_shell_command("HOME=/tmp mono /workspace/solution.exe"));
        assert!(validate_shell_command("java -cp /workspace Main"));
    }

    #[test]
    fn rejects_shell_metacharacters() {
        for cmd in [
            "python3 main.py || echo hi",
            "python3 main.py | cat",
            "python3 main.py > out.txt",
            "python3 main.py < in.txt",
            "python3 $(printf hi)",
            "python3 `printf hi`",
            "python3 main.py\ncat /etc/passwd",
        ] {
            assert!(
                !validate_shell_command(cmd),
                "expected command to be rejected: {cmd}"
            );
        }
    }

    #[test]
    fn allows_admin_chained_compile_steps() {
        // && and ; are permitted because admin-configured compile commands
        // frequently chain steps (e.g., `mkdir -p out && javac …`).
        assert!(validate_shell_command("mkdir -p out && javac Main.java"));
        assert!(validate_shell_command("cd /workspace; make"));
    }

    #[test]
    fn rejects_eval_even_without_other_metacharacters() {
        assert!(!validate_shell_command("eval python3 /workspace/main.py"));
    }
}

async fn run_command(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
) -> Result<std::process::Output, String> {
    let mut command = tokio::process::Command::new(program);
    command.args(args);
    if let Some(dir) = current_dir {
        command.current_dir(dir);
    }

    command
        .output()
        .await
        .map_err(|e| format!("Failed to run {program}: {e}"))
}

fn combined_output(output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    format!("{stdout}\n{stderr}").trim().to_string()
}

async fn docker_list_images(filter: &str) -> Result<Vec<DockerImageSummary>, String> {
    let output = run_command(
        "docker",
        &["images", "--format", "{{json .}}", "--filter", &format!("reference={filter}")],
        None,
    )
    .await?;

    if !output.status.success() {
        return Err(combined_output(&output));
    }

    let mut images = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let value: Value = serde_json::from_str(line)
            .map_err(|e| format!("Failed to parse docker images output: {e}"))?;
        images.push(DockerImageSummary {
            repository: value
                .get("Repository")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            tag: value.get("Tag").and_then(Value::as_str).unwrap_or("").to_string(),
            id: value.get("ID").and_then(Value::as_str).unwrap_or("").to_string(),
            created: value
                .get("CreatedSince")
                .or_else(|| value.get("CreatedAt"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            size: value.get("Size").and_then(Value::as_str).unwrap_or("").to_string(),
        });
    }

    Ok(images)
}

async fn docker_inspect_image(image_tag: &str) -> Result<Option<Value>, String> {
    let output = run_command("docker", &["inspect", image_tag], None).await?;
    if !output.status.success() {
        return Ok(None);
    }

    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse docker inspect output: {e}"))?;
    Ok(value
        .as_array()
        .and_then(|items| items.first().cloned()))
}

async fn docker_pull_image(image_tag: &str) -> Result<(), String> {
    let output = run_command("docker", &["pull", image_tag], None).await?;
    if output.status.success() {
        Ok(())
    } else {
        Err(combined_output(&output))
    }
}

async fn docker_remove_image(image_tag: &str) -> Result<(), String> {
    let output = run_command("docker", &["rmi", image_tag], None).await?;
    if output.status.success() {
        Ok(())
    } else {
        Err(combined_output(&output))
    }
}

async fn docker_build_image(image_name: &str, dockerfile_path: &str) -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to resolve build root: {e}"))?;
    let dockerfile = cwd.join(dockerfile_path);
    if !dockerfile.exists() {
        return Err(format!("Dockerfile not found: {}", dockerfile.display()));
    }

    let output = run_command(
        "docker",
        &["build", "-t", image_name, "-f", dockerfile_path, "."],
        Some(&cwd),
    )
    .await?;

    let logs = combined_output(&output);
    if output.status.success() {
        Ok(logs)
    } else {
        Err(logs)
    }
}

async fn host_disk_usage() -> Result<DiskUsageResponse, String> {
    let output = run_command("df", &["-h", "/"], None).await?;
    if !output.status.success() {
        return Err(combined_output(&output));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    let _header = lines.next();
    let data = lines.next().ok_or_else(|| "df output missing data line".to_string())?;
    let parts: Vec<&str> = data.split_whitespace().collect();

    Ok(DiskUsageResponse {
        total: parts.get(1).copied().unwrap_or("?").to_string(),
        used: parts.get(2).copied().unwrap_or("?").to_string(),
        available: parts.get(3).copied().unwrap_or("?").to_string(),
        use_percent: parts.get(4).copied().unwrap_or("?").to_string(),
    })
}

fn check_auth(headers: &HeaderMap, config: &Config) -> Result<(), StatusCode> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth.strip_prefix("Bearer ").ok_or(StatusCode::UNAUTHORIZED)?;
    // Use constant-time comparison to prevent timing side-channel attacks
    let expected = config.runner_auth_token.expose();
    if token.len() != expected.len() || !constant_time_eq(token.as_bytes(), expected.as_bytes()) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

/// Constant-time byte comparison to prevent timing attacks on auth tokens.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

async fn health() -> StatusCode {
    StatusCode::OK
}

async fn docker_images_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
    Query(query): Query<DockerImagesQuery>,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    let filter = query.filter.unwrap_or_else(|| "judge-*".to_string());
    if !validate_image_filter(&filter) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid Docker image filter".to_string(),
            }),
        )
            .into_response();
    }

    match docker_list_images(&filter).await {
        Ok(images) => (StatusCode::OK, Json(images)).into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error }),
        )
            .into_response(),
    }
}

async fn docker_inspect_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
    Json(req): Json<DockerImageRequest>,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    if !validate_admin_image_tag(&req.image_tag) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid Docker image reference".to_string(),
            }),
        )
            .into_response();
    }

    match docker_inspect_image(&req.image_tag).await {
        Ok(Some(info)) => (StatusCode::OK, Json(info)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Docker image not found".to_string(),
            }),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error }),
        )
            .into_response(),
    }
}

async fn docker_pull_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
    Json(req): Json<DockerImageRequest>,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    if !validate_admin_image_tag(&req.image_tag) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid Docker image reference".to_string(),
            }),
        )
            .into_response();
    }

    match docker_pull_image(&req.image_tag).await {
        Ok(()) => StatusCode::OK.into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error }),
        )
            .into_response(),
    }
}

async fn docker_remove_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
    Json(req): Json<DockerImageRequest>,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    if !validate_admin_image_tag(&req.image_tag) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid Docker image reference".to_string(),
            }),
        )
            .into_response();
    }

    match docker_remove_image(&req.image_tag).await {
        Ok(()) => StatusCode::OK.into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error }),
        )
            .into_response(),
    }
}

async fn docker_build_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
    Json(req): Json<DockerBuildRequest>,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    if !validate_admin_image_tag(&req.image_name) || !validate_dockerfile_path_for_build(&req.dockerfile_path) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid Docker build parameters".to_string(),
            }),
        )
            .into_response();
    }

    match docker_build_image(&req.image_name, &req.dockerfile_path).await {
        Ok(logs) => (StatusCode::OK, Json(DockerBuildResponse { logs })).into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error }),
        )
            .into_response(),
    }
}

async fn disk_usage_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    match host_disk_usage().await {
        Ok(usage) => (StatusCode::OK, Json(usage)).into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error }),
        )
            .into_response(),
    }
}

async fn run_handler(
    State(state): State<Arc<RunnerState>>,
    headers: HeaderMap,
    Json(req): Json<RunRequest>,
) -> impl IntoResponse {
    // Auth check
    if let Err(status) = check_auth(&headers, &state.config) {
        return (
            status,
            Json(ErrorResponse {
                error: "unauthorized".to_string(),
            }),
        )
            .into_response();
    }

    // Validate source code size
    if req.source_code.len() > MAX_SOURCE_CODE_BYTES {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Source code exceeds maximum size limit (64KB)".to_string(),
            }),
        )
            .into_response();
    }

    // Validate stdin size
    if req.stdin.len() > MAX_STDIN_BYTES {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Stdin exceeds maximum size limit (64KB)".to_string(),
            }),
        )
            .into_response();
    }

    // Validate docker image
    if !validate_docker_image(&req.docker_image) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid Docker image reference".to_string(),
            }),
        )
            .into_response();
    }

    // Validate shell commands
    if let Some(ref cmd) = req.compile_command
        && !validate_shell_command(cmd)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid compile command".to_string(),
            }),
        )
            .into_response();
    }
    if !validate_shell_command(&req.run_command) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid run command".to_string(),
            }),
        )
            .into_response();
    }

    // Acquire concurrency permit
    let _permit = match state.semaphore.try_acquire() {
        Ok(permit) => permit,
        Err(_) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Runner is at capacity, try again later".to_string(),
                }),
            )
                .into_response();
        }
    };

    // Execute
    let result = execute_run(&state.config, &req).await;

    match result {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: err }),
        )
            .into_response(),
    }
}

async fn execute_run(config: &Config, req: &RunRequest) -> Result<RunResponse, String> {
    let time_limit_ms = req.time_limit_ms.unwrap_or(DEFAULT_TIME_LIMIT_MS);
    let needs_exec_tmp = req
        .language
        .as_ref()
        .and_then(|l| languages::get_config(l))
        .is_some_and(|c| c.needs_exec_tmp);

    // Create temp workspace
    let temp_dir = tempfile::TempDir::new().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let workspace_dir = temp_dir.path();

    // Set permissions to 0o777 for sibling container access
    tokio::fs::set_permissions(
        workspace_dir,
        std::os::unix::fs::PermissionsExt::from_mode(0o777),
    )
    .await
    .map_err(|e| format!("Failed to set workspace permissions: {e}"))?;

    let workspace_dir_str = workspace_dir
        .to_str()
        .ok_or_else(|| "Temp directory path is not valid UTF-8".to_string())?
        .to_owned();

    // Validate file extension to prevent path traversal
    if !validate_extension(&req.extension) {
        return Err(format!("Invalid file extension: {}", req.extension));
    }

    // Write source file
    let source_path = workspace_dir.join(format!("solution{}", req.extension));
    tokio::fs::write(&source_path, &req.source_code)
        .await
        .map_err(|e| format!("Failed to write source code: {e}"))?;

    tokio::fs::set_permissions(
        &source_path,
        std::os::unix::fs::PermissionsExt::from_mode(0o644),
    )
    .await
    .map_err(|e| format!("Failed to set source file permissions: {e}"))?;

    let mut compile_output: Option<String> = None;

    // Compile phase
    if let Some(ref compile_command) = req.compile_command {
        let compile_timeout_ms = (time_limit_ms.saturating_mul(2)).max(MIN_COMPILE_TIMEOUT_MS);

        let compile_opts = DockerRunOptions {
            image: req.docker_image.clone(),
            workspace_dir: workspace_dir_str.clone(),
            command: vec!["sh".into(), "-c".into(), compile_command.clone()],
            phase: Phase::Compile,
            input: None,
            timeout_ms: compile_timeout_ms,
            memory_limit_mb: MEMORY_LIMIT_MB,
            read_only_workspace: false,
            needs_exec_tmp,
        };

        let compilation = docker::run_docker(
            &compile_opts,
            &config.seccomp_profile_path,
            config.disable_custom_seccomp,
            config.allow_default_compile_seccomp,
        )
        .await
        .map_err(|e| format!("Docker error during compilation: {e}"))?;

        if compilation.timed_out {
            return Ok(RunResponse {
                stdout: String::new(),
                stderr: String::new(),
                exit_code: None,
                execution_time_ms: compilation.duration_ms,
                timed_out: true,
                oom_killed: compilation.oom_killed,
                compile_output: Some("Compilation timed out".to_string()),
            });
        }

        if compilation.oom_killed || compilation.exit_code != Some(0) {
            let stdout_str = String::from_utf8_lossy(&compilation.stdout).into_owned();
            let output = [stdout_str.as_str(), compilation.stderr.as_str()]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            let output = output.trim().to_string();
            return Ok(RunResponse {
                stdout: String::new(),
                stderr: String::new(),
                exit_code: compilation.exit_code,
                execution_time_ms: compilation.duration_ms,
                timed_out: false,
                oom_killed: compilation.oom_killed,
                compile_output: Some(if output.is_empty() {
                    "Compilation failed".to_string()
                } else {
                    output
                }),
            });
        }

        if !compilation.stderr.is_empty() {
            compile_output = Some(compilation.stderr.clone());
        }
    }

    // Run phase
    // Ensure stdin ends with newline
    let stdin_text = if req.stdin.is_empty() {
        String::new()
    } else if req.stdin.ends_with('\n') {
        req.stdin.clone()
    } else {
        format!("{}\n", req.stdin)
    };

    let run_opts = DockerRunOptions {
        image: req.docker_image.clone(),
        workspace_dir: workspace_dir_str,
        command: vec!["sh".into(), "-c".into(), req.run_command.clone()],
        phase: Phase::Run,
        input: if stdin_text.is_empty() {
            None
        } else {
            Some(stdin_text)
        },
        timeout_ms: time_limit_ms,
        memory_limit_mb: MEMORY_LIMIT_MB,
        read_only_workspace: true,
        needs_exec_tmp,
    };

    let execution = docker::run_docker(
        &run_opts,
        &config.seccomp_profile_path,
        config.disable_custom_seccomp,
        config.allow_default_compile_seccomp,
    )
    .await
    .map_err(|e| format!("Docker error during execution: {e}"))?;

    let stdout = String::from_utf8_lossy(&execution.stdout).into_owned();

    Ok(RunResponse {
        stdout,
        stderr: execution.stderr,
        exit_code: execution.exit_code,
        execution_time_ms: execution.duration_ms,
        timed_out: execution.timed_out,
        oom_killed: execution.oom_killed,
        compile_output,
    })

    // temp_dir dropped here, workspace cleaned up automatically
}

pub fn create_router(state: Arc<RunnerState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/run", post(run_handler))
        .route("/docker/images", get(docker_images_handler))
        .route("/docker/inspect", post(docker_inspect_handler))
        .route("/docker/pull", post(docker_pull_handler))
        .route("/docker/remove", post(docker_remove_handler))
        .route("/docker/build", post(docker_build_handler))
        .route("/docker/disk-usage", get(disk_usage_handler))
        .layer(DefaultBodyLimit::max(MAX_RUNNER_BODY_BYTES))
        .with_state(state)
}
