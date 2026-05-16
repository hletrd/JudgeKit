import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { assignments, submissions, users } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatScore } from "@/lib/formatting";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { CodeTimelinePanel } from "@/components/contest/code-timeline-panel";
import { ParticipantTimelineBar } from "@/components/contest/participant-timeline-bar";
import { buildParticipantTimelineTranslations } from "@/components/contest/participant-timeline-translations";
import { getParticipantTimeline } from "@/lib/assignments/participant-timeline";
import { buildStatusLabels } from "@/lib/judge/status-labels";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string; userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("contests.view_analytics")) redirect("/contests/manage");

  const { assignmentId, userId } = await params;
  const [t, tSub, tCommon, locale, timeZone] = await Promise.all([
    getTranslations("contests"),
    getTranslations("submissions"),
    getTranslations("common"),
    getLocale(),
    getResolvedSystemTimeZone(),
  ]);

  // Fetch assignment
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    with: {
      group: { columns: { name: true } },
      assignmentProblems: {
        with: { problem: { columns: { id: true, title: true } } },
      },
    },
  });
  if (!assignment) notFound();

  // Fetch student
  const student = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, username: true, name: true, className: true },
  });
  if (!student) notFound();

  // Fetch all submissions by this student for this assignment
  const studentSubmissions = await db.query.submissions.findMany({
    where: and(
      eq(submissions.userId, userId),
      eq(submissions.assignmentId, assignmentId),
    ),
    orderBy: [desc(submissions.submittedAt)],
    with: {
      problem: { columns: { id: true, title: true } },
    },
  });

  // Group submissions by problem
  const sortedProblems = [...assignment.assignmentProblems].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );

  // Per-problem timeline (used by ParticipantTimelineBar progress view)
  const [participantTimeline, tParticipantAudit] = await Promise.all([
    getParticipantTimeline(assignmentId, userId),
    getTranslations("contests.participantAudit"),
  ]);
  const timelineByProblem = new Map(
    participantTimeline?.problems.map((p) => [p.problemId, p]) ?? []
  );
  const statusLabels = buildStatusLabels(tSub);
  const timelineProblems = sortedProblems.map((ap) => ({
    problemId: ap.problemId,
    title: ap.problem.title,
    points: ap.points ?? null,
    sortOrder: ap.sortOrder ?? null,
  }));
  const timelineTranslations = buildParticipantTimelineTranslations(tParticipantAudit);

  const statusColors: Record<string, string> = {
    accepted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    wrong_answer: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    time_limit: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    memory_limit: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    runtime_error: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    compile_error: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    judging: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/contests/manage/${assignmentId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>

      <div>
        <h2 className="text-2xl font-bold">{student.name}</h2>
        <p className="text-sm text-muted-foreground">
          @{student.username}
          {student.className && ` · ${student.className}`}
          {' · '}
          {assignment.title}
        </p>
      </div>

      {/* Per-problem summary — clicking jumps to the submissions list anchored
          at the matching row */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {sortedProblems.map((ap) => {
          const problemSubs = studentSubmissions.filter(
            (s) => s.problemId === ap.problemId
          );
          const bestScore = problemSubs.length > 0
            ? problemSubs.map((s) => s.score ?? 0).reduce((max, v) => Math.max(max, v), 0)
            : 0;
          const hasAccepted = problemSubs.some((s) => s.status === "accepted");
          const firstSubAnchor = problemSubs[0]?.id
            ? `submission-${problemSubs[0].id}`
            : "submission-list";

          return (
            <Link key={ap.problemId} href={`#${firstSubAnchor}`} className="block focus:outline-none">
              <Card className={`${hasAccepted ? "border-green-300 dark:border-green-700" : ""} transition-colors hover:bg-muted/40`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{ap.problem.title}</span>
                    <Badge variant={hasAccepted ? "success" : problemSubs.length > 0 ? "destructive" : "secondary"} className="text-xs">
                      {bestScore}/{ap.points ?? DEFAULT_PROBLEM_POINTS}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("submissionCount", { count: problemSubs.length })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Progress-bar timeline view */}
      {participantTimeline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{tParticipantAudit("progressTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ParticipantTimelineBar
              participant={participantTimeline.participant}
              assignmentProblems={timelineProblems}
              timelineByProblem={timelineByProblem}
              locale={locale}
              timeZone={timeZone}
              translations={timelineTranslations}
              statusLabels={statusLabels}
            />
          </CardContent>
        </Card>
      )}

      {/* Full submission log */}
      <Card id="submission-list">
        <CardHeader>
          <CardTitle className="text-lg">{t("tabs.submissions")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tSub("table.problem")}</TableHead>
                <TableHead>{tSub("table.language")}</TableHead>
                <TableHead>{tSub("table.status")}</TableHead>
                <TableHead className="text-right">{tSub("table.score")}</TableHead>
                <TableHead>{tSub("table.submittedAt")}</TableHead>
                <TableHead className="text-right pr-6">{tSub("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("noSubmissions")}
                  </TableCell>
                </TableRow>
              ) : (
                studentSubmissions.map((sub) => (
                  <TableRow key={sub.id} id={`submission-${sub.id}`} className="scroll-mt-24">
                    <TableCell className="font-medium text-sm">
                      <Link
                        href={`/submissions/${sub.id}`}
                        className="text-primary hover:underline"
                      >
                        {sub.problem?.title ?? sub.problemId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-mono">
                        {getLanguageDisplayLabel(sub.language)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/submissions/${sub.id}`}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-80 ${statusColors[sub.status ?? ""] ?? ""}`}
                      >
                        {tSub(`status.${sub.status}`)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatScore(sub.score, locale)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTimeInTimeZone(sub.submittedAt, locale, timeZone)}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Link href={`/submissions/${sub.id}`}>
                        <Button variant="outline" size="sm">
                          {tCommon("view")}
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CodeTimelinePanel
        assignmentId={assignmentId}
        userId={userId}
        userName={student.name}
      />
    </div>
  );
}
