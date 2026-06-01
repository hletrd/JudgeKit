import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("problem-set visibility implementation", () => {
  it("derives global problem-set visibility from capabilities instead of admin role level shortcuts", () => {
    const source = read("src/lib/problem-sets/visibility.ts");

    expect(source).toContain("const caps = await resolveCapabilities(role);");
    expect(source).toContain('caps.has("groups.view_all")');
    expect(source).toContain("PROBLEM_SET_CAPABILITIES.some");
    expect(source).not.toContain("isAtLeastRoleAsync");
    expect(source).not.toContain('requiredRole: "admin"');
  });

  it("scopes the problem-set builder's available-problems list (no problems.view_all bypass)", () => {
    const source = read("src/lib/problem-sets/visibility.ts");
    // getAvailableProblemsForProblemSetUser must not short-circuit to ALL problems
    // for a problems.view_all holder — only org-wide problem-set admins
    // (canViewAllProblemSets, which requires groups.view_all) get the unscoped
    // list; everyone else is scoped to their manageable groups + public + authored.
    expect(source).not.toContain('canViewAllProblemSets(role)) || caps.has("problems.view_all")');
    expect(source).toContain("inArray(problemGroupAccess.groupId, manageableGroupIds)");
  });
});
