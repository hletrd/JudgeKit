import { getTranslations, getLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Clock, MemoryStick } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignments, enrollments, groups, languageConfigs, problems, submissions, users } from "@/lib/db/schema";
import {
  getJudgeLanguageDefinition,
  serializeJudgeCommand,
} from "@/lib/judge/languages";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getRuntimeSystemInfo } from "@/lib/system-info";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { formatDateTimeInTimeZone, formatRelativeTimeFromNow } from "@/lib/datetime";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const tJudge = await getTranslations("judge");
  const tLangs = await getTranslations("languages");
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });
  const locale = await getLocale();

  const langs = await db.select().from(languageConfigs).where(eq(languageConfigs.isEnabled, true));
  const enabledLanguages = langs.flatMap((language) => {
    const definition = getJudgeLanguageDefinition(language.language);

    if (!definition) {
      return [];
    }

    return [{ id: language.id, definition }];
  });
  const runtimeSystemInfo = await getRuntimeSystemInfo();
  const now = new Date();

  const isAdminView =
    session.user.role === "admin" || session.user.role === "super_admin";
  const isInstructorView = session.user.role === "instructor";

  const recentSubmissions = await db
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
    .where(eq(submissions.userId, session.user.id))
    .orderBy(desc(submissions.submittedAt))
    .limit(5);

  const studentAssignments =
    session.user.role === "student"
      ? await db
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
          .where(eq(enrollments.userId, session.user.id))
          .orderBy(assignments.deadline)
      : [];

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

  const instructorGroups =
    isInstructorView
      ? await db.query.groups.findMany({
          where: eq(groups.instructorId, session.user.id),
          columns: { id: true, name: true },
        })
      : [];
  const instructorGroupIds = instructorGroups.map((group) => group.id);
  const instructorAssignments =
    isInstructorView && instructorGroupIds.length > 0
      ? await db.query.assignments.findMany({
          where: (assignments, { inArray: inArrayOperator }) =>
            inArrayOperator(assignments.groupId, instructorGroupIds),
          columns: { id: true, title: true, groupId: true, deadline: true, lateDeadline: true },
        })
      : [];
  const instructorAssignmentIds = instructorAssignments.map((assignment) => assignment.id);
  const pendingQueueCount =
    isInstructorView && instructorAssignmentIds.length > 0
      ? await db
          .select({ total: sql<number>`count(*)` })
          .from(submissions)
          .where(
            and(
              inArray(submissions.assignmentId, instructorAssignmentIds),
              sql`${submissions.status} IN ('pending', 'queued', 'judging')`
            )
          )
          .then((rows) => Number(rows[0]?.total ?? 0))
      : 0;
  const recentGroupActivity =
    isInstructorView && instructorAssignmentIds.length > 0
      ? await db
          .select({
            id: submissions.id,
            status: submissions.status,
            submittedAt: submissions.submittedAt,
            assignment: {
              id: assignments.id,
              title: assignments.title,
            },
            group: {
              id: groups.id,
              name: groups.name,
            },
            student: {
              id: users.id,
              name: users.name,
            },
          })
          .from(submissions)
          .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
          .innerJoin(groups, eq(assignments.groupId, groups.id))
          .leftJoin(users, eq(submissions.userId, users.id))
          .where(inArray(submissions.assignmentId, instructorAssignmentIds))
          .orderBy(desc(submissions.submittedAt))
          .limit(6)
      : [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>

      {session.user.role === "student" && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("myGroups")}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{new Set(studentAssignments.map((assignment) => assignment.groupId)).size}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("openAssignments")}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{openAssignments}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("completedAssignments")}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{completedAssignments}</CardContent>
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
                        <Link href={`/dashboard/groups/${assignment.groupId}/assignments/${assignment.id}`}>
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
                        />
                        <span className="text-sm text-muted-foreground">
                          {submission.submittedAt
                            ? formatDateTimeInTimeZone(submission.submittedAt, locale, settings.timeZone)
                            : "-"}
                        </span>
                      </div>
                      <div className="mt-3">
                        <Link href={`/dashboard/submissions/${submission.id}`}>
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
      )}

      {isInstructorView && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("myGroups")}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{instructorGroups.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("activeAssignments")}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{instructorAssignments.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("queuedSubmissions")}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{pendingQueueCount}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("recentGroupActivity")}</CardTitle>
            </CardHeader>
            <CardContent>
              {recentGroupActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noRecentGroupActivity")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("studentLabel")}</TableHead>
                      <TableHead>{t("groupLabel")}</TableHead>
                      <TableHead>{t("assignmentLabel")}</TableHead>
                      <TableHead>{t("statusLabel")}</TableHead>
                      <TableHead>{t("recentSubmissions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentGroupActivity.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell>{submission.student?.name ?? tCommon("unknown")}</TableCell>
                        <TableCell>{submission.group.name}</TableCell>
                        <TableCell>{submission.assignment?.title ?? tCommon("unknown")}</TableCell>
                        <TableCell>
                          <SubmissionStatusBadge
                            label={submission.status ?? tCommon("unknown")}
                            status={submission.status}
                          />
                        </TableCell>
                        <TableCell>
                          <Link href={`/dashboard/submissions/${submission.id}`}>
                            <Button size="sm" variant="outline">{t("viewSubmission")}</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isAdminView && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("opsOverviewTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{tJudge("cpuLabel")}</p>
                    <p className="text-sm font-medium">{runtimeSystemInfo.cpu}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{tJudge("osLabel")}</p>
                    <p className="text-sm font-medium">{runtimeSystemInfo.os}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{tJudge("timeLimitLabel")}</p>
                    <p className="text-sm font-medium">{tJudge("defaultTimeLimit")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <MemoryStick className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{tJudge("memoryLimitLabel")}</p>
                    <p className="text-sm font-medium">{tJudge("defaultMemoryLimit")}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{tJudge("limitsNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tLangs("title")}</CardTitle>
              <CardDescription>{runtimeSystemInfo.architecture}</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tLangs("language")}</TableHead>
                    <TableHead>{tLangs("compiler")}</TableHead>
                    <TableHead>{tLangs("compileOptions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enabledLanguages.map(({ id, definition }) => (
                    <TableRow key={id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {definition.displayName} {definition.standard ? `(${definition.standard})` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{definition.compiler || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {serializeJudgeCommand(definition.compileCommand) || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
