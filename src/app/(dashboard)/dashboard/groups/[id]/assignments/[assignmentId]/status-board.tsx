import Link from "next/link";
import { PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type AssignmentStudentStatusRow } from "@/lib/assignments/submissions";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import type { SubmissionStatus } from "@/types";
import { ScoreOverrideDialog, type ScoreOverrideLabels } from "./score-override-dialog";

type StatusFilterValue =
  | "all"
  | "not_submitted"
  | "pending"
  | "queued"
  | "judging"
  | "accepted"
  | "wrong_answer"
  | "time_limit"
  | "memory_limit"
  | "runtime_error"
  | "compile_error";

interface ProblemHeader {
  problemId: string;
  title: string;
  points: number;
}

export interface StatusBoardLabels {
  boardTitle: string;
  student: string;
  class: string;
  totalScore: string;
  attempts: string;
  status: string;
  lastSubmission: string;
  bestScore: string;
  latestSubmission: string;
  noSubmission: string;
  noFilteredStudents: string;
  notSet: string;
  statsMean: string;
  statsMedian: string;
  statsSubmitted: string;
  statsPerfect: string;
  overrideLabels?: ScoreOverrideLabels;
}

export interface StatusBoardProps {
  filteredRows: AssignmentStudentStatusRow[];
  problems: ProblemHeader[];
  totalPoints: number;
  statusLabels: Record<Exclude<StatusFilterValue, "all">, string>;
  locale: string;
  timeZone: string;
  labels: StatusBoardLabels;
  groupId: string;
  assignmentId: string;
  canManageOverrides?: boolean;
}

function formatBoardScore(score: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(score);
}

function getRowStatusFilterValue(row: AssignmentStudentStatusRow): Exclude<StatusFilterValue, "all"> {
  return row.latestStatus ?? "not_submitted";
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const midpoint = Math.floor(values.length / 2);

  if (values.length % 2 === 1) {
    return values[midpoint] ?? 0;
  }

  return ((values[midpoint - 1] ?? 0) + (values[midpoint] ?? 0)) / 2;
}

export function StatusBoard({
  filteredRows,
  problems,
  totalPoints,
  statusLabels,
  locale,
  timeZone,
  labels,
  groupId,
  assignmentId,
  canManageOverrides = false,
}: StatusBoardProps) {
  const scoreValues = filteredRows
    .map((row) => row.bestTotalScore)
    .sort((left, right) => left - right);
  const submittedCount = filteredRows.filter((row) => row.attemptCount > 0).length;
  const perfectScoreCount = filteredRows.filter((row) => row.bestTotalScore >= totalPoints).length;
  const meanScore =
    scoreValues.length === 0
      ? 0
      : scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;
  const medianScore = getMedian(scoreValues);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.boardTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{labels.statsMean}</div>
            <div className="text-lg font-semibold">
              {formatBoardScore(meanScore, locale)}/{formatBoardScore(totalPoints, locale)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{labels.statsMedian}</div>
            <div className="text-lg font-semibold">
              {formatBoardScore(medianScore, locale)}/{formatBoardScore(totalPoints, locale)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{labels.statsSubmitted}</div>
            <div className="text-lg font-semibold">{submittedCount}/{filteredRows.length}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{labels.statsPerfect}</div>
            <div className="text-lg font-semibold">{perfectScoreCount}</div>
          </div>
        </div>
        <Table data-testid="assignment-status-table">
          <TableHeader>
            <TableRow>
              <TableHead>{labels.student}</TableHead>
              <TableHead>{labels.class}</TableHead>
              <TableHead>{labels.totalScore}</TableHead>
              <TableHead>{labels.attempts}</TableHead>
              <TableHead>{labels.status}</TableHead>
              <TableHead>{labels.lastSubmission}</TableHead>
              {problems.map((problem) => (
                <TableHead key={problem.problemId}>
                  <div className="space-y-1">
                    <div>{problem.title}</div>
                    <div className="text-xs text-muted-foreground">{problem.points} pt</div>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => {
              const rowStatus = getRowStatusFilterValue(row);

              return (
                <TableRow key={row.userId}>
                  <TableCell className="align-top whitespace-normal">
                    <Link
                      href={`/dashboard/groups/${groupId}/assignments/${assignmentId}/student/${row.userId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">@{row.username}</div>
                  </TableCell>
                  <TableCell className="align-top">{row.className ?? labels.notSet}</TableCell>
                  <TableCell
                    className="align-top"
                    data-testid={`assignment-total-score-${row.userId}`}
                  >
                    {formatBoardScore(row.bestTotalScore, locale)}/{formatBoardScore(totalPoints, locale)}
                  </TableCell>
                  <TableCell
                    className="align-top"
                    data-testid={`assignment-attempt-count-${row.userId}`}
                  >
                    {row.attemptCount}
                  </TableCell>
                  <TableCell
                    className="align-top"
                    data-testid={`assignment-row-status-${row.userId}`}
                  >
                    {row.latestStatus ? (
                      <SubmissionStatusBadge
                        label={statusLabels[rowStatus]}
                        status={row.latestStatus}
                      />
                    ) : (
                      <Badge variant="outline">{statusLabels[rowStatus]}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    {row.latestSubmissionId ? (
                      <div className="space-y-1">
                        <div>
                          <Link
                            href={`/dashboard/submissions/${row.latestSubmissionId}`}
                            className="text-primary hover:underline"
                          >
                            {formatSubmissionIdPrefix(row.latestSubmissionId)}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.latestSubmittedAt
                            ? formatDateTimeInTimeZone(row.latestSubmittedAt, locale, timeZone)
                            : "-"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{labels.noSubmission}</span>
                    )}
                  </TableCell>
                  {row.problems.map((problem) => (
                    <TableCell
                      key={problem.problemId}
                      className="align-top whitespace-normal"
                      data-testid={`assignment-problem-score-${row.userId}-${problem.problemId}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className={problem.isOverridden ? "italic" : ""}>
                            {labels.bestScore}: {formatBoardScore(problem.bestScore ?? 0, locale)}/
                            {formatBoardScore(problem.points, locale)}
                          </span>
                          {problem.isOverridden && labels.overrideLabels && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <PenLine className="size-3 shrink-0 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>{labels.overrideLabels.overrideIndicator}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {canManageOverrides && labels.overrideLabels && (
                            <ScoreOverrideDialog
                              groupId={groupId}
                              assignmentId={assignmentId}
                              problemId={problem.problemId}
                              userId={row.userId}
                              currentScore={problem.bestScore ?? 0}
                              maxPoints={problem.points}
                              isOverridden={problem.isOverridden}
                              labels={labels.overrideLabels}
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {labels.attempts}: {problem.attemptCount}
                        </div>
                        {problem.latestSubmissionId ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {problem.latestStatus ? (
                              <SubmissionStatusBadge
                                className="text-xs"
                                label={statusLabels[problem.latestStatus as SubmissionStatus]}
                                status={problem.latestStatus}
                              />
                            ) : (
                              <Badge variant="outline">{statusLabels.not_submitted}</Badge>
                            )}
                            <Link
                              href={`/dashboard/submissions/${problem.latestSubmissionId}`}
                              className="text-primary hover:underline"
                            >
                              {formatSubmissionIdPrefix(problem.latestSubmissionId)}
                            </Link>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {labels.latestSubmission}: {labels.noSubmission}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6 + problems.length}
                  className="text-center text-muted-foreground"
                >
                  {labels.noFilteredStudents}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
