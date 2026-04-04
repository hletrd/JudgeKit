import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import {
  DEFAULT_SYSTEM_TIME_ZONE,
  getResolvedSystemSettings,
  getSystemSettings,
} from "@/lib/system-settings";
import { SETTING_DEFAULTS } from "@/lib/system-settings-config";
import type { ConfiguredSettings } from "@/lib/system-settings-config";
import { SystemSettingsForm } from "./system-settings-form";
import { ConfigSettingsForm } from "./config-settings-form";
import { AllowedHostsForm } from "./allowed-hosts-form";
import { DatabaseBackupRestore } from "./database-backup-restore";
import { DatabaseInfo } from "./database-info";
import { SettingsTabs } from "./settings-tabs";
import { getAuthUrlObject, normalizeHostForComparison } from "@/lib/security/env";
import { sqlite } from "@/lib/db";
import fs from "fs";
import path from "path";

const SECURITY_FIELDS: { key: keyof ConfiguredSettings }[] = [
  { key: "loginRateLimitMaxAttempts" },
  { key: "loginRateLimitWindowMs" },
  { key: "loginRateLimitBlockMs" },
  { key: "apiRateLimitMax" },
  { key: "apiRateLimitWindowMs" },
];

const SUBMISSION_FIELDS: { key: keyof ConfiguredSettings }[] = [
  { key: "submissionRateLimitMaxPerMinute" },
  { key: "submissionMaxPending" },
  { key: "submissionGlobalQueueLimit" },
  { key: "maxSourceCodeSizeBytes" },
];

const JUDGE_FIELDS: { key: keyof ConfiguredSettings }[] = [
  { key: "defaultTimeLimitMs" },
  { key: "defaultMemoryLimitMb" },
  { key: "compilerTimeLimitMs" },
  { key: "staleClaimTimeoutMs" },
];

const SESSION_FIELDS: { key: keyof ConfiguredSettings }[] = [
  { key: "sessionMaxAgeSeconds" },
  { key: "minPasswordLength" },
];

const ADVANCED_FIELDS: { key: keyof ConfiguredSettings }[] = [
  { key: "defaultPageSize" },
  { key: "maxSseConnectionsPerUser" },
  { key: "ssePollIntervalMs" },
  { key: "sseTimeoutMs" },
];

const UPLOAD_FIELDS: { key: keyof ConfiguredSettings }[] = [
  { key: "uploadMaxImageSizeBytes" },
  { key: "uploadMaxFileSizeBytes" },
  { key: "uploadMaxImageDimension" },
];

function extractInitialValues(
  storedSettings: Record<string, unknown> | undefined,
  fields: { key: keyof ConfiguredSettings }[]
): Partial<Record<keyof ConfiguredSettings, number | null>> {
  const result: Partial<Record<keyof ConfiguredSettings, number | null>> = {};
  if (!storedSettings) return result;
  for (const f of fields) {
    const val = storedSettings[f.key];
    result[f.key] = typeof val === "number" ? val : null;
  }
  return result;
}

function getDbInfo() {
  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "judge.db");

  let sizeBytes = 0;
  let walSizeBytes = 0;
  try {
    sizeBytes = fs.statSync(dbPath).size;
  } catch { /* */ }
  try {
    walSizeBytes = fs.statSync(dbPath + "-wal").size;
  } catch { /* */ }

  const journalMode = (sqlite.pragma("journal_mode", { simple: true }) as string) ?? "unknown";
  const foreignKeys = (sqlite.pragma("foreign_keys", { simple: true }) as number) === 1;
  const busyTimeout = (sqlite.pragma("busy_timeout", { simple: true }) as number) ?? 0;
  const pageSize = (sqlite.pragma("page_size", { simple: true }) as number) ?? 0;
  const pageCount = (sqlite.pragma("page_count", { simple: true }) as number) ?? 0;
  const tableCount = (sqlite.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get() as { c: number })?.c ?? 0;

  return {
    path: dbPath,
    sizeBytes,
    walSizeBytes,
    journalMode,
    foreignKeys,
    busyTimeout,
    tableCount,
    pageSize,
    pageCount,
  };
}

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) redirect("/dashboard");

  const t = await getTranslations("admin.settings");
  const tCommon = await getTranslations("common");
  const resolvedSettings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const storedSettings = await getSystemSettings();
  const stored = storedSettings as Record<string, unknown> | undefined;
  const dbInfo = getDbInfo();

  const authUrlObj = getAuthUrlObject();
  const authUrlHost = authUrlObj ? normalizeHostForComparison(authUrlObj.host) : null;

  let initialAllowedHosts: string[] = [];
  try {
    const raw = stored?.allowedHosts;
    if (typeof raw === "string" && raw.length > 0) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        initialAllowedHosts = parsed.filter((h: unknown) => typeof h === "string" && h.length > 0);
      }
    }
  } catch { /* ignore parse errors */ }

  const tabs = [
    {
      value: "general",
      label: t("tabGeneral"),
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("siteCardTitle")}</CardTitle>
              <CardDescription>{t("siteCardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <SystemSettingsForm
                initialSiteTitle={storedSettings?.siteTitle ?? ""}
                initialSiteDescription={storedSettings?.siteDescription ?? ""}
                initialTimeZone={storedSettings?.timeZone ?? ""}
                defaultSiteTitle={tCommon("appName")}
                defaultSiteDescription={tCommon("appDescription")}
                defaultTimeZone={DEFAULT_SYSTEM_TIME_ZONE}
                currentSiteTitle={resolvedSettings.siteTitle}
                currentSiteDescription={resolvedSettings.siteDescription}
                currentTimeZone={resolvedSettings.timeZone}
                initialAiAssistantEnabled={'aiAssistantEnabled' in (storedSettings ?? {}) ? (storedSettings as any).aiAssistantEnabled ?? true : true}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("backupTitle")}</CardTitle>
              <CardDescription>{t("backupDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <DatabaseBackupRestore isSuperAdmin={caps.has("system.backup")} />
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      value: "security",
      label: t("tabSecurity"),
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("allowedHostsCardTitle")}</CardTitle>
              <CardDescription>{t("allowedHostsCardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AllowedHostsForm
                initialHosts={initialAllowedHosts}
                authUrlHost={authUrlHost}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("securityCardTitle")}</CardTitle>
              <CardDescription>{t("securityCardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigSettingsForm
                fields={SECURITY_FIELDS}
                initialValues={extractInitialValues(stored, SECURITY_FIELDS)}
                defaults={SETTING_DEFAULTS}
              />
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      value: "submissions",
      label: t("tabSubmissions"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("submissionsCardTitle")}</CardTitle>
            <CardDescription>{t("submissionsCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigSettingsForm
              fields={SUBMISSION_FIELDS}
              initialValues={extractInitialValues(stored, SUBMISSION_FIELDS)}
              defaults={SETTING_DEFAULTS}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      value: "judge",
      label: t("tabJudge"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("judgeCardTitle")}</CardTitle>
            <CardDescription>{t("judgeCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigSettingsForm
              fields={JUDGE_FIELDS}
              initialValues={extractInitialValues(stored, JUDGE_FIELDS)}
              defaults={SETTING_DEFAULTS}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      value: "session",
      label: t("tabSession"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("sessionCardTitle")}</CardTitle>
            <CardDescription>{t("sessionCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigSettingsForm
              fields={SESSION_FIELDS}
              initialValues={extractInitialValues(stored, SESSION_FIELDS)}
              defaults={SETTING_DEFAULTS}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      value: "advanced",
      label: t("tabAdvanced"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("advancedCardTitle")}</CardTitle>
            <CardDescription>{t("advancedCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigSettingsForm
              fields={ADVANCED_FIELDS}
              initialValues={extractInitialValues(stored, ADVANCED_FIELDS)}
              defaults={SETTING_DEFAULTS}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      value: "uploads",
      label: t("tabUploads"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("uploadsCardTitle")}</CardTitle>
            <CardDescription>{t("uploadsCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigSettingsForm
              fields={UPLOAD_FIELDS}
              initialValues={extractInitialValues(stored, UPLOAD_FIELDS)}
              defaults={SETTING_DEFAULTS}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      value: "database",
      label: t("tabDatabase"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("databaseCardTitle")}</CardTitle>
            <CardDescription>{t("databaseCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DatabaseInfo dbInfo={dbInfo} />
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SettingsTabs tabs={tabs} />
    </div>
  );
}
