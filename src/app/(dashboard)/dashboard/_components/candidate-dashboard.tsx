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
};

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
          })
          .from(assignments)
          .leftJoin(
            examSessions,
            and(eq(examSessions.assignmentId, assignments.id), eq(examSessions.userId, userId))
          )
          .where(inArray(assignments.id, assignmentIds))
      : Promise.resolve([] as Array<{ assignmentId: string; title: string; deadline: Date | null }>),
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
  const assignmentProgress: AssignmentProgressSummary[] = assignmentRows.map((assignment) => ({
    assignmentId: assignment.assignmentId,
    title: assignment.title,
    deadline: assignment.deadline ? new Date(assignment.deadline) : null,
    problemCount: assignmentProblemCountMap.get(assignment.assignmentId) ?? 0,
    attemptedCount: assignmentAttemptedCountMap.get(assignment.assignmentId) ?? 0,
    solvedCount: assignmentSolvedCountMap.get(assignment.assignmentId) ?? 0,
  }));
  const nextDeadline = assignmentProgress
    .map((assignment) => assignment.deadline)
    .filter((deadline): deadline is Date => Boolean(deadline && deadline.getTime() > Date.now()))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

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
                    <Link href={`/dashboard/contests/${assignment.assignmentId}`}>
                      <Badge variant="secondary">{t("viewChallengeProgress")}</Badge>
                    </Link>
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
