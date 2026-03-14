use crate::types::Language;

pub struct LanguageConfig {
    pub extension: &'static str,
    pub docker_image: &'static str,
    pub compile_command: Option<&'static [&'static str]>,
    pub run_command: &'static [&'static str],
}

static C17_COMPILE: &[&str] = &[
    "gcc", "-O2", "-std=c17", "-o", "/workspace/solution",
    "/workspace/solution.c", "-lm",
];
static C17_RUN: &[&str] = &["/workspace/solution"];

static C23_COMPILE: &[&str] = &[
    "gcc", "-O2", "-std=c23", "-o", "/workspace/solution",
    "/workspace/solution.c", "-lm",
];
static C23_RUN: &[&str] = &["/workspace/solution"];

static CPP20_COMPILE: &[&str] = &[
    "g++", "-O2", "-std=c++20", "-o", "/workspace/solution",
    "/workspace/solution.cpp",
];
static CPP20_RUN: &[&str] = &["/workspace/solution"];

static CPP23_COMPILE: &[&str] = &[
    "g++", "-O2", "-std=c++23", "-o", "/workspace/solution",
    "/workspace/solution.cpp",
];
static CPP23_RUN: &[&str] = &["/workspace/solution"];

static JAVA_COMPILE: &[&str] = &[
    "sh", "-c",
    "export JAVA_TOOL_OPTIONS='-Djava.io.tmpdir=/workspace' && mkdir -p /workspace/out && cp /workspace/solution.java /workspace/Main.java && javac --release 25 -encoding UTF-8 -d /workspace/out /workspace/Main.java",
];
static JAVA_RUN: &[&str] = &["java", "-Djava.io.tmpdir=/workspace", "-cp", "/workspace/out", "Main"];

static PYTHON_RUN: &[&str] = &["python3", "/workspace/solution.py"];

static JAVASCRIPT_RUN: &[&str] = &["node", "/workspace/solution.js"];

static TYPESCRIPT_COMPILE: &[&str] = &[
    "tsc",
    "--pretty", "false",
    "--strict",
    "--types", "node",
    "--typeRoots", "/usr/local/lib/node_modules/@types",
    "--target", "ES2024",
    "--module", "commonjs",
    "--outDir", "/workspace/dist",
    "/workspace/solution.ts",
];
static TYPESCRIPT_RUN: &[&str] = &["node", "/workspace/dist/solution.js"];

static KOTLIN_COMPILE: &[&str] = &[
    "kotlinc", "-J-Djava.io.tmpdir=/workspace", "/workspace/solution.kt",
    "-include-runtime", "-d", "/workspace/solution.jar",
];
static KOTLIN_RUN: &[&str] = &["java", "-Djava.io.tmpdir=/workspace", "-jar", "/workspace/solution.jar"];

static RUST_COMPILE: &[&str] = &[
    "rustc", "-O", "-o", "/workspace/solution", "/workspace/solution.rs",
];
static RUST_RUN: &[&str] = &["/workspace/solution"];

static GO_COMPILE: &[&str] = &[
    "go", "build", "-o", "/workspace/solution", "/workspace/solution.go",
];
static GO_RUN: &[&str] = &["/workspace/solution"];

static SWIFT_COMPILE: &[&str] = &[
    "swiftc", "-O",
    "-module-cache-path", "/tmp/swift-module-cache",
    "-o", "/workspace/solution",
    "/workspace/solution.swift",
];
static SWIFT_RUN: &[&str] = &["/workspace/solution"];

static CSHARP_COMPILE: &[&str] = &[
    "mcs", "-optimize+", "-out:/workspace/solution.exe", "/workspace/solution.cs",
];
static CSHARP_RUN: &[&str] = &["mono", "/workspace/solution.exe"];

static R_RUN: &[&str] = &["Rscript", "/workspace/solution.r"];

static PERL_RUN: &[&str] = &["perl", "/workspace/solution.pl"];

static PHP_RUN: &[&str] = &["php", "/workspace/solution.php"];

// Ruby
static RUBY_RUN: &[&str] = &["ruby", "/workspace/solution.rb"];

// Lua
static LUA_RUN: &[&str] = &["lua5.4", "/workspace/solution.lua"];

// Haskell
static HASKELL_COMPILE: &[&str] = &["ghc", "-O2", "-o", "/workspace/solution", "/workspace/solution.hs"];
static HASKELL_RUN: &[&str] = &["/workspace/solution"];

// Dart
static DART_COMPILE: &[&str] = &["dart", "compile", "exe", "/workspace/solution.dart", "-o", "/workspace/solution"];
static DART_RUN: &[&str] = &["/workspace/solution"];

// Zig
static ZIG_COMPILE: &[&str] = &["zig", "build-exe", "/workspace/solution.zig", "-O", "ReleaseSafe", "--name", "solution"];
static ZIG_RUN: &[&str] = &["/workspace/solution"];

// Nim
static NIM_COMPILE: &[&str] = &["nim", "compile", "--opt:speed", "-d:release", "--out:/workspace/solution", "/workspace/solution.nim"];
static NIM_RUN: &[&str] = &["/workspace/solution"];

// OCaml
static OCAML_COMPILE: &[&str] = &["ocamlfind", "ocamlopt", "-package", "str", "-linkpkg", "-O2", "-o", "/workspace/solution", "/workspace/solution.ml"];
static OCAML_RUN: &[&str] = &["/workspace/solution"];

// Elixir
static ELIXIR_RUN: &[&str] = &["elixir", "/workspace/solution.exs"];

// Julia
static JULIA_RUN: &[&str] = &["julia", "/workspace/solution.jl"];

// D
static D_COMPILE: &[&str] = &["ldc2", "-O2", "-of=/workspace/solution", "/workspace/solution.d"];
static D_RUN: &[&str] = &["/workspace/solution"];

// Racket
static RACKET_RUN: &[&str] = &["racket", "/workspace/solution.rkt"];

// V
static V_COMPILE: &[&str] = &["v", "-prod", "-o", "/workspace/solution", "/workspace/solution.v"];
static V_RUN: &[&str] = &["/workspace/solution"];

static C17_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".c",
    docker_image: "judge-cpp:latest",
    compile_command: Some(C17_COMPILE),
    run_command: C17_RUN,
};

static C23_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".c",
    docker_image: "judge-cpp:latest",
    compile_command: Some(C23_COMPILE),
    run_command: C23_RUN,
};

static CPP20_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".cpp",
    docker_image: "judge-cpp:latest",
    compile_command: Some(CPP20_COMPILE),
    run_command: CPP20_RUN,
};

static CPP23_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".cpp",
    docker_image: "judge-cpp:latest",
    compile_command: Some(CPP23_COMPILE),
    run_command: CPP23_RUN,
};

static JAVA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".java",
    docker_image: "judge-jvm:latest",
    compile_command: Some(JAVA_COMPILE),
    run_command: JAVA_RUN,
};

static PYTHON_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".py",
    docker_image: "judge-python:latest",
    compile_command: None,
    run_command: PYTHON_RUN,
};

static JAVASCRIPT_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".js",
    docker_image: "judge-node:latest",
    compile_command: None,
    run_command: JAVASCRIPT_RUN,
};

static TYPESCRIPT_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ts",
    docker_image: "judge-node:latest",
    compile_command: Some(TYPESCRIPT_COMPILE),
    run_command: TYPESCRIPT_RUN,
};

static KOTLIN_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".kt",
    docker_image: "judge-jvm:latest",
    compile_command: Some(KOTLIN_COMPILE),
    run_command: KOTLIN_RUN,
};

static RUST_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".rs",
    docker_image: "judge-rust:latest",
    compile_command: Some(RUST_COMPILE),
    run_command: RUST_RUN,
};

static GO_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".go",
    docker_image: "judge-go:latest",
    compile_command: Some(GO_COMPILE),
    run_command: GO_RUN,
};

static SWIFT_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".swift",
    docker_image: "judge-swift:latest",
    compile_command: Some(SWIFT_COMPILE),
    run_command: SWIFT_RUN,
};

static CSHARP_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".cs",
    docker_image: "judge-csharp:latest",
    compile_command: Some(CSHARP_COMPILE),
    run_command: CSHARP_RUN,
};

static R_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".r",
    docker_image: "judge-r:latest",
    compile_command: None,
    run_command: R_RUN,
};

static PERL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".pl",
    docker_image: "judge-perl:latest",
    compile_command: None,
    run_command: PERL_RUN,
};

static PHP_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".php",
    docker_image: "judge-php:latest",
    compile_command: None,
    run_command: PHP_RUN,
};

static RUBY_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".rb",
    docker_image: "judge-ruby:latest",
    compile_command: None,
    run_command: RUBY_RUN,
};

static LUA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".lua",
    docker_image: "judge-lua:latest",
    compile_command: None,
    run_command: LUA_RUN,
};

static HASKELL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".hs",
    docker_image: "judge-haskell:latest",
    compile_command: Some(HASKELL_COMPILE),
    run_command: HASKELL_RUN,
};

static DART_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".dart",
    docker_image: "judge-dart:latest",
    compile_command: Some(DART_COMPILE),
    run_command: DART_RUN,
};

static ZIG_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".zig",
    docker_image: "judge-zig:latest",
    compile_command: Some(ZIG_COMPILE),
    run_command: ZIG_RUN,
};

static NIM_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".nim",
    docker_image: "judge-nim:latest",
    compile_command: Some(NIM_COMPILE),
    run_command: NIM_RUN,
};

static OCAML_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ml",
    docker_image: "judge-ocaml:latest",
    compile_command: Some(OCAML_COMPILE),
    run_command: OCAML_RUN,
};

static ELIXIR_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".exs",
    docker_image: "judge-elixir:latest",
    compile_command: None,
    run_command: ELIXIR_RUN,
};

static JULIA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".jl",
    docker_image: "judge-julia:latest",
    compile_command: None,
    run_command: JULIA_RUN,
};

static D_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".d",
    docker_image: "judge-d:latest",
    compile_command: Some(D_COMPILE),
    run_command: D_RUN,
};

static RACKET_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".rkt",
    docker_image: "judge-racket:latest",
    compile_command: None,
    run_command: RACKET_RUN,
};

static VLANG_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".v",
    docker_image: "judge-v:latest",
    compile_command: Some(V_COMPILE),
    run_command: V_RUN,
};

pub fn get_config(language: &Language) -> Option<&'static LanguageConfig> {
    match language {
        Language::C17 => Some(&C17_CONFIG),
        Language::C23 => Some(&C23_CONFIG),
        Language::Cpp20 => Some(&CPP20_CONFIG),
        Language::Cpp23 => Some(&CPP23_CONFIG),
        Language::Java => Some(&JAVA_CONFIG),
        Language::Python => Some(&PYTHON_CONFIG),
        Language::Javascript => Some(&JAVASCRIPT_CONFIG),
        Language::Typescript => Some(&TYPESCRIPT_CONFIG),
        Language::Kotlin => Some(&KOTLIN_CONFIG),
        Language::Rust => Some(&RUST_CONFIG),
        Language::Go => Some(&GO_CONFIG),
        Language::Swift => Some(&SWIFT_CONFIG),
        Language::Csharp => Some(&CSHARP_CONFIG),
        Language::R => Some(&R_CONFIG),
        Language::Perl => Some(&PERL_CONFIG),
        Language::Php => Some(&PHP_CONFIG),
        Language::Ruby => Some(&RUBY_CONFIG),
        Language::Lua => Some(&LUA_CONFIG),
        Language::Haskell => Some(&HASKELL_CONFIG),
        Language::Dart => Some(&DART_CONFIG),
        Language::Zig => Some(&ZIG_CONFIG),
        Language::Nim => Some(&NIM_CONFIG),
        Language::Ocaml => Some(&OCAML_CONFIG),
        Language::Elixir => Some(&ELIXIR_CONFIG),
        Language::Julia => Some(&JULIA_CONFIG),
        Language::D => Some(&D_CONFIG),
        Language::Racket => Some(&RACKET_CONFIG),
        Language::Vlang => Some(&VLANG_CONFIG),
        Language::Unknown => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Language;

    #[test]
    fn test_all_languages_have_config() {
        let languages = [
            Language::C17,
            Language::C23,
            Language::Cpp20,
            Language::Cpp23,
            Language::Java,
            Language::Python,
            Language::Javascript,
            Language::Typescript,
            Language::Kotlin,
            Language::Rust,
            Language::Go,
            Language::Swift,
            Language::Csharp,
            Language::R,
            Language::Perl,
            Language::Php,
            Language::Ruby,
            Language::Lua,
            Language::Haskell,
            Language::Dart,
            Language::Zig,
            Language::Nim,
            Language::Ocaml,
            Language::Elixir,
            Language::Julia,
            Language::D,
            Language::Racket,
            Language::Vlang,
        ];

        for lang in &languages {
            let config = get_config(lang).expect("known language must have config");
            assert!(!config.extension.is_empty(), "extension must not be empty");
            assert!(!config.docker_image.is_empty(), "docker_image must not be empty");
            assert!(!config.run_command.is_empty(), "run_command must not be empty");
        }

        // Unknown language returns None
        assert!(get_config(&Language::Unknown).is_none());

        // Verify every entry in the test array has a config — no magic number needed.
        // If you add a new language, add it to the `languages` array above.
        assert_eq!(
            languages.len(),
            languages.iter().filter_map(|l| get_config(l)).count(),
            "every language in the test array must have a config"
        );
    }
}
