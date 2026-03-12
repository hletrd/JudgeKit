use crate::types::{PollResponse, Submission, StatusReport, ResultReport, TestResult};

pub struct ApiClient {
    client: reqwest::Client,
    claim_url: String,
    report_url: String,
    auth_token: String,
}

impl ApiClient {
    pub fn new(claim_url: String, report_url: String, auth_token: String) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("failed to build HTTP client: {e}"))?;
        Ok(Self {
            client,
            claim_url,
            report_url,
            auth_token,
        })
    }

    /// POST claim_url with Bearer auth and empty JSON body.
    /// Returns Ok(Some(submission)) if work available,
    /// Ok(None) if no work, Err on network/parse error.
    pub async fn poll(&self) -> Result<Option<Submission>, String> {
        let response = self.client
            .post(&self.claim_url)
            .header("Authorization", format!("Bearer {}", self.auth_token))
            .header("Content-Type", "application/json")
            .body("{}")
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
    pub async fn report_status(&self, submission_id: &str, claim_token: &str, status: &str) -> Result<(), String> {
        let body = StatusReport {
            submission_id,
            claim_token,
            status,
        };

        let response = self.client
            .post(&self.report_url)
            .header("Authorization", format!("Bearer {}", self.auth_token))
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

        let response = self.client
            .post(&self.report_url)
            .header("Authorization", format!("Bearer {}", self.auth_token))
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
