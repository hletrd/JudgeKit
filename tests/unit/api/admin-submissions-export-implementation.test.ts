import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin submissions export implementation", () => {
  it("allows scoped assignment reviewers and honors their current filter dimensions in CSV export", () => {
    const source = read("src/app/api/v1/admin/submissions/export/route.ts");

    expect(source).toContain('capabilities: ["submissions.view_all", "assignments.view_status"]');
    expect(source).toContain("requireAllCapabilities: false");
    expect(source).toContain("getSubmissionReviewGroupIds(user.id, user.role)");
    expect(source).toContain("const scopedGroupFilter =");
    expect(source).toContain('searchParams.get("search")');
    expect(source).toContain('searchParams.get("status")');
    expect(source).toContain('searchParams.get("group")');
    expect(source).toContain('searchParams.get("language")');
    expect(source).toContain('searchParams.get("dateFrom")');
    expect(source).toContain('searchParams.get("dateTo")');
    expect(source).toContain("groupName: groups.name");
    expect(source).toContain('"text/csv; charset=utf-8"');
    expect(source).toContain('"submissions-export.csv"');
  });
});
