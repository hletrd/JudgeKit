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
    expect(source).toContain('name="language"');
    expect(source).toContain('eq(submissions.language, languageFilter)');
    expect(source).toContain('if (languageFilter) params.set("language", languageFilter);');
    expect(source).toContain('tSubmissions("allLanguages")');
    expect(source).toContain('name="dateFrom"');
    expect(source).toContain('name="dateTo"');
    expect(source).toContain('gte(submissions.submittedAt, new Date(dateFrom))');
    expect(source).toContain('lte(submissions.submittedAt, endOfDay)');
    expect(source).toContain('if (dateFrom) params.set("dateFrom", dateFrom);');
    expect(source).toContain('if (dateTo) params.set("dateTo", dateTo);');
    expect(source).toContain('t("dateFromLabel")');
    expect(source).toContain('t("dateToLabel")');
    expect(source).toContain('buildExportHref()');
    expect(source).toContain('t("exportCsv")');
    expect(source).toContain("AdminSubmissionsBulkRejudge");
    expect(source).toContain("canBulkRejudge");
  });
});
