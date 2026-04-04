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
    Cpp26,
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

#[derive(Debug, Clone, Serialize)]
pub struct RegisterRequest<'a> {
    pub hostname: &'a str,
    pub concurrency: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<&'a str>>,
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
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisterResponse {
    pub data: RegisterResponseData,
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
}
