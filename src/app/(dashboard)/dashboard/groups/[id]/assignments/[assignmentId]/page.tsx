import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import {
  canViewAssignmentSubmissions,
  getAssignmentStatusRows,
  getStudentProblemStatuses,
} from "@/lib/assignments/submissions";
import { canAccessGroup } from "@/lib/auth/permissions";
import { canManageGroupResources } from "@/lib/assignments/management";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@/types";
import { AssignmentOverview } from "./assignment-overview";
import { FilterForm } from "./filter-form";
import { StatusBoard } from "./status-board";

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

function normalizeStatusFilter(value: string | undefined): StatusFilterValue {
  if (value && STATUS_FILTER_VALUES.includes(value as StatusFilterValue)) {
    return value as StatusFilterValue;
  }
  return "all";
}

function matchesStudentQuery(
  row: { name: string; username: string; className: string | null },
  normalizedQuery: string
) {
  if (!normalizedQuery) return true;
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

  const [
    { id: groupId, assignmentId },
    resolvedSearchParams,
    locale,
    timeZone,
    tGroups,
    tCommon,
    tSubmissions,
    tAssignment,
  ] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(undefined),
    getLocale(),
    getResolvedSystemTimeZone(),
    getTranslations("groups"),
    getTranslations("common"),
    getTranslations("submissions"),
    getTranslations("groups.assignmentDetail"),
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
  const totalPoints = sortedProblems.reduce((sum, p) => sum + (p.points ?? 100), 0);
  const now = new Date();
  const isUpcoming = assignment.startsAt != null && new Date(assignment.startsAt) > now;
  const isPast =
    (assignment.lateDeadline != null && new Date(assignment.lateDeadline) < now) ||
    (assignment.lateDeadline == null && assignment.deadline != null && new Date(assignment.deadline) < now);

  const overviewLabels = {
    overviewTitle: tAssignment("overviewTitle"),
    problemsTitle: tAssignment("problemsTitle"),
    descriptionFallback: tAssignment("descriptionFallback"),
    lateDeadline: tAssignment("lateDeadline"),
    latePenalty: tAssignment("latePenalty"),
    points: tAssignment("points"),
    openProblem: tAssignment("openProblem"),
    noProblems: tAssignment("noProblems"),
    statusUpcoming: tGroups("statusUpcoming"),
    statusClosed: tGroups("statusClosed"),
    statusOpen: tGroups("statusOpen"),
    startsAt: tGroups("assignmentTable.startsAt"),
    deadline: tGroups("assignmentTable.deadline"),
    back: tCommon("back"),
    groupDetail: tGroups("detail"),
    action: tCommon("action"),
    assignments: tGroups("assignments"),
    problemCount: tGroups("problemCount", { count: sortedProblems.length }),
    titleColumn: tGroups("assignmentTable.title"),
    deadlineCountdown: tAssignment("deadlineCountdown"),
    lateDeadlineCountdown: tAssignment("lateDeadlineCountdown"),
  };

  if (!canViewBoard) {
    const studentProblemStatuses = await getStudentProblemStatuses(assignmentId, session.user.id);
    return (
      <div className="space-y-6">
        <Link
          href={`/dashboard/groups/${groupId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {tCommon("back")}
        </Link>
        <AssignmentOverview
          assignment={assignment}
          sortedProblems={sortedProblems}
          totalPoints={totalPoints}
          isUpcoming={isUpcoming}
          isPast={isPast}
          groupId={groupId}
          locale={locale}
          timeZone={timeZone}
          labels={{
            ...overviewLabels,
            solved: tAssignment("solved"),
            attempted: tAssignment("attempted"),
            untried: tAssignment("untried"),
          }}
          problemStatuses={studentProblemStatuses}
        />
      </div>
    );
  }

  const assignmentStatus = await getAssignmentStatusRows(assignmentId);

  if (!assignmentStatus || assignmentStatus.assignment.groupId !== groupId) {
    notFound();
  }

  const statusLabels = {
    not_submitted: tAssignment("notSubmitted"),
    pending: tSubmissions("status.pending"),
    queued: tSubmissions("status.queued"),
    judging: tSubmissions("status.judging"),
    accepted: tSubmissions("status.accepted"),
    wrong_answer: tSubmissions("status.wrong_answer"),
    time_limit: tSubmissions("status.time_limit"),
    memory_limit: tSubmissions("status.memory_limit"),
    runtime_error: tSubmissions("status.runtime_error"),
    compile_error: tSubmissions("status.compile_error"),
  } as const;

  const statusFilter = normalizeStatusFilter(resolvedSearchParams?.status);
  const studentQuery = resolvedSearchParams?.student?.trim() ?? "";
  const normalizedStudentQuery = studentQuery.toLocaleLowerCase();

  const filteredRows = assignmentStatus.rows.filter((row) => {
    if (!matchesStudentQuery(row, normalizedStudentQuery)) return false;
    if (statusFilter === "all") return true;
    return (row.latestStatus ?? "not_submitted") === statusFilter;
  });

  const filterSummary = tAssignment("filterSummary", { count: filteredRows.length });
  const boardTitle = tAssignment("boardTitle");

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/groups/${groupId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{boardTitle}</Badge>
            <Badge variant="secondary">{filterSummary}</Badge>
          </div>
          <h2 className="text-3xl font-bold">{assignmentStatus.assignment.title}</h2>
          <p className="text-sm text-muted-foreground">
            {assignment.group?.name ?? tGroups("detail")} · {tAssignment("totalScore")}: {totalPoints}
          </p>
        </div>

        <Link href={`/dashboard/groups/${groupId}`}>
          <Button variant="outline">{tCommon("back")}</Button>
        </Link>
      </div>

      <AssignmentOverview
        assignment={assignment}
        sortedProblems={sortedProblems}
        totalPoints={totalPoints}
        isUpcoming={isUpcoming}
        isPast={isPast}
        groupId={groupId}
        locale={locale}
        timeZone={timeZone}
        labels={overviewLabels}
      />

      <FilterForm
        groupId={groupId}
        assignmentId={assignmentId}
        currentStatusFilter={statusFilter}
        currentStudentQuery={studentQuery}
        statusLabels={statusLabels}
        labels={{
          filtersTitle: tAssignment("filtersTitle"),
          studentSearch: tAssignment("studentSearch"),
          studentSearchPlaceholder: tAssignment("studentSearchPlaceholder"),
          status: tAssignment("status"),
          allStatuses: tAssignment("allStatuses"),
          applyFilter: tAssignment("applyFilter"),
          resetFilter: tAssignment("resetFilter"),
        }}
      />

      <StatusBoard
        filteredRows={filteredRows}
        problems={assignmentStatus.problems}
        totalPoints={totalPoints}
        statusLabels={statusLabels}
        locale={locale}
        timeZone={timeZone}
        groupId={groupId}
        assignmentId={assignmentId}
        canManageOverrides={canManageGroupResources(
          assignment.group?.instructorId ?? null,
          session.user.id,
          role
        )}
        labels={{
          boardTitle,
          student: tAssignment("student"),
          class: tCommon("class"),
          totalScore: tAssignment("totalScore"),
          attempts: tAssignment("attempts"),
          status: tAssignment("status"),
          lastSubmission: tAssignment("lastSubmission"),
          bestScore: tAssignment("bestScore"),
          latestSubmission: tAssignment("latestSubmission"),
          noSubmission: tAssignment("noSubmission"),
          noFilteredStudents: tAssignment("noFilteredStudents"),
          notSet: tCommon("notSet"),
          statsMean: tAssignment("statsMean"),
          statsMedian: tAssignment("statsMedian"),
          statsSubmitted: tAssignment("statsSubmitted"),
          statsPerfect: tAssignment("statsPerfect"),
          pointsAbbreviation: tAssignment("pointsAbbreviation"),
          overrideLabels: {
            scoreOverride: tAssignment("scoreOverride"),
            overrideScore: tAssignment("overrideScore"),
            overrideReason: tAssignment("overrideReason"),
            automatedScore: tAssignment("automatedScore"),
            saveOverride: tAssignment("saveOverride"),
            removeOverride: tAssignment("removeOverride"),
            overrideIndicator: tAssignment("overrideIndicator"),
            overrideSaveSuccess: tAssignment("overrideSaveSuccess"),
            overrideSaveFailed: tAssignment("overrideSaveFailed"),
            overrideRemoveSuccess: tAssignment("overrideRemoveSuccess"),
            overrideRemoveFailed: tAssignment("overrideRemoveFailed"),
          },
        }}
      />
    </div>
  );
}
