import { describe, expect, it } from "vitest";
import {
  WARM_POOL_MAX_PER_IMAGE,
  WARM_POOL_MAX_TOTAL,
  languageToImage,
  resolveWarmPoolTargets,
  type WarmPoolConfig,
} from "@/lib/judge/warm-pool";

const ALL = new Set(["python", "c17", "c23", "cpp20", "cpp23", "cpp26", "rust"]);

describe("languageToImage", () => {
  it("maps C and C++ variants to the shared judge-cpp image", () => {
    expect(languageToImage("c17")).toBe("judge-cpp:latest");
    expect(languageToImage("cpp20")).toBe("judge-cpp:latest");
  });

  it("maps python to judge-python", () => {
    expect(languageToImage("python")).toBe("judge-python:latest");
  });

  it("returns undefined for an unknown language", () => {
    expect(languageToImage("brainfuck-9000")).toBeUndefined();
  });
});

describe("resolveWarmPoolTargets", () => {
  it("returns disabled targets when config is null", () => {
    expect(resolveWarmPoolTargets(null, ALL)).toEqual({ enabled: false, images: {} });
  });

  it("returns disabled targets when config.enabled is false", () => {
    const config: WarmPoolConfig = { enabled: false, languages: { python: 2 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({ enabled: false, images: {} });
  });

  it("groups languages by image and takes the MAX, not the sum", () => {
    // One warm judge-cpp container can serve either C or C++, so 2 and 3 -> 3.
    const config: WarmPoolConfig = { enabled: true, languages: { c17: 2, cpp20: 3 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 3 },
    });
  });

  it("keeps distinct images separate", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2, cpp20: 1 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 1, "judge-python:latest": 2 },
    });
  });

  it("skips languages that are disabled in languageConfigs", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2, cpp20: 2 } };
    expect(resolveWarmPoolTargets(config, new Set(["python"]))).toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });

  it("skips unknown languages and non-positive counts", () => {
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { python: 0, nope: 5, cpp20: -3 },
    };
    expect(resolveWarmPoolTargets(config, new Set(["python", "nope", "cpp20"]))).toEqual({
      enabled: true,
      images: {},
    });
  });

  it("clamps per-image counts to WARM_POOL_MAX_PER_IMAGE", () => {
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { python: WARM_POOL_MAX_PER_IMAGE + 50 },
    };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-python:latest": WARM_POOL_MAX_PER_IMAGE },
    });
  });

  it("enforces WARM_POOL_MAX_TOTAL across images deterministically", () => {
    const languages: Record<string, number> = {};
    for (const lang of ["python", "cpp20", "rust"]) {
      languages[lang] = WARM_POOL_MAX_PER_IMAGE;
    }
    const result = resolveWarmPoolTargets({ enabled: true, languages }, ALL);
    const total = Object.values(result.images).reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(WARM_POOL_MAX_TOTAL);
  });

  it("floors fractional counts", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2.9 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });
});
