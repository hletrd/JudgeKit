import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin dashboard implementation", () => {
  it("surfaces only the quick links the actor can actually access", () => {
    const source = read("src/app/(public)/dashboard/_components/admin-dashboard.tsx");
    const dashboardPage = read("src/app/(public)/dashboard/page.tsx");

    expect(source).toContain("const caps = new Set(capabilities);");
    expect(source).toContain('const canViewHealth = caps.has("system.settings");');
    expect(source).toContain('caps.has("system.settings")');
    expect(source).toContain('caps.has("users.view")');
    expect(source).toContain('caps.has("users.manage_roles")');
    expect(source).toContain('caps.has("system.audit_logs")');
    expect(source).toContain('caps.has("system.login_logs")');
    expect(source).toContain('caps.has("system.chat_logs")');
    expect(source).toContain('caps.has("files.manage")');
    expect(source).toContain('caps.has("system.plugins")');
    expect(source).toContain('CardTitle>{t("adminQuickActions")}');
    expect(source).toContain('href="/dashboard/admin/workers"');
    expect(source).toContain('href="/dashboard/admin/languages"');
    expect(source).toContain('href="/dashboard/admin/users"');
    expect(source).toContain('href="/dashboard/admin/roles"');
    expect(source).toContain('href="/dashboard/admin/audit-logs"');
    expect(source).toContain('href="/dashboard/admin/login-logs"');
    expect(source).toContain('href="/dashboard/admin/plugins/chat-logs"');
    expect(source).toContain('href="/dashboard/admin/files"');
    expect(source).toContain('href="/dashboard/admin/plugins"');
    expect(source).toContain('href="/dashboard/admin/api-keys"');
    expect(source).toContain('href="/dashboard/admin/tags"');
    expect(source).toContain('href="/dashboard/admin/settings"');
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
