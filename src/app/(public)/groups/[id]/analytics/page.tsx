import { and, avg, count, eq, inArray, max, min, notInArray, sql, sum } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignments, enrollments, groups, submissions, assignmentProblems } from "@/lib/db/schema";
import { canAccessGroup } from "@/lib/auth/permissions";
import { ACTIVE_SUBMISSION_STATUSES } from "@/lib/submissions/status";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatScore } from "@/lib/formatting";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatDateTimeInTimeZone } from "@/lib/datetime";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  const t = await getTranslations("groups");
  return { title: `${t("analytics")} - JudgeKit` };
}

export default async function GroupAnalyticsPage({ params }: PageProps) {
  const { id: groupId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) notFound();

  const canAccess = await canAccessGroup(groupId, session.user.id, session.user.role);
  if (!canAccess) notFound();

  const t = await getTranslations("groups");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();

  // Get group member count
  const [memberCountRow] = await db
    .select({ count: count() })
    .from(enrollments)
    .where(eq(enrollments.groupId, groupId));
  const memberCount = memberCountRow?.count ?? 0;

  // Get assignments with their total points from assignmentProblems
  const assignmentData = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      deadline: assignments.deadline,
      points: sum(assignmentProblems.points),
    })
    .from(assignments)
    .leftJoin(assignmentProblems, eq(assignmentProblems.assignmentId, assignments.id))
    .where(eq(assignments.groupId, groupId))
    .groupBy(assignments.id, assignments.title, assignments.deadline);

  // Get submission stats per assignment (excluding in-flight statuses)
  const groupAssignmentIds = (await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.groupId, groupId))).map(r => r.id);
  const activeStatuses = [...ACTIVE_SUBMISSION_STATUSES];
  const submissionStats = groupAssignmentIds.length > 0
    ? await db
        .select({
          assignmentId: submissions.assignmentId,
          submissionCount: count(submissions.id),
          avgScore: avg(submissions.score),
          maxScore: max(submissions.score),
          minScore: min(submissions.score),
          uniqueSubmitters: count(sql`DISTINCT ${submissions.userId}`),
        })
        .from(submissions)
        .where(and(
          inArray(submissions.assignmentId, groupAssignmentIds),
          notInArray(submissions.status, activeStatuses),
        ))
        .groupBy(submissions.assignmentId)
    : [];

  const statsMap = new Map(submissionStats.map((s) => [s.assignmentId, s]));

  const totalSubmissions = submissionStats.reduce((s, a) => s + a.submissionCount, 0);
  const avgOverallScore = submissionStats.length > 0
    ? submissionStats.reduce((s, a) => s + Number(a.avgScore ?? 0), 0) / submissionStats.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/groups/${groupId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {group.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold">{t("analytics")}</h1>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">{t("memberCount", { count: memberCount })}</div>
          <div className="text-lg font-semibold">{memberCount}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">{t("assignmentCount", { count: assignmentData.length })}</div>
          <div className="text-lg font-semibold">{assignmentData.length}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">{t("totalSubmissions")}</div>
          <div className="text-lg font-semibold">{totalSubmissions}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">{t("avgOverallScore")}</div>
          <div className="text-lg font-semibold">{formatScore(avgOverallScore, locale)}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("assignmentPerformance")}</CardTitle>
        </CardHeader>
        <CardContent>
          {assignmentData.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noAssignmentsYet")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("assignmentTitle")}</TableHead>
                  <TableHead>{t("totalPoints")}</TableHead>
                  <TableHead>{t("submitted")}</TableHead>
                  <TableHead>{t("avgScore")}</TableHead>
                  <TableHead>{t("highScore")}</TableHead>
                  <TableHead>{t("lowScore")}</TableHead>
                  <TableHead>{t("deadline")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentData.map((a) => {
                  const stats = statsMap.get(a.id);
                  const totalPoints = Number(a.points ?? 0);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/groups/${groupId}/assignments/${a.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {a.title}
                        </Link>
                      </TableCell>
                      <TableCell>{formatScore(totalPoints, locale)}</TableCell>
                      <TableCell>
                        <span>{stats?.uniqueSubmitters ?? 0}/{memberCount}</span>
                        {memberCount > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({Math.round(((stats?.uniqueSubmitters ?? 0) / memberCount) * 100)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatScore(stats?.avgScore != null ? Number(stats.avgScore) : null, locale)}</TableCell>
                      <TableCell>{formatScore(stats?.maxScore != null ? Number(stats.maxScore) : null, locale)}</TableCell>
                      <TableCell>{formatScore(stats?.minScore != null ? Number(stats.minScore) : null, locale)}</TableCell>
                      <TableCell>
                        {a.deadline
                          ? formatDateTimeInTimeZone(a.deadline, locale, timeZone)
                          : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
