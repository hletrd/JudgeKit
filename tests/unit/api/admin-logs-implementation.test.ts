import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin log route capability guards", () => {
  it("uses system log capabilities instead of admin-only role checks", () => {
    const loginLogsRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/login-logs/route.ts"),
      "utf8"
    );
    const auditLogsRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/audit-logs/route.ts"),
      "utf8"
    );

    expect(loginLogsRoute).toContain('auth: { capabilities: ["system.login_logs"] }');
    expect(loginLogsRoute).not.toContain("isAdmin(user.role)");

    expect(auditLogsRoute).toContain('auth: { capabilities: ["system.audit_logs"] }');
    expect(auditLogsRoute).not.toContain("isAdmin(user.role)");
  });

  it("supports date range filters on both login-log surfaces", () => {
    const loginLogsRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/login-logs/route.ts"),
      "utf8"
    );
    const loginLogsPage = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/dashboard/admin/login-logs/page.tsx"),
      "utf8"
    );
    const auditLogsRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/audit-logs/route.ts"),
      "utf8"
    );
    const auditLogsPage = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx"),
      "utf8"
    );

    expect(loginLogsRoute).toContain('searchParams.get("dateFrom")');
    expect(loginLogsRoute).toContain('searchParams.get("dateTo")');
    expect(loginLogsRoute).toContain("gte(loginEvents.createdAt, fromDate)");
    expect(loginLogsRoute).toContain("lte(loginEvents.createdAt, endOfDay)");
    expect(loginLogsRoute).toContain('searchParams.get("format")');
    expect(loginLogsRoute).toContain('"text/csv; charset=utf-8"');

    expect(loginLogsPage).toContain('name="dateFrom"');
    expect(loginLogsPage).toContain('name="dateTo"');
    expect(loginLogsPage).toContain('t("filters.dateFromLabel")');
    expect(loginLogsPage).toContain('t("filters.dateToLabel")');
    expect(loginLogsPage).toContain('t("exportCsv")');
    expect(loginLogsPage).toContain("buildExportHref(");

    expect(auditLogsRoute).toContain('searchParams.get("action")');
    expect(auditLogsRoute).toContain('searchParams.get("dateFrom")');
    expect(auditLogsRoute).toContain('searchParams.get("dateTo")');
    expect(auditLogsRoute).toContain('searchParams.get("format")');
    expect(auditLogsRoute).toContain('"text/csv; charset=utf-8"');
    expect(auditLogsRoute).toContain("like(auditEvents.action");

    expect(auditLogsPage).toContain('t("exportCsv")');
    expect(auditLogsPage).toContain("buildExportHref(");
  });
});
