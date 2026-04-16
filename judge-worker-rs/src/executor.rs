use crate::api::ApiClient;
use crate::comparator::{compare_output, compare_float_output};
use crate::config::Config;
use crate::docker::{self, DockerRunOptions, Phase};
use crate::languages;
use crate::types::{Submission, TestResult, Verdict};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tokio::fs;
use tracing::Instrument;

const COMPILATION_MEMORY_LIMIT_MB: u32 = 2048;
const COMPILATION_TIMEOUT_MS: u64 = 600_000;
const MIN_COMPILE_TIMEOUT_MS: u64 = 30_000;
const MIN_TIMEOUT_MS: u64 = 100;
const MAX_MEMORY_LIMIT_MB: u32 = 1024;
const RUNTIME_ERROR_OUTPUT_LIMIT: usize = 500;

fn max_time_limit_ms() -> u64 {
    std::env::var("MAX_TIME_LIMIT_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30_000)
}
const MAX_SOURCE_CODE_BYTES: usize = 256 * 1024; // 256 KB

use crate::validation::validate_docker_image;

fn compile_timeout_ms_for_submission(time_limit_ms: u64) -> u64 {
    time_limit_ms
        .saturating_mul(2)
        .clamp(MIN_COMPILE_TIMEOUT_MS, COMPILATION_TIMEOUT_MS)
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

fn reportable_test_case_output(verdict: Verdict, stdout: &[u8], stderr: &str) -> String {
    if verdict == Verdict::RuntimeError {
        let trimmed_stderr = stderr.trim();
        if !trimmed_stderr.is_empty() {
            return trimmed_stderr.chars().take(RUNTIME_ERROR_OUTPUT_LIMIT).collect();
        }
    }

    String::from_utf8_lossy(stdout).into_owned()
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

pub async fn execute(client: &ApiClient, config: &Config, submission: Submission) {
    let span = tracing::info_span!("judge_submission", submission_id = %submission.id);
    execute_inner(client, config, submission).instrument(span).await;
}

async fn execute_inner(client: &ApiClient, config: &Config, submission: Submission) {
    let lang_config = languages::get_config(&submission.language);

    // If no static config exists and no DB overrides are provided, reject
    if lang_config.is_none() && submission.docker_image.is_none() {
        report_error(client, config, &submission, Verdict::CompileError.as_str(), "Unsupported language").await;
        return;
    }

    // Use DB overrides or fall back to static config
    let default_ext = ".txt";
    let docker_image = submission.docker_image.as_deref()
        .or(lang_config.map(|c| c.docker_image))
        .unwrap_or("alpine:latest");

    // Validate docker image reference to prevent pulling arbitrary images
    if !validate_docker_image(docker_image) {
        report_error(client, config, &submission, Verdict::CompileError.as_str(), "Invalid Docker image reference").await;
        return;
    }
    let compile_command: Option<Vec<&str>> = match &submission.compile_command {
        Some(cmd) if !cmd.is_empty() && !cmd.iter().all(|s| s.is_empty()) => Some(cmd.iter().map(|s| s.as_str()).collect()),
        _ => lang_config.and_then(|c| c.compile_command.map(|c| c.to_vec())),
    };
    let run_command: Vec<&str> = match &submission.run_command {
        Some(cmd) if !cmd.is_empty() && !cmd.iter().all(|s| s.is_empty()) => cmd.iter().map(|s| s.as_str()).collect(),
        _ => lang_config.map(|c| c.run_command.to_vec()).unwrap_or_default(),
    };
    let extension = lang_config.map(|c| c.extension).unwrap_or(default_ext);
    let needs_exec_tmp = lang_config.is_some_and(|c| c.needs_exec_tmp);

    if run_command.is_empty() {
        report_error(client, config, &submission, Verdict::CompileError.as_str(), "No run command configured for this language").await;
        return;
    }

    // Report "judging" status; log errors but continue
    if let Err(e) = client
        .report_status(&submission.id, &submission.claim_token, "judging")
        .await
    {
        tracing::error!(error = %e, "Failed to report judging status");
    }

    // Create temp workspace directory
    let temp_dir = match tempfile::TempDir::new() {
        Ok(d) => d,
        Err(e) => {
            tracing::error!(error = %e, "Failed to create temp dir");
            report_error(client, config, &submission, "runtime_error", &e.to_string()).await;
            return;
        }
    };

    let workspace_dir = temp_dir.path();

    // Set permissions to 0o777 so the container judge user can write compiled output
    if let Err(e) = fs::set_permissions(
        workspace_dir,
        std::os::unix::fs::PermissionsExt::from_mode(0o777),
    )
    .await
    {
        tracing::error!(error = %e, "Failed to set temp dir permissions");
        report_error(client, config, &submission, "runtime_error", &e.to_string()).await;
        return;
    }

    // Validate source code size before writing to disk
    if submission.source_code.len() > MAX_SOURCE_CODE_BYTES {
        report_error(client, config, &submission, Verdict::CompileError.as_str(), "Source code exceeds maximum size limit").await;
        return;
    }

    // Write source code
    let source_path = workspace_dir.join(format!("solution{}", extension));
    if let Err(e) = fs::write(&source_path, &submission.source_code).await {
        tracing::error!(error = %e, "Failed to write source code");
        report_error(client, config, &submission, "runtime_error", &e.to_string()).await;
        return;
    }

    // Ensure source file is world-readable regardless of host umask
    if let Err(e) = fs::set_permissions(
        &source_path,
        std::os::unix::fs::PermissionsExt::from_mode(0o644),
    )
    .await
    {
        tracing::error!(error = %e, "Failed to set source file permissions");
        report_error(client, config, &submission, "runtime_error", &e.to_string()).await;
        return;
    }

    let workspace_dir_str = match workspace_dir.to_str() {
        Some(s) => s.to_owned(),
        None => {
            tracing::error!("Temp directory path is not valid UTF-8");
            report_error(client, config, &submission, "runtime_error", "Temp directory path is not valid UTF-8").await;
            return;
        }
    };
    let mut compile_output = String::new();

    // Compile phase (if language requires compilation)
    if let Some(compile_command) = compile_command {
        let compile_timeout_ms = compile_timeout_ms_for_submission(submission.time_limit_ms);
        let compile_memory_mb =
            COMPILATION_MEMORY_LIMIT_MB.max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB));

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
        )
        .await
        {
            Ok(result) => result,
            Err(docker::JudgeEnvironmentError(msg)) => {
                tracing::error!(error = %msg, "Judge environment error during compilation");
                report_error(client, config, &submission, "runtime_error", &msg).await;
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
        compile_output = parts.join("\n").trim().to_string();

        if compilation.timed_out {
            report_result(
                client,
                config,
                &submission,
                Verdict::CompileError.as_str(),
                "Compilation timed out",
                vec![],
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
            report_result(client, config, &submission, Verdict::CompileError.as_str(), output, vec![]).await;
            return;
        }
    }

    // Reject submissions with no test cases rather than silently returning "accepted"
    if submission.test_cases.is_empty() {
        report_error(client, config, &submission, "runtime_error", "No test cases defined for this problem").await;
        return;
    }

    // Run phase: execute each test case sequentially
    let mut results: Vec<TestResult> = Vec::new();

    for test_case in &submission.test_cases {
        let run_timeout_ms = MIN_TIMEOUT_MS.max(submission.time_limit_ms.min(max_time_limit_ms()));

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

        let execution = match docker::run_docker(
            &run_opts,
            &config.seccomp_profile_path,
            config.disable_custom_seccomp,
        )
        .await
        {
            Ok(result) => result,
            Err(docker::JudgeEnvironmentError(msg)) => {
                tracing::error!(
                    error = %msg,
                    test_case_id = %test_case.id,
                    "Judge environment error during test case execution"
                );
                report_error(client, config, &submission, "runtime_error", &msg).await;
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
            compare_output(
                test_case.expected_output.as_bytes(),
                &execution.stdout,
            )
        };

        // Determine test case status
        let verdict = if execution.timed_out {
            Verdict::TimeLimit
        } else if execution.oom_killed || execution.exit_code == Some(137) {
            Verdict::MemoryLimit
        } else if execution.exit_code.unwrap_or(1) != 0 {
            Verdict::RuntimeError
        } else if !is_correct {
            Verdict::WrongAnswer
        } else {
            Verdict::Accepted
        };

        let actual_output = reportable_test_case_output(verdict, &execution.stdout, &execution.stderr);

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
            memory_used_kb: memory_used_kb.into(),
            runtime_error_type: if verdict == Verdict::RuntimeError {
                runtime_error_type(&execution.stderr, execution.exit_code)
            } else {
                None
            },
        });

        if verdict != Verdict::Accepted {
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
        results,
    )
    .await;

    // temp_dir is dropped here, cleaning up automatically
}

#[cfg(test)]
mod tests {
    use super::{
        compile_timeout_ms_for_submission, prune_dead_letter_dir, reportable_test_case_output, reported_memory_used_kb,
        runtime_error_type, COMPILATION_TIMEOUT_MS, MIN_COMPILE_TIMEOUT_MS, RUNTIME_ERROR_OUTPUT_LIMIT,
    };
    use crate::types::Verdict;
    use tempfile::tempdir;
    use tokio::fs;

    #[test]
    fn compile_timeout_has_reasonable_floor_for_tiny_time_limits() {
        assert_eq!(compile_timeout_ms_for_submission(500), MIN_COMPILE_TIMEOUT_MS);
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
        assert_eq!(compile_timeout_ms_for_submission(400_000), COMPILATION_TIMEOUT_MS);
    }

    #[test]
    fn runtime_error_type_maps_known_exit_codes_and_stack_overflow() {
        assert_eq!(runtime_error_type("", Some(139)).as_deref(), Some("SIGSEGV"));
        assert_eq!(runtime_error_type("", Some(136)).as_deref(), Some("SIGFPE"));
        assert_eq!(runtime_error_type("stack overflow", Some(1)).as_deref(), Some("stack_overflow"));
    }

    #[test]
    fn reportable_test_case_output_prefers_truncated_stderr_for_runtime_errors() {
        let stderr = "x".repeat(RUNTIME_ERROR_OUTPUT_LIMIT + 50);
        let output = reportable_test_case_output(Verdict::RuntimeError, b"stdout", &stderr);

        assert_eq!(output.len(), RUNTIME_ERROR_OUTPUT_LIMIT);
        assert!(output.chars().all(|ch| ch == 'x'));
        assert_eq!(reportable_test_case_output(Verdict::WrongAnswer, b"stdout", "stderr"), "stdout");
    }

    #[tokio::test]
    async fn prune_dead_letter_dir_keeps_only_newest_json_files() {
        let temp = tempdir().unwrap();

        for index in 0..3 {
            let path = temp.path().join(format!("entry-{index}.json"));
            fs::write(&path, format!("{{\"index\":{index}}}")).await.unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        fs::write(temp.path().join("note.txt"), "keep").await.unwrap();

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

async fn report_error(client: &ApiClient, config: &Config, submission: &Submission, status: &str, message: &str) {
    report_with_retry(client, config, &submission.id, &submission.claim_token, status, message, vec![]).await;
}

async fn report_result(
    client: &ApiClient,
    config: &Config,
    submission: &Submission,
    status: &str,
    compile_output: &str,
    results: Vec<TestResult>,
) {
    report_with_retry(client, config, &submission.id, &submission.claim_token, status, compile_output, results).await;
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

async fn report_with_retry(
    client: &ApiClient,
    config: &Config,
    submission_id: &str,
    claim_token: &str,
    status: &str,
    compile_output: &str,
    results: Vec<TestResult>,
) {
    for attempt in 0..3u32 {
        match client
            .report_result(submission_id, claim_token, status, compile_output, results.clone())
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
    let failed_at = {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let secs_per_min = 60u64;
        let secs_per_hour = 3600u64;
        let secs_per_day = 86400u64;
        // Days since Unix epoch (1970-01-01)
        let mut days = now / secs_per_day;
        let time_of_day = now % secs_per_day;
        let hh = time_of_day / secs_per_hour;
        let mm = (time_of_day % secs_per_hour) / secs_per_min;
        let ss = time_of_day % secs_per_min;
        // Compute year/month/day using the Gregorian proleptic calendar
        let mut year = 1970u64;
        loop {
            let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
            let days_in_year = if leap { 366 } else { 365 };
            if days < days_in_year {
                break;
            }
            days -= days_in_year;
            year += 1;
        }
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let days_in_month = [31u64, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let mut month = 1u64;
        for &dim in &days_in_month {
            if days < dim {
                break;
            }
            days -= dim;
            month += 1;
        }
        let day = days + 1;
        format!("{:04}{:02}{:02}T{:02}{:02}{:02}Z", year, month, day, hh, mm, ss)
    };
    let entry = DeadLetterEntry {
        submission_id,
        status,
        compile_output,
        results: &results,
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
