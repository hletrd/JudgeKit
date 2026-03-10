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
    "sh", "-lc",
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
