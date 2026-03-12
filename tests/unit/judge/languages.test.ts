import { describe, expect, it } from "vitest";
import {
  getJudgeLanguageDefinition,
  isJudgeLanguage,
  serializeJudgeCommand,
} from "@/lib/judge/languages";

describe("judge language definitions", () => {
  it("recognizes Java and Kotlin as supported judge languages", () => {
    expect(isJudgeLanguage("java")).toBe(true);
    expect(isJudgeLanguage("kotlin")).toBe(true);
    expect(isJudgeLanguage("ruby")).toBe(false);
  });

  it("recognizes all 16 supported languages and rejects unknown ones", () => {
    const supported = [
      "c17", "c23", "cpp20", "cpp23",
      "java", "kotlin",
      "python", "javascript", "typescript",
      "rust", "go", "swift", "csharp",
      "r", "perl", "php",
    ];
    for (const lang of supported) {
      expect(isJudgeLanguage(lang), `${lang} should be recognized`).toBe(true);
    }
    expect(isJudgeLanguage("ruby")).toBe(false);
    expect(isJudgeLanguage("lua")).toBe(false);
    expect(isJudgeLanguage("")).toBe(false);
  });

  // ── C ────────────────────────────────────────────────────────────────────

  it("c17: exists with correct metadata and compile/run commands", () => {
    const def = getJudgeLanguageDefinition("c17");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("C");
    expect(def?.extension).toBe(".c");
    expect(def?.dockerImage).toBe("judge-cpp:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("gcc");
    expect(compile).toContain("-std=c17");
    expect(compile).toContain("/workspace/solution.c");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  it("c23: exists with correct metadata and compile/run commands", () => {
    const def = getJudgeLanguageDefinition("c23");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("C");
    expect(def?.extension).toBe(".c");
    expect(def?.dockerImage).toBe("judge-cpp:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("gcc");
    expect(compile).toContain("-std=c23");
    expect(compile).toContain("/workspace/solution.c");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  // ── C++ ──────────────────────────────────────────────────────────────────

  it("cpp20: exists with correct metadata and compile/run commands", () => {
    const def = getJudgeLanguageDefinition("cpp20");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("C++");
    expect(def?.extension).toBe(".cpp");
    expect(def?.dockerImage).toBe("judge-cpp:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("g++");
    expect(compile).toContain("-std=c++20");
    expect(compile).toContain("/workspace/solution.cpp");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  it("cpp23: exists with correct metadata and compile/run commands", () => {
    const def = getJudgeLanguageDefinition("cpp23");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("C++");
    expect(def?.extension).toBe(".cpp");
    expect(def?.dockerImage).toBe("judge-cpp:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("g++");
    expect(compile).toContain("-std=c++23");
    expect(compile).toContain("/workspace/solution.cpp");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  // ── JVM ──────────────────────────────────────────────────────────────────

  it("exposes the Java runtime with the shared JVM image and Main entrypoint", () => {
    const java = getJudgeLanguageDefinition("java");
    const serializedCompileCommand = serializeJudgeCommand(java?.compileCommand);

    expect(java).toMatchObject({
      language: "java",
      displayName: "Java",
      extension: ".java",
      dockerImage: "judge-jvm:latest",
      runCommand: ["java", "-Djava.io.tmpdir=/workspace", "-cp", "/workspace/out", "Main"],
    });
    expect(serializedCompileCommand).toContain("cp /workspace/solution.java /workspace/Main.java");
    expect(serializedCompileCommand).toContain("javac --release 25 -encoding UTF-8");
  });

  it("exposes Kotlin as a self-contained jar workflow on the shared JVM image", () => {
    const kotlin = getJudgeLanguageDefinition("kotlin");

    expect(kotlin).toMatchObject({
      language: "kotlin",
      displayName: "Kotlin",
      extension: ".kt",
      dockerImage: "judge-jvm:latest",
      compileCommand: [
        "kotlinc",
        "-J-Djava.io.tmpdir=/workspace",
        "/workspace/solution.kt",
        "-include-runtime",
        "-d",
        "/workspace/solution.jar",
      ],
      runCommand: ["java", "-Djava.io.tmpdir=/workspace", "-jar", "/workspace/solution.jar"],
    });
  });

  // ── Scripting ─────────────────────────────────────────────────────────────

  it("python: exists as interpreted language with no compile command", () => {
    const def = getJudgeLanguageDefinition("python");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("Python");
    expect(def?.extension).toBe(".py");
    expect(def?.dockerImage).toBe("judge-python:latest");
    expect(def?.compileCommand).toBeNull();
    expect(def?.runCommand).toEqual(["python3", "/workspace/solution.py"]);
  });

  it("javascript: exists as interpreted language with no compile command", () => {
    const def = getJudgeLanguageDefinition("javascript");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("JavaScript");
    expect(def?.extension).toBe(".js");
    expect(def?.dockerImage).toBe("judge-node:latest");
    expect(def?.compileCommand).toBeNull();
    expect(def?.runCommand).toEqual(["node", "/workspace/solution.js"]);
  });

  it("typescript: exists with tsc compile step producing a Node.js runnable", () => {
    const def = getJudgeLanguageDefinition("typescript");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("TypeScript");
    expect(def?.extension).toBe(".ts");
    expect(def?.dockerImage).toBe("judge-node:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("tsc");
    expect(compile).toContain("/workspace/solution.ts");
    expect(compile).toContain("/workspace/dist");
    expect(def?.runCommand).toEqual(["node", "/workspace/dist/solution.js"]);
  });

  // ── Systems / native ──────────────────────────────────────────────────────

  it("rust: exists with rustc compile step producing a native binary", () => {
    const def = getJudgeLanguageDefinition("rust");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("Rust");
    expect(def?.extension).toBe(".rs");
    expect(def?.dockerImage).toBe("judge-rust:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("rustc");
    expect(compile).toContain("/workspace/solution.rs");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  it("go: exists with go build compile step producing a native binary", () => {
    const def = getJudgeLanguageDefinition("go");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("Go");
    expect(def?.extension).toBe(".go");
    expect(def?.dockerImage).toBe("judge-go:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("go build");
    expect(compile).toContain("/workspace/solution.go");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  it("swift: exists with swiftc compile step producing a native binary", () => {
    const def = getJudgeLanguageDefinition("swift");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("Swift");
    expect(def?.extension).toBe(".swift");
    expect(def?.dockerImage).toBe("judge-swift:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("swiftc");
    expect(compile).toContain("/workspace/solution.swift");
    expect(def?.runCommand).toEqual(["/workspace/solution"]);
  });

  it("csharp: exists with mcs compile step and mono runtime", () => {
    const def = getJudgeLanguageDefinition("csharp");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("C#");
    expect(def?.extension).toBe(".cs");
    expect(def?.dockerImage).toBe("judge-csharp:latest");
    const compile = serializeJudgeCommand(def?.compileCommand);
    expect(compile).toContain("mcs");
    expect(compile).toContain("/workspace/solution.cs");
    expect(compile).toContain("/workspace/solution.exe");
    expect(def?.runCommand).toEqual(["mono", "/workspace/solution.exe"]);
  });

  // ── Scripting (other) ─────────────────────────────────────────────────────

  it("r: exists as interpreted language with no compile command", () => {
    const def = getJudgeLanguageDefinition("r");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("R");
    expect(def?.extension).toBe(".r");
    expect(def?.dockerImage).toBe("judge-r:latest");
    expect(def?.compileCommand).toBeNull();
    expect(def?.runCommand).toEqual(["Rscript", "/workspace/solution.r"]);
  });

  it("perl: exists as interpreted language with no compile command", () => {
    const def = getJudgeLanguageDefinition("perl");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("Perl");
    expect(def?.extension).toBe(".pl");
    expect(def?.dockerImage).toBe("judge-perl:latest");
    expect(def?.compileCommand).toBeNull();
    expect(def?.runCommand).toEqual(["perl", "/workspace/solution.pl"]);
  });

  it("php: exists as interpreted language with no compile command", () => {
    const def = getJudgeLanguageDefinition("php");
    expect(def).not.toBeNull();
    expect(def?.displayName).toBe("PHP");
    expect(def?.extension).toBe(".php");
    expect(def?.dockerImage).toBe("judge-php:latest");
    expect(def?.compileCommand).toBeNull();
    expect(def?.runCommand).toEqual(["php", "/workspace/solution.php"]);
  });

  // ── getJudgeLanguageDefinition: null for unknown language ─────────────────

  it("returns null for an unknown language", () => {
    expect(getJudgeLanguageDefinition("ruby")).toBeNull();
    expect(getJudgeLanguageDefinition("lua")).toBeNull();
    expect(getJudgeLanguageDefinition("")).toBeNull();
  });

  // ── serializeJudgeCommand edge cases ─────────────────────────────────────

  it("serializeJudgeCommand returns null for null/undefined input", () => {
    expect(serializeJudgeCommand(null)).toBeNull();
    expect(serializeJudgeCommand(undefined)).toBeNull();
  });

  it("serializeJudgeCommand joins array elements with spaces", () => {
    expect(serializeJudgeCommand(["go", "build", "-o", "/workspace/solution"])).toBe(
      "go build -o /workspace/solution"
    );
  });
});
