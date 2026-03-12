use std::env;
use std::path::PathBuf;
use std::time::Duration;

pub struct Config {
    pub poll_url: String,
    pub poll_interval: Duration,
    pub auth_token: String,
    pub disable_custom_seccomp: bool,
    pub seccomp_profile_path: PathBuf,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let poll_url = env::var("JUDGE_POLL_URL")
            .unwrap_or_else(|_| "http://localhost:3000/api/v1/judge/poll".to_string());

        if poll_url.starts_with("http://")
            && !poll_url.starts_with("http://localhost")
            && !poll_url.starts_with("http://127.0.0.1")
            && !poll_url.starts_with("http://[::1]")
        {
            tracing::warn!(
                "JUDGE_POLL_URL uses unencrypted HTTP for a non-localhost address. \
                 This exposes the auth token and submission data in transit. \
                 Use HTTPS in production."
            );
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

        let auth_token = env::var("JUDGE_AUTH_TOKEN")
            .map_err(|_| "JUDGE_AUTH_TOKEN environment variable is required".to_string())?;
        if auth_token == "your-judge-auth-token" {
            return Err(
                "JUDGE_AUTH_TOKEN must not be the placeholder value 'your-judge-auth-token'"
                    .to_string(),
            );
        }
        if auth_token.is_empty() {
            return Err("JUDGE_AUTH_TOKEN must not be empty".to_string());
        }
        if auth_token.len() < 32 {
            return Err(
                "JUDGE_AUTH_TOKEN must be at least 32 characters. Generate one with: openssl rand -hex 32"
                    .to_string(),
            );
        }

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

        Ok(Config {
            poll_url,
            poll_interval,
            auth_token,
            disable_custom_seccomp,
            seccomp_profile_path,
        })
    }
}
