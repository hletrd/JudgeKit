use serde::{Deserialize, Serialize};

/// A newtype wrapper that redacts the inner value in `Debug` output,
/// preventing accidental leakage of secrets into logs.
pub struct SecretString(String);

impl SecretString {
    pub fn new(s: String) -> Self {
        Self(s)
    }

    /// Expose the inner secret for use in HTTP headers, etc.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}

impl Clone for SecretString {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

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
    Ruby,
    Lua,
    Haskell,
    Dart,
    Zig,
    Nim,
    Ocaml,
    Elixir,
    Julia,
    D,
    Racket,
    Vlang,
    C99,
    C89,
    Fortran,
    Pascal,
    Brainfuck,
    Cobol,
    #[serde(rename = "clang_c23")]
    ClangC23,
    #[serde(rename = "clang_cpp23")]
    ClangCpp23,
    Scala,
    Erlang,
    Commonlisp,
    Bash,
    Whitespace,
    Befunge,
    Rockstar,
    Shakespeare,
    Aheui,
    Hyeong,
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
    #[serde(rename = "comparisonMode", default = "default_comparison_mode")]
    pub comparison_mode: String,
    #[serde(rename = "floatAbsoluteError")]
    pub float_absolute_error: Option<f64>,
    #[serde(rename = "floatRelativeError")]
    pub float_relative_error: Option<f64>,
}

fn default_comparison_mode() -> String {
    "exact".to_string()
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
