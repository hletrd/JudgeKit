import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { chmod, chown, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({
    compilerTimeLimitMs: 10_000,
  }),
}));

vi.mock("@/lib/judge/docker-image-validation", () => ({
  isAllowedJudgeDockerImage: () => true,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const VALID_OPTIONS = {
  sourceCode: "print(1)",
  stdin: "",
  language: {
    extension: ".py",
    dockerImage: "judge-python",
    compileCommand: null,
    runCommand: "python3 /workspace/solution.py",
  },
};

describe("executeCompilerRun", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.COMPILER_RUNNER_URL;
    delete process.env.JUDGE_AUTH_TOKEN;
    delete process.env.RUNNER_AUTH_TOKEN;
    delete process.env.DISABLE_COMPILER_LOCAL_FALLBACK;
    delete process.env.ENABLE_COMPILER_LOCAL_FALLBACK;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers RUNNER_AUTH_TOKEN over JUDGE_AUTH_TOKEN for runner requests", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";
    process.env.JUDGE_AUTH_TOKEN = "x".repeat(32);
    process.env.RUNNER_AUTH_TOKEN = "y".repeat(32);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stdout: "ok",
        stderr: "",
        exitCode: 0,
        executionTimeMs: 12,
        timedOut: false,
        oomKilled: false,
        compileOutput: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { executeCompilerRun } = await import("@/lib/compiler/execute");
    const result = await executeCompilerRun(VALID_OPTIONS);

    expect(result.stdout).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://judge-worker:3001/run",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${"y".repeat(32)}`,
        }),
      })
    );
  });

  it("rejects shell metacharacter chains in local fallback commands", async () => {
    const { executeCompilerRun } = await import("@/lib/compiler/execute");

    await expect(
      executeCompilerRun({
        ...VALID_OPTIONS,
        language: {
          ...VALID_OPTIONS.language,
          compileCommand: "python3 /workspace/solution.py | echo hi",
        },
      })
    ).resolves.toMatchObject({
      stderr: "Invalid compile command",
      exitCode: 1,
    });

    await expect(
      executeCompilerRun({
        ...VALID_OPTIONS,
        language: {
          ...VALID_OPTIONS.language,
          runCommand: "python3 /workspace/solution.py || echo hi",
        },
      })
    ).resolves.toMatchObject({
      stderr: "Invalid run command",
      exitCode: 1,
    });
  });

  it("rejects invalid shell commands before delegating to the Rust runner", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";
    process.env.RUNNER_AUTH_TOKEN = "y".repeat(32);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { executeCompilerRun } = await import("@/lib/compiler/execute");

    await expect(
      executeCompilerRun({
        ...VALID_OPTIONS,
        language: {
          ...VALID_OPTIONS.language,
          runCommand: "python3 /workspace/solution.py || echo hi",
        },
      })
    ).resolves.toMatchObject({
      stderr: "Invalid run command",
      exitCode: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects positional parameter expansion ($0-$9) in local fallback commands", async () => {
    const { executeCompilerRun } = await import("@/lib/compiler/execute");

    await expect(
      executeCompilerRun({
        ...VALID_OPTIONS,
        language: {
          ...VALID_OPTIONS.language,
          runCommand: "python3 /workspace/solution.py $1",
        },
      })
    ).resolves.toMatchObject({
      stderr: "Invalid run command",
      exitCode: 1,
    });

    await expect(
      executeCompilerRun({
        ...VALID_OPTIONS,
        language: {
          ...VALID_OPTIONS.language,
          runCommand: "python3 /workspace/solution.py $0",
        },
      })
    ).resolves.toMatchObject({
      stderr: "Invalid run command",
      exitCode: 1,
    });
  });

  it("accepts environment-variable prefixed compile commands", async () => {
    const { validateShellCommandStrict } = await import("@/lib/compiler/execute");

    expect(validateShellCommandStrict("CC=gcc gcc main.c")).toBe(true);
    expect(validateShellCommandStrict("CFLAGS=-O2 gcc main.c")).toBe(true);
  });

  it("rejects shell interpreter invocations and -c smuggling", async () => {
    const { validateShellCommandStrict } = await import("@/lib/compiler/execute");

    expect(validateShellCommandStrict("bash -c 'id'")).toBe(false);
    expect(validateShellCommandStrict("sh -c 'id'")).toBe(false);
    expect(validateShellCommandStrict("powershell -c 'id'")).toBe(false);
    expect(validateShellCommandStrict("pwsh -c 'id'")).toBe(false);
    expect(validateShellCommandStrict("-c 'id'")).toBe(false);
    expect(validateShellCommandStrict("bash /workspace/run.sh")).toBe(false);
  });

  it("fails closed with an explicit config error when a runner URL is set without any runner auth token", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";

    const { executeCompilerRun } = await import("@/lib/compiler/execute");
    await expect(executeCompilerRun(VALID_OPTIONS)).resolves.toMatchObject({
      stderr: "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing",
      exitCode: null,
    });
  });
});

describe("parseTimestampEpochMs", () => {
  it("parses standard millisecond RFC 3339 timestamps", async () => {
    const { parseTimestampEpochMs } = await import("@/lib/compiler/execute");
    expect(parseTimestampEpochMs("2024-01-15T10:30:45.123Z")).toBe(
      Date.parse("2024-01-15T10:30:45.123Z"),
    );
    expect(parseTimestampEpochMs("2024-01-15T10:30:45Z")).toBe(
      Date.parse("2024-01-15T10:30:45Z"),
    );
  });

  it("truncates nanosecond Docker timestamps to milliseconds", async () => {
    const { parseTimestampEpochMs } = await import("@/lib/compiler/execute");
    expect(parseTimestampEpochMs("2024-01-15T10:30:45.123456789Z")).toBe(
      Date.parse("2024-01-15T10:30:45.123Z"),
    );
    expect(parseTimestampEpochMs("2024-01-15T10:30:45.999999999Z")).toBe(
      Date.parse("2024-01-15T10:30:45.999Z"),
    );
  });

  it("returns null for malformed timestamps", async () => {
    const { parseTimestampEpochMs } = await import("@/lib/compiler/execute");
    expect(parseTimestampEpochMs("not-a-timestamp")).toBeNull();
    expect(parseTimestampEpochMs("")).toBeNull();
  });
});

describe("workspace leak regression", () => {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

  it("cleans up a sandbox-owned workspace tree", async () => {
    if (!isRoot) {
      // chown to the sandbox uid requires root/CAP_CHOWN; skip on normal dev hosts.
      return;
    }

    const { cleanupCompilerWorkspace } = await import("@/lib/compiler/execute");
    const base = await mkdtemp(join(tmpdir(), "compiler-"));
    const nested = join(base, "build");
    const sourcePath = join(base, "solution.py");
    const artifactPath = join(nested, "out.o");

    try {
      await mkdir(nested);
      await writeFile(sourcePath, "print(1)", { encoding: "utf8" });
      await writeFile(artifactPath, "", { encoding: "utf8" });
      await chown(nested, 65534, 65534);
      await chown(artifactPath, 65534, 65534);
      await chown(sourcePath, 65534, 65534);
      await chown(base, 65534, 65534);
      await chmod(base, 0o700);

      await cleanupCompilerWorkspace(base);

      expect(existsSync(base)).toBe(false);
      const leftovers = readdirSync(tmpdir()).filter((name) =>
        name.startsWith("compiler-"),
      );
      expect(leftovers).toHaveLength(0);
    } finally {
      // Best-effort cleanup if the test itself fails mid-way.
      try {
        await cleanupCompilerWorkspace(base);
      } catch {
        // ignore
      }
    }
  });
});

describe("non-root workspace cleanup", () => {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

  it("cleans up an ordinary workspace tree when running non-root", async () => {
    if (isRoot) {
      // The docker fallback is only for non-root production runs (Dockerfile USER 1001).
      return;
    }

    const { cleanupCompilerWorkspace } = await import("@/lib/compiler/execute");
    const base = await mkdtemp(join(tmpdir(), "compiler-nonroot-"));
    const nested = join(base, "build");

    try {
      await mkdir(nested);
      await writeFile(join(nested, "out.o"), "", { encoding: "utf8" });
      await writeFile(join(base, "solution.py"), "print(1)", { encoding: "utf8" });

      await cleanupCompilerWorkspace(base);

      expect(existsSync(base)).toBe(false);
      const leftovers = readdirSync(tmpdir()).filter((name) =>
        name.startsWith("compiler-nonroot-"),
      );
      expect(leftovers).toHaveLength(0);
    } finally {
      try {
        await cleanupCompilerWorkspace(base);
      } catch {
        // ignore
      }
    }
  });
});
