import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardJudgeSystemSection } from "@/app/(dashboard)/dashboard/_components/dashboard-judge-system-section";
import { getAdminHealthSnapshot } from "@/lib/ops/admin-health";

type AdminDashboardProps = {
  capabilities: string[];
};

export async function AdminDashboard({ capabilities }: AdminDashboardProps) {
  const [t, tNav, health] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("nav"),
    getAdminHealthSnapshot(),
  ]);
  const caps = new Set(capabilities);
  const canViewHealth = caps.has("system.settings");

  const healthVariant =
    health.status === "ok" ? "default" : health.status === "degraded" ? "secondary" : "destructive";
  const healthLabel =
    health.status === "ok"
      ? t("healthStatusOk")
      : health.status === "degraded"
        ? t("healthStatusDegraded")
        : t("healthStatusError");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("adminQuickActions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {caps.has("system.settings") ? (
            <>
              <Link href="/dashboard/admin/workers">
                <Button size="sm" variant="outline">{tNav("judgeWorkers")}</Button>
              </Link>
              <Link href="/dashboard/admin/languages">
                <Button size="sm" variant="outline">{tNav("languages")}</Button>
              </Link>
            </>
          ) : null}
          {caps.has("users.view") ? (
            <Link href="/dashboard/admin/users">
              <Button size="sm" variant="outline">{tNav("userManagement")}</Button>
            </Link>
          ) : null}
          {caps.has("system.audit_logs") ? (
            <Link href="/dashboard/admin/audit-logs">
              <Button size="sm" variant="outline">{tNav("auditLogs")}</Button>
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {canViewHealth ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t("systemHealthTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("systemHealthDescription")}</p>
            </div>
            <Badge variant={healthVariant}>{healthLabel}</Badge>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("databaseStatusTitle")}</p>
              <p className="text-2xl font-semibold">
                {health.checks.database === "ok" ? t("healthStatusOk") : t("healthStatusError")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("auditPipelineStatusTitle")}</p>
              <p className="text-2xl font-semibold">
                {health.checks.auditEvents === "ok" ? t("healthStatusOk") : t("healthStatusDegraded")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("submissionQueueStatusTitle")}</p>
              <p className="text-2xl font-semibold">
                {t("queueUsageValue", {
                  pending: health.submissionQueue.pending,
                  limit: health.submissionQueue.limit,
                })}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("workerFleetStatusTitle")}</p>
              <p className="text-2xl font-semibold">
                {t("workerFleetValue", {
                  online: health.judgeWorkers.online,
                  stale: health.judgeWorkers.stale,
                  offline: health.judgeWorkers.offline,
                })}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("uptimeStatusTitle")}</p>
              <p className="text-2xl font-semibold">
                {t("uptimeValue", { seconds: health.uptimeSeconds })}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("responseTimeStatusTitle")}</p>
              <p className="text-2xl font-semibold">
                {t("responseTimeValue", { ms: health.responseTimeMs })}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DashboardJudgeSystemSection />
    </div>
  );
}
