import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guard for designer cycle-2 REG-2 / NEW-H2-adjacent: the problem
 * edit page must gate on the strict group-scoped canManageProblem (same as the
 * PATCH/DELETE APIs), not the loose local author || problems.edit check, or it
 * hands hidden test cases + referenceSolution to out-of-group problems.edit
 * holders even though the API refuses the save.
 */
describe("problem edit page strict gate (designer REG-2)", () => {
  const source = readFileSync(
    "src/app/(public)/problems/[id]/edit/page.tsx",
    "utf8",
  );

  it("routes canEdit through strict canManageProblem", () => {
    expect(source).toContain('import { canManageProblem } from "@/lib/auth/permissions"');
    expect(source).toMatch(
      /const canEdit = await canManageProblem\(problem\.id, session\.user\.id, session\.user\.role\)/,
    );
    // The old loose local check must be gone.
    expect(source).not.toMatch(/canEdit = problem\.authorId === session\.user\.id \|\| caps\.has\("problems\.edit"\)/);
  });
});
