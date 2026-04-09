import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CHECKED_FILES = [
  "src/lib/auth/config.ts",
  "src/lib/actions/change-password.ts",
];

describe("security-critical rate limit persistence", () => {
  it("does not fire-and-forget failure or reset writes", () => {
    const violations: string[] = [];

    for (const relativePath of CHECKED_FILES) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        if (
          line.includes("void recordRateLimitFailure") ||
          line.includes("void recordRateLimitFailureMulti") ||
          line.includes("void clearRateLimit") ||
          line.includes("void clearRateLimitMulti")
        ) {
          violations.push(`${relativePath}:${index + 1}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
