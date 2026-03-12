import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertUserRole } from "@/lib/security/constants";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserRole } from "@/types";

export default async function StudentSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string; userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id: groupId, assignmentId, userId } = await params;
  const role = assertUserRole(session.user.role as string);
  const currentUserId = session.user.id;

  // Allow access if: instructor/admin can view assignment submissions, OR student is viewing their own
  const canViewBoard = await canViewAssignmentSubmissions(assignmentId, currentUserId, role);
  const isSelf = currentUserId === userId;

  if (!canViewBoard && !isSelf) {
    redirect("/dashboard/groups");
  }

  const [locale, timeZone, t, tSubmissions, tCommon] = await Promise.all([
    getLocale(),
    getResolvedSystemTimeZone(),
    getTranslations("groups.assignmentDetail"),
    getTranslations("submissions"),
    getTranslations("common"),
  ]);

  // Fetch assignment info
  const assignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), eq(assignments.groupId, groupId)),
    columns: {
      id: true,
      title: true,
      groupId: true,
    },
  });

  if (!assignment) {
    notFound();
  }

  // Fetch the student info
  const student = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      username: true,
    },
  });

  if (!student) {
    notFound();
  }

  // Fetch problems in this assignment ordered by sortOrder
  const assignmentProblemRows = await db
    .select({
      problemId: assignmentProblems.problemId,
      title: problems.title,
      points: assignmentProblems.points,
      sortOrder: assignmentProblems.sortOrder,
    })
    .from(assignmentProblems)
    .innerJoin(problems, eq(problems.id, assignmentProblems.problemId))
    .where(eq(assignmentProblems.assignmentId, assignmentId))
    .orderBy(assignmentProblems.sortOrder, problems.title);

  // Fetch all submissions for this student+assignment
  const studentSubmissions = await db
    .select({
      id: submissions.id,
      problemId: submissions.problemId,
      language: submissions.language,
      status: submissions.status,
      score: submissions.score,
      executionTimeMs: submissions.executionTimeMs,
      memoryUsedKb: submissions.memoryUsedKb,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.assignmentId, assignmentId),
        eq(submissions.userId, userId)
      )
    )
    .orderBy(desc(submissions.submittedAt));

  // Group submissions by problemId
  const submissionsByProblem = new Map<string, typeof studentSubmissions>();
  for (const sub of studentSubmissions) {
    if (!submissionsByProblem.has(sub.problemId)) {
      submissionsByProblem.set(sub.problemId, []);
    }
    submissionsByProblem.get(sub.problemId)!.push(sub);
  }

  const statusLabels: Record<string, string> = buildStatusLabels(tSubmissions);

  const scoreboardUrl = `/dashboard/groups/${groupId}/assignments/${assignmentId}`;

  return (
    <div className="space-y-6">
      <Link
        href={scoreboardUrl}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("backToScoreboard")}
      </Link>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold">
          {t("studentSubmissions", { student: student.name })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {assignment.title} · @{student.username}
        </p>
      </div>

      {assignmentProblemRows.length === 0 ? (
        <p className="text-muted-foreground">{t("noAttempts")}</p>
      ) : (
        <div className="space-y-6">
          {assignmentProblemRows.map((problem) => {
            const subs = submissionsByProblem.get(problem.problemId) ?? [];

            return (
              <Card key={problem.problemId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link
                      href={`/dashboard/problems/${problem.problemId}`}
                      className="text-primary hover:underline"
                    >
                      {problem.title}
                    </Link>
                    <span className="text-sm font-normal text-muted-foreground">
                      {problem.points ?? 100} pt
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {subs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noAttempts")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tSubmissions("table.id")}</TableHead>
                          <TableHead>{tSubmissions("table.status")}</TableHead>
                          <TableHead>{tSubmissions("table.score")}</TableHead>
                          <TableHead>{tSubmissions("time")}</TableHead>
                          <TableHead>{tSubmissions("memory")}</TableHead>
                          <TableHead>{tSubmissions("table.language")}</TableHead>
                          <TableHead>{tSubmissions("table.submittedAt")}</TableHead>
                          <TableHead>{tCommon("action")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subs.map((sub) => (
                          <TableRow key={sub.id}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                href={`/dashboard/submissions/${sub.id}`}
                                className="text-primary hover:underline"
                              >
                                {formatSubmissionIdPrefix(sub.id)}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {sub.status ? (
                                <SubmissionStatusBadge
                                  status={sub.status}
                                  label={statusLabels[sub.status] ?? sub.status}
                                />
                              ) : (
                                <Badge variant="outline">-</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {sub.score !== null && sub.score !== undefined
                                ? sub.score
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {sub.executionTimeMs !== null && sub.executionTimeMs !== undefined
                                ? tSubmissions("timeValue", { value: sub.executionTimeMs })
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {sub.memoryUsedKb !== null && sub.memoryUsedKb !== undefined
                                ? tSubmissions("memoryValue", { value: sub.memoryUsedKb })
                                : "-"}
                            </TableCell>
                            <TableCell>{sub.language}</TableCell>
                            <TableCell>
                              {sub.submittedAt
                                ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Link href={`/dashboard/submissions/${sub.id}`}>
                                <Button variant="outline" size="sm">
                                  {tCommon("view")}
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
