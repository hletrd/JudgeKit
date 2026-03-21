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

    /// Register this worker with the app server.
    pub async fn register(
        &self,
        hostname: &str,
        concurrency: usize,
    ) -> Result<RegisterResponse, String> {
        let body = RegisterRequest {
            hostname,
            concurrency,
            version: Some(env!("CARGO_PKG_VERSION")),
            labels: None,
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
        active_tasks: usize,
        available_slots: usize,
        uptime_seconds: u64,
    ) -> Result<(), String> {
        let body = HeartbeatRequest {
            worker_id,
            active_tasks,
            available_slots,
            uptime_seconds,
        };

        let response = self
            .client
            .post(&self.heartbeat_url)
            .header("Authorization", self.auth_header())
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
    pub async fn deregister(&self, worker_id: &str) -> Result<(), String> {
        let body = DeregisterRequest { worker_id };

        let response = self
            .client
            .post(&self.deregister_url)
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Deregister request failed: {e}"))?;

        if !response.status().is_success() {
            tracing::warn!("Deregister returned non-success: {}", response.status());
        }

        Ok(())
    }

    /// POST claim_url with Bearer auth.
    /// Returns Ok(Some(submission)) if work available,
    /// Ok(None) if no work, Err on network/parse error.
    pub async fn poll(&self, worker_id: Option<&str>) -> Result<Option<Submission>, String> {
        let body = ClaimRequest { worker_id };

        let response = self
            .client
            .post(&self.claim_url)
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Poll request failed: {e}"))?;

        if !response.status().is_success() {
            return Err(format!("Poll failed: {}", response.status()));
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
    ) -> Result<(), String> {
        let body = StatusReport {
            submission_id,
            claim_token,
            status,
        };

        let response = self
            .client
            .post(&self.report_url)
            .header("Authorization", self.auth_header())
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
        results: Vec<TestResult>,
    ) -> Result<(), String> {
        let body = ResultReport {
            submission_id,
            claim_token,
            status,
            compile_output,
            results,
        };

        let response = self
            .client
            .post(&self.report_url)
            .header("Authorization", self.auth_header())
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
