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

  it("exposes the Java runtime with the shared JVM image and Main entrypoint", () => {
    const java = getJudgeLanguageDefinition("java");
    const serializedCompileCommand = serializeJudgeCommand(java?.compileCommand);

    expect(java).toMatchObject({
      language: "java",
      extension: ".java",
      dockerImage: "judge-jvm:latest",
      runCommand: ["java", "-cp", "/workspace/out", "Main"],
    });
    expect(serializedCompileCommand).toContain("cp /workspace/solution.java /workspace/Main.java");
    expect(serializedCompileCommand).toContain("javac --release 25 -encoding UTF-8");
  });

  it("exposes Kotlin as a self-contained jar workflow on the shared JVM image", () => {
    const kotlin = getJudgeLanguageDefinition("kotlin");

    expect(kotlin).toMatchObject({
      language: "kotlin",
      extension: ".kt",
      dockerImage: "judge-jvm:latest",
      compileCommand: [
        "kotlinc",
        "/workspace/solution.kt",
        "-include-runtime",
        "-d",
        "/workspace/solution.jar",
      ],
      runCommand: ["java", "-jar", "/workspace/solution.jar"],
    });
  });
});
