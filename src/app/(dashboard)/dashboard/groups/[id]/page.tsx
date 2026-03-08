import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignments, groups, submissions, users } from "@/lib/db/schema";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canManageGroupResources, getManageableProblemsForGroup } from "@/lib/assignments/management";
import type { UserRole } from "@/types";
import AssignmentFormDialog, { type AssignmentEditorValue } from "./assignment-form-dialog";
import { AssignmentDeleteButton } from "./assignment-delete-button";
import { GroupMembersManager } from "./group-members-manager";

function sortAssignmentsBySchedule(
  left: {
    startsAt: Date | null;
    deadline: Date | null;
    createdAt: Date | null;
    title: string;
  },
  right: {
    startsAt: Date | null;
    deadline: Date | null;
    createdAt: Date | null;
    title: string;
  }
) {
  const leftStartsAt = left.startsAt?.valueOf() ?? Number.MAX_SAFE_INTEGER;
  const rightStartsAt = right.startsAt?.valueOf() ?? Number.MAX_SAFE_INTEGER;

  if (leftStartsAt !== rightStartsAt) {
    return leftStartsAt - rightStartsAt;
  }

  const leftDeadline = left.deadline?.valueOf() ?? Number.MAX_SAFE_INTEGER;
  const rightDeadline = right.deadline?.valueOf() ?? Number.MAX_SAFE_INTEGER;

  if (leftDeadline !== rightDeadline) {
    return leftDeadline - rightDeadline;
  }

  const leftCreatedAt = left.createdAt?.valueOf() ?? 0;
  const rightCreatedAt = right.createdAt?.valueOf() ?? 0;

  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return left.title.localeCompare(right.title);
}

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ id: groupId }, t, tCommon, locale, timeZone] = await Promise.all([
    params,
    getTranslations("groups"),
    getTranslations("common"),
    getLocale(),
    getResolvedSystemTimeZone(),
  ]);
  const role = session.user.role as UserRole;

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    with: {
      instructor: {
        columns: { id: true, name: true, email: true },
      },
      enrollments: {
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              name: true,
              className: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!group) {
    notFound();
  }

  const canManageGroup = canManageGroupResources(group.instructorId, session.user.id, role);
  const isEnrolled = group.enrollments.some((enrollment) => enrollment.userId === session.user.id);

  if (!isEnrolled && !canManageGroup) {
    redirect("/dashboard/groups");
  }

  const groupAssignments = await db.query.assignments.findMany({
    where: eq(assignments.groupId, groupId),
    with: {
      assignmentProblems: {
        with: {
          problem: {
            columns: { id: true, title: true },
          },
        },
      },
    },
  });

  const assignmentsWithSubmissionState = await Promise.all(
    groupAssignments.map(async (assignment) => ({
      ...assignment,
      hasSubmissions: Boolean(
        await db.query.submissions.findFirst({
          where: eq(submissions.assignmentId, assignment.id),
          columns: { id: true },
        })
      ),
    }))
  );
  assignmentsWithSubmissionState.sort(sortAssignmentsBySchedule);

  const memberRows = group.enrollments
    .map((enrollment) => ({
      id: enrollment.id,
      userId: enrollment.userId,
      name: enrollment.user.name,
      username: enrollment.user.username,
      className: enrollment.user.className,
      enrolledAt: enrollment.enrolledAt ? enrollment.enrolledAt.valueOf() : null,
    }))
    .sort((left, right) => `${left.name} ${left.username}`.localeCompare(`${right.name} ${right.username}`));

  const [availableStudents, availableProblems] = canManageGroup
    ? await Promise.all([
        db.query.users.findMany({
          where: and(eq(users.role, "student"), eq(users.isActive, true)),
          columns: {
            id: true,
            username: true,
            name: true,
            className: true,
          },
        }),
        getManageableProblemsForGroup(groupId, session.user.id, role),
      ])
    : [[], []];

  const enrolledUserIds = new Set(group.enrollments.map((enrollment) => enrollment.userId));
  const availableStudentOptions = availableStudents
    .filter((student) => !enrolledUserIds.has(student.id))
    .sort((left, right) => `${left.name} ${left.username}`.localeCompare(`${right.name} ${right.username}`))
    .map((student) => ({
      id: student.id,
      name: student.name,
      username: student.username,
      className: student.className,
    }));
  const availableProblemOptions = availableProblems
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((problem) => ({
      id: problem.id,
      title: problem.title,
    }));

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold">{group.name}</h2>
          <div className="description-copy text-muted-foreground">
            {group.description || tCommon("unknown")}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {t("instructorLabel", { name: group.instructor?.name || tCommon("unknown") })}
          </Badge>
          <Badge variant={group.isArchived ? "destructive" : "default"}>
            {group.isArchived ? t("archived") : t("active")}
          </Badge>
          <Badge variant="secondary">{t("memberCount", { count: memberRows.length })}</Badge>
          <Badge variant="secondary">
            {t("assignmentCount", { count: assignmentsWithSubmissionState.length })}
          </Badge>
        </div>
      </div>

      <GroupMembersManager
        groupId={groupId}
        canManage={canManageGroup}
        members={memberRows}
        availableStudents={availableStudentOptions}
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>{t("assignments")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("assignmentsDescription")}</p>
          </div>

          {canManageGroup && (
            <AssignmentFormDialog
              groupId={groupId}
              availableProblems={availableProblemOptions}
            />
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("assignmentTable.title")}</TableHead>
                <TableHead>{t("assignmentTable.startsAt")}</TableHead>
                <TableHead>{t("assignmentTable.deadline")}</TableHead>
                <TableHead>{t("assignmentTable.problems")}</TableHead>
                <TableHead>{t("assignmentTable.status")}</TableHead>
                {canManageGroup && <TableHead>{tCommon("action")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignmentsWithSubmissionState.map((assignment) => {
                const now = new Date();
                const isUpcoming = assignment.startsAt && new Date(assignment.startsAt) > now;
                const isPast =
                  (assignment.lateDeadline && new Date(assignment.lateDeadline) < now) ||
                  (!assignment.lateDeadline && assignment.deadline && new Date(assignment.deadline) < now);
                const editorValue: AssignmentEditorValue = {
                  id: assignment.id,
                  title: assignment.title,
                  description: assignment.description ?? "",
                  startsAt: assignment.startsAt ? assignment.startsAt.valueOf() : null,
                  deadline: assignment.deadline ? assignment.deadline.valueOf() : null,
                  lateDeadline: assignment.lateDeadline ? assignment.lateDeadline.valueOf() : null,
                  latePenalty: assignment.latePenalty ?? 0,
                  hasSubmissions: assignment.hasSubmissions,
                  problems: [...assignment.assignmentProblems]
                    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
                    .map((problem) => ({
                      problemId: problem.problemId,
                      points: problem.points ?? 100,
                    })),
                };

                return (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/groups/${groupId}/assignments/${assignment.id}`}
                        className="text-primary hover:underline"
                      >
                        {assignment.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {assignment.startsAt
                        ? formatDateTimeInTimeZone(assignment.startsAt, locale, timeZone)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {assignment.deadline
                        ? formatDateTimeInTimeZone(assignment.deadline, locale, timeZone)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {t("problemCount", { count: assignment.assignmentProblems.length })}
                    </TableCell>
                    <TableCell>
                      {isUpcoming ? (
                        <Badge variant="secondary">{t("statusUpcoming")}</Badge>
                      ) : isPast ? (
                        <Badge variant="outline">{t("statusClosed")}</Badge>
                      ) : (
                        <Badge className="bg-green-500">{t("statusOpen")}</Badge>
                      )}
                    </TableCell>
                    {canManageGroup && (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <AssignmentFormDialog
                            groupId={groupId}
                            availableProblems={availableProblemOptions}
                            initialAssignment={editorValue}
                          />
                          <AssignmentDeleteButton
                            groupId={groupId}
                            assignmentId={assignment.id}
                            assignmentTitle={assignment.title}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {assignmentsWithSubmissionState.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManageGroup ? 6 : 5}
                    className="text-center text-muted-foreground"
                  >
                    {t("noAssignments")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
