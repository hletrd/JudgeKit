import type { Language } from "@/types";

export const JUDGE_TOOLCHAIN_VERSIONS = {
  go: "1.26.1",
  java: "25.0.2",
  nodejs: "24.14.0",
  kotlin: "2.3.10",
  python: "3.14.3",
  rust: "1.94.0",
  swift: "6.2.4",
  typescript: "5.9.3",
  mono: "6.12",
  r: "4.5",
  perl: "5.40",
  php: "8.4",
} as const;

export interface JudgeLanguageDefinition {
  language: Language;
  displayName: string;
  standard: string | null;
  extension: string;
  dockerImage: string;
  compiler: string | null;
  compileCommand: string[] | null;
  runCommand: string[];
}

export const JUDGE_LANGUAGE_CONFIGS: Record<Language, JudgeLanguageDefinition> = {
  c17: {
    language: "c17",
    displayName: "C",
    standard: "C17",
    extension: ".c",
    dockerImage: "judge-cpp:latest",
    compiler: "GCC (gcc)",
    compileCommand: ["gcc", "-O2", "-std=c17", "-o", "/workspace/solution", "/workspace/solution.c", "-lm"],
    runCommand: ["/workspace/solution"],
  },
  c23: {
    language: "c23",
    displayName: "C",
    standard: "C23",
    extension: ".c",
    dockerImage: "judge-cpp:latest",
    compiler: "GCC (gcc)",
    compileCommand: ["gcc", "-O2", "-std=c23", "-o", "/workspace/solution", "/workspace/solution.c", "-lm"],
    runCommand: ["/workspace/solution"],
  },
  cpp20: {
    language: "cpp20",
    displayName: "C++",
    standard: "C++20",
    extension: ".cpp",
    dockerImage: "judge-cpp:latest",
    compiler: "GCC (g++)",
    compileCommand: ["g++", "-O2", "-std=c++20", "-o", "/workspace/solution", "/workspace/solution.cpp"],
    runCommand: ["/workspace/solution"],
  },
  cpp23: {
    language: "cpp23",
    displayName: "C++",
    standard: "C++23",
    extension: ".cpp",
    dockerImage: "judge-cpp:latest",
    compiler: "GCC (g++)",
    compileCommand: ["g++", "-O2", "-std=c++23", "-o", "/workspace/solution", "/workspace/solution.cpp"],
    runCommand: ["/workspace/solution"],
  },
  java: {
    language: "java",
    displayName: "Java",
    standard: "25",
    extension: ".java",
    dockerImage: "judge-jvm:latest",
    compiler: `Eclipse Temurin ${JUDGE_TOOLCHAIN_VERSIONS.java} (javac/java)`,
    compileCommand: [
      "sh",
      "-lc",
      "export JAVA_TOOL_OPTIONS='-Djava.io.tmpdir=/workspace' && mkdir -p /workspace/out && cp /workspace/solution.java /workspace/Main.java && javac --release 25 -encoding UTF-8 -d /workspace/out /workspace/Main.java",
    ],
    runCommand: ["java", "-Djava.io.tmpdir=/workspace", "-cp", "/workspace/out", "Main"],
  },
  python: {
    language: "python",
    displayName: "Python",
    standard: "3.14",
    extension: ".py",
    dockerImage: "judge-python:latest",
    compiler: `Python ${JUDGE_TOOLCHAIN_VERSIONS.python}`,
    compileCommand: null,
    runCommand: ["python3", "/workspace/solution.py"],
  },
  javascript: {
    language: "javascript",
    displayName: "JavaScript",
    standard: "Node.js 24",
    extension: ".js",
    dockerImage: "judge-node:latest",
    compiler: `Node.js ${JUDGE_TOOLCHAIN_VERSIONS.nodejs} (LTS)`,
    compileCommand: null,
    runCommand: ["node", "/workspace/solution.js"],
  },
  typescript: {
    language: "typescript",
    displayName: "TypeScript",
    standard: "TS 5.9",
    extension: ".ts",
    dockerImage: "judge-node:latest",
    compiler: `TypeScript ${JUDGE_TOOLCHAIN_VERSIONS.typescript} (tsc) / Node.js ${JUDGE_TOOLCHAIN_VERSIONS.nodejs}`,
    compileCommand: [
      "tsc",
      "--pretty",
      "false",
      "--strict",
      "--types",
      "node",
      "--typeRoots",
      "/usr/local/lib/node_modules/@types",
      "--target",
      "ES2024",
      "--module",
      "commonjs",
      "--outDir",
      "/workspace/dist",
      "/workspace/solution.ts",
    ],
    runCommand: ["node", "/workspace/dist/solution.js"],
  },
  kotlin: {
    language: "kotlin",
    displayName: "Kotlin",
    standard: "2.3",
    extension: ".kt",
    dockerImage: "judge-jvm:latest",
    compiler: `Kotlin ${JUDGE_TOOLCHAIN_VERSIONS.kotlin} / Eclipse Temurin ${JUDGE_TOOLCHAIN_VERSIONS.java}`,
    compileCommand: [
      "kotlinc",
      "-J-Djava.io.tmpdir=/workspace",
      "/workspace/solution.kt",
      "-include-runtime",
      "-d",
      "/workspace/solution.jar",
    ],
    runCommand: ["java", "-Djava.io.tmpdir=/workspace", "-jar", "/workspace/solution.jar"],
  },
  rust: {
    language: "rust",
    displayName: "Rust",
    standard: "1.94",
    extension: ".rs",
    dockerImage: "judge-rust:latest",
    compiler: `Rust ${JUDGE_TOOLCHAIN_VERSIONS.rust} (rustc)`,
    compileCommand: ["rustc", "-O", "-o", "/workspace/solution", "/workspace/solution.rs"],
    runCommand: ["/workspace/solution"],
  },
  go: {
    language: "go",
    displayName: "Go",
    standard: "1.26",
    extension: ".go",
    dockerImage: "judge-go:latest",
    compiler: `Go ${JUDGE_TOOLCHAIN_VERSIONS.go}`,
    compileCommand: ["go", "build", "-o", "/workspace/solution", "/workspace/solution.go"],
    runCommand: ["/workspace/solution"],
  },
  swift: {
    language: "swift",
    displayName: "Swift",
    standard: "6.2",
    extension: ".swift",
    dockerImage: "judge-swift:latest",
    compiler: `Swift ${JUDGE_TOOLCHAIN_VERSIONS.swift}`,
    compileCommand: [
      "swiftc",
      "-O",
      "-module-cache-path",
      "/tmp/swift-module-cache",
      "-o",
      "/workspace/solution",
      "/workspace/solution.swift",
    ],
    runCommand: ["/workspace/solution"],
  },
  csharp: {
    language: "csharp",
    displayName: "C#",
    standard: "Mono 6",
    extension: ".cs",
    dockerImage: "judge-csharp:latest",
    compiler: `Mono ${JUDGE_TOOLCHAIN_VERSIONS.mono} (mcs)`,
    compileCommand: ["mcs", "-optimize+", "-out:/workspace/solution.exe", "/workspace/solution.cs"],
    runCommand: ["mono", "/workspace/solution.exe"],
  },
  r: {
    language: "r",
    displayName: "R",
    standard: "4.5",
    extension: ".r",
    dockerImage: "judge-r:latest",
    compiler: `R ${JUDGE_TOOLCHAIN_VERSIONS.r}`,
    compileCommand: null,
    runCommand: ["Rscript", "/workspace/solution.r"],
  },
  perl: {
    language: "perl",
    displayName: "Perl",
    standard: "5.40",
    extension: ".pl",
    dockerImage: "judge-perl:latest",
    compiler: `Perl ${JUDGE_TOOLCHAIN_VERSIONS.perl}`,
    compileCommand: null,
    runCommand: ["perl", "/workspace/solution.pl"],
  },
  php: {
    language: "php",
    displayName: "PHP",
    standard: "8.4",
    extension: ".php",
    dockerImage: "judge-php:latest",
    compiler: `PHP ${JUDGE_TOOLCHAIN_VERSIONS.php}`,
    compileCommand: null,
    runCommand: ["php", "/workspace/solution.php"],
  },
};

export const DEFAULT_JUDGE_LANGUAGES = Object.values(JUDGE_LANGUAGE_CONFIGS);

export function isJudgeLanguage(language: string): language is Language {
  return language in JUDGE_LANGUAGE_CONFIGS;
}

export function getJudgeLanguageDefinition(language: string) {
  return isJudgeLanguage(language) ? JUDGE_LANGUAGE_CONFIGS[language] : null;
}

export function serializeJudgeCommand(command: string[] | null | undefined) {
  return command?.join(" ") ?? null;
}
