use crate::api::ApiClient;
use crate::comparator::compare_output;
use crate::config::Config;
use crate::docker::{self, DockerRunOptions, Phase};
use crate::languages;
use crate::types::{Submission, TestResult};
use tokio::fs;

const COMPILATION_MEMORY_LIMIT_MB: u32 = 1024;
const COMPILATION_TIMEOUT_MS: u64 = 20_000;
const MIN_TIMEOUT_MS: u64 = 100;

pub async fn execute(client: &ApiClient, config: &Config, submission: Submission) {
    let span = tracing::info_span!("judge_submission", submission_id = %submission.id);
    let _guard = span.enter();

    let lang_config = match languages::get_config(&submission.language) {
        Some(config) => config,
        None => {
            report_error(client, &submission, "compile_error", "Unsupported language").await;
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
            report_error(client, &submission, "runtime_error", &e.to_string()).await;
            return;
        }
    };

    let workspace_dir = temp_dir.path();

    // Set permissions to 0o755 so the judge user inside the container can write to the workspace
    if let Err(e) = fs::set_permissions(
        workspace_dir,
        std::os::unix::fs::PermissionsExt::from_mode(0o755),
    )
    .await
    {
        tracing::error!("Failed to set temp dir permissions: {e}");
        report_error(client, &submission, "runtime_error", &e.to_string()).await;
        return;
    }

    // Write source code
    let source_path = workspace_dir.join(format!("solution{}", lang_config.extension));
    if let Err(e) = fs::write(&source_path, &submission.source_code).await {
        tracing::error!("Failed to write source code: {e}");
        report_error(client, &submission, "runtime_error", &e.to_string()).await;
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
        report_error(client, &submission, "runtime_error", &e.to_string()).await;
        return;
    }

    let workspace_dir_str = match workspace_dir.to_str() {
        Some(s) => s.to_owned(),
        None => {
            tracing::error!("Temp directory path is not valid UTF-8");
            report_error(client, &submission, "runtime_error", "Temp directory path is not valid UTF-8").await;
            return;
        }
    };
    let mut compile_output = String::new();

    // Compile phase (if language requires compilation)
    if let Some(compile_command) = lang_config.compile_command {
        let compile_timeout_ms = COMPILATION_TIMEOUT_MS.max(submission.time_limit_ms * 5);
        let compile_memory_mb =
            COMPILATION_MEMORY_LIMIT_MB.max(submission.memory_limit_mb);

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
                report_error(client, &submission, "runtime_error", &msg).await;
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
                &submission,
                "compile_error",
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
            report_result(client, &submission, "compile_error", output, vec![]).await;
            return;
        }
    }

    // Run phase: execute each test case sequentially
    let mut results: Vec<TestResult> = Vec::new();

    for test_case in &submission.test_cases {
        let run_timeout_ms = MIN_TIMEOUT_MS.max(submission.time_limit_ms);

        let run_opts = DockerRunOptions {
            image: lang_config.docker_image.to_string(),
            workspace_dir: workspace_dir_str.clone(),
            command: lang_config.run_command.iter().map(|s| s.to_string()).collect(),
            phase: Phase::Run,
            input: Some(test_case.input.clone()),
            timeout_ms: run_timeout_ms,
            memory_limit_mb: submission.memory_limit_mb,
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
                report_error(client, &submission, "runtime_error", &msg).await;
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
        let status = if execution.timed_out {
            "time_limit"
        } else if execution.oom_killed || execution.exit_code == Some(137) {
            "memory_limit"
        } else if execution.exit_code.unwrap_or(1) != 0 {
            "runtime_error"
        } else if !is_correct {
            "wrong_answer"
        } else {
            "accepted"
        };

        let memory_used_kb = if execution.oom_killed {
            submission.memory_limit_mb.max(16) * 1024
        } else {
            0
        };

        results.push(TestResult {
            test_case_id: test_case.id.clone(),
            status: status.to_string(),
            actual_output,
            execution_time_ms: execution.duration_ms,
            memory_used_kb: memory_used_kb.into(),
        });

        if status != "accepted" {
            break;
        }
    }

    // Determine final status
    let final_status = results
        .iter()
        .find(|r| r.status != "accepted")
        .map(|r| r.status.clone())
        .unwrap_or_else(|| "accepted".to_string());

    report_result(
        client,
        &submission,
        &final_status,
        &compile_output,
        results,
    )
    .await;

    // temp_dir is dropped here, cleaning up automatically
}

async fn report_error(client: &ApiClient, submission: &Submission, status: &str, message: &str) {
    report_with_retry(client, &submission.id, &submission.claim_token, status, message, vec![]).await;
}

async fn report_result(
    client: &ApiClient,
    submission: &Submission,
    status: &str,
    compile_output: &str,
    results: Vec<TestResult>,
) {
    report_with_retry(client, &submission.id, &submission.claim_token, status, compile_output, results).await;
}

async fn report_with_retry(
    client: &ApiClient,
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
    tracing::error!(
        "All report attempts exhausted for submission {}; result may be lost",
        submission_id
    );
}
