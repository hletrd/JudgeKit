use crate::types::SecretString;
use std::env;
use std::path::PathBuf;
use std::time::Duration;

pub struct Config {
    pub claim_url: String,
    pub report_url: String,
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
        let (claim_url, report_url) = if let Ok(base) = env::var("JUDGE_BASE_URL") {
            let base = base.trim_end_matches('/');
            (
                format!("{base}/judge/claim"),
                format!("{base}/judge/poll"),
            )
        } else if let Ok(poll_url) = env::var("JUDGE_POLL_URL") {
            // Backward compatibility: derive claim URL from poll URL
            let claim = if let Some(base) = poll_url.strip_suffix("/judge/poll") {
                format!("{base}/judge/claim")
            } else {
                tracing::warn!(
                    "JUDGE_POLL_URL does not end with /judge/poll; \
                     cannot derive claim URL. Falling back to replacing last path segment."
                );
                // Best-effort: replace the last path segment
                match poll_url.rfind('/') {
                    Some(pos) => format!("{}/claim", &poll_url[..pos]),
                    None => poll_url.replace("poll", "claim"),
                }
            };
            (claim, poll_url)
        } else {
            (
                "http://localhost:3000/api/v1/judge/claim".to_string(),
                "http://localhost:3000/api/v1/judge/poll".to_string(),
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
            Err(_) => 2000,
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

        Ok(Config {
            claim_url,
            report_url,
            poll_interval,
            auth_token,
            disable_custom_seccomp,
            seccomp_profile_path,
            dead_letter_dir,
            judge_concurrency,
        })
    }
}
