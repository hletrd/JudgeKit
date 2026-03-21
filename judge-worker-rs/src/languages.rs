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
    "--skipLibCheck",
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
static KOTLIN_RUN: &[&str] = &["java", "-Djava.io.tmpdir=/workspace", "-cp", "/opt/kotlinc/lib/kotlin-stdlib.jar:/workspace/solution.jar", "SolutionKt"];

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
    "sh", "-c", "HOME=/tmp mcs -optimize+ -out:/workspace/solution.exe /workspace/solution.cs",
];
static CSHARP_RUN: &[&str] = &["sh", "-c", "HOME=/tmp mono /workspace/solution.exe"];

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
static DART_COMPILE: &[&str] = &["sh", "-c", "HOME=/tmp dart compile exe --suppress-analytics /workspace/solution.dart -o /workspace/solution"];
static DART_RUN: &[&str] = &["/workspace/solution"];

// Zig
static ZIG_COMPILE: &[&str] = &["sh", "-c", "zig build-exe --cache-dir /tmp/zig-cache --global-cache-dir /tmp/zig-global -femit-bin=/workspace/solution /workspace/solution.zig -O ReleaseSafe"];
static ZIG_RUN: &[&str] = &["/workspace/solution"];

// Nim
static NIM_COMPILE: &[&str] = &["sh", "-c", "mkdir -p /tmp/nimcache && nim compile --opt:speed -d:release --nimcache:/tmp/nimcache --out:/workspace/solution /workspace/solution.nim"];
static NIM_RUN: &[&str] = &["/workspace/solution"];

// OCaml
static OCAML_COMPILE: &[&str] = &["ocamlfind", "ocamlopt", "-package", "str", "-linkpkg", "-O2", "-o", "/workspace/solution", "/workspace/solution.ml"];
static OCAML_RUN: &[&str] = &["/workspace/solution"];

// Elixir
static ELIXIR_RUN: &[&str] = &["sh", "-c", "HOME=/tmp elixir /workspace/solution.exs"];

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

// C99
static C99_COMPILE: &[&str] = &["gcc", "-O2", "-std=c99", "-o", "/workspace/solution", "/workspace/solution.c", "-lm"];
static C99_RUN: &[&str] = &["/workspace/solution"];

// C89 (ANSI C)
static C89_COMPILE: &[&str] = &["gcc", "-O2", "-std=c89", "-o", "/workspace/solution", "/workspace/solution.c", "-lm"];
static C89_RUN: &[&str] = &["/workspace/solution"];

// Fortran
static FORTRAN_COMPILE: &[&str] = &["gfortran", "-O2", "-std=f2018", "-o", "/workspace/solution", "/workspace/solution.f90"];
static FORTRAN_RUN: &[&str] = &["/workspace/solution"];

// Pascal
static PASCAL_COMPILE: &[&str] = &["fpc", "-O2", "-o/workspace/solution", "/workspace/solution.pas"];
static PASCAL_RUN: &[&str] = &["/workspace/solution"];

// Brainfuck
static BRAINFUCK_RUN: &[&str] = &["beef", "/workspace/solution.bf"];

// COBOL
static COBOL_COMPILE: &[&str] = &["cobc", "-x", "-O2", "-o", "/workspace/solution", "/workspace/solution.cob"];
static COBOL_RUN: &[&str] = &["/workspace/solution"];

// Clang C23
static CLANG_C23_COMPILE: &[&str] = &["clang", "-O2", "-std=c23", "-o", "/workspace/solution", "/workspace/solution.c", "-lm"];
static CLANG_C23_RUN: &[&str] = &["/workspace/solution"];

// Clang C++23
static CLANG_CPP23_COMPILE: &[&str] = &["clang++", "-O2", "-std=c++23", "-o", "/workspace/solution", "/workspace/solution.cpp"];
static CLANG_CPP23_RUN: &[&str] = &["/workspace/solution"];

// Scala
static SCALA_COMPILE: &[&str] = &["sh", "-c", "export HOME=/tmp && mkdir -p /workspace/out && scalac -d /workspace/out /workspace/solution.scala"];
static SCALA_RUN: &[&str] = &["sh", "-c", "export HOME=/tmp && scala -classpath /workspace/out Main"];

// Erlang
static ERLANG_COMPILE: &[&str] = &["sh", "-c", "HOME=/tmp erlc -o /workspace /workspace/solution.erl"];
static ERLANG_RUN: &[&str] = &["sh", "-c", "HOME=/tmp erl -noshell -pa /workspace -s solution main -s init stop"];

// Common Lisp
static COMMONLISP_RUN: &[&str] = &["sbcl", "--script", "/workspace/solution.lisp"];

// Bash
static BASH_RUN: &[&str] = &["bash", "/workspace/solution.sh"];

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

static C99_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".c",
    docker_image: "judge-cpp:latest",
    compile_command: Some(C99_COMPILE),
    run_command: C99_RUN,
};

static C89_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".c",
    docker_image: "judge-cpp:latest",
    compile_command: Some(C89_COMPILE),
    run_command: C89_RUN,
};

static FORTRAN_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".f90",
    docker_image: "judge-fortran:latest",
    compile_command: Some(FORTRAN_COMPILE),
    run_command: FORTRAN_RUN,
};

static PASCAL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".pas",
    docker_image: "judge-pascal:latest",
    compile_command: Some(PASCAL_COMPILE),
    run_command: PASCAL_RUN,
};

static BRAINFUCK_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".bf",
    docker_image: "judge-brainfuck:latest",
    compile_command: None,
    run_command: BRAINFUCK_RUN,
};

static COBOL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".cob",
    docker_image: "judge-cobol:latest",
    compile_command: Some(COBOL_COMPILE),
    run_command: COBOL_RUN,
};

static CLANG_C23_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".c",
    docker_image: "judge-clang:latest",
    compile_command: Some(CLANG_C23_COMPILE),
    run_command: CLANG_C23_RUN,
};

static CLANG_CPP23_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".cpp",
    docker_image: "judge-clang:latest",
    compile_command: Some(CLANG_CPP23_COMPILE),
    run_command: CLANG_CPP23_RUN,
};

static SCALA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".scala",
    docker_image: "judge-scala:latest",
    compile_command: Some(SCALA_COMPILE),
    run_command: SCALA_RUN,
};

static ERLANG_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".erl",
    docker_image: "judge-erlang:latest",
    compile_command: Some(ERLANG_COMPILE),
    run_command: ERLANG_RUN,
};

static COMMONLISP_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".lisp",
    docker_image: "judge-commonlisp:latest",
    compile_command: None,
    run_command: COMMONLISP_RUN,
};

static BASH_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".sh",
    docker_image: "judge-bash:latest",
    compile_command: None,
    run_command: BASH_RUN,
};

// Befunge
static BEFUNGE_RUN: &[&str] = &["befunge93", "-q", "/workspace/solution.bf"];

static BEFUNGE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".bf",
    docker_image: "judge-esoteric:latest",
    compile_command: None,
    run_command: BEFUNGE_RUN,
};

// Aheui
static AHEUI_RUN: &[&str] = &["aheui", "/workspace/solution.aheui"];

static AHEUI_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".aheui",
    docker_image: "judge-esoteric:latest",
    compile_command: None,
    run_command: AHEUI_RUN,
};

// Hyeong
static HYEONG_RUN: &[&str] = &["hyeong", "run", "/workspace/solution.hyeong"];

static HYEONG_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".hyeong",
    docker_image: "judge-esoteric:latest",
    compile_command: None,
    run_command: HYEONG_RUN,
};

// Whitespace
static WHITESPACE_RUN: &[&str] = &["python3", "/usr/local/bin/whitespace.py", "/workspace/solution.ws"];

static WHITESPACE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ws",
    docker_image: "judge-esoteric:latest",
    compile_command: None,
    run_command: WHITESPACE_RUN,
};

// Ada
static ADA_COMPILE: &[&str] = &["gnatmake", "-O2", "/workspace/solution.adb"];
static ADA_RUN: &[&str] = &["/workspace/solution"];

static ADA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".adb",
    docker_image: "judge-ada:latest",
    compile_command: Some(ADA_COMPILE),
    run_command: ADA_RUN,
};

// Clojure
static CLOJURE_RUN: &[&str] = &["sh", "-c", "java -cp '/usr/local/lib/clojure/*' clojure.main /workspace/solution.clj"];

static CLOJURE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".clj",
    docker_image: "judge-clojure:latest",
    compile_command: None,
    run_command: CLOJURE_RUN,
};

// Prolog
static PROLOG_RUN: &[&str] = &["swipl", "-q", "-g", "main", "-t", "halt", "/workspace/solution.pro"];

static PROLOG_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".pro",
    docker_image: "judge-prolog:latest",
    compile_command: None,
    run_command: PROLOG_RUN,
};

// Tcl
static TCL_RUN: &[&str] = &["tclsh", "/workspace/solution.tcl"];

static TCL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".tcl",
    docker_image: "judge-tcl:latest",
    compile_command: None,
    run_command: TCL_RUN,
};

// AWK
static AWK_RUN: &[&str] = &["gawk", "-f", "/workspace/solution.awk"];

static AWK_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".awk",
    docker_image: "judge-awk:latest",
    compile_command: None,
    run_command: AWK_RUN,
};

// Scheme (Chicken)
static SCHEME_COMPILE: &[&str] = &["csc", "-O2", "-o", "/workspace/solution", "/workspace/solution.scm"];
static SCHEME_RUN: &[&str] = &["/workspace/solution"];

static SCHEME_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".scm",
    docker_image: "judge-scheme:latest",
    compile_command: Some(SCHEME_COMPILE),
    run_command: SCHEME_RUN,
};

// Groovy
static GROOVY_RUN: &[&str] = &["sh", "-c", "JAVA_OPTS='-Djava.io.tmpdir=/tmp -Duser.home=/tmp' groovy /workspace/solution.groovy"];

static GROOVY_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".groovy",
    docker_image: "judge-groovy:latest",
    compile_command: None,
    run_command: GROOVY_RUN,
};

// Octave
static OCTAVE_RUN: &[&str] = &["octave-cli", "--norc", "--quiet", "/workspace/solution.m"];

static OCTAVE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".m",
    docker_image: "judge-octave:latest",
    compile_command: None,
    run_command: OCTAVE_RUN,
};

// Crystal
static CRYSTAL_COMPILE: &[&str] = &["crystal", "build", "--release", "-o", "/workspace/solution", "/workspace/solution.cr"];
static CRYSTAL_RUN: &[&str] = &["/workspace/solution"];

static CRYSTAL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".cr",
    docker_image: "judge-crystal:latest",
    compile_command: Some(CRYSTAL_COMPILE),
    run_command: CRYSTAL_RUN,
};

// PowerShell
static POWERSHELL_RUN: &[&str] = &["sh", "-c", "HOME=/tmp pwsh -NoProfile -NonInteractive -File /workspace/solution.ps1"];

static POWERSHELL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ps1",
    docker_image: "judge-powershell:latest",
    compile_command: None,
    run_command: POWERSHELL_RUN,
};

// PostScript
static POSTSCRIPT_RUN: &[&str] = &["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "-dNOSAFER", "/workspace/solution.ps"];

static POSTSCRIPT_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ps",
    docker_image: "judge-postscript:latest",
    compile_command: None,
    run_command: POSTSCRIPT_RUN,
};

// Delphi (reuses judge-pascal image via FPC -Mdelphi)
static DELPHI_COMPILE: &[&str] = &["fpc", "-Mdelphi", "-O2", "-o/workspace/solution", "/workspace/solution.dpr"];
static DELPHI_RUN: &[&str] = &["/workspace/solution"];

static DELPHI_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".dpr",
    docker_image: "judge-pascal:latest",
    compile_command: Some(DELPHI_COMPILE),
    run_command: DELPHI_RUN,
};

// F# (script mode via dotnet fsi)
static FSHARP_RUN: &[&str] = &["dotnet", "fsi", "/workspace/solution.fsx"];

static FSHARP_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".fsx",
    docker_image: "judge-fsharp:latest",
    compile_command: None,
    run_command: FSHARP_RUN,
};

// APL (GNU APL)
static APL_RUN: &[&str] = &["apl", "--script", "-f", "/workspace/solution.apl"];

static APL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".apl",
    docker_image: "judge-apl:latest",
    compile_command: None,
    run_command: APL_RUN,
};

// FreeBASIC
static FREEBASIC_COMPILE: &[&str] = &["fbc", "-O", "2", "-o", "/workspace/solution", "/workspace/solution.bas"];
static FREEBASIC_RUN: &[&str] = &["/workspace/solution"];

static FREEBASIC_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".bas",
    docker_image: "judge-freebasic:latest",
    compile_command: Some(FREEBASIC_COMPILE),
    run_command: FREEBASIC_RUN,
};

// B
static B_COMPILE: &[&str] = &["bcause", "-o", "/workspace/solution", "/workspace/solution.b"];
static B_RUN: &[&str] = &["/workspace/solution"];

// Smalltalk (GNU Smalltalk)
static SMALLTALK_RUN: &[&str] = &["gst", "/workspace/solution.st"];

static SMALLTALK_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".st",
    docker_image: "judge-smalltalk:latest",
    compile_command: None,
    run_command: SMALLTALK_RUN,
};

static B_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".b",
    docker_image: "judge-b:latest",
    compile_command: Some(B_COMPILE),
    run_command: B_RUN,
};

// Sed (reuses judge-bash)
static SED_RUN: &[&str] = &["sed", "-f", "/workspace/solution.sed"];

static SED_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".sed",
    docker_image: "judge-bash:latest",
    compile_command: None,
    run_command: SED_RUN,
};

// dc (reuses judge-bash)
static DC_RUN: &[&str] = &["dc", "/workspace/solution.dc"];

static DC_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".dc",
    docker_image: "judge-bash:latest",
    compile_command: None,
    run_command: DC_RUN,
};

// CoffeeScript (reuses judge-node)
static COFFEESCRIPT_RUN: &[&str] = &["coffee", "/workspace/solution.coffee"];

static COFFEESCRIPT_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".coffee",
    docker_image: "judge-node:latest",
    compile_command: None,
    run_command: COFFEESCRIPT_RUN,
};

// LLVM IR (reuses judge-clang)
static LLVM_IR_RUN: &[&str] = &["lli", "/workspace/solution.ll"];

static LLVM_IR_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ll",
    docker_image: "judge-clang:latest",
    compile_command: None,
    run_command: LLVM_IR_RUN,
};

// Visual Basic .NET (reuses judge-fsharp)
static VBNET_COMPILE: &[&str] = &[
    "sh", "-c",
    "mkdir -p /workspace/out && echo '<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType><RootNamespace>Solution</RootNamespace></PropertyGroup></Project>' > /workspace/out/solution.vbproj && cp /workspace/solution.vb /workspace/out/Program.vb && cd /workspace/out && dotnet build -c Release -o /workspace/bin --nologo -v q",
];
static VBNET_RUN: &[&str] = &["/workspace/bin/solution"];

static VBNET_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".vb",
    docker_image: "judge-fsharp:latest",
    compile_command: Some(VBNET_COMPILE),
    run_command: VBNET_RUN,
};

// Assembly (NASM on x86-64, GNU as on AArch64)
static NASM_COMPILE: &[&str] = &["asm-compile"];
static NASM_RUN: &[&str] = &["/workspace/solution"];

static NASM_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".asm",
    docker_image: "judge-nasm:latest",
    compile_command: Some(NASM_COMPILE),
    run_command: NASM_RUN,
};

// BQN
static BQN_RUN: &[&str] = &["bqn", "/workspace/solution.bqn"];

static BQN_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".bqn",
    docker_image: "judge-bqn:latest",
    compile_command: None,
    run_command: BQN_RUN,
};

// LOLCODE
static LOLCODE_RUN: &[&str] = &["lci", "/workspace/solution.lol"];

static LOLCODE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".lol",
    docker_image: "judge-lolcode:latest",
    compile_command: None,
    run_command: LOLCODE_RUN,
};

// Forth
static FORTH_RUN: &[&str] = &["gforth", "/workspace/solution.fth", "-e", "bye"];

static FORTH_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".fth",
    docker_image: "judge-forth:latest",
    compile_command: None,
    run_command: FORTH_RUN,
};

// Algol 68
static ALGOL68_RUN: &[&str] = &["a68g", "/workspace/solution.a68"];

static ALGOL68_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".a68",
    docker_image: "judge-algol68:latest",
    compile_command: None,
    run_command: ALGOL68_RUN,
};

// Umjunsik
static UMJUNSIK_RUN: &[&str] = &["umjunsik", "/workspace/solution.umm"];

static UMJUNSIK_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".umm",
    docker_image: "judge-umjunsik:latest",
    compile_command: None,
    run_command: UMJUNSIK_RUN,
};

// INTERCAL
static INTERCAL_COMPILE: &[&str] = &["ick", "-b", "/workspace/solution.i"];
static INTERCAL_RUN: &[&str] = &["/workspace/solution"];

static INTERCAL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".i",
    docker_image: "judge-intercal:latest",
    compile_command: Some(INTERCAL_COMPILE),
    run_command: INTERCAL_RUN,
};

// K (ngn/k)
static K_RUN: &[&str] = &["k", "/workspace/solution.k"];

static K_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".k",
    docker_image: "judge-k:latest",
    compile_command: None,
    run_command: K_RUN,
};

// Haxe
static HAXE_COMPILE: &[&str] = &[
    "sh", "-c",
    "cd /workspace && haxe --main Solution --python /workspace/solution_out.py",
];
static HAXE_RUN: &[&str] = &["python3", "/workspace/solution_out.py"];

static HAXE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".hx",
    docker_image: "judge-haxe:latest",
    compile_command: Some(HAXE_COMPILE),
    run_command: HAXE_RUN,
};

// Raku
static RAKU_RUN: &[&str] = &["raku", "/workspace/solution.raku"];

static RAKU_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".raku",
    docker_image: "judge-raku:latest",
    compile_command: None,
    run_command: RAKU_RUN,
};


// Shakespeare
static SHAKESPEARE_RUN: &[&str] = &["shakespeare_run", "/workspace/solution.spl"];

static SHAKESPEARE_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".spl",
    docker_image: "judge-shakespeare:latest",
    compile_command: None,
    run_command: SHAKESPEARE_RUN,
};

// Unlambda
static UNLAMBDA_RUN: &[&str] = &["unlambda", "/workspace/solution.unl"];

static UNLAMBDA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".unl",
    docker_image: "judge-unlambda:latest",
    compile_command: None,
    run_command: UNLAMBDA_RUN,
};

// SNOBOL4
static SNOBOL4_RUN: &[&str] = &["snobol4", "/workspace/solution.sno"];

static SNOBOL4_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".sno",
    docker_image: "judge-snobol4:latest",
    compile_command: None,
    run_command: SNOBOL4_RUN,
};

// Icon
static ICON_COMPILE: &[&str] = &["sh", "-c", "cd /workspace && icont -o /workspace/solution /workspace/solution.icn"];
static ICON_RUN: &[&str] = &["/workspace/solution"];

static ICON_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".icn",
    docker_image: "judge-icon:latest",
    compile_command: Some(ICON_COMPILE),
    run_command: ICON_RUN,
};

// Simula
static SIMULA_COMPILE: &[&str] = &["sh", "-c", "cd /workspace && cim /workspace/solution.sim -o /workspace/solution"];
static SIMULA_RUN: &[&str] = &["/workspace/solution"];

static SIMULA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".sim",
    docker_image: "judge-simula:latest",
    compile_command: Some(SIMULA_COMPILE),
    run_command: SIMULA_RUN,
};

// Uiua
static UIUA_RUN: &[&str] = &["uiua", "run", "/workspace/solution.ua"];

static UIUA_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ua",
    docker_image: "judge-uiua:latest",
    compile_command: None,
    run_command: UIUA_RUN,
};

// Odin
static ODIN_COMPILE: &[&str] = &[
    "sh", "-c",
    "odin build /workspace/solution.odin -file -o:speed -out:/workspace/solution",
];
static ODIN_RUN: &[&str] = &["/workspace/solution"];

static ODIN_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".odin",
    docker_image: "judge-odin:latest",
    compile_command: Some(ODIN_COMPILE),
    run_command: ODIN_RUN,
};

// Objective-C
static OBJECTIVE_C_COMPILE: &[&str] = &["gcc", "-O2", "-lobjc", "-o", "/workspace/solution", "/workspace/solution.m"];
static OBJECTIVE_C_RUN: &[&str] = &["/workspace/solution"];

static OBJECTIVE_C_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".m",
    docker_image: "judge-objective-c:latest",
    compile_command: Some(OBJECTIVE_C_COMPILE),
    run_command: OBJECTIVE_C_RUN,
};

// Deno (JavaScript)
static DENO_JS_RUN: &[&str] = &["deno", "run", "--allow-read", "/workspace/solution.js"];

static DENO_JS_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".js",
    docker_image: "judge-deno:latest",
    compile_command: None,
    run_command: DENO_JS_RUN,
};

// Deno (TypeScript)
static DENO_TS_RUN: &[&str] = &["deno", "run", "--allow-read", "/workspace/solution.ts"];

static DENO_TS_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ts",
    docker_image: "judge-deno:latest",
    compile_command: None,
    run_command: DENO_TS_RUN,
};

// Bun (JavaScript)
static BUN_JS_RUN: &[&str] = &["bun", "run", "/workspace/solution.js"];

static BUN_JS_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".js",
    docker_image: "judge-bun:latest",
    compile_command: None,
    run_command: BUN_JS_RUN,
};

// Bun (TypeScript)
static BUN_TS_RUN: &[&str] = &["bun", "run", "/workspace/solution.ts"];

static BUN_TS_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".ts",
    docker_image: "judge-bun:latest",
    compile_command: None,
    run_command: BUN_TS_RUN,
};

// Gleam
static GLEAM_COMPILE: &[&str] = &[
    "sh", "-c",
    "cp -r /opt/gleam-template /workspace/gleam-project && cp /workspace/solution.gleam /workspace/gleam-project/src/solution.gleam && cd /workspace/gleam-project && gleam build --target erlang 2>&1",
];
static GLEAM_RUN: &[&str] = &["sh", "-c", "cd /workspace/gleam-project && gleam run --target erlang"];

static GLEAM_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".gleam",
    docker_image: "judge-gleam:latest",
    compile_command: Some(GLEAM_COMPILE),
    run_command: GLEAM_RUN,
};

// Standard ML (Poly/ML)
static SML_COMPILE: &[&str] = &["sh", "-c", "polyc -o /workspace/solution /workspace/solution.sml"];
static SML_RUN: &[&str] = &["/workspace/solution"];

static SML_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".sml",
    docker_image: "judge-sml:latest",
    compile_command: Some(SML_COMPILE),
    run_command: SML_RUN,
};

// Fennel (runs on Lua VM)
static FENNEL_RUN: &[&str] = &["fennel", "/workspace/solution.fnl"];

static FENNEL_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".fnl",
    docker_image: "judge-lua:latest",
    compile_command: None,
    run_command: FENNEL_RUN,
};

// Flix (JVM)
static FLIX_RUN: &[&str] = &["sh", "-c", "cd /workspace && java -jar /opt/flix.jar run /workspace/solution.flix"];

static FLIX_CONFIG: LanguageConfig = LanguageConfig {
    extension: ".flix",
    docker_image: "judge-jvm:latest",
    compile_command: None,
    run_command: FLIX_RUN,
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
        Language::C99 => Some(&C99_CONFIG),
        Language::C89 => Some(&C89_CONFIG),
        Language::Fortran => Some(&FORTRAN_CONFIG),
        Language::Pascal => Some(&PASCAL_CONFIG),
        Language::Brainfuck => Some(&BRAINFUCK_CONFIG),
        Language::Cobol => Some(&COBOL_CONFIG),
        Language::ClangC23 => Some(&CLANG_C23_CONFIG),
        Language::ClangCpp23 => Some(&CLANG_CPP23_CONFIG),
        Language::Scala => Some(&SCALA_CONFIG),
        Language::Erlang => Some(&ERLANG_CONFIG),
        Language::Commonlisp => Some(&COMMONLISP_CONFIG),
        Language::Bash => Some(&BASH_CONFIG),
        Language::Befunge => Some(&BEFUNGE_CONFIG),
        Language::Aheui => Some(&AHEUI_CONFIG),
        Language::Hyeong => Some(&HYEONG_CONFIG),
        Language::Whitespace => Some(&WHITESPACE_CONFIG),
        Language::Ada => Some(&ADA_CONFIG),
        Language::Clojure => Some(&CLOJURE_CONFIG),
        Language::Prolog => Some(&PROLOG_CONFIG),
        Language::Tcl => Some(&TCL_CONFIG),
        Language::Awk => Some(&AWK_CONFIG),
        Language::Scheme => Some(&SCHEME_CONFIG),
        Language::Groovy => Some(&GROOVY_CONFIG),
        Language::Octave => Some(&OCTAVE_CONFIG),
        Language::Crystal => Some(&CRYSTAL_CONFIG),
        Language::Powershell => Some(&POWERSHELL_CONFIG),
        Language::Postscript => Some(&POSTSCRIPT_CONFIG),
        Language::Delphi => Some(&DELPHI_CONFIG),
        Language::Fsharp => Some(&FSHARP_CONFIG),
        Language::Apl => Some(&APL_CONFIG),
        Language::Freebasic => Some(&FREEBASIC_CONFIG),
        Language::Smalltalk => Some(&SMALLTALK_CONFIG),
        Language::B => Some(&B_CONFIG),
        Language::Sed => Some(&SED_CONFIG),
        Language::Dc => Some(&DC_CONFIG),
        Language::Coffeescript => Some(&COFFEESCRIPT_CONFIG),
        Language::LlvmIr => Some(&LLVM_IR_CONFIG),
        Language::Vbnet => Some(&VBNET_CONFIG),
        Language::Nasm => Some(&NASM_CONFIG),
        Language::Bqn => Some(&BQN_CONFIG),
        Language::Lolcode => Some(&LOLCODE_CONFIG),
        Language::Forth => Some(&FORTH_CONFIG),
        Language::Algol68 => Some(&ALGOL68_CONFIG),
        Language::Umjunsik => Some(&UMJUNSIK_CONFIG),
        Language::Intercal => Some(&INTERCAL_CONFIG),
        Language::K => Some(&K_CONFIG),
        Language::Haxe => Some(&HAXE_CONFIG),
        Language::Raku => Some(&RAKU_CONFIG),

        Language::Shakespeare => Some(&SHAKESPEARE_CONFIG),
        Language::Unlambda => Some(&UNLAMBDA_CONFIG),
        Language::Snobol4 => Some(&SNOBOL4_CONFIG),
        Language::Icon => Some(&ICON_CONFIG),
        Language::Simula => Some(&SIMULA_CONFIG),
        Language::Uiua => Some(&UIUA_CONFIG),
        Language::Odin => Some(&ODIN_CONFIG),
        Language::ObjectiveC => Some(&OBJECTIVE_C_CONFIG),
        Language::DenoJs => Some(&DENO_JS_CONFIG),
        Language::DenoTs => Some(&DENO_TS_CONFIG),
        Language::BunJs => Some(&BUN_JS_CONFIG),
        Language::BunTs => Some(&BUN_TS_CONFIG),
        Language::Gleam => Some(&GLEAM_CONFIG),
        Language::Sml => Some(&SML_CONFIG),
        Language::Fennel => Some(&FENNEL_CONFIG),
        Language::Flix => Some(&FLIX_CONFIG),
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
            Language::C99,
            Language::C89,
            Language::Fortran,
            Language::Pascal,
            Language::Brainfuck,
            Language::Cobol,
            Language::ClangC23,
            Language::ClangCpp23,
            Language::Scala,
            Language::Erlang,
            Language::Commonlisp,
            Language::Bash,
            Language::Befunge,
            Language::Aheui,
            Language::Hyeong,
            Language::Whitespace,
            Language::Ada,
            Language::Clojure,
            Language::Prolog,
            Language::Tcl,
            Language::Awk,
            Language::Scheme,
            Language::Groovy,
            Language::Octave,
            Language::Crystal,
            Language::Powershell,
            Language::Postscript,
            Language::Delphi,
            Language::Fsharp,
            Language::Apl,
            Language::Freebasic,
            Language::Smalltalk,
            Language::B,
            Language::Sed,
            Language::Dc,
            Language::Coffeescript,
            Language::LlvmIr,
            Language::Vbnet,
            Language::Nasm,
            Language::Bqn,
            Language::Lolcode,
            Language::Forth,
            Language::Algol68,
            Language::Umjunsik,
            Language::Intercal,
            Language::K,
            Language::Haxe,
            Language::Raku,

            Language::Shakespeare,
            Language::Unlambda,
            Language::Snobol4,
            Language::Icon,
            Language::Simula,
            Language::Uiua,
            Language::Odin,
            Language::ObjectiveC,
            Language::DenoJs,
            Language::DenoTs,
            Language::BunJs,
            Language::BunTs,
            Language::Gleam,
            Language::Sml,
            Language::Fennel,
            Language::Flix,
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
