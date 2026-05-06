import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardJudgeSystemSection } from "@/app/(public)/dashboard/_components/dashboard-judge-system-section";
import { getAdminHealthSnapshot } from "@/lib/ops/admin-health";

type AdminDashboardProps = {
  capabilities: string[];
};

/**
 * High-frequency admin shortcuts shown directly on the dashboard.
 *
 * Per cycle-1 IA cleanup, the dashboard no longer renders the full
 * 11-item admin button wall — that surface lives at /dashboard/admin
 * (the canonical admin landing). Only a single primary CTA plus a
 * curated set of high-traffic shortcuts are surfaced here, gated by
 * capability.
 */
const QUICK_ADMIN_LINKS: { href: string; titleKey: string; capability: string }[] = [
  { href: "/dashboard/admin/users", titleKey: "userManagement", capability: "users.view" },
  { href: "/dashboard/admin/workers", titleKey: "judgeWorkers", capability: "system.settings" },
  { href: "/dashboard/admin/settings", titleKey: "systemSettings", capability: "system.settings" },
];

export async function AdminDashboard({ capabilities }: AdminDashboardProps) {
  const caps = new Set(capabilities);
  const canViewHealth = caps.has("system.settings");
  const [t, tNav, health] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("nav"),
    canViewHealth ? getAdminHealthSnapshot() : Promise.resolve(null),
  ]);

  const visibleQuickLinks = QUICK_ADMIN_LINKS.filter((link) => caps.has(link.capability));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>{t("adminQuickActions")}</CardTitle>
          <Link href="/dashboard/admin">
            <Button size="sm">
              {tNav("administration")}
              <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
            </Button>
          </Link>
        </CardHeader>
        {visibleQuickLinks.length > 0 ? (
          <CardContent className="flex flex-wrap gap-2">
            {visibleQuickLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button size="sm" variant="outline">{tNav(link.titleKey)}</Button>
              </Link>
            ))}
          </CardContent>
        ) : null}
      </Card>

      {canViewHealth && health ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t("systemHealthTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("systemHealthDescription")}</p>
            </div>
            <Badge variant={health.status === "ok" ? "default" : health.status === "degraded" ? "secondary" : "destructive"}>
              {health.status === "ok"
                ? t("healthStatusOk")
                : health.status === "degraded"
                  ? t("healthStatusDegraded")
                  : t("healthStatusError")}
            </Badge>
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

      {canViewHealth ? <DashboardJudgeSystemSection /> : null}
    </div>
  );
}
