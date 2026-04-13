import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("anti-cheat dashboard implementation", () => {
  it("shows explicit review tiers for anti-cheat events", () => {
    const source = read("src/components/contest/anti-cheat-dashboard.tsx");

    expect(source).toContain('getAntiCheatReviewTier(event.eventType)');
    expect(source).toContain('t("reviewTier")');
    expect(source).toContain('t(`reviewTiers.${getAntiCheatReviewTier(event.eventType)}`');
  });
});
