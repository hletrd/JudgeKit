use crate::types::SecretString;
use std::env;
use std::path::PathBuf;
use std::time::Duration;

pub struct Config {
    pub claim_url: String,
    pub report_url: String,
    pub register_url: String,
    pub heartbeat_url: String,
    pub deregister_url: String,
    pub poll_interval: Duration,
    pub auth_token: SecretString,
    pub disable_custom_seccomp: bool,
    pub seccomp_profile_path: PathBuf,
    /// Directory where failed result payloads are written as JSON for manual recovery.
    /// Defaults to `./dead-letter`. Configurable via `DEAD_LETTER_DIR` env var.
    pub dead_letter_dir: PathBuf,
    /// Maximum number of submissions to judge concurrently.
    /// Defaults to 1. Configurable via `JUDGE_CONCURRENCY` env var (1..=16).
    pub judge_concurrency: usize,
    /// Hostname reported to the app server during registration.
    /// Defaults to the system hostname.
    pub worker_hostname: String,
    /// Whether the HTTP runner endpoint is enabled.
    /// Defaults to true. Configurable via `RUNNER_ENABLED` env var.
    pub runner_enabled: bool,
    /// Host address for the runner HTTP server.
    /// Defaults to `0.0.0.0`. Configurable via `RUNNER_HOST` env var.
    pub runner_host: String,
    /// Port for the runner HTTP server.
    /// Defaults to 3001. Configurable via `RUNNER_PORT` env var.
    pub runner_port: u16,
    /// Maximum concurrent runner executions.
    /// Defaults to max(num_cpus - 1, 1). Configurable via `RUNNER_CONCURRENCY` env var.
    pub runner_concurrency: usize,
    /// Whether the worker may continue in unregistered polling mode when
    /// registration fails. Defaults to false and should only be enabled in
    /// controlled local/dev environments.
    pub allow_unregistered_mode: bool,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        // Derive claim and report URLs.
        //
        // Preferred: JUDGE_BASE_URL (e.g. "http://localhost:3000/api/v1")
        //   -> claim_url = {base}/judge/claim
        //   -> report_url = {base}/judge/poll
        //
        // Legacy fallback: JUDGE_POLL_URL (e.g. "http://localhost:3000/api/v1/judge/poll")
        //   -> report_url = JUDGE_POLL_URL (unchanged)
        //   -> claim_url  = JUDGE_POLL_URL with "/judge/poll" replaced by "/judge/claim"
        //
        // Default: http://localhost:3000/api/v1
        let (claim_url, report_url, register_url, heartbeat_url, deregister_url) = if let Ok(base) = env::var("JUDGE_BASE_URL") {
            let base = base.trim_end_matches('/');
            (
                format!("{base}/judge/claim"),
                format!("{base}/judge/poll"),
                format!("{base}/judge/register"),
                format!("{base}/judge/heartbeat"),
                format!("{base}/judge/deregister"),
            )
        } else if let Ok(poll_url) = env::var("JUDGE_POLL_URL") {
            // Backward compatibility: derive claim URL from poll URL
            let (claim, base_prefix) = if let Some(base) = poll_url.strip_suffix("/judge/poll") {
                (format!("{base}/judge/claim"), base.to_string())
            } else {
                tracing::warn!(
                    "JUDGE_POLL_URL does not end with /judge/poll; \
                     cannot derive claim URL. Falling back to replacing last path segment."
                );
                // Best-effort: replace the last path segment
                let c = match poll_url.rfind('/') {
                    Some(pos) => format!("{}/claim", &poll_url[..pos]),
                    None => poll_url.replace("poll", "claim"),
                };
                let b = match poll_url.rfind("/judge/") {
                    Some(pos) => poll_url[..pos].to_string(),
                    None => "http://localhost:3000/api/v1".to_string(),
                };
                (c, b)
            };
            (
                claim,
                poll_url,
                format!("{base_prefix}/judge/register"),
                format!("{base_prefix}/judge/heartbeat"),
                format!("{base_prefix}/judge/deregister"),
            )
        } else {
            (
                "http://localhost:3000/api/v1/judge/claim".to_string(),
                "http://localhost:3000/api/v1/judge/poll".to_string(),
                "http://localhost:3000/api/v1/judge/register".to_string(),
                "http://localhost:3000/api/v1/judge/heartbeat".to_string(),
                "http://localhost:3000/api/v1/judge/deregister".to_string(),
            )
        };

        for url in [&claim_url, &report_url] {
            if url.starts_with("http://")
                && !url.starts_with("http://localhost")
                && !url.starts_with("http://127.0.0.1")
                && !url.starts_with("http://[::1]")
            {
                tracing::warn!(
                    "Judge URL uses unencrypted HTTP for a non-localhost address ({url}). \
                     This exposes the auth token and submission data in transit. \
                     Use HTTPS in production."
                );
                break;
            }
        }

        let poll_interval_ms: u64 = match env::var("POLL_INTERVAL") {
            Ok(val) => {
                let ms = val
                    .parse::<u64>()
                    .map_err(|_| format!("POLL_INTERVAL must be a positive integer, got: {val}"))?;
                if ms == 0 {
                    return Err("POLL_INTERVAL must be a positive integer greater than 0".to_string());
                }
                ms
            }
            Err(_) => 3000,
        };
        let poll_interval = Duration::from_millis(poll_interval_ms);

        let auth_token_raw = env::var("JUDGE_AUTH_TOKEN")
            .map_err(|_| "JUDGE_AUTH_TOKEN environment variable is required".to_string())?;
        if auth_token_raw == "your-judge-auth-token" {
            return Err(
                "JUDGE_AUTH_TOKEN must not be the placeholder value 'your-judge-auth-token'"
                    .to_string(),
            );
        }
        if auth_token_raw.is_empty() {
            return Err("JUDGE_AUTH_TOKEN must not be empty".to_string());
        }
        if auth_token_raw.len() < 32 {
            return Err(
                "JUDGE_AUTH_TOKEN must be at least 32 characters. Generate one with: openssl rand -hex 32"
                    .to_string(),
            );
        }
        let auth_token = SecretString::new(auth_token_raw);

        let disable_custom_seccomp = match env::var("JUDGE_DISABLE_CUSTOM_SECCOMP") {
            Ok(val) => {
                let lower = val.trim().to_lowercase();
                matches!(lower.as_str(), "1" | "true" | "yes" | "on")
            }
            Err(_) => false,
        };

        if disable_custom_seccomp {
            tracing::warn!(
                "JUDGE_DISABLE_CUSTOM_SECCOMP is enabled — custom seccomp profile will NOT be applied. \
                This reduces sandboxing security and should only be used in trusted environments."
            );
        }

        let seccomp_profile_path = match std::env::var("JUDGE_SECCOMP_PROFILE") {
            Ok(path) => std::path::PathBuf::from(path),
            Err(_) => std::env::current_dir()
                .map_err(|e| format!("Failed to determine current working directory: {e}"))?
                .join("docker/seccomp-profile.json"),
        };

        let dead_letter_dir = match env::var("DEAD_LETTER_DIR") {
            Ok(path) => PathBuf::from(path),
            Err(_) => std::env::current_dir()
                .map_err(|e| format!("Failed to determine current working directory: {e}"))?
                .join("dead-letter"),
        };

        let judge_concurrency: usize = match env::var("JUDGE_CONCURRENCY") {
            Ok(val) => {
                let n = val
                    .parse::<usize>()
                    .map_err(|_| format!("JUDGE_CONCURRENCY must be a positive integer, got: {val}"))?;
                if n < 1 || n > 16 {
                    return Err(
                        "JUDGE_CONCURRENCY must be between 1 and 16 (inclusive)".to_string(),
                    );
                }
                n
            }
            Err(_) => 1,
        };

        let worker_hostname = env::var("JUDGE_WORKER_HOSTNAME").unwrap_or_else(|_| {
            hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "unknown".to_string())
        });

        let runner_enabled = match env::var("RUNNER_ENABLED") {
            Ok(val) => {
                let lower = val.trim().to_lowercase();
                !matches!(lower.as_str(), "0" | "false" | "no" | "off")
            }
            Err(_) => true,
        };

        let runner_host = env::var("RUNNER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());

        let runner_port: u16 = match env::var("RUNNER_PORT") {
            Ok(val) => val
                .parse::<u16>()
                .map_err(|_| format!("RUNNER_PORT must be a valid port number, got: {val}"))?,
            Err(_) => 3001,
        };

        let runner_concurrency: usize = match env::var("RUNNER_CONCURRENCY") {
            Ok(val) => {
                let n = val
                    .parse::<usize>()
                    .map_err(|_| format!("RUNNER_CONCURRENCY must be a positive integer, got: {val}"))?;
                if !(1..=64).contains(&n) {
                    return Err("RUNNER_CONCURRENCY must be between 1 and 64 (inclusive)".to_string());
                }
                n
            }
            Err(_) => num_cpus::get().saturating_sub(1).max(1),
        };

        let allow_unregistered_mode = match env::var("JUDGE_ALLOW_UNREGISTERED_MODE") {
            Ok(val) => {
                let lower = val.trim().to_lowercase();
                matches!(lower.as_str(), "1" | "true" | "yes" | "on")
            }
            Err(_) => false,
        };

        Ok(Config {
            claim_url,
            report_url,
            register_url,
            heartbeat_url,
            deregister_url,
            poll_interval,
            auth_token,
            disable_custom_seccomp,
            seccomp_profile_path,
            dead_letter_dir,
            judge_concurrency,
            worker_hostname,
            runner_enabled,
            runner_host,
            runner_port,
            runner_concurrency,
            allow_unregistered_mode,
        })
    }
}
