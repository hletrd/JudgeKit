"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, FileText, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type AssignmentStudentStatusRow } from "@/lib/assignments/submissions";
import {
  getAssignmentParticipantStatus,
  type AssignmentParticipantStatus,
} from "@/lib/assignments/participant-status";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import type { SubmissionStatus } from "@/types";
import { ScoreOverrideDialog, type ScoreOverrideLabels } from "./score-override-dialog";

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
  pointsAbbreviation: string;
  examSessionStatus?: string;
  examSessionNotStarted?: string;
  examSessionInProgress?: string;
  examSessionCompleted?: string;
  viewSubmissions?: string;
  overrideLabels?: ScoreOverrideLabels;
}

export interface StatusBoardProps {
  filteredRows: AssignmentStudentStatusRow[];
  problems: ProblemHeader[];
  totalPoints: number;
  statusLabels: Record<AssignmentParticipantStatus, string>;
  locale: string;
  timeZone: string;
  labels: StatusBoardLabels;
  groupId: string;
  assignmentId: string;
  canManageOverrides?: boolean;
  examMode?: string;
  examSessions?: Array<{ userId: string; startedAt: string; personalDeadline: string }>;
  isContestView?: boolean;
  currentTimeMs?: number;
}

function formatBoardScore(score: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(score);
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

function MobileStudentCard({
  row,
  rowStatus,
  problems,
  totalPoints,
  statusLabels,
  locale,
  timeZone,
  labels,
  groupId,
  assignmentId,
  isContestView,
  canManageOverrides,
  examMode,
  examSession,
  now,
}: {
  row: AssignmentStudentStatusRow;
  rowStatus: AssignmentParticipantStatus;
  problems: ProblemHeader[];
  totalPoints: number;
  statusLabels: Record<AssignmentParticipantStatus, string>;
  locale: string;
  timeZone: string;
  labels: StatusBoardLabels;
  groupId: string;
  assignmentId: string;
  isContestView: boolean;
  canManageOverrides: boolean;
  examMode?: string;
  examSession?: { startedAt: string; personalDeadline: string } | undefined;
  now: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border p-3">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={isContestView
                  ? `/contests/manage/${assignmentId}/participant/${row.userId}`
                  : `/groups/${groupId}/assignments/${assignmentId}/student/${row.userId}`}
                className="font-medium text-primary hover:underline"
              >
                {row.name}
              </Link>
              <span className="text-xs text-muted-foreground">@{row.username}</span>
              {isContestView && labels.viewSubmissions && (
                <Link
                  href={`/contests/manage/${assignmentId}/participant/${row.userId}/submissions`}
                  onClick={(e) => e.stopPropagation()}
                  className="ml-auto inline-flex"
                >
                  <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
                    <FileText className="size-3" />
                    {labels.viewSubmissions}
                  </Button>
                </Link>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span>{formatBoardScore(row.bestTotalScore, locale)}/{formatBoardScore(totalPoints, locale)}</span>
              <span className="text-muted-foreground">·</span>
              {rowStatus === "not_submitted" ? (
                <Badge variant="outline" className="text-xs">{statusLabels[rowStatus]}</Badge>
              ) : rowStatus === "in_progress" ? (
                <Badge variant="secondary" className="text-xs">{statusLabels[rowStatus]}</Badge>
              ) : (
                <SubmissionStatusBadge
                  className="text-xs"
                  label={statusLabels[rowStatus]}
                  status={rowStatus}
                  locale={locale}
                />
              )}
            </div>
          </div>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-2">
          <div className="text-xs text-muted-foreground">
            {labels.class}: {row.className ?? labels.notSet} · {labels.attempts}: {row.attemptCount}
          </div>
          {row.latestSubmissionId && (
            <div className="text-xs">
              {labels.lastSubmission}:{" "}
              <Link
                href={`/submissions/${row.latestSubmissionId}`}
                className="text-primary hover:underline"
              >
                {formatSubmissionIdPrefix(row.latestSubmissionId)}
              </Link>
              {row.latestSubmittedAt && (
                <span className="text-muted-foreground">
                  {" "}{formatDateTimeInTimeZone(row.latestSubmittedAt, locale, timeZone)}
                </span>
              )}
            </div>
          )}
          {examMode === "windowed" && labels.examSessionStatus && (
            <div className="text-xs">
              {labels.examSessionStatus}:{" "}
              {examSession ? (
                <Badge variant={now > new Date(examSession.personalDeadline).getTime() ? "outline" : "secondary"} className="text-xs">
                  {now > new Date(examSession.personalDeadline).getTime() ? labels.examSessionCompleted : labels.examSessionInProgress}
                </Badge>
              ) : (
                <span className="text-muted-foreground">{labels.examSessionNotStarted}</span>
              )}
            </div>
          )}
          {problems.map((problem) => {
            const problemRow = row.problems.find((p) => p.problemId === problem.problemId);
            return (
              <div key={problem.problemId} className="rounded-md border p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium">{problem.title}</span>
                  <span className="text-muted-foreground">{problem.points}{labels.pointsAbbreviation}</span>
                </div>
                {problemRow && (
                  <>
                    <div className="flex items-center gap-1">
                      <span>{labels.bestScore}: {formatBoardScore(problemRow.bestScore ?? 0, locale)}/{formatBoardScore(problem.points, locale)}</span>
                      {problemRow.isOverridden && (
                        <PenLine className="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
                      )}
                    </div>
                    <div className="text-muted-foreground">{labels.attempts}: {problemRow.attemptCount}</div>
                    {problemRow.latestSubmissionId && (
                      <div className="flex items-center gap-1">
                        {problemRow.latestStatus ? (
                          <SubmissionStatusBadge
                            className="text-xs"
                            label={statusLabels[problemRow.latestStatus as SubmissionStatus]}
                            status={problemRow.latestStatus}
                            locale={locale}
                          />
                        ) : (
                          <Badge variant="outline" className="text-xs">{statusLabels.not_submitted}</Badge>
                        )}
                        <Link
                          href={`/submissions/${problemRow.latestSubmissionId}`}
                          className="text-primary hover:underline"
                        >
                          {formatSubmissionIdPrefix(problemRow.latestSubmissionId)}
                        </Link>
                      </div>
                    )}
                    {canManageOverrides && labels.overrideLabels && (
                      <ScoreOverrideDialog
                        groupId={groupId}
                        assignmentId={assignmentId}
                        problemId={problem.problemId}
                        userId={row.userId}
                        currentScore={problemRow.bestScore ?? 0}
                        maxPoints={problem.points}
                        isOverridden={problemRow.isOverridden}
                        labels={labels.overrideLabels}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
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
  examMode,
  examSessions,
  isContestView = false,
  currentTimeMs,
}: StatusBoardProps) {
  const now = currentTimeMs ?? 0;
  const examSessionMap = new Map(examSessions?.map((session) => [session.userId, session]) ?? []);
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
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table data-testid="assignment-status-table">
            <TableHeader>
              <TableRow>
                <TableHead>{labels.student}</TableHead>
                <TableHead>{labels.class}</TableHead>
                <TableHead>{labels.totalScore}</TableHead>
                <TableHead>{labels.attempts}</TableHead>
                <TableHead>{labels.status}</TableHead>
                <TableHead>{labels.lastSubmission}</TableHead>
                {examMode === "windowed" && labels.examSessionStatus && (
                  <TableHead>{labels.examSessionStatus}</TableHead>
                )}
                {problems.map((problem) => (
                  <TableHead key={problem.problemId}>
                    <div className="space-y-1">
                      <div>{problem.title}</div>
                      <div className="text-xs text-muted-foreground">{problem.points} {labels.pointsAbbreviation}</div>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const examSession = examSessionMap.get(row.userId);
                const rowStatus = getAssignmentParticipantStatus({
                  latestStatus: row.latestStatus,
                  attemptCount: row.attemptCount,
                  bestTotalScore: row.bestTotalScore,
                  totalPoints,
                  examSessionStartedAt: examSession?.startedAt ?? null,
                  examSessionPersonalDeadline: examSession?.personalDeadline ?? null,
                  now,
                });

                return (
                  <TableRow key={row.userId}>
                    <TableCell className="align-top whitespace-normal">
                      <Link
                        href={isContestView
                          ? `/contests/manage/${assignmentId}/participant/${row.userId}`
                          : `/groups/${groupId}/assignments/${assignmentId}/student/${row.userId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">@{row.username}</div>
                      {isContestView && labels.viewSubmissions && (
                        <Link
                          href={`/contests/manage/${assignmentId}/participant/${row.userId}/submissions`}
                          className="mt-1 inline-flex"
                        >
                          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
                            <FileText className="size-3" />
                            {labels.viewSubmissions}
                          </Button>
                        </Link>
                      )}
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
                      {rowStatus === "not_submitted" ? (
                        <Badge variant="outline">{statusLabels[rowStatus]}</Badge>
                      ) : rowStatus === "in_progress" ? (
                        <Badge variant="secondary">{statusLabels[rowStatus]}</Badge>
                      ) : (
                        <SubmissionStatusBadge
                          label={statusLabels[rowStatus]}
                          status={rowStatus}
                          locale={locale}
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      {row.latestSubmissionId ? (
                        <div className="space-y-1">
                          <div>
                            <Link
                              href={`/submissions/${row.latestSubmissionId}`}
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
                    {examMode === "windowed" && labels.examSessionStatus && (() => {
                      if (!examSession) {
                        return <TableCell className="align-top text-muted-foreground">{labels.examSessionNotStarted}</TableCell>;
                      }
                      const deadline = new Date(examSession.personalDeadline).getTime();
                      const isExpired = now > deadline;
                      return (
                        <TableCell className="align-top">
                          <Badge variant={isExpired ? "outline" : "secondary"}>
                            {isExpired ? labels.examSessionCompleted : labels.examSessionInProgress}
                          </Badge>
                        </TableCell>
                      );
                    })()}
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
                                    <PenLine className="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
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
                                  locale={locale}
                                />
                              ) : (
                                <Badge variant="outline">{statusLabels.not_submitted}</Badge>
                              )}
                              <Link
                                href={`/submissions/${problem.latestSubmissionId}`}
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
                    colSpan={6 + problems.length + (examMode === "windowed" ? 1 : 0)}
                    className="text-center text-muted-foreground"
                  >
                    {labels.noFilteredStudents}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {filteredRows.map((row) => {
            const examSession = examSessionMap.get(row.userId);
            const rowStatus = getAssignmentParticipantStatus({
              latestStatus: row.latestStatus,
              attemptCount: row.attemptCount,
              bestTotalScore: row.bestTotalScore,
              totalPoints,
              examSessionStartedAt: examSession?.startedAt ?? null,
              examSessionPersonalDeadline: examSession?.personalDeadline ?? null,
              now,
            });

            return (
              <MobileStudentCard
                key={row.userId}
                row={row}
                rowStatus={rowStatus}
                problems={problems}
                totalPoints={totalPoints}
                statusLabels={statusLabels}
                locale={locale}
                timeZone={timeZone}
                labels={labels}
                groupId={groupId}
                assignmentId={assignmentId}
                isContestView={isContestView}
                canManageOverrides={canManageOverrides}
                examMode={examMode}
                examSession={examSession}
                now={now}
              />
            );
          })}
          {filteredRows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{labels.noFilteredStudents}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
