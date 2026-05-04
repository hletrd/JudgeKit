import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PublicContestDetail } from "@/app/(public)/_components/public-contest-detail";
import { formatDateLabel, getContestStatusBadgeVariant, getExamModeBadgeClass, getScoringModelBadgeClass, buildContestStatusLabels } from "@/app/(public)/_components/contest-status-styles";
import { ContestReplay } from "@/components/contest/contest-replay";
import { ContestStatistics } from "@/components/contest/contest-statistics";
import { ContestClarifications } from "@/components/contest/contest-clarifications";
import { LeaderboardTable } from "@/components/contest/leaderboard-table";
import { JsonLd } from "@/components/seo/json-ld";
import { AntiCheatMonitor } from "@/components/exam/anti-cheat-monitor";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import { StartExamButton } from "@/components/exam/start-exam-button";
import { AssignmentOverview } from "@/components/assignment/assignment-overview";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import {
  getPublicContestById,
  getEnrolledContestDetail,
  getUserContestAccess,
} from "@/lib/assignments/public-contests";
import { computeContestAnalytics } from "@/lib/assignments/contest-analytics";
import { computeContestReplay } from "@/lib/assignments/contest-replay";
import { computeLeaderboard } from "@/lib/assignments/leaderboard";
import { getStudentProblemStatuses } from "@/lib/assignments/submissions";

import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata, buildSocialImageUrl, NO_INDEX_METADATA, summarizeTextForMetadata } from "@/lib/seo";
import { getResolvedSystemSettings, getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatDifficulty, formatScore } from "@/lib/formatting";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getDbNow } from "@/lib/db-time";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submissions, problems } from "@/lib/db/schema";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [contest, t, tShell, tContest, locale] = await Promise.all([
    getPublicContestById(id),
    getTranslations("common"),
    getTranslations("publicShell"),
    getTranslations("contests"),
    getLocale(),
  ]);
  if (!contest) {
    return {
      title: tContest("metadataFallbackTitle"),
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
      tContest("keywords.programmingContest"),
      contest.groupName,
      contest.scoringModel === "icpc" ? tContest("keywords.icpcScoring") : tContest("keywords.ioiScoring"),
    ],
    section: tShell("nav.contests"),
    socialBadge: tShell(`contests.status.${contest.status === "in_progress" ? "inProgress" : contest.status}`),
    socialMeta: [
      contest.groupName,
      contest.examMode === "scheduled" ? tShell("contests.modeScheduled") : tShell("contests.modeWindowed"),
      contest.scoringModel === "icpc" ? tShell("contests.scoringModelIcpc") : tShell("contests.scoringModelIoi"),
    ].join(" • "),
    socialFooter: [
      tShell("contests.problemCount", { count: contest.problemCount }),
      tShell("contests.publicProblemCount", { count: contest.publicProblemCount }),
    ].join(" • "),
  });
}

export default async function PublicContestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, tCommon, tProblems, tContest, tSubmissions, tMySubmissions, tAssignment, tGroups, locale, session] = await Promise.all([
    getTranslations("publicShell"),
    getTranslations("common"),
    getTranslations("problems"),
    getTranslations("contests"),
    getTranslations("submissions"),
    getTranslations("contests.mySubmissions"),
    getTranslations("groups.assignmentDetail"),
    getTranslations("groups"),
    getLocale(),
    auth(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const statusLabels = buildContestStatusLabels({
    upcoming: t("contests.status.upcoming"),
    open: t("contests.status.open"),
    in_progress: t("contests.status.inProgress"),
    expired: t("contests.status.expired"),
    closed: t("contests.status.closed"),
  });

  // --- Auth-aware rendering ---
  // Check if the user is enrolled or can manage this contest
  let userAccess: "enrolled" | "managing" | null = null;
  let enrolledDetail: Awaited<ReturnType<typeof getEnrolledContestDetail>> = null;

  if (session?.user) {
    userAccess = await getUserContestAccess(id, session.user.id, session.user.role);
    if (userAccess === "enrolled") {
      enrolledDetail = await getEnrolledContestDetail(id, session.user.id, session.user.role);
    }
  }

  // --- Student participation view (enrolled) ---
  if (userAccess === "enrolled" && enrolledDetail && session?.user) {
    const contest = enrolledDetail;
    const recruitingAccess = await getRecruitingAccessContext(session.user.id);
    const isRecruitingCandidate = recruitingAccess.isRecruitingCandidate;
    const now = await getDbNow();

    const isUpcoming = contest.startsAt != null && new Date(contest.startsAt) > now;
    const isPast =
      (contest.lateDeadline != null && new Date(contest.lateDeadline) < now) ||
      (contest.lateDeadline == null && contest.deadline != null && new Date(contest.deadline) < now);

    const [studentProblemStatuses, mySubmissions, resolvedTimeZone] = await Promise.all([
      getStudentProblemStatuses(contest.id, session.user.id),
      db
        .select({
          id: submissions.id,
          status: submissions.status,
          score: submissions.score,
          submittedAt: submissions.submittedAt,
          executionTimeMs: submissions.executionTimeMs,
          memoryUsedKb: submissions.memoryUsedKb,
          problem: {
            id: problems.id,
            title: problems.title,
          },
        })
        .from(submissions)
        .leftJoin(problems, eq(submissions.problemId, problems.id))
        .where(
          and(
            eq(submissions.userId, session.user.id),
            eq(submissions.assignmentId, contest.id)
          )
        )
        .orderBy(desc(submissions.submittedAt))
        .limit(50),
      getResolvedSystemTimeZone(),
    ]);

    const statusLabelMap = buildStatusLabels(tSubmissions);

    const examSession = contest.examSession;

    const isExamExpired = contest.examMode === "windowed" && examSession != null
      && new Date(examSession.personalDeadline) < now;

    const sortedProblems = contest.problems.map((p, index) => ({
      id: p.id,
      sortOrder: p.sortOrder || index,
      points: p.points,
      problem: { id: p.id, title: p.title },
    }));
    const totalPoints = sortedProblems.reduce((sum, p) => sum + p.points, 0);

    const overviewLabels = {
      overviewTitle: tAssignment("overviewTitle"),
      problemsTitle: tAssignment("problemsTitle"),
      descriptionFallback: tAssignment("descriptionFallback"),
      lateDeadline: tAssignment("lateDeadline"),
      latePenalty: tAssignment("latePenalty"),
      points: tAssignment("points"),
      openProblem: tAssignment("openProblem"),
      noProblems: tAssignment("noProblems"),
      statusUpcoming: tGroups("statusUpcoming"),
      statusClosed: tGroups("statusClosed"),
      statusOpen: tGroups("statusOpen"),
      startsAt: tGroups("assignmentTable.startsAt"),
      deadline: tGroups("assignmentTable.deadline"),
      back: tCommon("back"),
      groupDetail: tGroups("detail"),
      action: tCommon("action"),
      assignments: tGroups("assignments"),
      problemCount: tGroups("problemCount", { count: sortedProblems.length }),
      titleColumn: tGroups("assignmentTable.title"),
      deadlineCountdown: tAssignment("deadlineCountdown"),
      lateDeadlineCountdown: tAssignment("lateDeadlineCountdown"),
      solved: tAssignment("solved"),
      attempted: tAssignment("attempted"),
      untried: tAssignment("untried"),
      examBadgeScheduled: tGroups("examBadgeScheduled"),
      examBadgeWindowed: tGroups("examBadgeWindowed", { duration: contest.examDurationMinutes ?? 0 }),
      examDuration: tAssignment("examDuration"),
    };

    return (
      <div className="space-y-6">
        <AntiCheatMonitor
          assignmentId={contest.id}
          enabled={Boolean(contest.enableAntiCheat)}
        />

        <Link
          href={buildLocalePath("/contests", locale)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {tCommon("back")}
        </Link>

        <div className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Badge variant={getContestStatusBadgeVariant(contest.status)} className="text-xs">
              {statusLabels[contest.status]}
            </Badge>
            <Badge className={getExamModeBadgeClass(contest.examMode)}>
              {contest.examMode === "scheduled" ? tContest("modeScheduled") : tContest("modeWindowed")}
            </Badge>
            <Badge className={getScoringModelBadgeClass(contest.scoringModel)}>
              {contest.scoringModel === "icpc" ? tContest("scoringModelIcpc") : tContest("scoringModelIoi")}
            </Badge>
            <Badge variant="outline">{tContest("group")}: {contest.groupName}</Badge>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl truncate">{contest.title}</h2>
        </div>

        {contest.enableAntiCheat && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {tContest("antiCheat.participantNoticeTitle")}
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              {tContest("antiCheat.participantNoticeBody")}
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {tContest("antiCheat.signalsDisclaimer")}
            </p>
          </div>
        )}

        {isUpcoming && (
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <p className="text-muted-foreground">{tContest("contestNotStarted")}</p>
              {contest.startsAt && (
                <div className="flex justify-center">
                  <CountdownTimer
                    deadline={new Date(contest.startsAt).getTime()}
                    label={tContest("startsIn")}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isUpcoming && !isPast && contest.examMode === "scheduled" && contest.deadline && (
          <CountdownTimer deadline={new Date(contest.deadline).getTime()} label={tGroups("examTimeRemaining")} />
        )}

        {!isUpcoming && !isPast && contest.examMode === "windowed" && !examSession && (
          <div className="rounded-lg border p-6 text-center space-y-4">
            <p className="text-muted-foreground">{tGroups("examNotStarted")}</p>
            <StartExamButton
              groupId={contest.groupId}
              assignmentId={contest.id}
              durationMinutes={contest.examDurationMinutes ?? 0}
            />
          </div>
        )}

        {!isUpcoming && contest.examMode === "windowed" && examSession && (
          <CountdownTimer
            deadline={new Date(examSession.personalDeadline).getTime()}
            label={tGroups("examTimeRemaining")}
          />
        )}

        {isExamExpired && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center space-y-2 dark:border-red-900 dark:bg-red-950">
            <p className="font-medium text-red-600 dark:text-red-400">{tGroups("examTimeExpired")}</p>
          </div>
        )}

        {isPast && !isExamExpired && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">{tContest("contestClosed")}</p>
            </CardContent>
          </Card>
        )}

        {!isUpcoming && (contest.examMode !== "windowed" || (examSession && !isExamExpired)) && (
          <>
            <AssignmentOverview
              assignment={{
                id: contest.id,
                title: contest.title,
                description: contest.description,
                startsAt: contest.startsAt,
                deadline: contest.deadline,
                lateDeadline: contest.lateDeadline,
                latePenalty: null,
                group: { name: contest.groupName },
                examMode: contest.examMode,
                examDurationMinutes: contest.examDurationMinutes,
              }}
              sortedProblems={sortedProblems}
              totalPoints={totalPoints}
              isUpcoming={isUpcoming}
              isPast={isPast}
              groupId={contest.groupId}
              locale={locale}
              timeZone={resolvedTimeZone}
              labels={overviewLabels}
              problemStatuses={studentProblemStatuses}
              backHref={buildLocalePath(`/contests/${contest.id}`, locale)}
              problemHrefPrefix="/practice/problems/"
            />
            <ContestClarifications
              assignmentId={contest.id}
              currentUserId={session.user.id}
              problems={sortedProblems.map((p) => ({
                id: p.problem?.id ?? p.id,
                title: p.problem?.title ?? "",
              }))}
            />
            {!isRecruitingCandidate && (
              <LeaderboardTable assignmentId={contest.id} currentUserId={session.user.id} />
            )}

            {/* My Submissions */}
            <Card>
              <CardHeader>
                <CardTitle>{tMySubmissions("title")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {mySubmissions.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {tMySubmissions("noSubmissions")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-6">{tMySubmissions("problem")}</TableHead>
                          <TableHead>{tMySubmissions("status")}</TableHead>
                          <TableHead>{tMySubmissions("score")}</TableHead>
                          <TableHead>{tMySubmissions("submittedAt")}</TableHead>
                          <TableHead className="pr-6">{tMySubmissions("action")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mySubmissions.map((sub) => (
                          <TableRow key={sub.id}>
                            <TableCell className="pl-6">
                              {sub.problem?.title ? (
                                <Link
                                  href={buildLocalePath(`/practice/problems/${sub.problem.id}?assignmentId=${contest.id}`, locale)}
                                  className="text-primary hover:underline"
                                >
                                  {sub.problem.title}
                                </Link>
                              ) : (
                                tCommon("unknown")
                              )}
                            </TableCell>
                            <TableCell>
                              <SubmissionStatusBadge
                                status={sub.status}
                                label={statusLabelMap[sub.status as keyof typeof statusLabelMap] ?? sub.status ?? ""}
                                executionTimeMs={sub.executionTimeMs}
                                memoryUsedKb={sub.memoryUsedKb}
                                score={sub.score}
                                locale={locale}
                              />
                            </TableCell>
                            <TableCell>{formatScore(sub.score, locale)}</TableCell>
                            <TableCell>
                              {sub.submittedAt
                                ? formatDateTimeInTimeZone(sub.submittedAt, locale, resolvedTimeZone)
                                : "-"}
                            </TableCell>
                            <TableCell className="pr-6">
                              <Link href={buildLocalePath(`/submissions/${sub.id}`, locale)}>
                                <Button variant="outline" size="sm">{tCommon("view")}</Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // --- Public view (not logged in, not enrolled, or instructor with manage link ---
  const contest = await getPublicContestById(id);
  if (!contest) {
    // Not a public contest and user is not enrolled — check if managing
    if (userAccess === "managing" && session?.user) {
      return (
        <div className="space-y-6">
          <Link
            href={buildLocalePath("/contests", locale)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {tCommon("back")}
          </Link>
          <div className="rounded-lg border p-6 text-center space-y-4">
            <p className="text-muted-foreground">{t("contests.privateContestNotice")}</p>
            <Link href={buildLocalePath(`/dashboard/contests/${id}`, locale)}>
              <Button>{t("contests.manageContest")}</Button>
            </Link>
          </div>
        </div>
      );
    }
    notFound();
  }

  const showArchiveInsights = contest.status === "expired" || contest.status === "closed";
  const [analytics, leaderboard, replay] = showArchiveInsights
    ? await Promise.all([
        computeContestAnalytics(contest.id),
        computeLeaderboard(contest.id, true),
        computeContestReplay(contest.id),
      ])
    : [null, null, null];
  const solveRateByProblem = new Map(
    analytics?.problemSolveRates.map((problem) => [problem.problemId, problem]) ?? []
  );
  const socialImageUrl = buildSocialImageUrl({
    title: contest.title,
    description: summarizeTextForMetadata(contest.description),
    locale,
    siteTitle: settings.siteTitle,
    section: t("nav.contests"),
    badge: statusLabels[contest.status],
    meta: [
      contest.groupName,
      contest.examMode === "scheduled" ? t("contests.modeScheduled") : t("contests.modeWindowed"),
      contest.scoringModel === "icpc" ? t("contests.scoringModelIcpc") : t("contests.scoringModelIoi"),
    ].join(" • "),
    footer: [
      t("contests.problemCount", { count: contest.problemCount }),
      t("contests.publicProblemCount", { count: contest.publicProblemCount }),
    ].join(" • "),
  });

  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: contest.title,
    description: summarizeTextForMetadata(contest.description),
    url: buildAbsoluteUrl(buildLocalePath(`/contests/${contest.id}`, locale)),
    inLanguage: locale,
    image: [socialImageUrl],
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: (() => {
      switch (contest.status) {
        case "upcoming":
          return "https://schema.org/EventScheduled";
        case "open":
        case "in_progress":
          return "https://schema.org/EventInProgress";
        case "expired":
        case "closed":
          return "https://schema.org/EventCompleted";
      }
    })(),
    location: {
      "@type": "VirtualLocation",
      url: buildAbsoluteUrl(buildLocalePath(`/contests/${contest.id}`, locale)),
    },
    isAccessibleForFree: true,
    organizer: {
      "@type": "Organization",
      name: contest.groupName,
    },
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
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

      {/* Instructor: show manage button at the top */}
      {userAccess === "managing" && (
        <div className="mb-4 flex justify-end">
          <Link href={buildLocalePath(`/dashboard/contests/${contest.id}`, locale)}>
            <Button>{t("contests.manageContest")}</Button>
          </Link>
        </div>
      )}

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
        difficultyLabel={tProblems("table.difficulty")}
        solverCountLabel={t("practice.solverCount")}
        successRateLabel={t("practice.successRate")}
        actionLabel={t("contests.openContest")}
        publicProblems={contest.publicProblems.map((problem) => ({
          id: problem.id,
          title: problem.title,
          href: buildLocalePath(`/practice/problems/${problem.id}`, locale),
          difficultyLabel: problem.difficulty != null
            ? formatDifficulty(problem.difficulty, locale)
            : null,
          solverCount: solveRateByProblem.get(problem.id)?.solved ?? null,
          successRateLabel: solveRateByProblem.has(problem.id)
            ? `${solveRateByProblem.get(problem.id)?.solvedPercent ?? 0}%`
            : null,
        }))}
        finalRankingsTitle={showArchiveInsights ? tContest("leaderboard.title") : null}
        noFinalRankingsLabel={showArchiveInsights ? tContest("leaderboard.noEntries") : null}
        rankLabel={showArchiveInsights ? tContest("leaderboard.rank") : null}
        nameLabel={showArchiveInsights ? tContest("leaderboard.name") : null}
        totalScoreLabel={showArchiveInsights ? tContest("leaderboard.totalScore") : null}
        penaltyLabel={showArchiveInsights && contest.scoringModel === "icpc" ? tContest("leaderboard.penalty") : null}
        finalRankings={(leaderboard?.entries ?? []).slice(0, 10).map((entry) => ({
          userId: entry.userId,
          name: entry.name || entry.username,
          rank: entry.rank,
          totalScoreLabel: contest.scoringModel === "icpc"
            ? `${entry.totalScore}`
            : `${formatScore(entry.totalScore, locale)}`,
          penaltyLabel: contest.scoringModel === "icpc" ? `${entry.totalPenalty}` : null,
        }))}
        signInHref={buildLocalePath(
          `/login?callbackUrl=${encodeURIComponent(buildLocalePath(`/contests/${contest.id}`, locale))}`,
          locale,
        )}
        signInLabel={t("contests.signInToJoin")}
        dashboardHref={buildLocalePath("/dashboard", locale)}
        dashboardLabel={t("contests.openDashboard")}
        overviewLabel={tContest("tabs.overview")}
      />

      {showArchiveInsights && replay ? (
        <ContestReplay
          title={tContest("replay.title")}
          description={tContest("replay.description")}
          noDataLabel={tContest("replay.noData")}
          timelineLabel={tContest("replay.timeline")}
          playLabel={tContest("replay.play")}
          pauseLabel={tContest("replay.pause")}
          speedLabel={tContest("replay.speed")}
          rankLabel={tContest("leaderboard.rank")}
          nameLabel={tContest("leaderboard.name")}
          totalScoreLabel={tContest("leaderboard.totalScore")}
          penaltyLabel={contest.scoringModel === "icpc" ? tContest("leaderboard.penalty") : null}
          snapshots={replay.snapshots.map((snapshot) => ({
            label: contest.startsAt
              ? tContest("replay.elapsed", {
                  value: `${Math.floor((snapshot.cutoffMs - contest.startsAt.getTime()) / 60_000)}m`,
                })
              : new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(snapshot.cutoffMs),
            entries: snapshot.entries.map((entry) => ({
              userId: entry.userId,
              name: entry.name,
              rank: entry.rank,
              totalScoreLabel: contest.scoringModel === "icpc"
                ? `${entry.totalScore}`
                : `${formatScore(entry.totalScore, locale)}`,
              penaltyLabel: contest.scoringModel === "icpc" ? `${entry.totalPenalty}` : null,
            })),
          }))}
        />
      ) : null}

      {showArchiveInsights && analytics ? (
        <ContestStatistics
          title={tContest("analytics.title")}
          scoreDistributionTitle={tContest("analytics.scoreDistribution")}
          solveRatesTitle={tContest("analytics.solveRates")}
          noDataLabel={tContest("analytics.noData")}
          studentsLabel={tContest("analytics.students")}
          countLabel={tContest("analytics.count")}
          percentageLabel={tContest("analytics.percentage")}
          solvedLabel={tContest("analytics.solved")}
          partialLabel={tContest("analytics.partial")}
          zeroLabel={tContest("analytics.zero")}
          scoreDistribution={analytics.scoreDistribution}
          problemSolveRates={analytics.problemSolveRates}
        />
      ) : null}

      {/* Virtual Practice for expired/closed contests */}
      {(contest.status === "expired" || contest.status === "closed") && contest.publicProblems.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold">{t("contests.virtualPractice")}</h2>
          <p className="text-sm text-muted-foreground">{t("contests.virtualPracticeDescription")}</p>
          <div className="space-y-2">
            {contest.publicProblems.map((problem, index) => (
              <Link
                key={problem.id}
                href={buildLocalePath(`/practice/problems/${problem.id}?assignmentId=${contest.id}`, locale)}
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
