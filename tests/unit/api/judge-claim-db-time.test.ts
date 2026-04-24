import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression test for the clock-skew bug class (cycles 40-48).
 *
 * The judge claim route must use DB server time (getDbNowUncached or getDbNowMs)
 * for claimCreatedAt instead of Date.now(), because the stale claim detection
 * compares judge_claimed_at against NOW() in SQL. Using Date.now() would cause
 * premature or delayed stale detection under clock skew between the app server
 * and the database server.
 *
 * This test verifies the source code uses the correct DB-time function.
 */
describe("judge claim route DB-time usage", () => {
  const filePath = join(process.cwd(), "src/app/api/v1/judge/claim/route.ts");

  it("uses getDbNowUncached (not Date.now()) for claimCreatedAt", () => {
    const source = readFileSync(filePath, "utf8");
    const lines = source.split("\n");

    // Find the line that assigns claimCreatedAt (the actual assignment, not a comment)
    const claimCreatedAtLineIndex = lines.findIndex((line) =>
      line.match(/claimCreatedAt\s*=/) && !line.trimStart().startsWith("//")
    );

    expect(
      claimCreatedAtLineIndex,
      "claimCreatedAt assignment not found in judge claim route"
    ).toBeGreaterThanOrEqual(0);

    const claimCreatedAtLine = lines[claimCreatedAtLineIndex];

    // Verify it uses getDbNowUncached or getDbNowMs — NOT Date.now()
    expect(
      claimCreatedAtLine,
      "claimCreatedAt must use getDbNowUncached() or getDbNowMs(), not Date.now()"
    ).toMatch(/getDbNowUncached|getDbNowMs/);

    expect(
      claimCreatedAtLine,
      "claimCreatedAt must NOT use Date.now()"
    ).not.toContain("Date.now()");
  });

  it("imports getDbNowUncached from @/lib/db-time", () => {
    const source = readFileSync(filePath, "utf8");

    // Verify the import exists (either getDbNowUncached or getDbNowMs)
    expect(
      source,
      "judge claim route must import getDbNowUncached or getDbNowMs from @/lib/db-time"
    ).toMatch(/import.*getDbNow(Uncached|Ms).*from ["']@\/lib\/db-time["']/);
  });
});
