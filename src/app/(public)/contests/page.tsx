import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicContestList } from "../_components/public-contest-list";
import { getPublicContests } from "@/lib/assignments/public-contests";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, tShell, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: tShell("contests.catalogTitle"),
    description: tShell("contests.catalogDescription"),
    path: "/contests",
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "programming contests",
      "competitive coding events",
      "online programming competitions",
    ],
    section: tShell("nav.contests"),
  });
}

export default async function PublicContestsPage() {
  const [t, locale] = await Promise.all([
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const statusLabels = {
    upcoming: t("contests.status.upcoming"),
    open: t("contests.status.open"),
    in_progress: t("contests.status.inProgress"),
    expired: t("contests.status.expired"),
    closed: t("contests.status.closed"),
  } as const;

  const contests = await getPublicContests();
  const contestsJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("contests.catalogTitle"),
    description: t("contests.catalogDescription"),
    url: buildAbsoluteUrl(buildLocalePath("/contests", locale)),
    inLanguage: locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: contests.map((contest, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: buildAbsoluteUrl(buildLocalePath(`/contests/${contest.id}`, locale)),
        name: contest.title,
      })),
    },
  };

  return (
    <>
      <JsonLd data={contestsJsonLd} />
      <PublicContestList
        title={t("contests.catalogTitle")}
        description={t("contests.catalogDescription")}
        noContestsLabel={t("contests.noContests")}
        openContestLabel={t("contests.openContest")}
        contests={contests.map((contest) => ({
          id: contest.id,
          title: contest.title,
          description: contest.description,
          groupName: contest.groupName,
          statusLabel: statusLabels[contest.status],
          problemCountLabel: t("contests.problemCount", { count: contest.problemCount }),
          publicProblemCountLabel: t("contests.publicProblemCount", { count: contest.publicProblemCount }),
          modeLabel: contest.examMode === "scheduled" ? t("contests.modeScheduled") : t("contests.modeWindowed"),
          scoringLabel: contest.scoringModel === "icpc" ? t("contests.scoringModelIcpc") : t("contests.scoringModelIoi"),
        }))}
      />
    </>
  );
}
