import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  WARM_POOL_MAX_PER_IMAGE,
  WARM_POOL_MAX_TOTAL,
  defaultWarmPoolConfig,
  languageToImage,
  resolveLanguageImage,
  resolveWarmPoolTargets,
  type WarmPoolConfig,
} from "@/lib/judge/warm-pool";
import { systemSettingsSchema } from "@/lib/validators/system-settings";

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

describe("resolveLanguageImage", () => {
  it("prefers the DB image over the static mapping", () => {
    expect(resolveLanguageImage("cpp20", "judge-cpp:v2")).toBe("judge-cpp:v2");
  });

  it("falls back to the static mapping when the DB value is missing or blank", () => {
    expect(resolveLanguageImage("cpp20", null)).toBe("judge-cpp:latest");
    expect(resolveLanguageImage("cpp20", undefined)).toBe("judge-cpp:latest");
    expect(resolveLanguageImage("cpp20", "   ")).toBe("judge-cpp:latest");
  });

  it("trims the DB value the same way the claim route does", () => {
    expect(resolveLanguageImage("python", "  judge-python:v9\n")).toBe("judge-python:v9");
  });

  it("uses the DB image even for a language with no static mapping", () => {
    expect(resolveLanguageImage("brainfuck-9000", "judge-bf:latest")).toBe("judge-bf:latest");
    expect(resolveLanguageImage("brainfuck-9000", null)).toBeUndefined();
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

  // The whole point of the feature: the worker acquires by
  // `submission.docker_image`, which comes from `language_configs.docker_image`.
  // Warming the static image after an admin retags would miss every acquire.
  it("warms the DB image when it has drifted from the static mapping", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { cpp20: 2 } };
    const images = new Map([["cpp20", "judge-cpp:v2"]]);
    expect(resolveWarmPoolTargets(config, ALL, images)).toEqual({
      enabled: true,
      images: { "judge-cpp:v2": 2 },
    });
  });

  it("falls back to the static mapping for languages with no DB row", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { cpp20: 2, python: 1 } };
    const images = new Map([["cpp20", "judge-cpp:v2"]]);
    expect(resolveWarmPoolTargets(config, ALL, images)).toEqual({
      enabled: true,
      images: { "judge-cpp:v2": 2, "judge-python:latest": 1 },
    });
  });

  it("treats a null or blank DB image as no override", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { cpp20: 2, python: 1 } };
    const images = new Map<string, string | null>([
      ["cpp20", null],
      ["python", "  "],
    ]);
    expect(resolveWarmPoolTargets(config, ALL, images)).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 2, "judge-python:latest": 1 },
    });
  });

  it("merges with MAX per RESOLVED image, so retagging one language splits the pool", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { c17: 2, cpp20: 3 } };
    // Both share judge-cpp:latest statically; only C++ is retagged.
    const images = new Map([["cpp20", "judge-cpp:v2"]]);
    expect(resolveWarmPoolTargets(config, ALL, images)).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 2, "judge-cpp:v2": 3 },
    });
  });

  it("merges with MAX when two languages are retagged onto the SAME image", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { c17: 2, python: 3 } };
    const images = new Map([
      ["c17", "judge-shared:v1"],
      ["python", "judge-shared:v1"],
    ]);
    expect(resolveWarmPoolTargets(config, ALL, images)).toEqual({
      enabled: true,
      images: { "judge-shared:v1": 3 },
    });
  });

  it("still clamps per-image and total caps against DB images", () => {
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { python: WARM_POOL_MAX_PER_IMAGE + 5 },
    };
    const images = new Map([["python", "judge-python:v2"]]);
    expect(resolveWarmPoolTargets(config, ALL, images)).toEqual({
      enabled: true,
      images: { "judge-python:v2": WARM_POOL_MAX_PER_IMAGE },
    });
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

describe("systemSettingsSchema warmPool", () => {
  it("accepts a valid warm pool config", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: 2, cpp20: 3 } },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null (clear to default)", () => {
    expect(systemSettingsSchema.safeParse({ warmPool: null }).success).toBe(true);
  });

  it("accepts omission", () => {
    expect(systemSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a count above the per-image cap", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: WARM_POOL_MAX_PER_IMAGE + 1 } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative count", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: -1 } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-integer count", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: 1.5 } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing enabled flag", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { languages: { python: 1 } },
    });
    expect(parsed.success).toBe(false);
  });
});
