import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RATE_LIMIT_PATH = "src/lib/security/rate-limit.ts";

describe("rate limit eviction timer", () => {
  it("exports startRateLimitEviction and stopRateLimitEviction", () => {
    const source = readFileSync(join(process.cwd(), RATE_LIMIT_PATH), "utf8");
    expect(source).toContain("export function startRateLimitEviction");
    expect(source).toContain("export function stopRateLimitEviction");
  });

  it("uses a 60-second interval for eviction", () => {
    const source = readFileSync(join(process.cwd(), RATE_LIMIT_PATH), "utf8");
    expect(source).toContain("60_000");
    expect(source).toContain("1 minute");
  });

  it("prevents duplicate timer starts", () => {
    const source = readFileSync(join(process.cwd(), RATE_LIMIT_PATH), "utf8");
    // Must check if timer exists before creating a new one
    expect(source).toContain("if (evictionTimer) return;");
  });

  it("clears interval and nulls the timer on stop", () => {
    const source = readFileSync(join(process.cwd(), RATE_LIMIT_PATH), "utf8");
    expect(source).toContain("clearInterval(evictionTimer)");
    expect(source).toContain("evictionTimer = null");
  });

  it("calls unref on the timer to allow process exit", () => {
    const source = readFileSync(join(process.cwd(), RATE_LIMIT_PATH), "utf8");
    expect(source).toContain("unref()");
  });
});
