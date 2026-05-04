import Link from "next/link";
import { ArrowLeft, Clock, Trophy } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatScore } from "@/lib/formatting";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import type { ParticipantAuditData } from "@/lib/assignments/participant-audit";
import type { ParticipantTimeline } from "@/lib/assignments/participant-timeline";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";
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

type ParticipantTimelineViewProps = {
  assignmentId: string;
  userId: string;
  assignment: {
    title: string;
    enableAntiCheat: boolean;
  };
  assignmentProblems: Array<{
    problemId: string;
    title: string;
    points: number | null;
    sortOrder: number | null;
  }>;
  auditData: ParticipantAuditData | null;
  participantTimeline: ParticipantTimeline;
};

export async function ParticipantTimelineView({
  assignmentId,
  userId,
  assignment,
  assignmentProblems,
  auditData,
  participantTimeline,
}: ParticipantTimelineViewProps) {
  const [t, tAntiCheat, tSubmissions, tCommon, locale, timeZone] =
    await Promise.all([
      getTranslations("contests.participantAudit"),
      getTranslations("contests.antiCheat"),
      getTranslations("submissions"),
      getTranslations("common"),
      getLocale(),
      getResolvedSystemTimeZone(),
    ]);

  const { participant, problems: timelineProblems } = participantTimeline;
  const timelineByProblem = new Map(
    timelineProblems.map((problem) => [problem.problemId, problem])
  );
  const statusLabels: Record<string, string> = buildStatusLabels(tSubmissions);
  const problemRankingMap = new Map(
    auditData?.entry.problems.map((p) => [p.problemId, p]) ?? []
  );

  function formatRelativeSeconds(totalSeconds: number | null) {
    if (totalSeconds === null || totalSeconds === undefined) {
      return "-";
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return t("problemSummary.relativeTime", { minutes, seconds });
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/contests/${assignmentId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("backToContest")}
      </Link>

      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">{participant.name}</h2>
          <p className="text-sm text-muted-foreground">
            @{participant.username} &middot; {assignment.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {auditData ? (
            <>
              <Badge variant="secondary" className="gap-1">
                <Trophy className="size-3" />
                {t("header.rank")} #{auditData.entry.rank}
              </Badge>
              <Badge variant="secondary">
                {t("header.totalScore")}: {auditData.entry.totalScore}
              </Badge>
              {auditData.scoringModel === "icpc" &&
              auditData.entry.totalPenalty > 0 ? (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="size-3" />
                  {t("header.penalty")}: {auditData.entry.totalPenalty}
                </Badge>
              ) : null}
            </>
          ) : null}
          {participant.className ? (
            <Badge variant="outline">
              {t("header.class")}: {participant.className}
            </Badge>
          ) : null}
          {participant.examStartedAt ? (
            <Badge variant="outline">
              {t("header.examStarted")}: {" "}
              {formatDateTimeInTimeZone(
                participant.examStartedAt,
                locale,
                timeZone
              )}
            </Badge>
          ) : null}
          {participant.personalDeadline ? (
            <Badge variant="outline">
              {t("header.personalDeadline")}: {" "}
              {formatDateTimeInTimeZone(
                participant.personalDeadline,
                locale,
                timeZone
              )}
            </Badge>
          ) : null}
          {participant.contestAccessAt ? (
            <Badge variant="outline">
              {t("header.contestAccess")}: {" "}
              {formatDateTimeInTimeZone(
                participant.contestAccessAt,
                locale,
                timeZone
              )}
            </Badge>
          ) : null}
        </div>
      </div>

      {auditData ? (
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
                {assignmentProblems.map((problem) => {
                  const ranking = problemRankingMap.get(problem.problemId);
                  const timeline = timelineByProblem.get(problem.problemId);
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
                          {t("pointsValue", { value: problem.points ?? DEFAULT_PROBLEM_POINTS })}
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
                      <TableCell>
                        {timeline?.summary.totalAttempts ?? ranking?.attempts ?? 0}
                      </TableCell>
                      <TableCell>
                        {timeline?.summary.firstAcAt ?? ranking?.firstAcAt ? (
                          formatDateTimeInTimeZone(
                            new Date(
                              (timeline?.summary.firstAcAt ?? ranking?.firstAcAt)!
                            ),
                            locale,
                            timeZone
                          )
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("submissionHistory.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {assignmentProblems.map((problem) => {
            const timeline = timelineByProblem.get(problem.problemId);
            const submissionEvents =
              timeline?.timeline.filter(
                (event) => event.type === "submission"
              ) ?? [];
            const summary = timeline?.summary;
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
                    {t("pointsValue", { value: problem.points ?? DEFAULT_PROBLEM_POINTS })}
                  </span>
                </h4>
                {summary ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {t("problemSummary.attempts", {
                        count: summary.totalAttempts,
                      })}
                    </Badge>
                    <Badge variant="outline">
                      {t("problemSummary.bestScore")}: {" "}
                      {summary.bestScore !== null &&
                      summary.bestScore !== undefined
                        ? summary.bestScore
                        : "-"}
                    </Badge>
                    <Badge variant="outline">
                      {t("problemSummary.snapshots", {
                        count: summary.snapshotCount,
                      })}
                    </Badge>
                    <Badge variant="outline">
                      {t("problemSummary.timeToFirstSubmission")}: {" "}
                      {formatRelativeSeconds(summary.timeToFirstSubmission)}
                    </Badge>
                    <Badge variant="outline">
                      {t("problemSummary.timeToSolve")}: {" "}
                      {formatRelativeSeconds(summary.timeToFirstAc)}
                    </Badge>
                    <Badge variant="outline">
                      {t("problemSummary.wrongBeforeAc", {
                        count: summary.wrongBeforeAc,
                      })}
                    </Badge>
                  </div>
                ) : null}
                {submissionEvents.length === 0 ? (
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
                        <TableHead>
                          {tSubmissions("table.language")}
                        </TableHead>
                        <TableHead>
                          {tSubmissions("table.submittedAt")}
                        </TableHead>
                        <TableHead>{tCommon("action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissionEvents.map((sub) => (
                        <TableRow key={sub.submissionId}>
                          <TableCell className="font-mono text-xs">
                            <Link
                              href={`/submissions/${sub.submissionId}`}
                              className="text-primary hover:underline"
                            >
                              {formatSubmissionIdPrefix(sub.submissionId)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {sub.status ? (
                              <SubmissionStatusBadge
                                status={sub.status}
                                label={statusLabels[sub.status] ?? sub.status}
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
                          <TableCell>
                            {getLanguageDisplayLabel(sub.language)}
                          </TableCell>
                          <TableCell>
                            {sub.at
                              ? formatDateTimeInTimeZone(
                                  sub.at,
                                  locale,
                                  timeZone
                                )
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/submissions/${sub.submissionId}`}
                            >
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
        userName={participant.name}
      />

      {assignment.enableAntiCheat ? (
        <>
          {participantTimeline.antiCheatSummary.totalEvents > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("antiCheatSummary.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant="secondary">
                  {t("antiCheatSummary.totalEvents", {
                    count: participantTimeline.antiCheatSummary.totalEvents,
                  })}
                </Badge>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(participantTimeline.antiCheatSummary.byType)
                    .sort((left, right) => right[1] - left[1])
                    .map(([eventType, count]) => (
                      <Badge key={eventType} variant="outline">
                        {tAntiCheat(
                          `eventTypes.${eventType}` as Parameters<
                            typeof tAntiCheat
                          >[0]
                        )}
                        : {count}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <ParticipantAntiCheatTimeline
            assignmentId={assignmentId}
            userId={userId}
          />
        </>
      ) : null}
    </div>
  );
}
