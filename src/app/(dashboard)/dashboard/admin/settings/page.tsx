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
import { HomePageContentForm } from "./home-page-content-form";
import { FooterContentForm } from "./footer-content-form";
import { DatabaseBackupRestore } from "./database-backup-restore";
import { DatabaseInfo } from "./database-info";
import { SettingsTabs } from "./settings-tabs";
import { getAuthUrlObject, normalizeHostForComparison } from "@/lib/security/env";
import { pool } from "@/lib/db";
import { countTablesQuery } from "@/lib/db/queries";

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

async function getDbInfo() {
  if (!pool) throw new Error("PostgreSQL pool not available");

  const [tableCountResult, sizeResult, versionResult] = await Promise.all([
    pool.query(countTablesQuery()),
    pool.query("SELECT pg_database_size(current_database()) AS size"),
    pool.query("SELECT version() AS version"),
  ]);

  const tableCount = Number(tableCountResult.rows[0]?.count ?? 0);
  const sizeBytes = Number(sizeResult.rows[0]?.size ?? 0);
  const fullVersion = (versionResult.rows[0]?.version as string) ?? "unknown";
  const version = fullVersion.split(" ").slice(0, 2).join(" ");

  const dbUrl = process.env.DATABASE_URL ?? "";
  // Mask everything except host:port — hide username, password, and database name
  const maskedUrl = (() => {
    try {
      const u = new URL(dbUrl);
      return `${u.protocol}//***:***@${u.host}/***`;
    } catch {
      return "***";
    }
  })();

  return {
    dialect: "postgresql" as const,
    path: maskedUrl,
    sizeBytes,
    version,
    tableCount,
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
  const initialAiAssistantEnabled =
    typeof stored?.aiAssistantEnabled === "boolean" ? stored.aiAssistantEnabled : true;
  const initialPublicSignupEnabled =
    typeof stored?.publicSignupEnabled === "boolean" ? stored.publicSignupEnabled : false;
  const initialSignupHcaptchaEnabled =
    typeof stored?.signupHcaptchaEnabled === "boolean" ? stored.signupHcaptchaEnabled : false;
  const initialHcaptchaSiteKey = (stored?.hcaptchaSiteKey as string) ?? "";
  const initialHcaptchaSecretMasked = (stored?.hcaptchaSecret as string) ? "••••••••" : "";
  const dbInfo = await getDbInfo();

  type LocaleOverride = {
    eyebrow?: string;
    title?: string;
    description?: string;
    cards?: {
      practice?: { title?: string; description?: string };
      playground?: { title?: string; description?: string };
      contests?: { title?: string; description?: string };
      community?: { title?: string; description?: string };
    };
  };
  const initialHomePageContent = (stored?.homePageContent as Record<string, LocaleOverride> | undefined) ?? null;

  type FooterLocaleContent = {
    copyrightText?: string;
    links?: { label: string; url: string }[];
  };
  const initialFooterContent = (stored?.footerContent as Record<string, FooterLocaleContent> | undefined) ?? null;

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
                initialSiteIconUrl={(stored?.siteIconUrl as string) ?? ""}
                initialTimeZone={storedSettings?.timeZone ?? ""}
                initialPlatformMode={storedSettings?.platformMode ?? "homework"}
                initialDefaultLanguage={(stored?.defaultLanguage as string) ?? ""}
                initialDefaultLocale={(stored?.defaultLocale as string) ?? ""}
                defaultSiteTitle={tCommon("appName")}
                defaultSiteDescription={tCommon("appDescription")}
                defaultTimeZone={DEFAULT_SYSTEM_TIME_ZONE}
                currentSiteTitle={resolvedSettings.siteTitle}
                currentSiteDescription={resolvedSettings.siteDescription}
                currentTimeZone={resolvedSettings.timeZone}
                currentPlatformMode={resolvedSettings.platformMode}
                initialAiAssistantEnabled={initialAiAssistantEnabled}
                initialPublicSignupEnabled={initialPublicSignupEnabled}
                initialSignupHcaptchaEnabled={initialSignupHcaptchaEnabled}
                initialHcaptchaSiteKey={initialHcaptchaSiteKey}
                initialHcaptchaSecretMasked={initialHcaptchaSecretMasked}
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
    {
      value: "homepage",
      label: t("tabHomepage"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("homepageCardTitle")}</CardTitle>
            <CardDescription>{t("homepageCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <HomePageContentForm
              initialContent={initialHomePageContent}
              defaultContent={{
                en: {
                  eyebrow: "Online judge platform",
                  title: "Write code. Submit. Get judged.",
                  description: "JudgeKit is a modern online judge for programming practice, contests, and coursework. Solve problems, compete in contests, and track your progress.",
                  cards: {
                    practice: { title: "Practice", description: "Solve problems and sharpen your algorithm skills at your own pace." },
                    playground: { title: "Playground", description: "Write and run code instantly — no sign-in required." },
                    contests: { title: "Contests", description: "Browse and join upcoming programming competitions." },
                    community: { title: "Community", description: "Ask questions, share tips, and discuss with other users." },
                  },
                },
                ko: {
                  eyebrow: "온라인 저지 플랫폼",
                  title: "코드를 작성하고, 제출하고, 채점받으세요.",
                  description: "JudgeKit은 프로그래밍 연습, 대회, 과제를 위한 최신 온라인 저지 플랫폼입니다. 문제를 풀고, 대회에 참가하고, 성장 과정을 추적하세요.",
                  cards: {
                    practice: { title: "연습", description: "원하는 속도로 문제를 풀고 알고리즘 실력을 키우세요." },
                    playground: { title: "플레이그라운드", description: "로그인 없이 코드를 작성하고 바로 실행하세요." },
                    contests: { title: "대회", description: "진행 중인 프로그래밍 대회를 탐색하고 참여하세요." },
                    community: { title: "커뮤니티", description: "질문하고, 팁을 공유하고, 다른 사용자와 소통하세요." },
                  },
                },
              }}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      value: "footer",
      label: t("tabFooter"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("footerCardTitle")}</CardTitle>
            <CardDescription>{t("footerCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FooterContentForm initialContent={initialFooterContent} />
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
