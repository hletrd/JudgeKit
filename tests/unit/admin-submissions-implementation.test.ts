import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin submissions implementation", () => {
  it("supports a status filter and preserves it across sort/pagination links", () => {
    const source = read("src/app/(dashboard)/dashboard/admin/submissions/page.tsx");

    expect(source).toContain("STATUS_FILTER_VALUES");
    expect(source).toContain('name="status"');
    expect(source).toContain('eq(submissions.status, statusFilter)');
    expect(source).toContain('if (statusFilter !== "all") params.set("status", statusFilter);');
    expect(source).toContain('tSubmissions("statusFilter.all")');
  });
});
