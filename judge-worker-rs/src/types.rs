use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Accepted,
    WrongAnswer,
    TimeLimit,
    MemoryLimit,
    RuntimeError,
    CompileError,
}

impl Verdict {
    pub fn as_str(&self) -> &'static str {
        match self {
            Verdict::Accepted => "accepted",
            Verdict::WrongAnswer => "wrong_answer",
            Verdict::TimeLimit => "time_limit",
            Verdict::MemoryLimit => "memory_limit",
            Verdict::RuntimeError => "runtime_error",
            Verdict::CompileError => "compile_error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    C17,
    C23,
    Cpp20,
    Cpp23,
    Java,
    Python,
    Javascript,
    Kotlin,
    Typescript,
    Rust,
    Go,
    Swift,
    Csharp,
    R,
    Perl,
    Php,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    pub id: String,
    pub input: String,
    #[serde(rename = "expectedOutput")]
    pub expected_output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Submission {
    pub id: String,
    #[serde(rename = "claimToken")]
    pub claim_token: String,
    pub language: Language,
    #[serde(rename = "sourceCode")]
    pub source_code: String,
    #[serde(rename = "timeLimitMs")]
    pub time_limit_ms: u64,
    #[serde(rename = "memoryLimitMb")]
    pub memory_limit_mb: u32,
    #[serde(rename = "testCases")]
    pub test_cases: Vec<TestCase>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollResponse {
    pub data: Option<Submission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    #[serde(rename = "testCaseId")]
    pub test_case_id: String,
    pub status: String,
    #[serde(rename = "actualOutput")]
    pub actual_output: String,
    #[serde(rename = "executionTimeMs")]
    pub execution_time_ms: u64,
    #[serde(rename = "memoryUsedKb")]
    pub memory_used_kb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusReport<'a> {
    #[serde(rename = "submissionId")]
    pub submission_id: &'a str,
    #[serde(rename = "claimToken")]
    pub claim_token: &'a str,
    pub status: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultReport<'a> {
    #[serde(rename = "submissionId")]
    pub submission_id: &'a str,
    #[serde(rename = "claimToken")]
    pub claim_token: &'a str,
    pub status: &'a str,
    #[serde(rename = "compileOutput")]
    pub compile_output: &'a str,
    pub results: Vec<TestResult>,
}
