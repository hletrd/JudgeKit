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
import { ParticipantTimelineBar } from "@/components/contest/participant-timeline-bar";
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
        href={`/contests/manage/${assignmentId}`}
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
                          href={`/problems/${problem.problemId}`}
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
                        {(() => {
                          const firstAc = timeline?.summary.firstAcAt ?? ranking?.firstAcAt;
                          if (!firstAc) return "-";
                          const date = typeof firstAc === "number" ? new Date(firstAc) : firstAc;
                          return formatDateTimeInTimeZone(date, locale, timeZone);
                        })()}
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
          <ParticipantTimelineBar
            participant={participantTimeline.participant}
            assignmentProblems={assignmentProblems}
            timelineByProblem={timelineByProblem}
            locale={locale}
            timeZone={timeZone}
            translations={{
              noSubmissions: t("submissionHistory.noSubmissions"),
              pointsValue: (value: number) => t("pointsValue", { value }),
              attempts: (count: number) => t("problemSummary.attempts", { count }),
              snapshots: (count: number) => t("problemSummary.snapshots", { count }),
              bestScore: t("problemSummary.bestScore"),
              timeToFirstSubmission: t("problemSummary.timeToFirstSubmission"),
              timeToSolve: t("problemSummary.timeToSolve"),
              wrongBeforeAc: (count: number) => t("problemSummary.wrongBeforeAc", { count }),
              relativeTime: (minutes: number, seconds: number) =>
                t("problemSummary.relativeTime", { minutes, seconds }),
              firstAccepted: t("problemSummary.firstAccepted"),
              codeSnapshot: (chars: number) => t("problemSummary.codeSnapshot", { chars }),
              view: tCommon("view"),
              tries: (count: number) => t("problemSummary.tries", { count }),
              best: (score: string | number) => t("problemSummary.best", { score }),
            }}
            statusLabels={statusLabels}
          />
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
