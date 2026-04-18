import Link from "next/link";
import { ArrowLeft, Trophy, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { getParticipantAuditData } from "@/lib/assignments/participant-audit";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { ParticipantAntiCheatTimeline } from "@/components/contest/participant-anti-cheat-timeline";
import { CodeTimelinePanel } from "@/components/contest/code-timeline-panel";
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

export default async function ParticipantAuditPage({
  params,
}: {
  params: Promise<{ assignmentId: string; userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [
    { assignmentId, userId },
    t,
    tSubmissions,
    tCommon,
    locale,
    timeZone,
  ] = await Promise.all([
    params,
    getTranslations("contests.participantAudit"),
    getTranslations("submissions"),
    getTranslations("common"),
    getLocale(),
    getResolvedSystemTimeZone(),
  ]);

  const role = session.user.role;

  const canView = await canViewAssignmentSubmissions(
    assignmentId,
    session.user.id,
    role
  );
  if (!canView) {
    redirect(`/dashboard/contests/${assignmentId}`);
  }

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { id: true, title: true, examMode: true, enableAntiCheat: true },
  });

  if (!assignment || assignment.examMode === "none") {
    notFound();
  }

  const auditData = await getParticipantAuditData(assignmentId, userId);

  const student = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, username: true, className: true },
  });

  if (!student) {
    notFound();
  }

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

  const submissionsByProblem = new Map<string, typeof studentSubmissions>();
  for (const sub of studentSubmissions) {
    if (!submissionsByProblem.has(sub.problemId)) {
      submissionsByProblem.set(sub.problemId, []);
    }
    submissionsByProblem.get(sub.problemId)!.push(sub);
  }

  const statusLabels: Record<string, string> = buildStatusLabels(tSubmissions);

  // Build problem info map from ranking data
  const problemRankingMap = new Map(
    auditData?.entry.problems.map((p) => [p.problemId, p]) ?? []
  );

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/contests/${assignmentId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("backToContest")}
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">{student.name}</h2>
          <p className="text-sm text-muted-foreground">
            @{student.username} &middot; {assignment.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {auditData && (
            <>
              <Badge variant="secondary" className="gap-1">
                <Trophy className="size-3" />
                {t("header.rank")} #{auditData.entry.rank}
              </Badge>
              <Badge variant="secondary">
                {t("header.totalScore")}: {auditData.entry.totalScore}
              </Badge>
              {auditData.scoringModel === "icpc" &&
                auditData.entry.totalPenalty > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="size-3" />
                    {t("header.penalty")}: {auditData.entry.totalPenalty}
                  </Badge>
                )}
            </>
          )}
          {student.className && (
            <Badge variant="outline">
              {t("header.class")}: {student.className}
            </Badge>
          )}
        </div>
      </div>

      {/* Solving Timeline */}
      {auditData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("solvingTimeline.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("solvingTimeline.problem")}</TableHead>
                  <TableHead>{t("solvingTimeline.status")}</TableHead>
                  <TableHead>{t("solvingTimeline.attempts")}</TableHead>
                  <TableHead>{t("solvingTimeline.firstAc")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentProblemRows.map((problem) => {
                  const ranking = problemRankingMap.get(problem.problemId);
                  return (
                    <TableRow key={problem.problemId}>
                      <TableCell>
                        <Link
                          href={`/dashboard/problems/${problem.problemId}`}
                          className="text-primary hover:underline"
                        >
                          {problem.title}
                        </Link>
                        <span className="ml-1 text-xs text-muted-foreground">
                          {problem.points ?? 100} pt
                        </span>
                      </TableCell>
                      <TableCell>
                        {ranking ? (
                          ranking.solved ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              {t("solvingTimeline.solved")}
                            </Badge>
                          ) : ranking.attempts > 0 ? (
                            <Badge variant="destructive">
                              {t("solvingTimeline.notSolved")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {t("solvingTimeline.noAttempts")}
                            </Badge>
                          )
                        ) : (
                          <Badge variant="outline">
                            {t("solvingTimeline.noAttempts")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{ranking?.attempts ?? 0}</TableCell>
                      <TableCell>
                        {ranking?.firstAcAt
                          ? formatDateTimeInTimeZone(
                              new Date(ranking.firstAcAt),
                              locale,
                              timeZone
                            )
                          : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Submission History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("submissionHistory.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {assignmentProblemRows.map((problem) => {
            const subs = submissionsByProblem.get(problem.problemId) ?? [];
            return (
              <div key={problem.problemId}>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Link
                    href={`/dashboard/problems/${problem.problemId}`}
                    className="text-primary hover:underline"
                  >
                    {problem.title}
                  </Link>
                  <span className="text-xs font-normal text-muted-foreground">
                    {problem.points ?? 100} pt
                  </span>
                </h4>
                {subs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("submissionHistory.noSubmissions")}
                  </p>
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
                        <TableHead>
                          {tSubmissions("table.submittedAt")}
                        </TableHead>
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
                            {sub.executionTimeMs !== null &&
                            sub.executionTimeMs !== undefined
                              ? tSubmissions("timeValue", {
                                  value: sub.executionTimeMs,
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {sub.memoryUsedKb !== null &&
                            sub.memoryUsedKb !== undefined
                              ? tSubmissions("memoryValue", {
                                  value: sub.memoryUsedKb,
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>{getLanguageDisplayLabel(sub.language)}</TableCell>
                          <TableCell>
                            {sub.submittedAt
                              ? formatDateTimeInTimeZone(
                                  sub.submittedAt,
                                  locale,
                                  timeZone
                                )
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
              </div>
            );
          })}
        </CardContent>
      </Card>

      <CodeTimelinePanel
        assignmentId={assignmentId}
        userId={userId}
        userName={student.name}
      />

      {/* Anti-Cheat Timeline */}
      {assignment.enableAntiCheat && (
        <ParticipantAntiCheatTimeline
          assignmentId={assignmentId}
          userId={userId}
        />
      )}
    </div>
  );
}
