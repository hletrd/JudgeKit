use crate::api::ApiClient;
use crate::comparator::compare_output;
use crate::config::Config;
use crate::docker::{self, DockerRunOptions, Phase};
use crate::languages;
use crate::types::{Submission, TestResult, Verdict};
use serde::Serialize;
use tokio::fs;
use tracing::Instrument;

const COMPILATION_MEMORY_LIMIT_MB: u32 = 1024;
const COMPILATION_TIMEOUT_MS: u64 = 20_000;
const MIN_TIMEOUT_MS: u64 = 100;
const MAX_TIME_LIMIT_MS: u64 = 30_000;
const MAX_MEMORY_LIMIT_MB: u32 = 1024;
const MAX_SOURCE_CODE_BYTES: usize = 256 * 1024; // 256 KB

pub async fn execute(client: &ApiClient, config: &Config, submission: Submission) {
    let span = tracing::info_span!("judge_submission", submission_id = %submission.id);
    execute_inner(client, config, submission).instrument(span).await;
}

async fn execute_inner(client: &ApiClient, config: &Config, submission: Submission) {
    let lang_config = match languages::get_config(&submission.language) {
        Some(lc) => lc,
        None => {
            report_error(client, config, &submission, Verdict::CompileError.as_str(), "Unsupported language").await;
            return;
        }
    };

    // Report "judging" status; log errors but continue
    if let Err(e) = client
        .report_status(&submission.id, &submission.claim_token, "judging")
        .await
    {
        tracing::error!("Failed to report judging status: {e}");
    }

    // Create temp workspace directory
    let temp_dir = match tempfile::TempDir::new() {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("Failed to create temp dir: {e}");
            report_error(client, config, &submission, "runtime_error", &e.to_string()).await;
            return;
        }
    };

    let workspace_dir = temp_dir.path();

    // Set permissions to 0o700 so only the owner can access the workspace
    if let Err(e) = fs::set_permissions(
        workspace_dir,
        std::os::unix::fs::PermissionsExt::from_mode(0o700),
    )
    .await
    {
        tracing::error!("Failed to set temp dir permissions: {e}");
        report_error(client, config, &submission, "runtime_error", &e.to_string()).await;
        return;
    }

    // Validate source code size before writing to disk
    if submission.source_code.len() > MAX_SOURCE_CODE_BYTES {
        report_error(client, config, &submission, Verdict::CompileError.as_str(), "Source code exceeds maximum size limit").await;
        return;
    }

    // Write source code
    let source_path = workspace_dir.join(format!("solution{}", lang_config.extension));
    if let Err(e) = fs::write(&source_path, &submission.source_code).await {
        tracing::error!("Failed to write source code: {e}");
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
        tracing::error!("Failed to set source file permissions: {e}");
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
    if let Some(compile_command) = lang_config.compile_command {
        let clamped_time = submission.time_limit_ms.min(MAX_TIME_LIMIT_MS);
        let compile_timeout_ms = COMPILATION_TIMEOUT_MS.max(clamped_time.saturating_mul(5));
        let compile_memory_mb =
            COMPILATION_MEMORY_LIMIT_MB.max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB));

        let compile_opts = DockerRunOptions {
            image: lang_config.docker_image.to_string(),
            workspace_dir: workspace_dir_str.clone(),
            command: compile_command.iter().map(|s| s.to_string()).collect(),
            phase: Phase::Compile,
            input: None,
            timeout_ms: compile_timeout_ms,
            memory_limit_mb: compile_memory_mb,
            read_only_workspace: false,
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
                tracing::error!("Judge environment error during compilation: {msg}");
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
        let run_timeout_ms = MIN_TIMEOUT_MS.max(submission.time_limit_ms.min(MAX_TIME_LIMIT_MS));

        let run_opts = DockerRunOptions {
            image: lang_config.docker_image.to_string(),
            workspace_dir: workspace_dir_str.clone(),
            command: lang_config.run_command.iter().map(|s| s.to_string()).collect(),
            phase: Phase::Run,
            input: Some(test_case.input.clone()),
            timeout_ms: run_timeout_ms,
            memory_limit_mb: submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB),
            read_only_workspace: true,
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
                    "Judge environment error during test case {}: {msg}",
                    test_case.id
                );
                report_error(client, config, &submission, "runtime_error", &msg).await;
                return;
            }
        };

        // Compare raw bytes directly (avoids double conversion and UTF-8 lossy artifacts)
        let is_correct = compare_output(
            test_case.expected_output.as_bytes(),
            &execution.stdout,
        );

        // Convert to string for reporting (separate from comparison)
        let actual_output = String::from_utf8_lossy(&execution.stdout).into_owned();

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

        let memory_used_kb = if execution.oom_killed {
            submission.memory_limit_mb.max(16) * 1024
        } else {
            0
        };

        results.push(TestResult {
            test_case_id: test_case.id.clone(),
            status: verdict.as_str().to_string(),
            actual_output,
            execution_time_ms: execution.duration_ms,
            memory_used_kb: memory_used_kb.into(),
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
    claim_token: &'a str,
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
                    "Report attempt {}/{} failed for submission {}: {e}",
                    attempt + 1,
                    3,
                    submission_id
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
        claim_token,
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
                "All report attempts exhausted for submission {}; \
                 also failed to create dead-letter dir {:?}: {e}. Result is lost.",
                submission_id,
                config.dead_letter_dir
            );
        }
        Ok(()) => match serde_json::to_vec_pretty(&entry) {
            Err(e) => {
                tracing::error!(
                    "All report attempts exhausted for submission {}; \
                     failed to serialize dead-letter entry: {e}. Result is lost.",
                    submission_id
                );
            }
            Ok(bytes) => match fs::write(&file_path, &bytes).await {
                Err(e) => {
                    tracing::error!(
                        "All report attempts exhausted for submission {}; \
                         failed to write dead-letter file {:?}: {e}. Result is lost.",
                        submission_id,
                        file_path
                    );
                }
                Ok(()) => {
                    tracing::error!(
                        "All report attempts exhausted for submission {}; \
                         result written to dead-letter file: {:?}",
                        submission_id,
                        file_path
                    );
                }
            },
        },
    }
}
