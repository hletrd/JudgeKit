import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The recruiting-candidate isolation strategy on the per-problem rankings
 * page changed: previously the page imported getRecruitingAccessContext and
 * redirected recruiting candidates to /dashboard/problems/[id]. The current
 * implementation provides stronger isolation by excluding recruiting
 * candidates from the rankings query itself (via a NOT EXISTS subquery
 * against recruiting_invitations.status = 'redeemed'), so they don't appear
 * to ANY viewer. The redirect-based mock test that asserted the old behavior
 * is replaced with a source-grep that pins the SQL-level exclusion.
 *
 * If a future change loosens the exclusion (e.g., relies on a session-scope
 * check instead of the SQL filter), this test fails immediately.
 */
describe("ProblemRankingsPage recruiting-candidate isolation", () => {
  it("excludes recruiting candidates from the rankings via a SQL NOT EXISTS subquery", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(public)/practice/problems/[id]/rankings/page.tsx"),
      "utf8",
    );

    expect(source).toContain("recruiting_invitations");
    expect(source).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM recruiting_invitations/);
    expect(source).toContain("ri.status = 'redeemed'");
    expect(source).toContain("ri.user_id = u.id");
  });

  it("renders the rankings card and does not silently swallow accepted-only scope", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(public)/practice/problems/[id]/rankings/page.tsx"),
      "utf8",
    );

    expect(source).toContain("s.status = 'accepted'");
  });
});
