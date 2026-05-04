import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import { assignments, problems, submissions, users } from "@/lib/db/schema";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatScore } from "@/lib/formatting";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ContestParticipantSubmissionsPage({
  params,
}: {
  params: Promise<{ assignmentId: string; userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { assignmentId, userId } = await params;
  const canView = await canViewAssignmentSubmissions(
    assignmentId,
    session.user.id,
    session.user.role
  );
  if (!canView && session.user.id !== userId) {
    redirect(`/dashboard/contests/${assignmentId}`);
  }

  const [locale, timeZone, t, tSubmissions, tCommon, tAudit] = await Promise.all([
    getLocale(),
    getResolvedSystemTimeZone(),
    getTranslations("groups.assignmentDetail"),
    getTranslations("submissions"),
    getTranslations("common"),
    getTranslations("contests.participantAudit"),
  ]);

  const [assignment, student, rows] = await Promise.all([
    db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, title: true, examMode: true },
    }),
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, name: true, username: true },
    }),
    db
      .select({
        id: submissions.id,
        problemId: submissions.problemId,
        problemTitle: problems.title,
        language: submissions.language,
        status: submissions.status,
        score: submissions.score,
        compileOutput: submissions.compileOutput,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .leftJoin(problems, eq(problems.id, submissions.problemId))
      .where(
        and(
          eq(submissions.assignmentId, assignmentId),
          eq(submissions.userId, userId)
        )
      )
      .orderBy(desc(submissions.submittedAt)),
  ]);

  if (!assignment || assignment.examMode === "none" || !student) {
    notFound();
  }

  const statusLabels: Record<string, string> = buildStatusLabels(tSubmissions);

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/contests/${assignmentId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tAudit("backToContest")}
      </Link>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold">
          {t("studentSubmissions", { student: student.name })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {assignment.title} · @{student.username}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t("noAttempts")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{tSubmissions("table.id")}</TableHead>
                    <TableHead>{tSubmissions("table.problem")}</TableHead>
                    <TableHead>{tSubmissions("table.status")}</TableHead>
                    <TableHead>{tSubmissions("table.score")}</TableHead>
                    <TableHead>{tSubmissions("time")}</TableHead>
                    <TableHead>{tSubmissions("memory")}</TableHead>
                    <TableHead>{tSubmissions("table.language")}</TableHead>
                    <TableHead>{tSubmissions("table.submittedAt")}</TableHead>
                    <TableHead className="pr-6">{tCommon("action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="pl-6 font-mono text-xs">
                        <Link
                          href={`/submissions/${sub.id}`}
                          className="text-primary hover:underline"
                        >
                          {formatSubmissionIdPrefix(sub.id)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {sub.problemTitle ? (
                          <Link
                            href={`/dashboard/problems/${sub.problemId}`}
                            className="text-primary hover:underline"
                          >
                            {sub.problemTitle}
                          </Link>
                        ) : (
                          tCommon("unknown")
                        )}
                      </TableCell>
                      <TableCell>
                        {sub.status ? (
                          <SubmissionStatusBadge
                            status={sub.status}
                            label={statusLabels[sub.status] ?? sub.status}
                            compileOutput={sub.compileOutput}
                            executionTimeMs={sub.executionTimeMs}
                            memoryUsedKb={sub.memoryUsedKb}
                            score={sub.score}
                            locale={locale}
                          />
                        ) : (
                          <Badge variant="outline">-</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {formatScore(sub.score, locale)}
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
                      <TableCell>{getLanguageDisplayLabel(sub.language)}</TableCell>
                      <TableCell>
                        {sub.submittedAt
                          ? formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)
                          : "-"}
                      </TableCell>
                      <TableCell className="pr-6">
                        <Link href={`/submissions/${sub.id}`}>
                          <Button variant="outline" size="sm">
                            {tCommon("view")}
                          </Button>
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
    </div>
  );
}
