import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  enrollments,
  examSessions,
  languageConfigs,
  problemGroupAccess,
  problems,
  submissions,
} from "@/lib/db/schema";
import { getTranslations } from "next-intl/server";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getLocale } from "next-intl/server";
import { getEffectivePlatformMode } from "@/lib/platform-mode-context";

type CandidateDashboardProps = {
  userId: string;
  role: string;
  assignmentIds: string[];
};

type AssignmentProgressSummary = {
  assignmentId: string;
  title: string;
  deadline: Date | null;
  problemCount: number;
  attemptedCount: number;
  solvedCount: number;
  resultsVisible: boolean;
  bestScore: number;
  maxScore: number;
};

type AssignmentProblemProgressItem = {
  assignmentId: string;
  problemId: string;
  title: string;
  sortOrder: number | null;
  progress: "solved" | "attempted" | "untried";
};

type CandidateAssignmentState = "active" | "complete" | "closed";

export async function CandidateDashboard({
  userId,
  role,
  assignmentIds,
}: CandidateDashboardProps) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  // Determine accessible problem count at the database level instead of fetching all problems
  const caps = await resolveCapabilities(role);
  const canViewAll = caps.has("problems.view_all");
  const restrictToAssignmentIds = assignmentIds.length > 0;
  const assignmentSubmissionFilter = restrictToAssignmentIds
    ? inArray(submissions.assignmentId, assignmentIds)
    : undefined;

  const isRecruitingMode = (await getEffectivePlatformMode({ userId })) === "recruiting";

  const [
    accessibleProblemCount,
    submissionCountRows,
    enabledLanguagesRows,
    recentSubmissions,
    assignmentRows,
    attemptedProblemCountRows,
    solvedProblemCountRows,
    assignmentProblemCountRows,
    assignmentAttemptedRows,
    assignmentSolvedRows,
    assignmentProblemRows,
    assignmentSubmissionRows,
  ] = await Promise.all([
    canViewAll
      ? db.select({ count: sql<number>`count(*)` }).from(problems).then((r) => Number(r[0]?.count ?? 0))
      : restrictToAssignmentIds
        ? db
            .select({ count: sql<number>`count(distinct ${assignmentProblems.problemId})` })
            .from(assignmentProblems)
            .where(inArray(assignmentProblems.assignmentId, assignmentIds))
            .then((r) => Number(r[0]?.count ?? 0))
      : (async () => {
          if (isRecruitingMode) {
            // In recruiting mode: count only problems assigned to the user's enrolled contests
            const count = await db.execute(sql`
              SELECT count(DISTINCT ap.problem_id) AS count
              FROM assignment_problems ap
              INNER JOIN assignments a ON a.id = ap.assignment_id
              INNER JOIN enrollments e ON e.group_id = a.group_id AND e.user_id = ${userId}
              WHERE a.exam_mode != 'none'
            `).then((r) => Number(r.rows[0]?.count ?? 0));
            return count;
          }

          // Non-recruiting: count public + group-accessible + authored problems
          const userGroupIds = await db
            .select({ groupId: enrollments.groupId })
            .from(enrollments)
            .where(eq(enrollments.userId, userId))
            .then((rows) => rows.map((r) => r.groupId));

          if (userGroupIds.length === 0) {
            return db
              .select({ count: sql<number>`count(*)` })
              .from(problems)
              .where(eq(problems.visibility, "public"))
              .then((r) => Number(r[0]?.count ?? 0));
          }

          // Use parameterized Drizzle queries instead of sql.raw() to prevent injection
          const groupAccessible = await db
            .select({ problemId: problemGroupAccess.problemId })
            .from(problemGroupAccess)
            .where(inArray(problemGroupAccess.groupId, userGroupIds));

          const accessibleIds = new Set<string>();
          const publicRows = await db
            .select({ id: problems.id })
            .from(problems)
            .where(eq(problems.visibility, "public"));
          for (const r of publicRows) accessibleIds.add(r.id);
          for (const r of groupAccessible) accessibleIds.add(r.problemId);
          const authoredRows = await db
            .select({ id: problems.id })
            .from(problems)
            .where(eq(problems.authorId, userId));
          for (const r of authoredRows) accessibleIds.add(r.id);

          return accessibleIds.size;
        })(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(
        assignmentSubmissionFilter
          ? and(eq(submissions.userId, userId), assignmentSubmissionFilter)
          : eq(submissions.userId, userId)
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(languageConfigs)
      .where(eq(languageConfigs.isEnabled, true)),
    db
      .select({
        id: submissions.id,
        status: submissions.status,
        submittedAt: submissions.submittedAt,
        score: submissions.score,
        problemTitle: problems.title,
      })
      .from(submissions)
      .leftJoin(problems, eq(submissions.problemId, problems.id))
      .where(
        assignmentSubmissionFilter
          ? and(eq(submissions.userId, userId), assignmentSubmissionFilter)
          : eq(submissions.userId, userId)
      )
      .orderBy(desc(submissions.submittedAt))
      .limit(5),
    restrictToAssignmentIds
      ? db
          .select({
            assignmentId: assignments.id,
            title: assignments.title,
            deadline: sql<Date | null>`coalesce(${examSessions.personalDeadline}, ${assignments.deadline})`,
            showResultsToCandidate: assignments.showResultsToCandidate,
            hideScoresFromCandidates: assignments.hideScoresFromCandidates,
          })
          .from(assignments)
          .leftJoin(
            examSessions,
            and(eq(examSessions.assignmentId, assignments.id), eq(examSessions.userId, userId))
          )
          .where(inArray(assignments.id, assignmentIds))
      : Promise.resolve(
          [] as Array<{
            assignmentId: string;
            title: string;
            deadline: Date | null;
            showResultsToCandidate: boolean;
            hideScoresFromCandidates: boolean;
          }>
        ),
    restrictToAssignmentIds
      ? db
          .select({ count: sql<number>`count(distinct ${submissions.problemId})` })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              inArray(submissions.assignmentId, assignmentIds)
            )
          )
      : Promise.resolve([] as Array<{ count: number }>),
    restrictToAssignmentIds
      ? db
          .select({ count: sql<number>`count(distinct ${submissions.problemId})` })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              inArray(submissions.assignmentId, assignmentIds),
              eq(submissions.status, "accepted")
            )
          )
      : Promise.resolve([] as Array<{ count: number }>),
    restrictToAssignmentIds
      ? db
          .select({
            assignmentId: assignmentProblems.assignmentId,
            count: sql<number>`count(distinct ${assignmentProblems.problemId})`,
          })
          .from(assignmentProblems)
          .where(inArray(assignmentProblems.assignmentId, assignmentIds))
          .groupBy(assignmentProblems.assignmentId)
      : Promise.resolve([] as Array<{ assignmentId: string; count: number }>),
    restrictToAssignmentIds
      ? db
          .select({
            assignmentId: submissions.assignmentId,
            count: sql<number>`count(distinct ${submissions.problemId})`,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              inArray(submissions.assignmentId, assignmentIds)
            )
          )
          .groupBy(submissions.assignmentId)
      : Promise.resolve([] as Array<{ assignmentId: string | null; count: number }>),
    restrictToAssignmentIds
      ? db
          .select({
            assignmentId: submissions.assignmentId,
            count: sql<number>`count(distinct ${submissions.problemId})`,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              inArray(submissions.assignmentId, assignmentIds),
              eq(submissions.status, "accepted")
            )
          )
          .groupBy(submissions.assignmentId)
      : Promise.resolve([] as Array<{ assignmentId: string | null; count: number }>),
    restrictToAssignmentIds
      ? db
          .select({
            assignmentId: assignmentProblems.assignmentId,
            problemId: assignmentProblems.problemId,
            title: problems.title,
            sortOrder: assignmentProblems.sortOrder,
            points: assignmentProblems.points,
          })
          .from(assignmentProblems)
          .innerJoin(problems, eq(problems.id, assignmentProblems.problemId))
          .where(inArray(assignmentProblems.assignmentId, assignmentIds))
      : Promise.resolve(
          [] as Array<{
            assignmentId: string;
            problemId: string;
            title: string;
            sortOrder: number | null;
            points: number;
          }>
        ),
    restrictToAssignmentIds
      ? db
          .select({
            assignmentId: submissions.assignmentId,
            problemId: submissions.problemId,
            status: submissions.status,
            score: submissions.score,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              inArray(submissions.assignmentId, assignmentIds)
            )
          )
      : Promise.resolve(
          [] as Array<{
            assignmentId: string | null;
            problemId: string;
            status: string | null;
            score: number | null;
          }>
        ),
  ]);

  const totalAttempts = Number(submissionCountRows[0]?.count ?? 0);
  const enabledLanguages = Number(enabledLanguagesRows[0]?.count ?? 0);
  const attemptedProblemCount = Number(attemptedProblemCountRows[0]?.count ?? 0);
  const solvedProblemCount = Number(solvedProblemCountRows[0]?.count ?? 0);
  const assignmentProblemCountMap = new Map(
    assignmentProblemCountRows.map((row) => [row.assignmentId, Number(row.count ?? 0)])
  );
  const assignmentAttemptedCountMap = new Map(
    assignmentAttemptedRows
      .filter((row) => row.assignmentId)
      .map((row) => [row.assignmentId as string, Number(row.count ?? 0)])
  );
  const assignmentSolvedCountMap = new Map(
    assignmentSolvedRows
      .filter((row) => row.assignmentId)
      .map((row) => [row.assignmentId as string, Number(row.count ?? 0)])
  );
  const assignmentMaxScoreMap = new Map<string, number>();
  for (const row of assignmentProblemRows) {
    assignmentMaxScoreMap.set(
      row.assignmentId,
      (assignmentMaxScoreMap.get(row.assignmentId) ?? 0) + Number(row.points ?? 0)
    );
  }
  const assignmentBestProblemScoreMap = new Map<string, number>();
  const submissionStatusMap = new Map<string, Set<string>>();
  for (const row of assignmentSubmissionRows) {
    if (!row.assignmentId) continue;
    const key = `${row.assignmentId}:${row.problemId}`;
    const statuses = submissionStatusMap.get(key) ?? new Set<string>();
    if (row.status) statuses.add(row.status);
    submissionStatusMap.set(key, statuses);
    const currentBest = assignmentBestProblemScoreMap.get(key) ?? 0;
    assignmentBestProblemScoreMap.set(key, Math.max(currentBest, Number(row.score ?? 0)));
  }
  const assignmentBestScoreMap = new Map<string, number>();
  for (const [key, score] of assignmentBestProblemScoreMap) {
    const assignmentId = key.split(":")[0] ?? "";
    assignmentBestScoreMap.set(assignmentId, (assignmentBestScoreMap.get(assignmentId) ?? 0) + score);
  }
  const assignmentProgress: AssignmentProgressSummary[] = assignmentRows.map((assignment) => ({
    assignmentId: assignment.assignmentId,
    title: assignment.title,
    deadline: assignment.deadline ? new Date(assignment.deadline) : null,
    problemCount: assignmentProblemCountMap.get(assignment.assignmentId) ?? 0,
    attemptedCount: assignmentAttemptedCountMap.get(assignment.assignmentId) ?? 0,
    solvedCount: assignmentSolvedCountMap.get(assignment.assignmentId) ?? 0,
    resultsVisible: Boolean(assignment.showResultsToCandidate) && !Boolean(assignment.hideScoresFromCandidates),
    bestScore: assignmentBestScoreMap.get(assignment.assignmentId) ?? 0,
    maxScore: assignmentMaxScoreMap.get(assignment.assignmentId) ?? 0,
  }));
  const assignmentProblemProgressMap = new Map<string, AssignmentProblemProgressItem[]>();
  for (const row of assignmentProblemRows) {
    const key = `${row.assignmentId}:${row.problemId}`;
    const statuses = submissionStatusMap.get(key);
    const progress: AssignmentProblemProgressItem["progress"] =
      !statuses || statuses.size === 0
        ? "untried"
        : statuses.has("accepted")
          ? "solved"
          : "attempted";
    const items = assignmentProblemProgressMap.get(row.assignmentId) ?? [];
    items.push({
      assignmentId: row.assignmentId,
      problemId: row.problemId,
      title: row.title,
      sortOrder: row.sortOrder,
      progress,
    });
    assignmentProblemProgressMap.set(row.assignmentId, items);
  }
  const nextDeadline = assignmentProgress
    .map((assignment) => assignment.deadline)
    .filter((deadline): deadline is Date => Boolean(deadline && deadline.getTime() > Date.now()))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const assignmentStateMap = new Map<string, CandidateAssignmentState>();
  for (const assignment of assignmentProgress) {
    const isClosed = Boolean(assignment.deadline && assignment.deadline.getTime() <= Date.now());
    const isComplete = assignment.problemCount > 0 && assignment.attemptedCount >= assignment.problemCount;
    assignmentStateMap.set(
      assignment.assignmentId,
      isClosed ? "closed" : isComplete ? "complete" : "active"
    );
  }
  const closedAssignmentCount = [...assignmentStateMap.values()].filter(
    (state) => state === "closed"
  ).length;
  const completeAssignmentCount = [...assignmentStateMap.values()].filter(
    (state) => state === "complete"
  ).length;
  const resultsSummaryMessage =
    assignmentProgress.length > 0 && closedAssignmentCount === assignmentProgress.length
      ? t("candidateResultsReady")
      : t("candidateResultsPending");
  const visibleScoreAssignments = assignmentProgress.filter((assignment) => assignment.resultsVisible);
  const aggregateVisibleScore = visibleScoreAssignments.reduce(
    (sum, assignment) => sum + assignment.bestScore,
    0
  );
  const aggregateVisibleMaxScore = visibleScoreAssignments.reduce(
    (sum, assignment) => sum + assignment.maxScore,
    0
  );
  const hiddenScoreAssignmentCount = assignmentProgress.length - visibleScoreAssignments.length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t("candidateOverviewTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("candidateOverviewDescription")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("availableChallenges")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{accessibleProblemCount}</div>
            <Link href="/dashboard/problems" className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
              {t("viewChallenges")}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("solvedChallenges")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{solvedProblemCount}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("candidateProgressSummary", {
                solved: solvedProblemCount,
                attempted: attemptedProblemCount,
                total: accessibleProblemCount,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("totalAttempts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{totalAttempts}</div>
            <Link href="/dashboard/submissions" className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
              {t("viewAttempts")}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("candidateTimeRemaining")}</CardTitle>
          </CardHeader>
          <CardContent>
            {nextDeadline ? (
              <div className="space-y-2">
                <CountdownTimer deadline={nextDeadline.getTime()} />
                <p className="text-xs text-muted-foreground">
                  {formatDateTimeInTimeZone(nextDeadline, locale, settings.timeZone)}
                </p>
              </div>
            ) : (
              <>
                <div className="text-3xl font-semibold">{enabledLanguages}</div>
                <p className="mt-2 text-xs text-muted-foreground">{t("timeRemainingUnavailable")}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {assignmentProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("candidateResultsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleScoreAssignments.length > 0 ? (
              <div className="text-2xl font-semibold">
                {t("candidateScoreSummaryValue", {
                  score: aggregateVisibleScore,
                  total: aggregateVisibleMaxScore,
                })}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {t("candidateResultsAssignments", { count: assignmentProgress.length })}
              </Badge>
              <Badge variant="outline">
                {t("candidateResultsCompletedAssignments", {
                  count: completeAssignmentCount + closedAssignmentCount,
                })}
              </Badge>
              <Badge variant="outline">
                {t("candidateResultsClosedAssignments", { count: closedAssignmentCount })}
              </Badge>
              {visibleScoreAssignments.length > 0 ? (
                <Badge variant="outline">
                  {t("candidateScoreVisibleAssignments", {
                    count: visibleScoreAssignments.length,
                  })}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{resultsSummaryMessage}</p>
            {hiddenScoreAssignmentCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("candidateScoreHiddenAssignments", { count: hiddenScoreAssignmentCount })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {assignmentProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("candidateProgressTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignmentProgress.map((assignment) => {
              const remainingCount = Math.max(
                assignment.problemCount - assignment.attemptedCount,
                0
              );

              return (
                <div key={assignment.assignmentId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{assignment.title}</div>
                      {assignment.deadline && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("deadlineInfo", {
                            date: formatDateTimeInTimeZone(
                              assignment.deadline,
                              locale,
                              settings.timeZone
                            ),
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">
                        {assignmentStateMap.get(assignment.assignmentId) === "closed"
                          ? t("candidateAssignmentClosed")
                          : assignmentStateMap.get(assignment.assignmentId) === "complete"
                            ? t("candidateAssignmentComplete")
                            : t("candidateAssignmentActive")}
                      </Badge>
                      <Link href={`/dashboard/contests/${assignment.assignmentId}`}>
                        <Badge variant="secondary">{t("viewChallengeProgress")}</Badge>
                      </Link>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {t("candidateProgressSolved", { count: assignment.solvedCount })}
                    </Badge>
                    <Badge variant="outline">
                      {t("candidateProgressAttempted", {
                        count: Math.max(assignment.attemptedCount - assignment.solvedCount, 0),
                      })}
                    </Badge>
                    <Badge variant="outline">
                      {t("candidateProgressRemaining", { count: remainingCount })}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {assignment.resultsVisible
                      ? t("candidateAssignmentScore", {
                          score: assignment.bestScore,
                          total: assignment.maxScore,
                        })
                      : t("candidateAssignmentResultsHidden")}
                  </div>
                  {assignmentProblemProgressMap.get(assignment.assignmentId)?.length ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t("candidateProblemBreakdownTitle")}
                      </div>
                      <div className="grid gap-2">
                        {(assignmentProblemProgressMap.get(assignment.assignmentId) ?? [])
                          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                          .map((problem) => (
                            <div
                              key={problem.problemId}
                              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                            >
                              <span className="text-sm">{problem.title}</span>
                              <Badge variant="outline">
                                {problem.progress === "solved"
                                  ? t("candidateProblemSolved")
                                  : problem.progress === "attempted"
                                    ? t("candidateProblemAttempted")
                                    : t("candidateProblemUntried")}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("recentAttempts")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRecentAttempts")}</p>
          ) : (
            recentSubmissions.map((submission) => (
              <div key={submission.id} className="rounded-lg border p-3">
                <div className="font-medium">{submission.problemTitle ?? tCommon("unknown")}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{submission.status ?? tCommon("unknown")}</Badge>
                  <span>{formatDateTimeInTimeZone(submission.submittedAt, locale, settings.timeZone)}</span>
                  <span>·</span>
                  <span>{t("scoreLabel", { score: submission.score ?? 0 })}</span>
                </div>
                <div className="mt-3">
                  <Link href={`/dashboard/submissions/${submission.id}`}>
                    <Badge variant="secondary">{t("viewAttempt")}</Badge>
                  </Link>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
