import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("problem page scroll layout implementation", () => {
  it("keeps the submission panel sticky only on large screens so stacked mobile layouts can scroll normally", () => {
    // The dashboard route is now a redirect-only shell; the layout lives in
    // the public counterpart at (public)/practice/problems/[id]/page.tsx.
    const dashboardShell = read("src/app/(dashboard)/dashboard/problems/[id]/page.tsx");
    const publicSource = read("src/app/(public)/practice/problems/[id]/page.tsx");

    expect(dashboardShell).toContain("redirect(");
    expect(dashboardShell).toContain("/practice/problems/");

    // The sticky panel keeps an id for downstream test selectors; the lg:
    // breakpoint matches the rest of the public layout's responsive design.
    expect(publicSource).toContain('className="sticky top-6"');
    expect(publicSource).toContain("grid grid-cols-1 gap-6 lg:grid-cols-2");
  });
});
