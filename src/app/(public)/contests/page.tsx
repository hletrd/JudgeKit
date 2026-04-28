import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicContestList } from "../_components/public-contest-list";
import { getContestStatusBorderClass, getContestStatusBadgeVariant, formatDateLabel } from "../_components/contest-status-styles";
import { getPublicContests } from "@/lib/assignments/public-contests";
import { getContestsForUser } from "@/lib/assignments/contests";
import { getContestStatus } from "@/lib/assignments/contests";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { Button } from "@/components/ui/button";
import { KeyRound, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import { getDbNow } from "@/lib/db-time";
import Link from "next/link";

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
  const [t, tContests, locale, session] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("contests"),
    getLocale(),
    auth(),
  ]);
  const caps = session?.user ? await resolveCapabilities(session.user.role) : null;
  const canCreateContest = caps?.has("contests.create") ?? false;
  const isAuthenticated = Boolean(session?.user);
  const statusLabels = {
    upcoming: t("contests.status.upcoming"),
    open: t("contests.status.open"),
    in_progress: t("contests.status.inProgress"),
    expired: t("contests.status.expired"),
    closed: t("contests.status.closed"),
  } as const;

  // Fetch user's enrolled contests when authenticated
  const now = await getDbNow();
  const [myContestsRaw, contests] = await Promise.all([
    isAuthenticated && session?.user
      ? getContestsForUser(session.user.id, session.user.role)
      : Promise.resolve([]),
    getPublicContests(),
  ]);
  const myContests = myContestsRaw.map((c) => ({
    ...c,
    status: getContestStatus(c, now),
  }));
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
      {(isAuthenticated || canCreateContest) && (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {canCreateContest && (
            <Link href={buildLocalePath("/dashboard/contests/create", locale)}>
              <Button>
                <Plus className="mr-1 size-4" />
                {tContests("createContest")}
              </Button>
            </Link>
          )}
          {isAuthenticated && (
            <Link href={buildLocalePath("/contests/join", locale)}>
              <Button variant="outline">
                <KeyRound className="mr-1 size-4" />
                {tContests("joinWithCode")}
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* My Contests section for authenticated users */}
      {myContests.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-bold">{t("contests.myContestsTitle")}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {myContests.map((contest) => (
              <Link key={contest.id} href={buildLocalePath(`/contests/${contest.id}`, locale)} className="block">
                <div className={`flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 ${getContestStatusBorderClass(contest.status)}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{contest.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      <span>{contest.groupName}</span>
                      <span>·</span>
                      <span>{tContests("problems")}: {contest.problemCount}</span>
                      {contest.startsAt && (
                        <>
                          <span>·</span>
                          <span>{formatDateLabel(contest.startsAt, t("contests.notScheduled"), locale)}</span>
                        </>
                      )}
                      {contest.deadline && (contest.status === "open" || contest.status === "in_progress") && (
                        <>
                          <span>·</span>
                          <CountdownTimer
                            deadline={new Date(contest.personalDeadline ?? contest.deadline).getTime()}
                            label={tContests("endsIn")}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={getContestStatusBadgeVariant(contest.status)} className="text-xs">
                      {statusLabels[contest.status]}
                    </Badge>
                    <Badge className={`text-xs ${contest.examMode === "scheduled" ? "bg-blue-500 text-white dark:bg-blue-600 dark:text-white" : "bg-purple-500 text-white dark:bg-purple-600 dark:text-white"}`}>
                      {contest.examMode === "scheduled" ? tContests("modeScheduled") : tContests("modeWindowed")}
                    </Badge>
                    <Badge className={`text-xs ${contest.scoringModel === "ioi" ? "bg-teal-500 text-white dark:bg-teal-600 dark:text-white" : "bg-orange-500 text-white dark:bg-orange-600 dark:text-white"}`}>
                      {contest.scoringModel === "ioi" ? tContests("scoringModelIoi") : tContests("scoringModelIcpc")}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <PublicContestList
        title={t("contests.catalogTitle")}
        description={t("contests.catalogDescription")}
        noContestsLabel={t("contests.noContests")}
        archiveTitle={t("contests.archiveTitle")}
        locale={locale}
        contests={contests.map((contest) => ({
          id: contest.id,
          href: buildLocalePath(`/contests/${contest.id}`, locale),
          title: contest.title,
          description: contest.description,
          groupName: contest.groupName,
          statusLabel: statusLabels[contest.status],
          statusKey: contest.status,
          problemCountLabel: t("contests.problemCount", { count: contest.problemCount }),
          publicProblemCountLabel: t("contests.publicProblemCount", { count: contest.publicProblemCount }),
          modeLabel: contest.examMode === "scheduled" ? tContests("modeScheduled") : tContests("modeWindowed"),
          modeKey: contest.examMode === "scheduled" ? "scheduled" : "windowed",
          scoringLabel: contest.scoringModel === "icpc" ? tContests("scoringModelIcpc") : tContests("scoringModelIoi"),
          scoringKey: contest.scoringModel === "icpc" ? "icpc" : "ioi",
          archiveGroupLabel: contest.startsAt
            ? String(contest.startsAt.getFullYear())
            : t("contests.archiveUndated"),
          startsAtLabel: t("contests.startsAt", {
            value: formatDateLabel(contest.startsAt, t("contests.notScheduled"), locale),
          }),
          deadlineLabel: t("contests.deadline", {
            value: formatDateLabel(contest.deadline, t("contests.noDeadline"), locale),
          }),
        }))}
      />
    </>
  );
}
