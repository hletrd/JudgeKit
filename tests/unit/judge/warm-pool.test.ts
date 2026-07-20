import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  WARM_POOL_MAX_PER_IMAGE,
  WARM_POOL_MAX_TOTAL,
  defaultWarmPoolConfig,
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

  it("enforces WARM_POOL_MAX_TOTAL across images deterministically (full truncation)", () => {
    // Four distinct images, each requesting 8 containers = 32 total, exceeds 24 cap.
    // Alphabetically sorted: judge-cpp, judge-go, judge-python, judge-rust.
    // Expected: cpp=8, go=8, python=8, rust=0 (dropped entirely).
    const enabledLangs = new Set(["cpp20", "go", "python", "rust"]);
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { cpp20: 8, go: 8, python: 8, rust: 8 },
    };
    const result = resolveWarmPoolTargets(config, enabledLangs);
    expect(result).toEqual({
      enabled: true,
      images: {
        "judge-cpp:latest": 8,
        "judge-go:latest": 8,
        "judge-python:latest": 8,
      },
    });
    const total = Object.values(result.images).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(WARM_POOL_MAX_TOTAL);
  });

  it("enforces WARM_POOL_MAX_TOTAL across images with partial truncation", () => {
    // Craft counts so the last image receives a partial slice: cpp=8, go=8, python=5, rust=8 = 29 requested.
    // Alphabetically: judge-cpp, judge-go, judge-python, judge-rust.
    // After cpp (total=8), go (total=16), python (total=21), rust gets min(8, 24-21)=3.
    const enabledLangs = new Set(["cpp20", "go", "python", "rust"]);
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { cpp20: 8, go: 8, python: 5, rust: 8 },
    };
    const result = resolveWarmPoolTargets(config, enabledLangs);
    expect(result).toEqual({
      enabled: true,
      images: {
        "judge-cpp:latest": 8,
        "judge-go:latest": 8,
        "judge-python:latest": 5,
        "judge-rust:latest": 3,
      },
    });
    const total = Object.values(result.images).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(WARM_POOL_MAX_TOTAL);
  });

  it("truncation is deterministic across multiple calls", () => {
    const enabledLangs = new Set(["cpp20", "go", "python", "rust"]);
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { cpp20: 8, go: 8, python: 8, rust: 8 },
    };
    const result1 = resolveWarmPoolTargets(config, enabledLangs);
    const result2 = resolveWarmPoolTargets(config, enabledLangs);
    expect(result1).toEqual(result2);
  });

  it("floors fractional counts", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2.9 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });
});

describe("defaultWarmPoolConfig", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WARM_POOL_DEFAULT_ENABLED;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WARM_POOL_DEFAULT_ENABLED;
    } else {
      process.env.WARM_POOL_DEFAULT_ENABLED = originalEnv;
    }
  });

  it("returns enabled: true when WARM_POOL_DEFAULT_ENABLED is 'true'", () => {
    process.env.WARM_POOL_DEFAULT_ENABLED = "true";
    const config = defaultWarmPoolConfig();
    expect(config.enabled).toBe(true);
  });

  it("returns enabled: false when WARM_POOL_DEFAULT_ENABLED is unset", () => {
    delete process.env.WARM_POOL_DEFAULT_ENABLED;
    const config = defaultWarmPoolConfig();
    expect(config.enabled).toBe(false);
  });

  it("returns enabled: false when WARM_POOL_DEFAULT_ENABLED is 'false'", () => {
    process.env.WARM_POOL_DEFAULT_ENABLED = "false";
    const config = defaultWarmPoolConfig();
    expect(config.enabled).toBe(false);
  });

  it("returns enabled: false when WARM_POOL_DEFAULT_ENABLED is '1' (not the exact string 'true')", () => {
    process.env.WARM_POOL_DEFAULT_ENABLED = "1";
    const config = defaultWarmPoolConfig();
    expect(config.enabled).toBe(false);
  });

  it("returns the default languages map { python: 2, cpp20: 2, c17: 2 }", () => {
    const config = defaultWarmPoolConfig();
    expect(config.languages).toEqual({ python: 2, cpp20: 2, c17: 2 });
  });

  it("returns the default languages map regardless of WARM_POOL_DEFAULT_ENABLED value", () => {
    process.env.WARM_POOL_DEFAULT_ENABLED = "false";
    const config = defaultWarmPoolConfig();
    expect(config.languages).toEqual({ python: 2, cpp20: 2, c17: 2 });

    process.env.WARM_POOL_DEFAULT_ENABLED = "true";
    const config2 = defaultWarmPoolConfig();
    expect(config2.languages).toEqual({ python: 2, cpp20: 2, c17: 2 });
  });
});
