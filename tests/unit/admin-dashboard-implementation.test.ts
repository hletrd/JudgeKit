import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin dashboard implementation", () => {
  it("surfaces only the quick links the actor can actually access", () => {
    // Per cycle-1 IA cleanup, the dashboard no longer renders the full 11-item
    // admin chip wall — that surface lives at /dashboard/admin (the canonical
    // admin landing). The dashboard now renders a single 'Administration →'
    // CTA plus a curated set of high-frequency shortcuts gated by capability.
    // This test asserts the new contract: capability-gated shortcuts + CTA to
    // the canonical admin landing.
    const source = read("src/app/(public)/dashboard/_components/admin-dashboard.tsx");
    const dashboardPage = read("src/app/(public)/dashboard/page.tsx");

    expect(source).toContain("const caps = new Set(capabilities);");
    expect(source).toContain('const canViewHealth = caps.has("system.settings");');
    // Primary CTA → admin landing.
    expect(source).toContain('href="/dashboard/admin"');
    expect(source).toContain('tNav("administration")');
    expect(source).toContain('CardTitle>{t("adminShortcuts")}');
    // Curated high-frequency shortcuts — capability-gated by way of the
    // single source of truth in src/lib/navigation/admin-nav.ts.
    expect(source).toContain('findAdminNavItem');
    expect(source).toContain('"/dashboard/admin/users"');
    expect(source).toContain('"/dashboard/admin/workers"');
    expect(source).toContain('"/dashboard/admin/settings"');
    // Empty-state guard.
    expect(source).toContain("visibleQuickLinks.length > 0");
    // Caps still derived from server-passed capability list.
    expect(source).toContain("const caps = new Set(capabilities);");
    expect(dashboardPage).toContain("<AdminDashboard capabilities={capabilityList} />");
  });

  it("renders the system health snapshot only for roles with system.settings", () => {
    const source = read("src/app/(public)/dashboard/_components/admin-dashboard.tsx");
    const dashboardPage = read("src/app/(public)/dashboard/page.tsx");

    expect(source).toContain('canViewHealth ? getAdminHealthSnapshot() : Promise.resolve(null)');
    expect(source).toContain("{canViewHealth && health ? (");
    expect(source).toContain('CardTitle>{t("systemHealthTitle")}');
    expect(source).toContain('t("databaseStatusTitle")');
    expect(source).toContain('t("auditPipelineStatusTitle")');
    expect(source).toContain('t("submissionQueueStatusTitle")');
    expect(source).toContain('t("workerFleetStatusTitle")');
    expect(source).toContain('t("uptimeStatusTitle")');
    expect(source).toContain('t("responseTimeStatusTitle")');
    expect(source).toContain('{canViewHealth ? <DashboardJudgeSystemSection /> : null}');
    expect(dashboardPage).toContain("const hasAdminWorkspace =");
    expect(dashboardPage).toContain('caps.has("users.view")');
    expect(dashboardPage).toContain('caps.has("system.audit_logs")');
    expect(dashboardPage).toContain('const isAdminView = hasAdminWorkspace;');
    expect(dashboardPage).toContain('const isCandidateView = platformMode === "recruiting" && !canReviewAssignments && !hasAdminWorkspace;');
  });
});
