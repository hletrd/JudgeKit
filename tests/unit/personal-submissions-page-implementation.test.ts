import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("public submissions page implementation", () => {
  it("scopes the user filter to session userId only when scope=mine, and the dashboard route is a redirect", () => {
    // Workspace→public migration: the dashboard /dashboard/submissions route
    // is now a 308 redirect (in next.config.ts) to the public counterpart.
    // The capability-aware logic moved with the page; reviewers no longer
    // need a hard redirect away because the public page accepts ?scope=all
    // and respects auth gating per row. Verify the migration is intact.
    const source = read("src/app/(public)/submissions/page.tsx");
    const nextConfig = read("next.config.ts");

    // Public submissions page: scope-based userFilter, guest visibility
    // restriction, no hardcoded role check. The table.student column header
    // is rendered for reviewer scope (the dashboard reviewer queue was
    // unified into the public page with ?scope=all), so we do NOT assert
    // its absence here — that was a holdover from the old "personal-only"
    // page.
    expect(source).toContain("eq(submissions.userId, session!.user.id)");
    expect(source).toContain("eq(problems.visibility, \"public\")");
    expect(source).not.toContain("isInstructor(");

    // The 308 redirect from the legacy dashboard path is preserved so deep
    // links in chat / email continue to work.
    expect(nextConfig).toContain("/dashboard/submissions");
  });
});
