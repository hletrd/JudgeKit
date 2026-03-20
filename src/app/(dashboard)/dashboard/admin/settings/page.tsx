import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { DatabaseBackupRestore } from "./database-backup-restore";

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="general">{t("tabGeneral")}</TabsTrigger>
          <TabsTrigger value="security">{t("tabSecurity")}</TabsTrigger>
          <TabsTrigger value="submissions">{t("tabSubmissions")}</TabsTrigger>
          <TabsTrigger value="judge">{t("tabJudge")}</TabsTrigger>
          <TabsTrigger value="session">{t("tabSession")}</TabsTrigger>
          <TabsTrigger value="advanced">{t("tabAdvanced")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-4">
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
        </TabsContent>

        <TabsContent value="security" className="mt-4">
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
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
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
        </TabsContent>

        <TabsContent value="judge" className="mt-4">
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
        </TabsContent>

        <TabsContent value="session" className="mt-4">
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
        </TabsContent>

        <TabsContent value="advanced" className="mt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
