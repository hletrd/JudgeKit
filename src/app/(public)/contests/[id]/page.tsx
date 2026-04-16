import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicContestDetail } from "@/app/(public)/_components/public-contest-detail";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicContestById } from "@/lib/assignments/public-contests";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata, NO_INDEX_METADATA, summarizeTextForMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import Link from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [contest, t, tShell, locale] = await Promise.all([
    getPublicContestById(id),
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  if (!contest) {
    return {
      title: "Contest",
      ...NO_INDEX_METADATA,
    };
  }

  const settings = await getResolvedSystemSettings({
    siteTitle: t("appName"),
    siteDescription: t("appDescription"),
  });

  return buildPublicMetadata({
    title: contest.title,
    description: summarizeTextForMetadata(contest.description),
    path: `/contests/${id}`,
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "programming contest",
      contest.groupName,
    ],
    section: tShell("nav.contests"),
    socialBadge: contest.examMode === "scheduled" ? tShell("contests.modeScheduled") : tShell("contests.modeWindowed"),
    socialMeta: contest.groupName,
  });
}

function formatDateLabel(value: Date | null, fallback: string, locale: string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value) : fallback;
}

export default async function PublicContestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, tCommon, tProblems, session, locale] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("common"),
    getTranslations("problems"),
    auth(),
    getLocale(),
  ]);
  const statusLabels = {
    upcoming: t("contests.status.upcoming"),
    open: t("contests.status.open"),
    in_progress: t("contests.status.inProgress"),
    expired: t("contests.status.expired"),
    closed: t("contests.status.closed"),
  } as const;

  const contest = await getPublicContestById(id);
  if (!contest) {
    notFound();
  }

  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: contest.title,
    description: summarizeTextForMetadata(contest.description),
    url: buildAbsoluteUrl(buildLocalePath(`/contests/${contest.id}`, locale)),
    inLanguage: locale,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    organizer: {
      "@type": "Organization",
      name: contest.groupName,
    },
    startDate: contest.startsAt?.toISOString(),
    endDate: contest.deadline?.toISOString(),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: tCommon("appName"),
        item: buildAbsoluteUrl(buildLocalePath("/", locale)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: t("nav.contests"),
        item: buildAbsoluteUrl(buildLocalePath("/contests", locale)),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: contest.title,
        item: buildAbsoluteUrl(buildLocalePath(`/contests/${contest.id}`, locale)),
      },
    ],
  };

  return (
    <>
      <JsonLd data={[eventJsonLd, breadcrumbJsonLd]} />
      <PublicContestDetail
        backHref={buildLocalePath("/contests", locale)}
        backLabel={tCommon("back")}
        title={contest.title}
        description={contest.description}
        groupLabel={t("contests.hostedBy", { name: contest.groupName })}
        statusLabel={statusLabels[contest.status]}
        modeLabel={contest.examMode === "scheduled" ? t("contests.modeScheduled") : t("contests.modeWindowed")}
        scoringLabel={contest.scoringModel === "icpc" ? t("contests.scoringModelIcpc") : t("contests.scoringModelIoi")}
        startsAtLabel={t("contests.startsAt", { value: formatDateLabel(contest.startsAt, t("contests.notScheduled"), locale) })}
        deadlineLabel={t("contests.deadline", { value: formatDateLabel(contest.deadline, t("contests.noDeadline"), locale) })}
        problemCountLabel={t("contests.problemCount", { count: contest.problemCount })}
        publicProblemCountLabel={t("contests.publicProblemCount", { count: contest.publicProblemCount })}
        publicProblemsTitle={t("contests.publicProblemsTitle")}
        noPublicProblemsLabel={t("contests.noPublicProblems")}
        problemTitleLabel={tProblems("table.title")}
        actionLabel={t("contests.openContest")}
        publicProblems={contest.publicProblems.map((problem) => ({
          ...problem,
          href: buildLocalePath(`/practice/problems/${problem.id}`, locale),
        }))}
        signInHref={buildLocalePath(
          `/login?callbackUrl=${encodeURIComponent(buildLocalePath(`/dashboard/contests/${contest.id}`, locale))}`,
          locale,
        )}
        signInLabel={t("contests.signInToJoin")}
        workspaceHref={buildLocalePath("/workspace", locale)}
        workspaceLabel={t("contests.openWorkspace")}
      />

      {/* Virtual Practice for expired/closed contests */}
      {(contest.status === "expired" || contest.status === "closed") && contest.publicProblems.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold">{t("contests.virtualPractice")}</h2>
          <p className="text-sm text-muted-foreground">{t("contests.virtualPracticeDescription")}</p>
          <div className="space-y-2">
            {contest.publicProblems.map((problem, index) => (
              <Link
                key={problem.id}
                href={buildLocalePath(`/practice/problems/${problem.id}`, locale)}
                className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent transition-colors"
              >
                <span className="font-mono text-muted-foreground">{index + 1}.</span>
                <span className="font-medium">{problem.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
