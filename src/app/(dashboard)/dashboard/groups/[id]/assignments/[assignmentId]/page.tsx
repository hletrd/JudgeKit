import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auth } from "@/lib/auth";
import {
  canViewAssignmentSubmissions,
  getAssignmentStatusRows,
  type AssignmentStudentStatusRow,
} from "@/lib/assignments/submissions";
import { canAccessGroup } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatSubmissionIdPrefix } from "@/lib/submissions/id";
import { getSubmissionStatusVariant } from "@/lib/submissions/status";
import { notFound, redirect } from "next/navigation";
import type { SubmissionStatus, UserRole } from "@/types";

const STATUS_FILTER_VALUES = [
  "all",
  "not_submitted",
  "pending",
  "queued",
  "judging",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
] as const;

type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

function formatBoardScore(score: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(score);
}

function normalizeStatusFilter(value: string | undefined): StatusFilterValue {
  if (value && STATUS_FILTER_VALUES.includes(value as StatusFilterValue)) {
    return value as StatusFilterValue;
  }

  return "all";
}

function getRowStatusFilterValue(row: AssignmentStudentStatusRow): Exclude<StatusFilterValue, "all"> {
  return row.latestStatus ?? "not_submitted";
}

function buildStatusLabels(
  tSubmissions: Awaited<ReturnType<typeof getTranslations>>,
  locale: string
): Record<Exclude<StatusFilterValue, "all">, string> {
  const notSubmitted = locale === "ko" ? "미제출" : "Not submitted";

  return {
    not_submitted: notSubmitted,
    pending: tSubmissions("status.pending"),
    queued: tSubmissions("status.queued"),
    judging: tSubmissions("status.judging"),
    accepted: tSubmissions("status.accepted"),
    wrong_answer: tSubmissions("status.wrong_answer"),
    time_limit: tSubmissions("status.time_limit"),
    memory_limit: tSubmissions("status.memory_limit"),
    runtime_error: tSubmissions("status.runtime_error"),
    compile_error: tSubmissions("status.compile_error"),
  } satisfies Record<Exclude<StatusFilterValue, "all">, string>;
}

function matchesStudentQuery(row: AssignmentStudentStatusRow, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  return [row.name, row.username, row.className ?? ""]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

export default async function GroupAssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
  searchParams?: Promise<{ status?: string; student?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ id: groupId, assignmentId }, resolvedSearchParams, locale, timeZone, tGroups, tCommon, tSubmissions] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve(undefined),
      getLocale(),
      getResolvedSystemTimeZone(),
      getTranslations("groups"),
      getTranslations("common"),
      getTranslations("submissions"),
    ]);

  const role = session.user.role as UserRole;
  const canViewBoard = await canViewAssignmentSubmissions(assignmentId, session.user.id, role);
  const hasGroupAccess = await canAccessGroup(groupId, session.user.id, role);

  if (!canViewBoard && !hasGroupAccess) {
    redirect("/dashboard/groups");
  }

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    with: {
      group: {
        columns: {
          instructorId: true,
          name: true,
        },
      },
      assignmentProblems: {
        with: {
          problem: {
            columns: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!assignment || assignment.groupId !== groupId) {
    notFound();
  }

  const sortedProblems = [...assignment.assignmentProblems].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  );
  const totalPoints = sortedProblems.reduce((sum, problem) => sum + (problem.points ?? 100), 0);
  const now = new Date();
  const isUpcoming = assignment.startsAt && new Date(assignment.startsAt) > now;
  const isPast =
    (assignment.lateDeadline && new Date(assignment.lateDeadline) < now) ||
    (!assignment.lateDeadline && assignment.deadline && new Date(assignment.deadline) < now);
  const assignmentOverviewTitle = locale === "ko" ? "과제 안내" : "Assignment overview";
  const assignmentProblemsTitle = locale === "ko" ? "문제 목록" : "Problems";
  const assignmentDescriptionFallback =
    locale === "ko" ? "과제 설명이 아직 없습니다." : "No assignment description yet.";
  const lateDeadlineLabel = locale === "ko" ? "지각 허용 마감" : "Late deadline";
  const latePenaltyLabel = locale === "ko" ? "지각 감점" : "Late penalty";
  const pointsLabel = locale === "ko" ? "배점" : "Points";
  const openProblemLabel = locale === "ko" ? "문제 열기" : "Open problem";
  const noProblemsLabel = locale === "ko" ? "등록된 문제가 없습니다." : "No problems assigned yet.";

  if (!canViewBoard) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{tGroups("assignments")}</Badge>
              <Badge variant="secondary">{tGroups("problemCount", { count: sortedProblems.length })}</Badge>
            </div>
            <h2 className="text-3xl font-bold">{assignment.title}</h2>
            <p className="text-sm text-muted-foreground">
              {assignment.group?.name ?? tGroups("detail")} · {pointsLabel}: {totalPoints}
            </p>
          </div>

          <Link href={`/dashboard/groups/${groupId}`}>
            <Button variant="outline">{tCommon("back")}</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{assignmentOverviewTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {isUpcoming ? (
                <Badge variant="secondary">{tGroups("statusUpcoming")}</Badge>
              ) : isPast ? (
                <Badge variant="outline">{tGroups("statusClosed")}</Badge>
              ) : (
                <Badge className="bg-green-500">{tGroups("statusOpen")}</Badge>
              )}
              <Badge variant="outline">{pointsLabel}: {totalPoints}</Badge>
            </div>

            <p className="description-copy text-sm text-muted-foreground">
              {assignment.description || assignmentDescriptionFallback}
            </p>

            <dl className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-sm font-medium">{tGroups("assignmentTable.startsAt")}</dt>
                <dd className="text-sm text-muted-foreground">
                  {assignment.startsAt
                    ? formatDateTimeInTimeZone(assignment.startsAt, locale, timeZone)
                    : "-"}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium">{tGroups("assignmentTable.deadline")}</dt>
                <dd className="text-sm text-muted-foreground">
                  {assignment.deadline
                    ? formatDateTimeInTimeZone(assignment.deadline, locale, timeZone)
                    : "-"}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium">{lateDeadlineLabel}</dt>
                <dd className="text-sm text-muted-foreground">
                  {assignment.lateDeadline
                    ? formatDateTimeInTimeZone(assignment.lateDeadline, locale, timeZone)
                    : "-"}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium">{latePenaltyLabel}</dt>
                <dd className="text-sm text-muted-foreground">{assignment.latePenalty ?? 0}%</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{assignmentProblemsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tGroups("assignmentTable.title")}</TableHead>
                  <TableHead>{pointsLabel}</TableHead>
                  <TableHead>{tCommon("action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProblems.map((problem) => (
                  <TableRow key={problem.id}>
                    <TableCell className="font-medium">{problem.problem?.title ?? "-"}</TableCell>
                    <TableCell>{problem.points ?? 100}</TableCell>
                    <TableCell>
                      {problem.problem ? (
                        <Link href={`/dashboard/problems/${problem.problem.id}?assignmentId=${assignment.id}`}>
                          <Button variant="outline" size="sm">
                            {openProblemLabel}
                          </Button>
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {sortedProblems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {noProblemsLabel}
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

  const assignmentStatus = await getAssignmentStatusRows(assignmentId);

  if (!assignmentStatus || assignmentStatus.assignment.groupId !== groupId) {
    notFound();
  }

  const statusLabels = buildStatusLabels(tSubmissions, locale);
  const statusFilter = normalizeStatusFilter(resolvedSearchParams?.status);
  const studentQuery = resolvedSearchParams?.student?.trim() ?? "";
  const normalizedStudentQuery = studentQuery.toLocaleLowerCase();
  const filteredRows = assignmentStatus.rows.filter((row) => {
    if (!matchesStudentQuery(row, normalizedStudentQuery)) {
      return false;
    }

    if (statusFilter === "all") {
      return true;
    }

    return getRowStatusFilterValue(row) === statusFilter;
  });
  const filterSummary =
    locale === "ko"
      ? `총 ${filteredRows.length}명의 학생`
      : `${filteredRows.length} student${filteredRows.length === 1 ? "" : "s"}`;
  const boardTitle = locale === "ko" ? "과제 현황" : "Assignment status board";
  const filterTitle = locale === "ko" ? "필터" : "Filters";
  const allStatusesLabel = locale === "ko" ? "모든 상태" : "All statuses";
  const bestScoreLabel = locale === "ko" ? "최고 점수" : "Best score";
  const attemptsLabel = locale === "ko" ? "시도" : "Attempts";
  const latestSubmissionLabel = locale === "ko" ? "최근 제출" : "Latest submission";
  const noLatestSubmissionLabel = locale === "ko" ? "제출 없음" : "No submission";
  const noFilteredStudentsLabel =
    locale === "ko" ? "조건에 맞는 학생이 없습니다." : "No students match the current filters.";
  const filterButtonLabel = locale === "ko" ? "적용" : "Apply";
  const resetButtonLabel = locale === "ko" ? "초기화" : "Reset";
  const totalScoreLabel = locale === "ko" ? "총점" : "Total score";
  const studentLabel = locale === "ko" ? "학생" : "Student";
  const statusLabel = locale === "ko" ? "상태" : "Status";
  const studentSearchLabel = locale === "ko" ? "학생 검색" : "Student search";
  const studentSearchPlaceholder =
    locale === "ko" ? "이름, 사용자명, 반으로 검색" : "Search by name, username, or class";
  const lastSubmissionLabel = locale === "ko" ? "마지막 제출" : "Last submission";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{boardTitle}</Badge>
            <Badge variant="secondary">{filterSummary}</Badge>
          </div>
          <h2 className="text-3xl font-bold">{assignmentStatus.assignment.title}</h2>
          <p className="text-sm text-muted-foreground">
            {assignment.group?.name ?? tGroups("detail")} · {totalScoreLabel}: {totalPoints}
          </p>
        </div>

        <Link href={`/dashboard/groups/${groupId}`}>
          <Button variant="outline">{tCommon("back")}</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{assignmentOverviewTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {isUpcoming ? (
              <Badge variant="secondary">{tGroups("statusUpcoming")}</Badge>
            ) : isPast ? (
              <Badge variant="outline">{tGroups("statusClosed")}</Badge>
            ) : (
              <Badge className="bg-green-500">{tGroups("statusOpen")}</Badge>
            )}
            <Badge variant="outline">{pointsLabel}: {totalPoints}</Badge>
          </div>

          <p className="description-copy text-sm text-muted-foreground">
            {assignment.description || assignmentDescriptionFallback}
          </p>

          <dl className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium">{tGroups("assignmentTable.startsAt")}</dt>
              <dd className="text-sm text-muted-foreground">
                {assignment.startsAt
                  ? formatDateTimeInTimeZone(assignment.startsAt, locale, timeZone)
                  : "-"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">{tGroups("assignmentTable.deadline")}</dt>
              <dd className="text-sm text-muted-foreground">
                {assignment.deadline
                  ? formatDateTimeInTimeZone(assignment.deadline, locale, timeZone)
                  : "-"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">{lateDeadlineLabel}</dt>
              <dd className="text-sm text-muted-foreground">
                {assignment.lateDeadline
                  ? formatDateTimeInTimeZone(assignment.lateDeadline, locale, timeZone)
                  : "-"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">{latePenaltyLabel}</dt>
              <dd className="text-sm text-muted-foreground">{assignment.latePenalty ?? 0}%</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filterTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="student-search">
                {studentSearchLabel}
              </label>
              <input
                id="student-search"
                name="student"
                defaultValue={studentQuery}
                placeholder={studentSearchPlaceholder}
                data-testid="assignment-student-search"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                type="search"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="status-filter">
                {statusLabel}
              </label>
              <select
                id="status-filter"
                name="status"
                defaultValue={statusFilter}
                data-testid="assignment-status-filter"
                className="flex h-10 min-w-48 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="all">{allStatusesLabel}</option>
                {STATUS_FILTER_VALUES.filter((value) => value !== "all").map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button type="submit">{filterButtonLabel}</Button>
              <Link href={`/dashboard/groups/${groupId}/assignments/${assignmentId}`}>
                <Button type="button" variant="outline">
                  {resetButtonLabel}
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{boardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="assignment-status-table">
            <TableHeader>
              <TableRow>
                <TableHead>{studentLabel}</TableHead>
                <TableHead>{tCommon("class")}</TableHead>
                <TableHead>{totalScoreLabel}</TableHead>
                <TableHead>{attemptsLabel}</TableHead>
                <TableHead>{statusLabel}</TableHead>
                <TableHead>{lastSubmissionLabel}</TableHead>
                {assignmentStatus.problems.map((problem) => (
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
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">@{row.username}</div>
                    </TableCell>
                    <TableCell className="align-top">{row.className ?? tCommon("notSet")}</TableCell>
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
                      <Badge
                        variant={
                          row.latestStatus ? getSubmissionStatusVariant(row.latestStatus) : "outline"
                        }
                      >
                        {statusLabels[rowStatus]}
                      </Badge>
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
                        <span className="text-muted-foreground">{noLatestSubmissionLabel}</span>
                      )}
                    </TableCell>
                    {row.problems.map((problem) => (
                      <TableCell
                        key={problem.problemId}
                        className="align-top whitespace-normal"
                        data-testid={`assignment-problem-score-${row.userId}-${problem.problemId}`}
                      >
                        <div className="space-y-1">
                          <div>
                            {bestScoreLabel}: {formatBoardScore(problem.bestScore ?? 0, locale)}/
                            {formatBoardScore(problem.points, locale)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {attemptsLabel}: {problem.attemptCount}
                          </div>
                          {problem.latestSubmissionId ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge
                                variant={
                                  problem.latestStatus
                                    ? getSubmissionStatusVariant(problem.latestStatus)
                                    : "outline"
                                }
                              >
                                {problem.latestStatus
                                  ? statusLabels[problem.latestStatus as SubmissionStatus]
                                  : statusLabels.not_submitted}
                              </Badge>
                              <Link
                                href={`/dashboard/submissions/${problem.latestSubmissionId}`}
                                className="text-primary hover:underline"
                              >
                                {formatSubmissionIdPrefix(problem.latestSubmissionId)}
                              </Link>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              {latestSubmissionLabel}: {noLatestSubmissionLabel}
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
                    colSpan={6 + assignmentStatus.problems.length}
                    className="text-center text-muted-foreground"
                  >
                    {noFilteredStudentsLabel}
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
