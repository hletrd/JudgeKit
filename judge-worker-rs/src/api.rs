use crate::types::{
    ClaimRequest, DeregisterRequest, HeartbeatRequest, PollResponse, RegisterRequest,
    RegisterResponse, ResultReport, SecretString, StatusReport, Submission, TestResult,
};

pub struct ApiClient {
    client: reqwest::Client,
    claim_url: String,
    report_url: String,
    register_url: String,
    heartbeat_url: String,
    deregister_url: String,
    auth_token: SecretString,
}

impl ApiClient {
    pub fn new(
        claim_url: String,
        report_url: String,
        register_url: String,
        heartbeat_url: String,
        deregister_url: String,
        auth_token: SecretString,
    ) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("failed to build HTTP client: {e}"))?;
        Ok(Self {
            client,
            claim_url,
            report_url,
            register_url,
            heartbeat_url,
            deregister_url,
            auth_token,
        })
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.auth_token.expose())
    }

    fn auth_header_for_worker(&self, worker_secret: Option<&str>) -> String {
        match worker_secret {
            Some(secret) => format!("Bearer {secret}"),
            None => {
                // Falling back to the shared token is supported but worth
                // surfacing once so an operator can notice a missing per-worker
                // secret. Logged at most once per process to avoid per-request spam.
                use std::sync::atomic::{AtomicBool, Ordering};
                static WARNED: AtomicBool = AtomicBool::new(false);
                if !WARNED.swap(true, Ordering::Relaxed) {
                    tracing::warn!(
                        "no per-worker secret available; falling back to shared auth token (logged once)"
                    );
                }
                format!("Bearer {}", self.auth_token.expose())
            }
        }
    }

    /// Register this worker with the app server.
    pub async fn register(
        &self,
        hostname: &str,
        concurrency: usize,
        cpu_model: Option<&str>,
        architecture: Option<&str>,
    ) -> Result<RegisterResponse, String> {
        let body = RegisterRequest {
            hostname,
            concurrency,
            version: Some(env!("CARGO_PKG_VERSION")),
            labels: None,
            cpu_model,
            architecture,
        };

        let response = self
            .client
            .post(&self.register_url)
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Register request failed: {e}"))?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Register failed: {text}"));
        }

        response
            .json::<RegisterResponse>()
            .await
            .map_err(|e| format!("Failed to parse register response: {e}"))
    }

    /// Send a heartbeat to the app server.
    pub async fn heartbeat(
        &self,
        worker_id: &str,
        worker_secret: Option<&str>,
        active_tasks: usize,
        available_slots: usize,
        uptime_seconds: u64,
    ) -> Result<(), String> {
        let body = HeartbeatRequest {
            worker_id,
            worker_secret,
            active_tasks,
            available_slots,
            uptime_seconds,
        };

        let response = self
            .client
            .post(&self.heartbeat_url)
            .header("Authorization", self.auth_header_for_worker(worker_secret))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Heartbeat request failed: {e}"))?;

        if !response.status().is_success() {
            return Err(format!("Heartbeat failed: {}", response.status()));
        }

        Ok(())
    }

    /// Deregister this worker from the app server.
    pub async fn deregister(
        &self,
        worker_id: &str,
        worker_secret: Option<&str>,
    ) -> Result<(), String> {
        let body = DeregisterRequest {
            worker_id,
            worker_secret,
        };

        let response = self
            .client
            .post(&self.deregister_url)
            .header("Authorization", self.auth_header_for_worker(worker_secret))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Deregister request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Deregister failed: {status} {text}"));
        }

        Ok(())
    }

    /// POST claim_url with Bearer auth.
    /// Returns Ok(Some(submission)) if work available,
    /// Ok(None) if no work, Err on network/parse error.
    pub async fn poll(
        &self,
        worker_id: Option<&str>,
        worker_secret: Option<&str>,
    ) -> Result<Option<Submission>, String> {
        let body = ClaimRequest {
            worker_id,
            worker_secret,
        };

        let response = self
            .client
            .post(&self.claim_url)
            .header("Authorization", self.auth_header_for_worker(worker_secret))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Poll request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Poll failed: {status} {body}"));
        }

        let poll_response: PollResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse poll response: {e}"))?;

        Ok(poll_response.data)
    }

    /// POST status update (e.g. "judging") without results
    pub async fn report_status(
        &self,
        submission_id: &str,
        claim_token: &str,
        status: &str,
        worker_secret: Option<&str>,
    ) -> Result<(), String> {
        let body = StatusReport {
            submission_id,
            claim_token,
            status,
        };

        let response = self
            .client
            .post(&self.report_url)
            .header("Authorization", self.auth_header_for_worker(worker_secret))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to report status: {e}"))?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to report status: {text}"));
        }

        Ok(())
    }

    /// POST final result with compile output and test results
    pub async fn report_result(
        &self,
        submission_id: &str,
        claim_token: &str,
        status: &str,
        compile_output: &str,
        results: &[TestResult],
        worker_secret: Option<&str>,
    ) -> Result<(), String> {
        let body = ResultReport {
            submission_id,
            claim_token,
            status,
            compile_output,
            results: std::borrow::Cow::Borrowed(results),
        };

        let response = self
            .client
            .post(&self.report_url)
            .header("Authorization", self.auth_header_for_worker(worker_secret))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to report result: {e}"))?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to report result: {text}"));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::ApiClient;
    use crate::types::SecretString;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn make_client() -> ApiClient {
        ApiClient::new(
            "http://localhost/claim".to_string(),
            "http://localhost/report".to_string(),
            "http://localhost/register".to_string(),
            "http://localhost/heartbeat".to_string(),
            "http://localhost/deregister".to_string(),
            SecretString::new("shared-token".to_string()),
        )
        .expect("client")
    }

    fn make_client_with_base(base_url: &str) -> ApiClient {
        ApiClient::new(
            format!("{base_url}/claim"),
            format!("{base_url}/report"),
            format!("{base_url}/register"),
            format!("{base_url}/heartbeat"),
            format!("{base_url}/deregister"),
            SecretString::new("shared-token".to_string()),
        )
        .expect("client")
    }

    #[test]
    fn uses_worker_secret_for_worker_scoped_bearer_auth() {
        let client = make_client();
        assert_eq!(
            client.auth_header_for_worker(Some("worker-secret")),
            "Bearer worker-secret"
        );
    }

    #[test]
    fn falls_back_to_shared_bearer_auth_when_worker_secret_is_absent() {
        let client = make_client();
        assert_eq!(client.auth_header_for_worker(None), "Bearer shared-token");
    }

    #[tokio::test]
    async fn deregister_succeeds_on_success_status() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/deregister"))
            .and(header("Authorization", "Bearer shared-token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"ok": true})))
            .mount(&server)
            .await;

        let client = make_client_with_base(&server.uri());
        let result = client.deregister("worker-1", None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn deregister_returns_err_on_404() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/deregister"))
            .respond_with(ResponseTemplate::new(404).set_body_string("not found"))
            .mount(&server)
            .await;

        let client = make_client_with_base(&server.uri());
        let result = client.deregister("worker-1", None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("404"));
    }

    #[tokio::test]
    async fn deregister_returns_err_on_500() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/deregister"))
            .respond_with(ResponseTemplate::new(500).set_body_string("server error"))
            .mount(&server)
            .await;

        let client = make_client_with_base(&server.uri());
        let result = client.deregister("worker-1", None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("500"));
    }
}
