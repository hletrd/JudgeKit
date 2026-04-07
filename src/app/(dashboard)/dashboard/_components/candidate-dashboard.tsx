import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { assignmentProblems, enrollments, languageConfigs, problems, submissions } from "@/lib/db/schema";
import { getTranslations } from "next-intl/server";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedPlatformMode, getResolvedSystemSettings } from "@/lib/system-settings";
import { getLocale } from "next-intl/server";

type CandidateDashboardProps = {
  userId: string;
  role: string;
  assignmentIds: string[];
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
  const canViewAll = caps.has("problems.view_all") || role === "super_admin" || role === "admin";
  const restrictToAssignmentIds = assignmentIds.length > 0;
  const assignmentSubmissionFilter = restrictToAssignmentIds
    ? inArray(submissions.assignmentId, assignmentIds)
    : undefined;

  const isRecruitingMode = (await getResolvedPlatformMode()) === "recruiting";

  const [accessibleProblemCount, submissionCountRows, enabledLanguagesRows, recentSubmissions] = await Promise.all([
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

          const publicCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(problems)
            .where(eq(problems.visibility, "public"))
            .then((r) => Number(r[0]?.count ?? 0));

          if (userGroupIds.length === 0) return publicCount;

          const groupIdArray = sql.raw(`ARRAY[${userGroupIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]`);
          const distinctCount = await db.execute(sql`
            SELECT count(*) AS count FROM (
              SELECT id FROM problems WHERE visibility = 'public'
              UNION
              SELECT p.id FROM problems p
                JOIN problem_group_access pga ON pga.problem_id = p.id
                WHERE pga.group_id = ANY(${groupIdArray})
              UNION
              SELECT id FROM problems WHERE author_id = ${userId}
            ) accessible
          `).then((r) => Number(r.rows[0]?.count ?? 0));

          return distinctCount;
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
  ]);

  const totalAttempts = Number(submissionCountRows[0]?.count ?? 0);
  const enabledLanguages = Number(enabledLanguagesRows[0]?.count ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t("candidateOverviewTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("candidateOverviewDescription")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
            <CardTitle>{t("supportedLanguages")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{enabledLanguages}</div>
            <p className="mt-2 text-xs text-muted-foreground">{t("supportedLanguagesDescription")}</p>
          </CardContent>
        </Card>
      </div>

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
