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
    process.env.JUDGE_AUTH_TOKEN = "x".repeat(32);
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

  it("prefers RUNNER_AUTH_TOKEN over JUDGE_AUTH_TOKEN for worker docker-management calls", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";
    process.env.JUDGE_AUTH_TOKEN = "x".repeat(32);
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

  it("fails closed when a runner URL is configured without any runner auth token", async () => {
    process.env.COMPILER_RUNNER_URL = "http://judge-worker:3001";

    const { listDockerImages, pullDockerImage } = await import("@/lib/docker/client");

    await expect(listDockerImages("judge-*")).rejects.toThrow(
      "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN/JUDGE_AUTH_TOKEN is missing"
    );
    await expect(pullDockerImage("judge-python:latest")).resolves.toEqual({
      success: false,
      error: "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN/JUDGE_AUTH_TOKEN is missing",
    });
  });
});
