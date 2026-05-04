import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { db } from "@/lib/db";
import { assignments, enrollments, groups, problems, submissions } from "@/lib/db/schema";
import { desc, eq, sql, countDistinct } from "drizzle-orm";
import { formatDateTimeInTimeZone, formatRelativeTimeFromNow } from "@/lib/datetime";
import { getDbNow } from "@/lib/db-time";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getResolvedSystemSettings } from "@/lib/system-settings";

type StudentDashboardProps = {
  userId: string;
};

export async function StudentDashboard({ userId }: StudentDashboardProps) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const locale = await getLocale();
  // Use DB server time for assignment deadline checks to avoid clock skew
  // between the app server and DB server (same rationale as recruit page fix).
  const now = await getDbNow();

  // Progress stats
  const [progressStats] = await db
    .select({
      totalSubmissions: sql<number>`count(*)`.as("totalSubmissions"),
      acceptedSubmissions: sql<number>`count(*) filter (where ${submissions.status} = 'accepted')`.as("acceptedSubmissions"),
      solvedProblems: countDistinct(
        sql`case when ${submissions.status} = 'accepted' then ${submissions.problemId} end`
      ).as("solvedProblems"),
      attemptedProblems: countDistinct(submissions.problemId).as("attemptedProblems"),
    })
    .from(submissions)
    .where(eq(submissions.userId, userId));

  const totalSubmissionCount = Number(progressStats?.totalSubmissions ?? 0);
  const acceptedCount = Number(progressStats?.acceptedSubmissions ?? 0);
  const solvedCount = Number(progressStats?.solvedProblems ?? 0);
  const attemptedCount = Number(progressStats?.attemptedProblems ?? 0);
  const acceptanceRate = totalSubmissionCount > 0
    ? Math.round((acceptedCount / totalSubmissionCount) * 100)
    : 0;

  // Language distribution (top 5)
  const languageStats = await db
    .select({
      language: submissions.language,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(submissions)
    .where(eq(submissions.userId, userId))
    .groupBy(submissions.language)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const [recentSubmissions, studentAssignments] = await Promise.all([
    db
      .select({
        id: submissions.id,
        status: submissions.status,
        submittedAt: submissions.submittedAt,
        score: submissions.score,
        problem: {
          id: problems.id,
          title: problems.title,
        },
        assignment: {
          id: assignments.id,
          title: assignments.title,
        },
      })
      .from(submissions)
      .leftJoin(problems, eq(submissions.problemId, problems.id))
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(eq(submissions.userId, userId))
      .orderBy(desc(submissions.submittedAt))
      .limit(5),
    db
      .select({
        id: assignments.id,
        title: assignments.title,
        groupId: groups.id,
        groupName: groups.name,
        deadline: assignments.deadline,
        lateDeadline: assignments.lateDeadline,
      })
      .from(enrollments)
      .innerJoin(groups, eq(enrollments.groupId, groups.id))
      .innerJoin(assignments, eq(assignments.groupId, groups.id))
      .where(eq(enrollments.userId, userId))
      .orderBy(assignments.deadline),
  ]);

  const upcomingAssignments = studentAssignments
    .filter((assignment) => assignment.deadline && assignment.deadline > now)
    .slice(0, 5);
  const openAssignments = studentAssignments.filter((assignment) => {
    const deadline = assignment.lateDeadline ?? assignment.deadline;
    return deadline ? deadline >= now : true;
  }).length;
  const completedAssignments = studentAssignments.filter((assignment) => {
    const deadline = assignment.lateDeadline ?? assignment.deadline;
    return deadline ? deadline < now : false;
  }).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("progressTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{solvedCount}/{attemptedCount}</div>
              <div className="text-xs text-muted-foreground">{t("solvedProblems")}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{acceptanceRate}%</div>
              <div className="text-xs text-muted-foreground">{t("acceptanceRate")}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{totalSubmissionCount}</div>
              <div className="text-xs text-muted-foreground">{t("totalSubmissions")}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground mb-2">{t("topLanguages")}</div>
              {languageStats.length === 0 ? (
                <div className="text-sm text-muted-foreground">-</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {languageStats.map((lang) => (
                    <Badge key={lang.language} variant="secondary" className="text-xs">
                      {lang.language} ({lang.count})
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("myGroups")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{new Set(studentAssignments.map((assignment) => assignment.groupId)).size}</div>
            <Link href="/groups" className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
              {tCommon("viewAll")}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("openAssignments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{openAssignments}</div>
            <Link href="/groups" className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
              {tCommon("viewAll")}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("completedAssignments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{completedAssignments}</div>
            <Link href="/submissions?scope=mine" className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
              {tCommon("viewAll")}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("upcomingDeadlines")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noUpcomingAssignments")}</p>
            ) : (
              upcomingAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded-lg border p-3">
                  <div className="font-medium">{assignment.title}</div>
                  <div className="text-sm text-muted-foreground">{assignment.groupName}</div>
                  <div className="mt-2 text-sm">
                    {t("deadlineLabel")}:{" "}
                    {assignment.deadline
                      ? formatDateTimeInTimeZone(assignment.deadline, locale, settings.timeZone)
                      : "-"}
                  </div>
                  {assignment.deadline && (
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeTimeFromNow(assignment.deadline, locale)}
                    </div>
                  )}
                  <div className="mt-3">
                    <Link
                      href={`/dashboard/groups/${assignment.groupId}/assignments/${assignment.id}`}
                      aria-label={t("viewAssignmentLabel", { title: assignment.title })}
                    >
                      <Badge variant="secondary">{t("viewAssignment")}</Badge>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentSubmissions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRecentSubmissions")}</p>
            ) : (
              recentSubmissions.map((submission) => (
                <div key={submission.id} className="rounded-lg border p-3">
                  <div className="font-medium">{submission.problem?.title ?? tCommon("unknown")}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SubmissionStatusBadge
                      label={submission.status ?? tCommon("unknown")}
                      status={submission.status}
                      locale={locale}
                    />
                    <span className="text-sm text-muted-foreground">
                      {submission.submittedAt
                        ? formatDateTimeInTimeZone(submission.submittedAt, locale, settings.timeZone)
                        : "-"}
                    </span>
                  </div>
                  <div className="mt-3">
                    <Link href={`/submissions/${submission.id}`}>
                      <Badge variant="outline">{t("viewSubmission")}</Badge>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
