import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("buildDockerImage implementation", () => {
  it("uses the repository root as the docker build context", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/docker/client.ts"), "utf8");

    expect(source).toContain('const contextDir = ".";');
    expect(source).toContain('spawn("docker", ["build", "-t", imageName, "-f", dockerfilePath, contextDir])');
  });

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.COMPILER_RUNNER_URL;
    delete process.env.JUDGE_AUTH_TOKEN;
    delete process.env.RUNNER_AUTH_TOKEN;
  });

  it("routes Docker management through the worker API when a runner is configured", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";
    process.env.RUNNER_AUTH_TOKEN = "y".repeat(32);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const { listDockerImages } = await import("@/lib/docker/client");
    await expect(listDockerImages("judge-*")).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://judge-worker:3001/docker/images?filter=judge-*",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });

  it("uses RUNNER_AUTH_TOKEN (not JUDGE_AUTH_TOKEN) for worker docker-management calls", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";
    process.env.RUNNER_AUTH_TOKEN = "y".repeat(32);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const { listDockerImages } = await import("@/lib/docker/client");
    await listDockerImages("judge-*");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://judge-worker:3001/docker/images?filter=judge-*",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const init = vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Headers | undefined;
    expect(headers?.get("Authorization")).toBe(`Bearer ${"y".repeat(32)}`);
  });

  it("fails closed with a generic error code when a runner URL is configured without RUNNER_AUTH_TOKEN", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";
    // JUDGE_AUTH_TOKEN is intentionally NOT used as a fallback for docker
    // operations — the Docker API and judge submission API are separate
    // authorization domains. See commit 909fcbf5 and the security hardening
    // that removed the shared token fallback.
    //
    // The error returned to API callers is the generic "configError" code
    // rather than the literal "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN
    // is missing" message — leaking env-var names to API responses is
    // inconsistent with the no-leak hardening on /api/metrics (CRON_SECRET).
    // The operator-facing detail is logged server-side instead.

    const { listDockerImages, pullDockerImage } = await import("@/lib/docker/client");

    await expect(listDockerImages("judge-*")).rejects.toThrow("configError");
    await expect(pullDockerImage("judge-python:latest")).resolves.toEqual({
      success: false,
      error: "configError",
    });
  });
});

describe("validateDockerfilePath", () => {
  // The validateDockerfilePath function is not exported, so we test it
  // indirectly through the source code assertions and by verifying that
  // the DOCKERFILE_PREFIX constant is correctly defined.
  it("requires docker/Dockerfile.judge- prefix (not just docker/Dockerfile.)", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/docker/client.ts"), "utf8");

    // Verify the shared prefix constant
    expect(source).toContain('const DOCKERFILE_PREFIX = "docker/Dockerfile.judge-";');

    // Verify both build paths use the shared validation function
    expect(source).toContain("validateDockerfilePath(dockerfilePath)");

    // Verify the validation function checks the prefix
    expect(source).toContain("dockerfilePath.startsWith(DOCKERFILE_PREFIX)");

    // Verify path traversal check uses the prefix length
    expect(source).toContain("dockerfilePath.slice(DOCKERFILE_PREFIX.length)");
  });

  it("does not accept non-judge Dockerfile paths", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/docker/client.ts"), "utf8");

    // The local path previously used "docker/Dockerfile.judge-" (correct)
    // and the remote path used "docker/Dockerfile." (too permissive).
    // Both now use validateDockerfilePath() which enforces "judge-" infix.
    // Verify there is no remaining "docker/Dockerfile." check that would
    // allow non-judge builds.
    const remoteBuildMatch = source.match(
      /if\s*\(!dockerfilePath\.startsWith\("docker\/Dockerfile\."\)\)/
    );
    expect(remoteBuildMatch).toBeNull();
  });
});
