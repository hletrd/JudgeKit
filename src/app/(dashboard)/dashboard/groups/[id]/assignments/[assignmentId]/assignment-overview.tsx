import Link from "next/link";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import type { StudentProblemProgress, StudentProblemStatus } from "@/lib/assignments/submissions";

interface AssignmentProblemEntry {
  id: string;
  sortOrder: number | null;
  points: number | null;
  problem: { id: string; title: string } | null;
}

export interface AssignmentOverviewLabels {
  overviewTitle: string;
  problemsTitle: string;
  descriptionFallback: string;
  lateDeadline: string;
  latePenalty: string;
  points: string;
  openProblem: string;
  noProblems: string;
  statusUpcoming: string;
  statusClosed: string;
  statusOpen: string;
  startsAt: string;
  deadline: string;
  back: string;
  groupDetail: string;
  action: string;
  assignments: string;
  problemCount: string;
  titleColumn: string;
  deadlineCountdown: string;
  lateDeadlineCountdown: string;
  solved: string;
  attempted: string;
  untried: string;
  examBadgeScheduled?: string;
  examBadgeWindowed?: string;
  examDuration?: string;
}

export interface AssignmentOverviewProps {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    startsAt: string | Date | null;
    deadline: string | Date | null;
    lateDeadline: string | Date | null;
    latePenalty: number | null;
    group: { name: string } | null;
    examMode?: string;
    examDurationMinutes?: number | null;
  };
  sortedProblems: AssignmentProblemEntry[];
  totalPoints: number;
  isUpcoming: boolean;
  isPast: boolean;
  groupId: string;
  locale: string;
  timeZone: string;
  labels: AssignmentOverviewLabels;
  problemStatuses?: StudentProblemStatus[];
}

function ProgressIcon({ progress, labels }: { progress: StudentProblemProgress; labels: AssignmentOverviewLabels }) {
  if (progress === "solved") {
    return (
      <>
        <CheckCircle2
          className="size-4 shrink-0 text-green-700 dark:text-green-400"
          aria-hidden="true"
        />
        <span className="sr-only">{labels.solved}</span>
      </>
    );
  }
  if (progress === "attempted") {
    return (
      <>
        <Circle
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <span className="sr-only">{labels.attempted}</span>
      </>
    );
  }
  return (
    <>
      <MinusCircle
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="sr-only">{labels.untried}</span>
    </>
  );
}

export function AssignmentOverview({
  assignment,
  sortedProblems,
  totalPoints,
  isUpcoming,
  isPast,
  groupId,
  locale,
  timeZone,
  labels,
  problemStatuses,
}: AssignmentOverviewProps) {
  const statusMap = new Map<string, StudentProblemProgress>(
    (problemStatuses ?? []).map((s) => [s.problemId, s.progress])
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{labels.assignments}</Badge>
            <Badge variant="secondary">{labels.problemCount}</Badge>
            {assignment.examMode === "scheduled" && (
              <Badge variant="default">{labels.examBadgeScheduled}</Badge>
            )}
            {assignment.examMode === "windowed" && (
              <Badge variant="secondary">
                {labels.examBadgeWindowed}
              </Badge>
            )}
          </div>
          <h2 className="text-3xl font-bold">{assignment.title}</h2>
          <p className="text-sm text-muted-foreground">
            {assignment.group?.name ?? labels.groupDetail} · {labels.points}: {totalPoints}
          </p>
        </div>

        <Link href={`/dashboard/groups/${groupId}`}>
          <Button variant="outline">{labels.back}</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{labels.overviewTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {isUpcoming ? (
              <Badge variant="secondary">{labels.statusUpcoming}</Badge>
            ) : isPast ? (
              <Badge variant="outline">{labels.statusClosed}</Badge>
            ) : (
              <Badge variant="success">{labels.statusOpen}</Badge>
            )}
            <Badge variant="outline">{labels.points}: {totalPoints}</Badge>
          </div>

          <p className="description-copy text-sm text-muted-foreground">
            {assignment.description || labels.descriptionFallback}
          </p>

          <dl className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium">{labels.startsAt}</dt>
              <dd className="text-sm text-muted-foreground">
                {assignment.startsAt
                  ? formatDateTimeInTimeZone(assignment.startsAt, locale, timeZone)
                  : "-"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">{labels.deadline}</dt>
              <dd className="text-sm text-muted-foreground">
                {assignment.deadline
                  ? formatDateTimeInTimeZone(assignment.deadline, locale, timeZone)
                  : "-"}
              </dd>
              {assignment.deadline && (
                <div className="text-xs">
                  <CountdownTimer
                    deadline={new Date(assignment.deadline).getTime()}
                    label={labels.deadlineCountdown}
                  />
                </div>
              )}
            </div>
            {assignment.examMode !== "windowed" && (
              <div className="space-y-1">
                <dt className="text-sm font-medium">{labels.lateDeadline}</dt>
                <dd className="text-sm text-muted-foreground">
                  {assignment.lateDeadline
                    ? formatDateTimeInTimeZone(assignment.lateDeadline, locale, timeZone)
                    : "-"}
                </dd>
                {assignment.lateDeadline && (
                  <div className="text-xs">
                    <CountdownTimer
                      deadline={new Date(assignment.lateDeadline).getTime()}
                      label={labels.lateDeadlineCountdown}
                    />
                  </div>
                )}
              </div>
            )}
            {assignment.examMode !== "windowed" && (
              <div className="space-y-1">
                <dt className="text-sm font-medium">{labels.latePenalty}</dt>
                <dd className="text-sm text-muted-foreground">{assignment.latePenalty ?? 0}%</dd>
              </div>
            )}
            {assignment.examMode === "windowed" && assignment.examDurationMinutes && (
              <div className="space-y-1">
                <dt className="text-sm font-medium">{labels.examDuration}</dt>
                <dd className="text-sm text-muted-foreground">{assignment.examDurationMinutes} min</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.problemsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.titleColumn}</TableHead>
                <TableHead>{labels.points}</TableHead>
                <TableHead>{labels.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProblems.map((problem) => {
                const progress = problem.problem ? statusMap.get(problem.problem.id) : undefined;
                return (
                <TableRow key={problem.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {problemStatuses && problem.problem && (
                        <ProgressIcon progress={progress ?? "untried"} labels={labels} />
                      )}
                      {problem.problem ? (
                        <Link
                          href={`/dashboard/problems/${problem.problem.id}?assignmentId=${assignment.id}`}
                          className="hover:underline"
                        >
                          {problem.problem.title}
                        </Link>
                      ) : "-"}
                    </div>
                  </TableCell>
                  <TableCell>{problem.points ?? 100}</TableCell>
                  <TableCell>
                    {problem.problem ? (
                      <Link href={`/dashboard/problems/${problem.problem.id}?assignmentId=${assignment.id}`}>
                        <Button variant="outline" size="sm">
                          {labels.openProblem}
                        </Button>
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
              {sortedProblems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {labels.noProblems}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
