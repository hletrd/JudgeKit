import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin submissions export implementation", () => {
  it("uses submissions.view_all capability auth and honors current filter dimensions in CSV export", () => {
    const source = read("src/app/api/v1/admin/submissions/export/route.ts");

    expect(source).toContain('auth: { capabilities: ["submissions.view_all"] }');
    expect(source).toContain('searchParams.get("search")');
    expect(source).toContain('searchParams.get("status")');
    expect(source).toContain('searchParams.get("language")');
    expect(source).toContain('searchParams.get("dateFrom")');
    expect(source).toContain('searchParams.get("dateTo")');
    expect(source).toContain('"text/csv; charset=utf-8"');
    expect(source).toContain('"submissions-export.csv"');
  });
});
