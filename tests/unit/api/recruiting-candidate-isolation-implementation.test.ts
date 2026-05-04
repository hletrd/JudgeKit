import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("recruiting candidate isolation implementation", () => {
  it("blocks recruiting candidates from the leaderboard API before shared standings are computed", () => {
    const source = read("src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts");

    expect(source).toContain('if (recruitingAccess.isRecruitingCandidate && !isInstructorView)');
    expect(source).toContain('return apiError("forbidden", 403);');
  });

  it("keeps recruiting candidates out of shared standings on the public contest detail page", () => {
    // Workspace→public migration: the contest detail page moved from
    // (dashboard)/contests/[assignmentId] to (public)/contests/[id]. The
    // recruiting-candidate isolation moved with it.
    const source = read("src/app/(public)/contests/[id]/page.tsx");

    expect(source).toContain("const isRecruitingCandidate = recruitingAccess.isRecruitingCandidate");
    expect(source).toContain("{!isRecruitingCandidate && (");
    expect(source).toContain("<LeaderboardTable");
  });

  it("excludes recruiting candidates from per-problem rankings via SQL", () => {
    // The dashboard problem detail page is now a redirect-only shell, and
    // the per-problem rankings page (public) excludes recruiting candidates
    // from the rankings query directly via a NOT EXISTS subquery against
    // recruiting_invitations.status = 'redeemed'. This is stronger than the
    // previous redirect-on-candidate guard because candidates don't appear
    // in the rankings even to other viewers.
    const dashboardShell = read("src/app/(public)/problems/[id]/page.tsx");
    const rankingsSource = read("src/app/(public)/practice/problems/[id]/rankings/page.tsx");

    expect(dashboardShell).toContain("redirect(");
    expect(dashboardShell).toContain("/practice/problems/");

    expect(rankingsSource).toContain("recruiting_invitations");
    expect(rankingsSource).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM recruiting_invitations/);
    expect(rankingsSource).toContain("ri.status = 'redeemed'");
  });
});
