import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("instructor dashboard implementation", () => {
  it("surfaces quick links for the most common instructor workflows", () => {
    const source = read("src/app/(public)/dashboard/_components/instructor-dashboard.tsx");

    expect(source).toContain('CardTitle>{t("instructorQuickActions")}');
    expect(source).toContain("const canAccessProblemSets =");
    expect(source).toContain('caps.has("problem_sets.edit")');
    expect(source).toContain('href="/groups"');
    expect(source).toContain('href="/contests/manage"');
    expect(source).toContain('href="/dashboard/admin/submissions"');
    expect(source).toContain('href="/problem-sets"');
    expect(source).toContain("{canAccessProblemSets ? (");
  });
});
