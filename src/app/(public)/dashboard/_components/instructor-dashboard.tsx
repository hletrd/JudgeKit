import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { db } from "@/lib/db";
import { assignments, groups, submissions, users } from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getAssignedTeachingGroupIds } from "@/lib/assignments/management";

type InstructorDashboardProps = {
  userId: string;
  capabilities: string[];
};

export async function InstructorDashboard({ userId, capabilities }: InstructorDashboardProps) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const tNav = await getTranslations("nav");
  const locale = await getLocale();
  const caps = new Set(capabilities);
  const canAccessProblemSets =
    caps.has("problem_sets.create")
    || caps.has("problem_sets.edit")
    || caps.has("problem_sets.delete")
    || caps.has("problem_sets.assign_groups");

  const instructorGroupIds = await getAssignedTeachingGroupIds(userId);
  const instructorGroups =
    instructorGroupIds.length > 0
      ? await db.query.groups.findMany({
          where: (groups, { inArray: inArrayOperator }) =>
            inArrayOperator(groups.id, instructorGroupIds),
          columns: { id: true, name: true },
        })
      : [];

  const instructorAssignments =
    instructorGroupIds.length > 0
      ? await db.query.assignments.findMany({
          where: (assignments, { inArray: inArrayOperator }) =>
            inArrayOperator(assignments.groupId, instructorGroupIds),
          columns: { id: true, title: true, groupId: true, deadline: true, lateDeadline: true },
        })
      : [];
  const instructorAssignmentIds = instructorAssignments.map((assignment) => assignment.id);

  const [pendingQueueCount, recentGroupActivity] = await Promise.all([
    instructorAssignmentIds.length > 0
      ? db
          .select({ total: sql<number>`count(*)` })
          .from(submissions)
          .where(
            and(
              inArray(submissions.assignmentId, instructorAssignmentIds),
              sql`${submissions.status} IN ('pending', 'queued', 'judging')`
            )
          )
          .then((rows) => Number(rows[0]?.total ?? 0))
      : Promise.resolve(0),
    instructorAssignmentIds.length > 0
      ? db
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
      : Promise.resolve([]),
  ]);

  return (
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
          <CardTitle>{t("instructorQuickActions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/groups">
            <Button size="sm" variant="outline">{tNav("groups")}</Button>
          </Link>
          <Link href="/contests/manage">
            <Button size="sm" variant="outline">{tNav("contests")}</Button>
          </Link>
          <Link href="/dashboard/admin/submissions">
            <Button size="sm" variant="outline">{tNav("submissions")}</Button>
          </Link>
          {canAccessProblemSets ? (
            <Link href="/problem-sets">
              <Button size="sm" variant="outline">{tNav("problemSets")}</Button>
            </Link>
          ) : null}
        </CardContent>
      </Card>

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
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/submissions/${submission.id}`}>
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
  );
}
