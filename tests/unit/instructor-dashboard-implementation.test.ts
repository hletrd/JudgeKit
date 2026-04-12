import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("instructor dashboard implementation", () => {
  it("surfaces quick links for the most common instructor workflows", () => {
    const source = read("src/app/(dashboard)/dashboard/_components/instructor-dashboard.tsx");

    expect(source).toContain('CardTitle>{t("instructorQuickActions")}');
    expect(source).toContain('href="/dashboard/groups"');
    expect(source).toContain('href="/dashboard/contests"');
    expect(source).toContain('href="/dashboard/submissions"');
    expect(source).toContain('href="/dashboard/problem-sets"');
  });
});
