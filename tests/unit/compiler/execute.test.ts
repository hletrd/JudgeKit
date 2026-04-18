import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      exitCode: null,
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
      exitCode: null,
    });
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
