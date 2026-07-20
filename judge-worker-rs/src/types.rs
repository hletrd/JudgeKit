use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

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

impl Drop for SecretString {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::SecretString;

    #[test]
    fn secret_string_zeroizes_on_drop_without_panic() {
        let secret = SecretString::new("super-secret-token".to_string());
        drop(secret);
    }

    #[test]
    fn secret_string_redacts_debug_output() {
        let secret = SecretString::new("super-secret-token".to_string());
        assert_eq!(format!("{:?}", secret), "[REDACTED]");
    }

    #[test]
    fn warm_pool_targets_default_to_disabled_when_absent() {
        // Older app servers omit warmPool entirely; the worker must treat that
        // as "warm pool off" rather than failing to parse the response.
        let json = r#"{"workerId":"w1","workerSecret":"s","heartbeatIntervalMs":30000,"staleClaimTimeoutMs":300000}"#;
        let parsed: super::RegisterResponseData = serde_json::from_str(json).expect("parse");
        assert!(!parsed.warm_pool.enabled);
        assert!(parsed.warm_pool.images.is_empty());
    }

    #[test]
    fn warm_pool_targets_parse_image_counts() {
        let json = r#"{"workerId":"w1","workerSecret":"s","heartbeatIntervalMs":30000,"staleClaimTimeoutMs":300000,"warmPool":{"enabled":true,"images":{"judge-cpp:latest":2}}}"#;
        let parsed: super::RegisterResponseData = serde_json::from_str(json).expect("parse");
        assert!(parsed.warm_pool.enabled);
        assert_eq!(parsed.warm_pool.images.get("judge-cpp:latest"), Some(&2));
    }

    #[test]
    fn heartbeat_response_parses_warm_pool() {
        let json = r#"{"data":{"ok":true,"warmPool":{"enabled":true,"images":{"judge-python:latest":3}}}}"#;
        let parsed: super::HeartbeatResponse = serde_json::from_str(json).expect("parse");
        assert_eq!(parsed.data.warm_pool.images.get("judge-python:latest"), Some(&3));
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
    OutputLimitExceeded,
    RuntimeError,
    CompileError,
}

impl Verdict {
    pub fn as_str(&self) -> &'static str {
        match self {
            Verdict::Accepted => "accepted",
            Verdict::WrongAnswer => "wrong_answer",
            Verdict::TimeLimit => "time_limit_exceeded",
            Verdict::MemoryLimit => "memory_limit_exceeded",
            Verdict::OutputLimitExceeded => "output_limit_exceeded",
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
    Cpp26,
    Java,
    Python,
    Pypy,
    Javascript,
    Kotlin,
    Typescript,
    Plaintext,
    Verilog,
    #[serde(rename = "systemverilog")]
    Systemverilog,
    Vhdl,
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
    #[serde(rename = "clang_cpp26")]
    ClangCpp26,
    Scala,
    Erlang,
    Commonlisp,
    Bash,
    Befunge,
    Aheui,
    Hyeong,
    Whitespace,
    Ada,
    Clojure,
    Prolog,
    Tcl,
    Awk,
    Scheme,
    Groovy,
    Octave,
    Crystal,
    Powershell,
    Postscript,
    Delphi,
    Fsharp,
    Apl,
    Freebasic,
    Smalltalk,
    #[serde(rename = "b")]
    B,
    Sed,
    Dc,
    Coffeescript,
    #[serde(rename = "llvm_ir")]
    LlvmIr,
    Vbnet,
    Nasm,
    Bqn,
    Lolcode,
    Forth,
    #[serde(rename = "algol68")]
    Algol68,
    Umjunsik,
    Haxe,
    Raku,

    Shakespeare,
    #[serde(rename = "snobol4")]
    Snobol4,
    Icon,
    Uiua,
    Odin,
    #[serde(rename = "objective_c")]
    ObjectiveC,
    #[serde(rename = "deno_js")]
    DenoJs,
    #[serde(rename = "deno_ts")]
    DenoTs,
    #[serde(rename = "bun_js")]
    BunJs,
    #[serde(rename = "bun_ts")]
    BunTs,
    Gleam,
    Sml,
    Fennel,
    Flix,
    Micropython,
    Squirrel,
    Rexx,
    Hy,
    Arturo,
    Janet,
    C3,
    Vala,
    Nelua,
    Hare,
    Koka,
    Lean,
    Picat,
    Mercury,
    Wat,
    Purescript,
    #[serde(rename = "modula2")]
    Modula2,
    Factor,
    Spark,
    Minizinc,
    Curry,
    Clean,
    Roc,
    Carp,
    Grain,
    Pony,
    Moonbit,
    Chapel,
    #[serde(rename = "idris2")]
    Idris2,
    Rescript,
    Elm,
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
    /// DB-configured Docker image override (takes precedence over static config)
    #[serde(rename = "dockerImage")]
    pub docker_image: Option<String>,
    /// DB-configured compile command override (takes precedence over static config)
    #[serde(rename = "compileCommand")]
    pub compile_command: Option<Vec<String>>,
    /// DB-configured run command override (takes precedence over static config)
    #[serde(rename = "runCommand")]
    pub run_command: Option<Vec<String>>,
    /// When true (IOI partial scoring), run EVERY test case instead of breaking
    /// at the first failure, so the server's `passed / results.length` score uses
    /// the true denominator. Defaults to false (fail-fast) for ICPC/practice and
    /// for older server payloads that omit the field.
    #[serde(rename = "runAllTestCases", default)]
    pub run_all_test_cases: bool,
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
    #[serde(rename = "runtimeErrorType", skip_serializing_if = "Option::is_none")]
    pub runtime_error_type: Option<String>,
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
    // Borrowed so the retry loop can re-serialize without cloning the (possibly
    // large) result vector on every attempt. Deserializes to an owned Vec.
    pub results: std::borrow::Cow<'a, [TestResult]>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegisterRequest<'a> {
    pub hostname: &'a str,
    pub concurrency: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<&'a str>>,
    #[serde(rename = "cpuModel", skip_serializing_if = "Option::is_none")]
    pub cpu_model: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub architecture: Option<&'a str>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisterResponseData {
    #[serde(rename = "workerId")]
    pub worker_id: String,
    #[serde(rename = "workerSecret")]
    pub worker_secret: Option<String>,
    #[serde(rename = "heartbeatIntervalMs")]
    pub heartbeat_interval_ms: u64,
    #[serde(rename = "staleClaimTimeoutMs")]
    #[allow(dead_code)]
    pub stale_claim_timeout_ms: u64,
    /// Not yet consumed in production code; wired into the warm-pool
    /// reconciler in a later task.
    #[serde(rename = "warmPool", default)]
    #[allow(dead_code)]
    pub warm_pool: WarmPoolTargets,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisterResponse {
    pub data: RegisterResponseData,
}

/// Warm container pool targets pushed by the app server in the register and
/// heartbeat responses. `#[serde(default)]` everywhere so an older app server
/// that omits the field simply yields "disabled" instead of a parse error.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct WarmPoolTargets {
    #[serde(default)]
    pub enabled: bool,
    /// docker image -> desired idle warm-container count
    #[serde(default)]
    pub images: std::collections::HashMap<String, u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct HeartbeatResponseData {
    #[serde(rename = "warmPool", default)]
    pub warm_pool: WarmPoolTargets,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HeartbeatResponse {
    pub data: HeartbeatResponseData,
}

#[derive(Debug, Clone, Serialize)]
pub struct HeartbeatRequest<'a> {
    #[serde(rename = "workerId")]
    pub worker_id: &'a str,
    #[serde(rename = "workerSecret", skip_serializing_if = "Option::is_none")]
    pub worker_secret: Option<&'a str>,
    #[serde(rename = "activeTasks")]
    pub active_tasks: usize,
    #[serde(rename = "availableSlots")]
    pub available_slots: usize,
    #[serde(rename = "uptimeSeconds")]
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeregisterRequest<'a> {
    #[serde(rename = "workerId")]
    pub worker_id: &'a str,
    #[serde(rename = "workerSecret", skip_serializing_if = "Option::is_none")]
    pub worker_secret: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaimRequest<'a> {
    #[serde(rename = "workerId", skip_serializing_if = "Option::is_none")]
    pub worker_id: Option<&'a str>,
    #[serde(rename = "workerSecret", skip_serializing_if = "Option::is_none")]
    pub worker_secret: Option<&'a str>,
}
