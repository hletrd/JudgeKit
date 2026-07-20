import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSystemSettings = vi.fn();
const selectFrom = vi.fn();

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: () => getSystemSettings(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => selectFrom() }) },
}));

describe("getWarmPoolTargets", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WARM_POOL_DEFAULT_ENABLED;
    vi.resetModules();
    getSystemSettings.mockReset();
    selectFrom.mockReset();
    delete process.env.WARM_POOL_DEFAULT_ENABLED;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WARM_POOL_DEFAULT_ENABLED;
    } else {
      process.env.WARM_POOL_DEFAULT_ENABLED = originalEnv;
    }
  });

  it("resolves stored config into per-image targets", async () => {
    getSystemSettings.mockResolvedValue({
      warmPool: { enabled: true, languages: { python: 2, cpp20: 2, c17: 2 } },
    });
    selectFrom.mockResolvedValue([
      { language: "python", isEnabled: true },
      { language: "cpp20", isEnabled: true },
      { language: "c17", isEnabled: true },
    ]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 2, "judge-python:latest": 2 },
    });
  });

  it("falls back to the deployment default when the column is null", async () => {
    process.env.WARM_POOL_DEFAULT_ENABLED = "true";
    getSystemSettings.mockResolvedValue({ warmPool: null });
    selectFrom.mockResolvedValue([
      { language: "python", isEnabled: true },
      { language: "cpp20", isEnabled: true },
      { language: "c17", isEnabled: true },
    ]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    const targets = await getWarmPoolTargets();
    expect(targets.enabled).toBe(true);
    expect(targets.images["judge-python:latest"]).toBe(2);
  });

  it("is disabled by default when the deployment does not opt in", async () => {
    getSystemSettings.mockResolvedValue({ warmPool: null });
    selectFrom.mockResolvedValue([{ language: "python", isEnabled: true }]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({ enabled: false, images: {} });
  });

  it("excludes languages disabled in languageConfigs", async () => {
    getSystemSettings.mockResolvedValue({
      warmPool: { enabled: true, languages: { python: 2, cpp20: 2 } },
    });
    selectFrom.mockResolvedValue([
      { language: "python", isEnabled: true },
      { language: "cpp20", isEnabled: false },
    ]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });

  it("returns disabled targets if settings lookup throws", async () => {
    getSystemSettings.mockRejectedValue(new Error("db down"));
    selectFrom.mockResolvedValue([]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({ enabled: false, images: {} });
  });
});
