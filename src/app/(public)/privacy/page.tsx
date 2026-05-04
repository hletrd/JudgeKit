import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

const PAGE_PATH = "/privacy";

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, t, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("privacy"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  return buildPublicMetadata({
    title: t("title"),
    description: t("description"),
    path: PAGE_PATH,
    siteTitle: settings.siteTitle,
    locale,
  });
}

export default async function PrivacyPage() {
  const [t, locale] = await Promise.all([
    getTranslations("privacy"),
    getLocale(),
  ]);

  // IMPORTANT: These retention periods must be kept in sync with the system
  // settings in src/lib/data-retention.ts and the maintenance thresholds in
  // src/lib/data-retention-maintenance.ts. If an operator changes a retention
  // period in the admin settings, this page must be updated to match.
  const dataClasses = [
    { key: "auditLogs", retention: "90" },
    { key: "aiChatLogs", retention: "30" },
    { key: "antiCheatEvents", retention: "180" },
    { key: "recruitingInvitations", retention: "365" },
    { key: "submissions", retention: "365" },
  ] as const;

  return (
    <article className="prose dark:prose-invert mx-auto max-w-3xl">
      <h1 className={locale !== "ko" ? "tracking-tight" : ""}>{t("title")}</h1>
      <p className="lead">{t("description")}</p>

      <h2>{t("sectionDataClassesTitle")}</h2>
      <p>{t("sectionDataClassesIntro")}</p>
      <ul>
        {dataClasses.map((row) => (
          <li key={row.key}>
            <strong>{t(`dataClasses.${row.key}.label`)}</strong> —{" "}
            {t("retentionWindow", { days: row.retention })}.{" "}
            {t(`dataClasses.${row.key}.description`)}
          </li>
        ))}
      </ul>

      <h2>{t("sectionRightsTitle")}</h2>
      <p>{t("sectionRightsIntro")}</p>
      <ul>
        <li>{t("rights.access")}</li>
        <li>{t("rights.deletion")}</li>
        <li>{t("rights.objection")}</li>
      </ul>

      <h2>{t("sectionRequestsTitle")}</h2>
      <p>{t("sectionRequestsIntro")}</p>
      <p>
        <Link href={buildLocalePath("/dashboard/profile", locale)} className="underline">
          {t("openProfileForRequest")}
        </Link>
      </p>

      <h2>{t("sectionContactTitle")}</h2>
      <p>
        {t("sectionContactIntro")}{" "}
        <a className="underline" rel="nofollow" href="mailto:privacy@xylolabs.com">
          privacy@xylolabs.com
        </a>
      </p>

      <h2>{t("sectionAntiCheatTitle")}</h2>
      <p>{t("sectionAntiCheatIntro")}</p>
    </article>
  );
}
