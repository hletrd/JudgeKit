import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("public quick submit implementation", () => {
  it("uses the shared problem submission form and routes new submissions to the public detail page", () => {
    const source = read("src/components/problem/public-quick-submit.tsx");

    expect(source).toContain("ProblemSubmissionForm");
    expect(source).toContain('router.push(`/submissions/${submissionId}?from=problem`)');
    expect(source).toContain("setOpen(false)");
  });

  it("switches between a dialog and a bottom sheet based on the mobile breakpoint", () => {
    const source = read("src/components/problem/public-quick-submit.tsx");

    expect(source).toContain("useIsMobile");
    expect(source).toContain("<Sheet");
    expect(source).toContain("<Dialog");
  });
  it("supports an inline workspace mode that renders the shared submission form without dialog chrome", () => {
    const source = read("src/components/problem/public-quick-submit.tsx");

    expect(source).toContain('layout?: "dialog" | "inline"');
    expect(source).toContain('if (layout === "inline")');
    expect(source).toContain("return form;");
  });

});
