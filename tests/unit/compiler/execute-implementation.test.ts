import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("compiler workspace hardening (AGG-20 / DBG-4)", () => {
  it("uses 0o700/0o600 and fails closed when chown fails", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain("await chmod(workspaceDir, 0o700)");
    expect(source).toContain("await chmod(sourcePath, 0o600)");
    expect(source).toContain("Failed to assign compiler workspace to sandbox user");
    expect(source).not.toContain("await chmod(workspaceDir, 0o777)");
    expect(source).not.toContain("await chmod(sourcePath, 0o666)");
  });
});

// Logger is mocked so the import-time logger.error emitted on misconfigured
// RUNNER_AUTH_TOKEN does not spam test output. Hoisted above the dynamic
// import below. Existing source-grep tests do not touch the logger.
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("compiler execute implementation", () => {
  it("assigns local fallback workspaces to the non-root sandbox user", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain('"65534:65534"');
    expect(source).toContain("await chmod(workspaceDir, 0o700);");
    expect(source).toContain("await chown(workspaceDir, SANDBOX_UID, SANDBOX_GID);");
    expect(source).toContain("await chown(sourcePath, SANDBOX_UID, SANDBOX_GID);");
    expect(source).not.toContain("await chmod(workspaceDir, 0o777);");
    expect(source).not.toContain("await chmod(sourcePath, 0o666);");
  });

  it("uses phase-specific PID limits (64 run, 128 compile)", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain('opts.phase === "run" ? "64" : "128"');
  });

  it("chowns the workspace back to the app user before cleanup", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain("cleanupCompilerWorkspace(workspaceDir)");
    expect(source).toContain("chownRecursive");
    expect(source).toContain("process.getuid");
    expect(source).toContain("process.getgid");
  });

  it("keeps the legacy deploy path compatible with compiler workspace creation", () => {
    const source = readFileSync(join(process.cwd(), "deploy.sh"), "utf8");

    expect(source).toContain("sudo chown 1001:1001 /compiler-workspaces");
    expect(source).toContain("sudo chmod 0700 /compiler-workspaces");
  });

  it("makes local compiler fallback opt-in when a worker runner is configured", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");
    const productionCompose = readFileSync(join(process.cwd(), "docker-compose.production.yml"), "utf8");
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(source).toContain("ENABLE_COMPILER_LOCAL_FALLBACK");
    expect(source).toContain("SHOULD_ALLOW_LOCAL_FALLBACK");
    expect(source).toContain('stderr: "Compiler runner unavailable"');
    expect(productionCompose).not.toContain("DISABLE_COMPILER_LOCAL_FALLBACK=1");
    expect(readme).toContain("ENABLE_COMPILER_LOCAL_FALLBACK=1");
  });

  it("keeps runner auth and shell-command validation aligned with the Rust worker", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain("const RUNNER_AUTH_TOKEN");
    expect(source).toContain("process.env.RUNNER_AUTH_TOKEN || \"\"");
    expect(source).toContain("COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing");
    expect(source).toContain("\\beval\\b");
    expect(source).toContain("\\$\\(");
    expect(source).toContain("\\|\\|");
  });

  it("caches seccomp profile availability instead of checking synchronously on every run", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain("const HAS_CUSTOM_SECCOMP_PROFILE = existsSync(SECCOMP_PROFILE_PATH);");
    expect(source).not.toContain("if (existsSync(SECCOMP_PROFILE_PATH))");
  });

  it("fails closed in production when the custom seccomp profile is missing", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain("!HAS_CUSTOM_SECCOMP_PROFILE");
    expect(source).toContain("Seccomp profile not found; container execution disabled in production");
  });
});

describe("compiler execute import-time misconfiguration (ARCH-1)", () => {
  // Capture the env once so each spec can mutate it freely.
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // NODE_ENV is declared readonly on Node's ProcessEnv type; assign via a
    // record-typed view of process.env (same pattern as tests/unit/security/ip.test.ts).
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.COMPILER_RUNNER_URL = "http://runner:3001";
    delete process.env.RUNNER_AUTH_TOKEN;
    delete process.env.RUNNER_AUTH_DISABLED;
    delete process.env.ENABLE_COMPILER_LOCAL_FALLBACK;
    delete process.env.DISABLE_COMPILER_LOCAL_FALLBACK;
  });

  afterEach(() => {
    // Restore env: remove keys added since snapshot, reset the rest.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
  });

  it("loads the module without throwing when RUNNER_AUTH_TOKEN is unset in production (ARCH-1)", async () => {
    // Previously this env combination threw at module top level, breaking the
    // whole process on misconfig. Now it logs and sets a config-error flag.
    await expect(import("@/lib/compiler/execute")).resolves.toBeDefined();
  });

  it("returns a configError result instead of throwing when RUNNER_AUTH_TOKEN is missing", async () => {
    const { executeCompilerRun } = await import("@/lib/compiler/execute");

    const result = await executeCompilerRun({
      sourceCode: "print('hi')",
      stdin: "",
      language: {
        extension: "py",
        dockerImage: "judge-python:3",
        compileCommand: null,
        runCommand: "python3 main.py",
      },
    });

    // COMPILER_RUNNER_CONFIG_ERROR constant value; downstream maps this to a
    // user-facing configError. No network/Docker calls occur (tryRustRunner
    // short-circuits when the token is missing).
    expect(result.stderr).toBe("COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing");
    expect(result.exitCode).toBeNull();
    expect(result.stdout).toBe("");
  });
});
