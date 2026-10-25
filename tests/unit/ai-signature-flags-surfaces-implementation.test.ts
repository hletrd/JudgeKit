import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Every server surface that shows AI-use signature flags must take them from
 * the manager-scoped helpers (resolveSignatureFlagViewerScope →
 * getSignatureFlag(s)…), never from the flag table directly, so a student's
 * HTML/RSC payload can only ever see an empty result. The scope behaviour
 * itself is covered against PostgreSQL in
 * tests/integration/db/ai-signature-flags.test.ts.
 */
describe("AI signature flag surfaces", () => {
  const scopedPages = [
    "src/app/(public)/submissions/page.tsx",
    "src/app/(public)/submissions/[id]/page.tsx",
    "src/app/(dashboard)/dashboard/admin/submissions/page.tsx",
    "src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/submissions/page.tsx",
    "src/app/api/v1/submissions/route.ts",
    "src/app/api/v1/submissions/[id]/route.ts",
  ];

  it.each(scopedPages)("%s resolves the viewer scope before reading flags", (path) => {
    const source = read(path);
    expect(source).toContain("resolveSignatureFlagViewerScope(");
    expect(source).not.toContain("submissionSignatureFlags");
  });

  it("passes the detail-page flag prop only when there is a visible flag", () => {
    const source = read("src/app/(public)/submissions/[id]/page.tsx");
    expect(source).toContain("{...(signatureFlag ? { aiSignatureMatches: signatureFlag.matches } : {})}");
  });

  it("asks for leaderboard flags only from the management page", () => {
    expect(read("src/app/(public)/contests/manage/[assignmentId]/page.tsx")).toContain(
      "showAiSignatureFlags={canManage}",
    );
    expect(read("src/app/(public)/contests/[id]/page.tsx")).not.toContain("showAiSignatureFlags");
    const route = read("src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts");
    expect(route).toContain('isInstructorView && req.nextUrl.searchParams.get("aiFlags") === "1"');
  });

  it("keeps the flag table out of the submissions relations", () => {
    expect(read("src/lib/db/relations.pg.ts")).not.toContain("submissionSignatureFlags");
  });
});
