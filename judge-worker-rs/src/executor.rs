use crate::api::ApiClient;
use crate::comparator::{compare_float_output, compare_output};
use crate::config::Config;
use crate::docker::{self, DockerRunOptions, Phase};
use crate::languages;
use crate::pool::PoolManager;
use crate::types::{Submission, TestResult, Verdict};
use crate::workspace::SandboxWorkspace;
use serde::Serialize;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::fs;
use tracing::Instrument;

const COMPILATION_MEMORY_LIMIT_MB: u32 = 2048;
const COMPILATION_TIMEOUT_MS: u64 = 600_000;
const MIN_COMPILE_TIMEOUT_MS: u64 = 30_000;
const MIN_TIMEOUT_MS: u64 = 100;
/// Wall-clock budget for Docker container startup/teardown that we add on top
/// of the problem's `time_limit_ms` before issuing the kill timeout. Docker
/// reports CPU runtime via `StartedAt → FinishedAt`, so this buffer only
/// affects the "kill" deadline; TLE classification still compares the
/// Docker-reported duration against the unbuffered problem limit.
const DOCKER_RUN_OVERHEAD_BUDGET_MS: u64 = 2_000;
const MAX_MEMORY_LIMIT_MB: u32 = 1024;
const RUNTIME_ERROR_OUTPUT_LIMIT: usize = 500;
const REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES: usize = 16 * 1024;
const TRUNCATED_SUFFIX: &str = "\n...[truncated]";

fn max_time_limit_ms() -> u64 {
    std::env::var("MAX_TIME_LIMIT_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30_000)
}

/// Upper bound on a single compile's wall-clock time. Bounds compiler-bomb DoS
/// (a malicious build that loops forever). Env-configurable via
/// JUDGE_COMPILE_TIMEOUT_MS; defaults to COMPILATION_TIMEOUT_MS so slow
/// toolchains aren't broken, but RAM/CPU-constrained operators can lower it.
fn compilation_timeout_ms() -> u64 {
    std::env::var("JUDGE_COMPILE_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(COMPILATION_TIMEOUT_MS)
}

/// Memory ceiling granted to the compile phase. Bounds per-compile RAM (a
/// malicious build that allocates gigabytes). Env-configurable via
/// JUDGE_COMPILE_MEMORY_MB; defaults to COMPILATION_MEMORY_LIMIT_MB.
fn compilation_memory_limit_mb() -> u32 {
    std::env::var("JUDGE_COMPILE_MEMORY_MB")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(COMPILATION_MEMORY_LIMIT_MB)
}
const MAX_SOURCE_CODE_BYTES: usize = 256 * 1024; // 256KB

use crate::validation::validate_docker_image;

fn compile_timeout_ms_for_submission(time_limit_ms: u64) -> u64 {
    clamp_compile_timeout(time_limit_ms.saturating_mul(2), compilation_timeout_ms())
}

fn clamp_compile_timeout(scaled_ms: u64, cap_ms: u64) -> u64 {
    // `clamp` panics when min > max, so a configured JUDGE_COMPILE_TIMEOUT_MS
    // below MIN_COMPILE_TIMEOUT_MS turned every compiled-language submission
    // into a catch_unwind runtime_error (RPF cycle-1 M1). Raise the upper
    // bound to at least the floor instead (same pattern as runner.rs).
    scaled_ms.clamp(MIN_COMPILE_TIMEOUT_MS, cap_ms.max(MIN_COMPILE_TIMEOUT_MS))
}

fn reported_memory_used_kb(
    memory_peak_kb: Option<u64>,
    memory_limit_mb: u32,
    oom_killed: bool,
) -> u64 {
    let memory_limit_kb = u64::from(memory_limit_mb.max(16)) * 1024;
    if oom_killed {
        return memory_limit_kb;
    }

    memory_peak_kb.unwrap_or(0).min(memory_limit_kb)
}

fn truncate_report_diagnostic(value: &str) -> String {
    if value.len() <= REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES {
        return value.to_string();
    }

    let mut end = REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}{}", &value[..end], TRUNCATED_SUFFIX)
}

fn reportable_test_case_output(verdict: Verdict, stdout: &[u8], stderr: &str) -> String {
    if verdict == Verdict::RuntimeError {
        let trimmed_stderr = stderr.trim();
        if !trimmed_stderr.is_empty() {
            return trimmed_stderr
                .chars()
                .take(RUNTIME_ERROR_OUTPUT_LIMIT)
                .collect();
        }
    }

    truncate_report_diagnostic(&String::from_utf8_lossy(stdout))
}

fn runtime_error_type(stderr: &str, exit_code: Option<i32>) -> Option<String> {
    let stderr_lower = stderr.to_ascii_lowercase();
    if stderr_lower.contains("stack overflow") {
        return Some("stack_overflow".to_string());
    }

    match exit_code {
        Some(134) => Some("SIGABRT".to_string()),
        Some(136) => Some("SIGFPE".to_string()),
        Some(137) => Some("SIGKILL".to_string()),
        Some(139) => Some("SIGSEGV".to_string()),
        Some(152) => Some("SIGXCPU".to_string()),
        Some(code) if code >= 128 => Some(format!("signal_{}", code - 128)),
        _ => None,
    }
}

/// Inputs to the per-test-case verdict classifier. Extracted so the
/// classifier can be unit-tested without spinning up a real container.
#[derive(Debug, Clone, Copy)]
struct VerdictInputs {
    timed_out: bool,
    duration_ms: u64,
    effective_time_limit_ms: u64,
    oom_killed: bool,
    exit_code: Option<i32>,
    output_limit_exceeded: bool,
    is_correct: bool,
}

/// Classify the per-test-case verdict from execution signals. The classifier
/// honours the `DOCKER_RUN_OVERHEAD_BUDGET_MS` policy: a wall-clock kill that
/// fires while the Docker-reported user-code runtime stayed within the problem
/// limit is reported as `RuntimeError` (likely environment/container issue)
/// rather than `TimeLimit`, so submissions like "765ms < 1000ms TLE" don't get
/// misclassified as TLE due to container startup overhead.
fn classify_test_case_verdict(inputs: VerdictInputs) -> Verdict {
    let exceeded_problem_limit = inputs.duration_ms > inputs.effective_time_limit_ms;
    // OOM takes precedence over time-limit classification: a container that the
    // kernel OOM-killer terminated must not be reported as `TimeLimit` even if
    // its measured duration crossed the problem limit.
    if inputs.oom_killed || inputs.exit_code == Some(137) {
        Verdict::MemoryLimit
    } else if inputs.timed_out && exceeded_problem_limit {
        Verdict::TimeLimit
    } else if inputs.timed_out {
        Verdict::RuntimeError
    } else if exceeded_problem_limit {
        Verdict::TimeLimit
    } else if inputs.output_limit_exceeded {
        Verdict::OutputLimitExceeded
    } else if inputs.exit_code.unwrap_or(1) != 0 {
        Verdict::RuntimeError
    } else if !inputs.is_correct {
        Verdict::WrongAnswer
    } else {
        Verdict::Accepted
    }
}

async fn prune_dead_letter_dir(dead_letter_dir: &Path, max_files: usize) {
    let mut entries = match fs::read_dir(dead_letter_dir).await {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut files: Vec<(PathBuf, SystemTime)> = Vec::new();

    loop {
        match entries.next_entry().await {
            Ok(Some(entry)) => {
                if entry.path().extension().is_some_and(|ext| ext == "json") {
                    let modified = entry
                        .metadata()
                        .await
                        .and_then(|metadata| metadata.modified())
                        .unwrap_or(SystemTime::UNIX_EPOCH);
                    files.push((entry.path(), modified));
                }
            }
            Ok(None) => break,
            Err(_) => return,
        }
    }

    if files.len() <= max_files {
        return;
    }

    files.sort_by_key(|(_, modified)| *modified);
    let remove_count = files.len() - max_files;

    for (path, _) in files.into_iter().take(remove_count) {
        if fs::remove_file(&path).await.is_ok() {
            tracing::info!(path = ?path, "Pruned old dead-letter file");
        }
    }
}

/// Only the run phase may be served by a warm container.
///
/// A warm container is created with the run phase's seccomp profile and the
/// strict `RUN_TMPFS`, and neither is changeable after creation, so compiling
/// in one would either fail outright or require weakening isolation.
/// `docker::warm_refusal_reason` refuses a compile as well; this guard stops the
/// executor from even taking a container out of the pool for one.
pub(crate) fn warm_eligible(phase: Phase) -> bool {
    phase == Phase::Run
}

/// The warm-attempt-then-cold-fallback decision, with every Docker call behind
/// a caller-supplied seam so the policy is unit-testable without a daemon.
///
/// Contract, in order:
///   * `warm` runs only when a container was acquired;
///   * `destroy` runs afterwards no matter the outcome — an acquired container
///     is single-use and never goes back to the pool, so this is where it stops
///     being tracked;
///   * `cold` runs exactly when no container was acquired, or when the warm
///     attempt answered `WarmUnavailable`;
///   * any other `DockerError` is a genuine fault and is surfaced the same way
///     `docker::run_docker` surfaces one, so it is never masked by a retry.
async fn warm_then_cold<Warm, WarmFut, Destroy, DestroyFut, Cold, ColdFut>(
    container: Option<String>,
    warm: Warm,
    destroy: Destroy,
    cold: Cold,
) -> Result<docker::DockerRunResult, docker::JudgeEnvironmentError>
where
    Warm: FnOnce(String) -> WarmFut,
    WarmFut: Future<Output = Result<docker::DockerRunResult, docker::DockerError>>,
    Destroy: FnOnce(String) -> DestroyFut,
    DestroyFut: Future<Output = ()>,
    Cold: FnOnce() -> ColdFut,
    ColdFut: Future<Output = Result<docker::DockerRunResult, docker::JudgeEnvironmentError>>,
{
    if let Some(container) = container {
        let result = warm(container.clone()).await;
        // Single use: retired before the result is even inspected, so no early
        // return can leak it. `warm` itself owns the `docker rm`; this is the
        // pool-side half (stop tracking, replenish).
        destroy(container).await;

        match result {
            Ok(result) => return Ok(result),
            Err(docker::DockerError::WarmUnavailable(reason)) => {
                tracing::warn!(reason = %reason, "warm container unavailable; retrying cold");
            }
            Err(e) => return Err(docker::JudgeEnvironmentError(e.to_string())),
        }
    }

    cold().await
}

/// Run one test case, preferring a warm container and falling back to the cold
/// `docker::run_docker` on any warm-path failure.
async fn run_test_case_container(
    options: &DockerRunOptions,
    config: &Config,
    effective_time_limit_ms: u64,
    pool: Option<&Arc<PoolManager>>,
) -> Result<docker::DockerRunResult, docker::JudgeEnvironmentError> {
    let container = match pool {
        Some(pool) if warm_eligible(options.phase) => pool.acquire(&options.image).await,
        _ => None,
    };
    let replenish = pool.map(Arc::clone);

    warm_then_cold(
        container,
        |container| async move {
            docker::run_docker_warm(options, &container, effective_time_limit_ms).await
        },
        |container| async move {
            // No `docker rm` here: `run_docker_warm` consumes the container on
            // every path (the measurement removes it on success, the wrapper on
            // every error), and a second force-remove is ~40 ms of pure latency
            // per test case on the judging hot path.
            if let Some(pool) = replenish {
                // Stop tracking the name only now, so the container is in
                // `pending` for the whole time it is out of the pool.
                pool.release_destroyed(&container).await;
                // Refill in the background so the NEXT test case can also run
                // warm, without making this one wait on a `docker run`. A
                // reconcile that lands after shutdown began creates nothing:
                // `drain_all` latches the pool closed first.
                tokio::spawn(async move { pool.reconcile().await });
            }
        },
        // The same public entry point the run loop used before warm containers
        // existed. It owns the seccomp resolution and the
        // `should_retry_without_seccomp` handling, which calling
        // `run_docker_once` directly would lose.
        || {
            docker::run_docker(
                options,
                &config.seccomp_profile_path,
                config.disable_custom_seccomp,
                config.allow_default_compile_seccomp,
            )
        },
    )
    .await
}

pub async fn execute(
    client: &ApiClient,
    config: &Config,
    submission: Submission,
    worker_secret: Option<&str>,
    pool: Option<&Arc<PoolManager>>,
) {
    let span = tracing::info_span!("judge_submission", submission_id = %submission.id);
    execute_inner(client, config, submission, worker_secret, pool)
        .instrument(span)
        .await;
}

async fn execute_inner(
    client: &ApiClient,
    config: &Config,
    submission: Submission,
    worker_secret: Option<&str>,
    pool: Option<&Arc<PoolManager>>,
) {
    let lang_config = languages::get_config(&submission.language);

    // If no static config exists and no DB overrides are provided, reject
    if lang_config.is_none() && submission.docker_image.is_none() {
        report_error(
            client,
            config,
            &submission,
            Verdict::CompileError.as_str(),
            "Unsupported language",
            worker_secret,
        )
        .await;
        return;
    }

    // Use DB overrides or fall back to static config
    let default_ext = ".txt";
    let docker_image = submission
        .docker_image
        .as_deref()
        .or(lang_config.map(|c| c.docker_image))
        .unwrap_or("alpine:latest");

    // Validate docker image reference to prevent pulling arbitrary images
    if !validate_docker_image(docker_image) {
        report_error(
            client,
            config,
            &submission,
            Verdict::CompileError.as_str(),
            "Invalid Docker image reference",
            worker_secret,
        )
        .await;
        return;
    }
    let compile_command: Option<Vec<&str>> = match &submission.compile_command {
        Some(cmd) if !cmd.is_empty() && !cmd.iter().all(|s| s.is_empty()) => {
            Some(cmd.iter().map(|s| s.as_str()).collect())
        }
        _ => lang_config.and_then(|c| c.compile_command.map(|c| c.to_vec())),
    };
    let run_command: Vec<&str> = match &submission.run_command {
        Some(cmd) if !cmd.is_empty() && !cmd.iter().all(|s| s.is_empty()) => {
            cmd.iter().map(|s| s.as_str()).collect()
        }
        _ => lang_config
            .map(|c| c.run_command.to_vec())
            .unwrap_or_default(),
    };
    let extension = lang_config.map(|c| c.extension).unwrap_or(default_ext);
    let needs_exec_tmp = lang_config.is_some_and(|c| c.needs_exec_tmp);

    if run_command.is_empty() {
        report_error(
            client,
            config,
            &submission,
            Verdict::CompileError.as_str(),
            "No run command configured for this language",
            worker_secret,
        )
        .await;
        return;
    }

    // Report "judging" status; log errors but continue
    if let Err(e) = client
        .report_status(
            &submission.id,
            &submission.claim_token,
            "judging",
            worker_secret,
        )
        .await
    {
        tracing::error!(error = %e, "Failed to report judging status");
    }

    // Create temp workspace directory
    let workspace = match SandboxWorkspace::new() {
        Ok(w) => w,
        Err(e) => {
            tracing::error!(error = %e, "Failed to create temp dir");
            report_error(
                client,
                config,
                &submission,
                "runtime_error",
                &e.to_string(),
                worker_secret,
            )
            .await;
            return;
        }
    };

    let workspace_dir = workspace.path();

    // Tighten host-side workspace permissions. The judge container runs as
    // 65534:65534, so ownership transfer must succeed before the workspace is
    // mounted. Failing closed avoids the old broad fallback that exposed
    // in-flight source and artifacts to other host users.
    if let Err(e) = std::os::unix::fs::chown(workspace_dir, Some(65534), Some(65534)) {
        tracing::error!(
            error = %e,
            workspace = %workspace_dir.display(),
            "chown(workspace_dir, 65534:65534) failed; refusing broad workspace permissions",
        );
        report_error(
            client,
            config,
            &submission,
            "runtime_error",
            "Failed to assign judge workspace to sandbox user",
            worker_secret,
        )
        .await;
        return;
    }
    if let Err(e) = fs::set_permissions(
        workspace_dir,
        std::os::unix::fs::PermissionsExt::from_mode(0o700),
    )
    .await
    {
        tracing::error!(error = %e, "Failed to set temp dir permissions");
        report_error(
            client,
            config,
            &submission,
            "runtime_error",
            &e.to_string(),
            worker_secret,
        )
        .await;
        return;
    }

    // Validate source code size before writing to disk
    if submission.source_code.len() > MAX_SOURCE_CODE_BYTES {
        report_error(
            client,
            config,
            &submission,
            Verdict::CompileError.as_str(),
            "Source code exceeds maximum size limit (256KB)",
            worker_secret,
        )
        .await;
        return;
    }

    // Write source code
    let source_path = workspace_dir.join(format!("solution{}", extension));
    if let Err(e) = fs::write(&source_path, &submission.source_code).await {
        tracing::error!(error = %e, "Failed to write source code");
        report_error(
            client,
            config,
            &submission,
            "runtime_error",
            &e.to_string(),
            worker_secret,
        )
        .await;
        return;
    }

    if let Err(e) = std::os::unix::fs::chown(&source_path, Some(65534), Some(65534)) {
        tracing::error!(
            error = %e,
            source = %source_path.display(),
            "chown(source_path, 65534:65534) failed; refusing broad source permissions",
        );
        report_error(
            client,
            config,
            &submission,
            "runtime_error",
            "Failed to assign judge source file to sandbox user",
            worker_secret,
        )
        .await;
        return;
    }

    // Keep source readable only by the sandbox owner.
    if let Err(e) = fs::set_permissions(
        &source_path,
        std::os::unix::fs::PermissionsExt::from_mode(0o600),
    )
    .await
    {
        tracing::error!(error = %e, "Failed to set source file permissions");
        report_error(
            client,
            config,
            &submission,
            "runtime_error",
            &e.to_string(),
            worker_secret,
        )
        .await;
        return;
    }

    let workspace_dir_str = match workspace_dir.to_str() {
        Some(s) => s.to_owned(),
        None => {
            tracing::error!("Temp directory path is not valid UTF-8");
            report_error(
                client,
                config,
                &submission,
                "runtime_error",
                "Temp directory path is not valid UTF-8",
                worker_secret,
            )
            .await;
            return;
        }
    };
    let mut compile_output = String::new();

    // Compile phase (if language requires compilation)
    if let Some(compile_command) = compile_command {
        let compile_timeout_ms = compile_timeout_ms_for_submission(submission.time_limit_ms);
        let compile_memory_mb =
            compilation_memory_limit_mb().max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB));

        let compile_opts = DockerRunOptions {
            image: docker_image.to_string(),
            workspace_dir: workspace_dir_str.clone(),
            command: compile_command.iter().map(|s| s.to_string()).collect(),
            phase: Phase::Compile,
            input: None,
            timeout_ms: compile_timeout_ms,
            memory_limit_mb: compile_memory_mb,
            read_only_workspace: false,
            needs_exec_tmp,
        };

        let compilation = match docker::run_docker(
            &compile_opts,
            &config.seccomp_profile_path,
            config.disable_custom_seccomp,
            config.allow_default_compile_seccomp,
        )
        .await
        {
            Ok(result) => result,
            Err(docker::JudgeEnvironmentError(msg)) => {
                tracing::error!(error = %msg, "Judge environment error during compilation");
                report_error(
                    client,
                    config,
                    &submission,
                    "runtime_error",
                    &msg,
                    worker_secret,
                )
                .await;
                return;
            }
        };

        // Build compile output from stdout + stderr, matching TS:
        // [compilation.stdout, compilation.stderr].filter(Boolean).join("\n").trim()
        let stdout_str = String::from_utf8_lossy(&compilation.stdout).into_owned();
        let parts: Vec<&str> = [stdout_str.as_str(), compilation.stderr.as_str()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect();
        compile_output = truncate_report_diagnostic(parts.join("\n").trim());

        if compilation.timed_out {
            report_result(
                client,
                config,
                &submission,
                Verdict::CompileError.as_str(),
                "Compilation timed out",
                &[],
                worker_secret,
            )
            .await;
            return;
        }

        if compilation.oom_killed || compilation.exit_code != Some(0) {
            let output = if compile_output.is_empty() {
                "Compilation failed"
            } else {
                &compile_output
            };
            report_result(
                client,
                config,
                &submission,
                Verdict::CompileError.as_str(),
                output,
                &[],
                worker_secret,
            )
            .await;
            return;
        }
    }

    // Reject submissions with no test cases rather than silently returning "accepted"
    if submission.test_cases.is_empty() {
        report_error(
            client,
            config,
            &submission,
            "runtime_error",
            "No test cases defined for this problem",
            worker_secret,
        )
        .await;
        return;
    }

    // Warn once if the submission's authored time limit exceeds the worker
    // ceiling so the silent clamp is observable (AGG-17 / C3-AGG-10c). The UI
    // validator caps authoring at 10s, so this only fires for API/imported
    // problems that bypass it; without the log the resulting TLE is opaque.
    if submission.time_limit_ms > max_time_limit_ms() {
        tracing::warn!(
            submission_id = %submission.id,
            authored_ms = submission.time_limit_ms,
            ceiling_ms = max_time_limit_ms(),
            "submission time_limit_ms exceeds MAX_TIME_LIMIT_MS; clamping to ceiling"
        );
    }

    // Run phase: execute each test case sequentially
    let mut results: Vec<TestResult> = Vec::new();

    for test_case in &submission.test_cases {
        // Effective per-test time limit (clamped to MAX_TIME_LIMIT_MS).
        let effective_time_limit_ms =
            MIN_TIMEOUT_MS.max(submission.time_limit_ms.min(max_time_limit_ms()));
        // Wall-clock kill timeout includes Docker container startup overhead
        // so a submission whose actual user-code runtime is under the limit
        // isn't killed prematurely. The verdict logic below still uses the
        // Docker-reported `duration_ms` (StartedAt → FinishedAt) for TLE so
        // the buffer doesn't change pass/fail semantics.
        let run_timeout_ms = effective_time_limit_ms.saturating_add(DOCKER_RUN_OVERHEAD_BUDGET_MS);

        let run_opts = DockerRunOptions {
            image: docker_image.to_string(),
            workspace_dir: workspace_dir_str.clone(),
            command: run_command.iter().map(|s| s.to_string()).collect(),
            phase: Phase::Run,
            input: Some(test_case.input.clone()),
            timeout_ms: run_timeout_ms,
            memory_limit_mb: submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB),
            read_only_workspace: true,
            needs_exec_tmp,
        };

        // Warm container first, cold `docker run` on any warm-path refusal. The
        // fallback is total: `WarmUnavailable` never reaches the classifier
        // below, so adopting a warm container cannot change a verdict.
        let execution =
            match run_test_case_container(&run_opts, config, effective_time_limit_ms, pool).await {
                Ok(result) => result,
                Err(docker::JudgeEnvironmentError(msg)) => {
                    tracing::error!(
                        error = %msg,
                        test_case_id = %test_case.id,
                        "Judge environment error during test case execution"
                    );
                    report_error(
                        client,
                        config,
                        &submission,
                        "runtime_error",
                        &msg,
                        worker_secret,
                    )
                    .await;
                    return;
                }
            };

        // Compare raw bytes directly (avoids double conversion and UTF-8 lossy artifacts)
        let is_correct = if submission.comparison_mode == "float" {
            compare_float_output(
                test_case.expected_output.as_bytes(),
                &execution.stdout,
                submission.float_absolute_error,
                submission.float_relative_error,
            )
        } else {
            compare_output(test_case.expected_output.as_bytes(), &execution.stdout)
        };

        // Determine test case status. We mark TLE when EITHER the wall-clock
        // kill fired AND user code actually crossed the limit, OR the Docker-
        // reported runtime crosses the problem's time limit on its own.
        // The classification is delegated to `classify_test_case_verdict` so
        // it can be unit-tested without spinning up a real container.
        let verdict = classify_test_case_verdict(VerdictInputs {
            timed_out: execution.timed_out,
            duration_ms: execution.duration_ms,
            effective_time_limit_ms,
            oom_killed: execution.oom_killed,
            exit_code: execution.exit_code,
            output_limit_exceeded: execution.stdout_truncated || execution.stderr_truncated,
            is_correct,
        });

        let actual_output =
            reportable_test_case_output(verdict, &execution.stdout, &execution.stderr);

        let memory_used_kb = reported_memory_used_kb(
            execution.memory_peak_kb,
            submission.memory_limit_mb,
            execution.oom_killed,
        );

        results.push(TestResult {
            test_case_id: test_case.id.clone(),
            status: verdict.as_str().to_string(),
            actual_output,
            execution_time_ms: execution.duration_ms,
            memory_used_kb,
            runtime_error_type: if verdict == Verdict::RuntimeError {
                runtime_error_type(&execution.stderr, execution.exit_code)
            } else {
                None
            },
        });

        // Fail-fast by default, but for IOI partial scoring (run_all_test_cases)
        // keep going so EVERY test case is reported — otherwise the server's
        // `passed / results.length` score divides by a truncated denominator and
        // inflates the partial score (e.g. 2/3 instead of 2/10).
        if verdict != Verdict::Accepted && !submission.run_all_test_cases {
            break;
        }
    }

    // Determine final status
    let final_status = results
        .iter()
        .find(|r| r.status != Verdict::Accepted.as_str())
        .map(|r| r.status.clone())
        .unwrap_or_else(|| Verdict::Accepted.as_str().to_string());

    report_result(
        client,
        config,
        &submission,
        &final_status,
        &compile_output,
        &results,
        worker_secret,
    )
    .await;

    // `workspace` is dropped here, which chowns the tree back to the worker
    // user and removes it so sandbox-created files do not leak.
}

#[cfg(test)]
mod tests {
    use super::{
        COMPILATION_TIMEOUT_MS, MIN_COMPILE_TIMEOUT_MS, REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES,
        RUNTIME_ERROR_OUTPUT_LIMIT, TRUNCATED_SUFFIX, VerdictInputs, classify_test_case_verdict,
        compile_timeout_ms_for_submission, prune_dead_letter_dir, reportable_test_case_output,
        reported_memory_used_kb, runtime_error_type, truncate_report_diagnostic,
    };
    use crate::types::Verdict;
    use tempfile::tempdir;
    use tokio::fs;

    fn base_inputs() -> VerdictInputs {
        VerdictInputs {
            timed_out: false,
            duration_ms: 0,
            effective_time_limit_ms: 1_000,
            oom_killed: false,
            exit_code: Some(0),
            output_limit_exceeded: false,
            is_correct: true,
        }
    }

    #[test]
    fn classifies_clean_run_as_accepted() {
        assert_eq!(classify_test_case_verdict(base_inputs()), Verdict::Accepted);
    }

    #[test]
    fn classifies_wrong_answer_when_output_mismatches() {
        let mut inputs = base_inputs();
        inputs.is_correct = false;
        assert_eq!(classify_test_case_verdict(inputs), Verdict::WrongAnswer);
    }

    #[test]
    fn classifies_output_limit_when_stream_was_truncated() {
        let mut inputs = base_inputs();
        inputs.output_limit_exceeded = true;
        inputs.is_correct = false;
        assert_eq!(
            classify_test_case_verdict(inputs),
            Verdict::OutputLimitExceeded
        );
    }

    #[test]
    fn classifies_tle_when_docker_duration_crosses_problem_limit() {
        let mut inputs = base_inputs();
        inputs.duration_ms = 1_500;
        inputs.effective_time_limit_ms = 1_000;
        assert_eq!(classify_test_case_verdict(inputs), Verdict::TimeLimit);
    }

    #[test]
    fn classifies_tle_when_kill_fires_after_user_code_exceeded_limit() {
        let mut inputs = base_inputs();
        inputs.timed_out = true;
        inputs.duration_ms = 2_500;
        inputs.effective_time_limit_ms = 1_000;
        assert_eq!(classify_test_case_verdict(inputs), Verdict::TimeLimit);
    }

    #[test]
    fn does_not_classify_tle_when_kill_fires_within_limit_due_to_overhead() {
        // Reproduces the "765ms < 1000ms TLE 오인" report: wall-clock kill
        // fires (e.g. Docker overhead pushes the wall-clock past the buffered
        // run timeout) but the Docker-reported user-code runtime stayed under
        // the problem's effective limit. Should be RuntimeError, not TLE.
        let mut inputs = base_inputs();
        inputs.timed_out = true;
        inputs.duration_ms = 765;
        inputs.effective_time_limit_ms = 1_000;
        assert_eq!(classify_test_case_verdict(inputs), Verdict::RuntimeError);
    }

    #[test]
    fn classifies_oom_kill_as_memory_limit() {
        let mut inputs = base_inputs();
        inputs.oom_killed = true;
        inputs.exit_code = None;
        assert_eq!(classify_test_case_verdict(inputs), Verdict::MemoryLimit);
    }

    #[test]
    fn oom_killed_takes_precedence_over_time_limit() {
        let mut inputs = base_inputs();
        inputs.oom_killed = true;
        inputs.duration_ms = 1_500;
        inputs.effective_time_limit_ms = 1_000;
        let verdict = classify_test_case_verdict(inputs);
        assert_ne!(verdict, Verdict::TimeLimit);
        assert_eq!(verdict, Verdict::MemoryLimit);
    }

    #[test]
    fn classifies_exit_137_as_memory_limit_even_without_oom_signal() {
        let mut inputs = base_inputs();
        inputs.exit_code = Some(137);
        assert_eq!(classify_test_case_verdict(inputs), Verdict::MemoryLimit);
    }

    #[test]
    fn classifies_non_zero_exit_as_runtime_error() {
        let mut inputs = base_inputs();
        inputs.exit_code = Some(1);
        assert_eq!(classify_test_case_verdict(inputs), Verdict::RuntimeError);
    }

    #[test]
    fn tle_takes_precedence_over_runtime_error_when_user_code_exceeded_limit() {
        let mut inputs = base_inputs();
        inputs.timed_out = true;
        inputs.duration_ms = 1_001;
        inputs.effective_time_limit_ms = 1_000;
        inputs.exit_code = Some(1);
        assert_eq!(classify_test_case_verdict(inputs), Verdict::TimeLimit);
    }

    #[test]
    fn compile_timeout_has_reasonable_floor_for_tiny_time_limits() {
        assert_eq!(
            compile_timeout_ms_for_submission(500),
            MIN_COMPILE_TIMEOUT_MS
        );
    }

    #[test]
    fn compile_timeout_scales_with_submission_limit() {
        assert_eq!(compile_timeout_ms_for_submission(20_000), 40_000);
    }

    #[test]
    fn reported_memory_uses_limit_for_oom_results() {
        assert_eq!(reported_memory_used_kb(Some(u64::MAX), 256, true), 262_144);
    }

    #[test]
    fn reported_memory_clamps_spurious_peaks_to_the_submission_limit() {
        assert_eq!(
            reported_memory_used_kb(Some(u64::MAX / 1024), 256, false),
            262_144
        );
        assert_eq!(reported_memory_used_kb(Some(32_768), 256, false), 32_768);
    }

    #[test]
    fn compile_timeout_is_capped_for_huge_time_limits() {
        assert_eq!(
            compile_timeout_ms_for_submission(400_000),
            COMPILATION_TIMEOUT_MS
        );
    }

    #[test]
    fn compile_timeout_does_not_panic_when_env_cap_is_below_the_floor() {
        // RPF cycle-1 M1: JUDGE_COMPILE_TIMEOUT_MS < MIN_COMPILE_TIMEOUT_MS
        // made clamp(min, max) panic (min > max) and mis-verdicted every
        // compiled-language submission as runtime_error.
        assert_eq!(
            super::clamp_compile_timeout(2_000, 10_000),
            MIN_COMPILE_TIMEOUT_MS
        );
        // A sub-floor cap must also bound scaled values at the floor.
        assert_eq!(
            super::clamp_compile_timeout(100_000, 10_000),
            MIN_COMPILE_TIMEOUT_MS
        );
    }

    #[test]
    fn runtime_error_type_maps_known_exit_codes_and_stack_overflow() {
        assert_eq!(
            runtime_error_type("", Some(139)).as_deref(),
            Some("SIGSEGV")
        );
        assert_eq!(runtime_error_type("", Some(136)).as_deref(), Some("SIGFPE"));
        assert_eq!(
            runtime_error_type("stack overflow", Some(1)).as_deref(),
            Some("stack_overflow")
        );
    }

    #[test]
    fn reportable_test_case_output_prefers_truncated_stderr_for_runtime_errors() {
        let stderr = "x".repeat(RUNTIME_ERROR_OUTPUT_LIMIT + 50);
        let output = reportable_test_case_output(Verdict::RuntimeError, b"stdout", &stderr);

        assert_eq!(output.len(), RUNTIME_ERROR_OUTPUT_LIMIT);
        assert!(output.chars().all(|ch| ch == 'x'));
        assert_eq!(
            reportable_test_case_output(Verdict::WrongAnswer, b"stdout", "stderr"),
            "stdout"
        );
    }

    #[test]
    fn reportable_test_case_output_caps_large_stdout_payloads() {
        let stdout = "a".repeat(REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES + 50);
        let output = reportable_test_case_output(Verdict::WrongAnswer, stdout.as_bytes(), "");

        assert!(output.ends_with(TRUNCATED_SUFFIX));
        assert!(output.len() <= REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES + TRUNCATED_SUFFIX.len());
    }

    #[test]
    fn report_diagnostic_truncation_preserves_utf8_boundaries() {
        let prefix = "a".repeat(REPORT_DIAGNOSTIC_OUTPUT_LIMIT_BYTES - 1);
        let output = truncate_report_diagnostic(&format!("{prefix}한"));

        assert!(output.ends_with(TRUNCATED_SUFFIX));
        assert!(!output.contains('\u{fffd}'));
    }

    /// Marker exit code used to tell the fake warm result from the fake cold
    /// one, so a test can prove WHICH path produced the value it got back.
    const WARM_MARKER_EXIT_CODE: i32 = 41;
    const COLD_MARKER_EXIT_CODE: i32 = 42;

    fn fake_result(exit_code: i32) -> crate::docker::DockerRunResult {
        crate::docker::DockerRunResult {
            stdout: Vec::new(),
            stderr: String::new(),
            stdout_truncated: false,
            stderr_truncated: false,
            exit_code: Some(exit_code),
            timed_out: false,
            oom_killed: false,
            duration_ms: 1,
            memory_peak_kb: None,
            container_started: true,
        }
    }

    /// Records what each seam of `warm_then_cold` did, so the tests can assert
    /// on the decision rather than on a live Docker daemon.
    #[derive(Default)]
    struct Calls {
        warm: std::cell::Cell<usize>,
        destroyed: std::cell::RefCell<Vec<String>>,
        cold: std::cell::Cell<usize>,
    }

    async fn drive(
        calls: &Calls,
        container: Option<&str>,
        warm_outcome: Result<crate::docker::DockerRunResult, crate::docker::DockerError>,
    ) -> Result<crate::docker::DockerRunResult, crate::docker::JudgeEnvironmentError> {
        let warm_outcome = std::cell::RefCell::new(Some(warm_outcome));
        super::warm_then_cold(
            container.map(str::to_string),
            |_name| async {
                calls.warm.set(calls.warm.get() + 1);
                warm_outcome.borrow_mut().take().expect("warm runs once")
            },
            |name| async move {
                calls.destroyed.borrow_mut().push(name);
            },
            || async {
                calls.cold.set(calls.cold.get() + 1);
                Ok(fake_result(COLD_MARKER_EXIT_CODE))
            },
        )
        .await
    }

    #[test]
    fn warm_is_attempted_only_for_the_run_phase() {
        // Compile keeps the cold path: its seccomp profile differs from run's
        // and seccomp cannot be changed on an already-created container.
        assert!(super::warm_eligible(crate::docker::Phase::Run));
        assert!(!super::warm_eligible(crate::docker::Phase::Compile));
    }

    #[tokio::test]
    async fn warm_unavailable_retries_cold_instead_of_failing_the_submission() {
        let calls = Calls::default();
        let outcome = drive(
            &calls,
            Some("oj-warm-abc"),
            Err(crate::docker::DockerError::WarmUnavailable(
                "warm container oj-warm-abc is not running".to_string(),
            )),
        )
        .await;

        let result = outcome.expect("WarmUnavailable must never fail the submission");
        assert_eq!(result.exit_code, Some(COLD_MARKER_EXIT_CODE));
        assert_eq!(calls.cold.get(), 1, "the cold path must run exactly once");
        assert_eq!(
            calls.destroyed.borrow().as_slice(),
            ["oj-warm-abc"],
            "the acquired container is destroyed even when the warm path bailed"
        );
    }

    #[tokio::test]
    async fn a_successful_warm_run_skips_cold_and_still_destroys_the_container() {
        let calls = Calls::default();
        let outcome = drive(
            &calls,
            Some("oj-warm-def"),
            Ok(fake_result(WARM_MARKER_EXIT_CODE)),
        )
        .await;

        let result = outcome.expect("a warm success is a normal result");
        assert_eq!(result.exit_code, Some(WARM_MARKER_EXIT_CODE));
        assert_eq!(calls.cold.get(), 0, "a warm success must not re-run cold");
        assert_eq!(calls.destroyed.borrow().as_slice(), ["oj-warm-def"]);
    }

    #[tokio::test]
    async fn a_genuine_docker_error_is_propagated_rather_than_masked_by_a_cold_retry() {
        let calls = Calls::default();
        let outcome = drive(
            &calls,
            Some("oj-warm-ghi"),
            Err(crate::docker::DockerError::ProcessError(
                "docker daemon is wedged".to_string(),
            )),
        )
        .await;

        let error = match outcome {
            Ok(_) => panic!("a non-WarmUnavailable error must not be swallowed"),
            Err(error) => error,
        };
        assert!(error.0.contains("docker daemon is wedged"));
        assert_eq!(calls.cold.get(), 0, "a genuine fault must not be retried");
        assert_eq!(calls.destroyed.borrow().as_slice(), ["oj-warm-ghi"]);
    }

    #[tokio::test]
    async fn without_a_warm_container_only_the_cold_path_runs() {
        // The no-pool / pool-disabled / empty-pool case: byte-for-byte the
        // pre-warm-pool behaviour — one cold run, nothing acquired, nothing
        // destroyed.
        let calls = Calls::default();
        let outcome = drive(&calls, None, Ok(fake_result(WARM_MARKER_EXIT_CODE))).await;

        let result = outcome.expect("the cold path is unaffected");
        assert_eq!(result.exit_code, Some(COLD_MARKER_EXIT_CODE));
        assert_eq!(calls.warm.get(), 0);
        assert_eq!(calls.cold.get(), 1);
        assert!(calls.destroyed.borrow().is_empty());
    }

    #[tokio::test]
    async fn prune_dead_letter_dir_keeps_only_newest_json_files() {
        let temp = tempdir().unwrap();

        for index in 0..3 {
            let path = temp.path().join(format!("entry-{index}.json"));
            fs::write(&path, format!("{{\"index\":{index}}}"))
                .await
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        fs::write(temp.path().join("note.txt"), "keep")
            .await
            .unwrap();

        prune_dead_letter_dir(temp.path(), 2).await;

        let mut entries = fs::read_dir(temp.path()).await.unwrap();
        let mut names = Vec::new();
        while let Some(entry) = entries.next_entry().await.unwrap() {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
        names.sort();

        assert_eq!(names, vec!["entry-1.json", "entry-2.json", "note.txt"]);
    }
}

async fn report_error(
    client: &ApiClient,
    config: &Config,
    submission: &Submission,
    status: &str,
    message: &str,
    worker_secret: Option<&str>,
) {
    report_with_retry(
        client,
        config,
        ReportRetry {
            submission_id: &submission.id,
            claim_token: &submission.claim_token,
            status,
            compile_output: message,
            results: &[],
            worker_secret,
        },
    )
    .await;
}

/// Report a `runtime_error` verdict for a submission whose executor task
/// panicked (caught via `catch_unwind`). Takes the id/claim_token explicitly
/// because the `Submission` value has already been moved into the panicking
/// future by the time the panic is observed. Used by the main loop's panic
/// recovery (AGG-15 / C3-AGG-9). Best-effort: if reporting fails, the
/// existing dead-letter fallback in `report_with_retry` writes a JSON file.
pub async fn report_panic(
    client: &ApiClient,
    config: &Config,
    submission_id: &str,
    claim_token: &str,
    panic_message: &str,
    worker_secret: Option<&str>,
) {
    report_with_retry(
        client,
        config,
        ReportRetry {
            submission_id,
            claim_token,
            status: "runtime_error",
            compile_output: &format!("executor panicked: {panic_message}"),
            results: &[],
            worker_secret,
        },
    )
    .await;
}

async fn report_result(
    client: &ApiClient,
    config: &Config,
    submission: &Submission,
    status: &str,
    compile_output: &str,
    results: &[TestResult],
    worker_secret: Option<&str>,
) {
    report_with_retry(
        client,
        config,
        ReportRetry {
            submission_id: &submission.id,
            claim_token: &submission.claim_token,
            status,
            compile_output,
            results,
            worker_secret,
        },
    )
    .await;
}

/// Payload written to the dead-letter directory when all report retries are exhausted.
#[derive(Serialize)]
struct DeadLetterEntry<'a> {
    submission_id: &'a str,
    status: &'a str,
    compile_output: &'a str,
    results: &'a [TestResult],
    failed_at: String,
}

struct ReportRetry<'a> {
    submission_id: &'a str,
    claim_token: &'a str,
    status: &'a str,
    compile_output: &'a str,
    results: &'a [TestResult],
    worker_secret: Option<&'a str>,
}

async fn report_with_retry(client: &ApiClient, config: &Config, report: ReportRetry<'_>) {
    let ReportRetry {
        submission_id,
        claim_token,
        status,
        compile_output,
        results,
        worker_secret,
    } = report;

    for attempt in 0..3u32 {
        match client
            .report_result(
                submission_id,
                claim_token,
                status,
                compile_output,
                results,
                worker_secret,
            )
            .await
        {
            Ok(()) => return,
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    attempt = attempt + 1,
                    max_attempts = 3,
                    submission_id = %submission_id,
                    "Report attempt failed"
                );
                if attempt < 2 {
                    tokio::time::sleep(std::time::Duration::from_secs(1 << attempt)).await;
                }
            }
        }
    }

    // All retries exhausted — persist to dead-letter directory so the result
    // can be replayed manually and the submission does not remain stuck in
    // `judging` status indefinitely.
    let failed_at = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let entry = DeadLetterEntry {
        submission_id,
        status,
        compile_output,
        results,
        failed_at: failed_at.clone(),
    };

    let safe_id: String = submission_id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(128)
        .collect();
    let file_name = format!("{}-{}.json", safe_id, failed_at);
    let file_path = config.dead_letter_dir.join(&file_name);

    match fs::create_dir_all(&config.dead_letter_dir).await {
        Err(e) => {
            tracing::error!(
                error = %e,
                submission_id = %submission_id,
                dead_letter_dir = ?config.dead_letter_dir,
                "All report attempts exhausted; failed to create dead-letter dir. Result is lost."
            );
        }
        Ok(()) => match serde_json::to_vec_pretty(&entry) {
            Err(e) => {
                tracing::error!(
                    error = %e,
                    submission_id = %submission_id,
                    "All report attempts exhausted; failed to serialize dead-letter entry. Result is lost."
                );
            }
            Ok(bytes) => match fs::write(&file_path, &bytes).await {
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        submission_id = %submission_id,
                        dead_letter_path = ?file_path,
                        "All report attempts exhausted; failed to write dead-letter file. Result is lost."
                    );
                }
                Ok(()) => {
                    tracing::error!(
                        submission_id = %submission_id,
                        dead_letter_path = ?file_path,
                        "All report attempts exhausted; result written to dead-letter file"
                    );
                    prune_dead_letter_dir(&config.dead_letter_dir, 1000).await;
                }
            },
        },
    }
}
