import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("problem duplication implementation", () => {
  it("lets the create page open the problem form in duplication mode and links to it from edit", () => {
    const createPage = read("src/app/(public)/problems/create/page.tsx");
    const formSource = read("src/app/(public)/problems/create/create-problem-form.tsx");
    const editPage = read("src/app/(public)/problems/[id]/edit/page.tsx");

    expect(createPage).toContain("duplicateFrom");
    expect(createPage).toContain('mode={duplicateProblemData ? "duplicate" : "create"}');
    expect(createPage).toContain('t("duplicateTitle")');
    expect(createPage).toContain('t("duplicateDescription")');

    expect(formSource).toContain('mode?: "create" | "edit" | "duplicate"');
    expect(formSource).toContain('mode === "duplicate"');
    expect(formSource).toContain('t("duplicateSuccess")');
    expect(formSource).toContain('t("duplicateProblem")');

    expect(editPage).toContain('href={`/problems/create?duplicateFrom=${problem.id}`}');
    expect(editPage).toContain('t("duplicateProblem")');
  });

  it("gates duplication on the group-scoped canAccessProblem check (no cross-group test-case exfiltration)", () => {
    const createPage = read("src/app/(public)/problems/create/page.tsx");
    // Duplication clones the source problem's (possibly hidden) test cases, so it
    // MUST be gated on whether the user can actually access the source problem
    // (group-scoped), not on a broad capability that would let any view_all/edit
    // holder clone another group's private problem.
    expect(createPage).toContain("canAccessProblem(initialProblem.id, session.user.id, session.user.role)");
    expect(createPage).not.toContain('caps.has("problems.view_all")');
  });
});
