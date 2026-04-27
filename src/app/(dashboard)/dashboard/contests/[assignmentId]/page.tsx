import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HashTabs } from "@/components/hash-tabs";
import { auth } from "@/lib/auth";
import {
  canViewAssignmentSubmissions,
  getAssignmentStatusRows,
} from "@/lib/assignments/submissions";
import {
  ASSIGNMENT_PARTICIPANT_STATUS_VALUES,
  getAssignmentParticipantStatus,
} from "@/lib/assignments/participant-status";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { canAccessGroup } from "@/lib/auth/permissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { assignments, problems, submissions } from "@/lib/db/schema";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { notFound, redirect } from "next/navigation";
import { getExamSessionsForAssignment } from "@/lib/assignments/exam-sessions";
import { AssignmentOverview } from "@/components/assignment/assignment-overview";
import { FilterForm } from "../../groups/[id]/assignments/[assignmentId]/filter-form";
import { StatusBoard } from "../../groups/[id]/assignments/[assignmentId]/status-board";
import { LeaderboardTable } from "@/components/contest/leaderboard-table";
import { AccessCodeManager } from "@/components/contest/access-code-manager";
import { InviteParticipants } from "@/components/contest/invite-participants";
import { ContestQuickStats } from "@/components/contest/contest-quick-stats";
import { AntiCheatDashboard } from "@/components/contest/anti-cheat-dashboard";
import { AnalyticsCharts } from "@/components/contest/analytics-charts";
import { ExportButton } from "@/components/contest/export-button";
import { ContestAnnouncements } from "@/components/contest/contest-announcements";
import { ContestClarifications } from "@/components/contest/contest-clarifications";
import { RecruiterCandidatesPanel } from "@/components/contest/recruiter-candidates-panel";
import { RecruitingInvitationsPanel } from "@/components/contest/recruiting-invitations-panel";
import AssignmentFormDialog, { type AssignmentEditorValue } from "../../groups/[id]/assignment-form-dialog";
import { AssignmentDeleteButton } from "../../groups/[id]/assignment-delete-button";
import { getDbNow } from "@/lib/db-time";

const STATUS_FILTER_VALUES = ["all", ...ASSIGNMENT_PARTICIPANT_STATUS_VALUES] as const;

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

export async function generateMetadata({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { title: true },
  });
  const title = assignment?.title ?? "Contest";
  return {
    title,
    openGraph: { title },
  };
}

export default async function ContestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams?: Promise<{ status?: string; student?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [
    { assignmentId },
    resolvedSearchParams,
    locale,
    timeZone,
    t,
    tGroups,
    tCommon,
    tSubmissions,
    tAssignment,
  ] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(undefined),
    getLocale(),
    getResolvedSystemTimeZone(),
    getTranslations("contests"),
    getTranslations("groups"),
    getTranslations("common"),
    getTranslations("submissions"),
    getTranslations("groups.assignmentDetail"),
  ]);

  const role = session.user.role;
  const roleCapabilities = await resolveCapabilities(role);
  const canOverrideLockedProblems = roleCapabilities.has("groups.view_all");

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    with: {
      group: {
        columns: {
          id: true,
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

  if (!assignment || assignment.examMode === "none") {
    notFound();
  }

  const groupId = assignment.groupId;

  // Check access: admin/super_admin can see all, instructor can see their groups, student must be enrolled
  const canViewBoard = await canViewAssignmentSubmissions(assignmentId, session.user.id, role);
  let hasAccess = canViewBoard;
  if (!hasAccess) {
    hasAccess = await canAccessGroup(groupId, session.user.id, role);
  }

  if (!hasAccess) {
    redirect("/dashboard/contests");
  }

  const canManage = await canManageGroupResourcesAsync(
    assignment.group?.instructorId ?? null,
    session.user.id,
    role,
    groupId
  );

  const sortedProblems = [...assignment.assignmentProblems].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  );
  const totalPoints = sortedProblems.reduce((sum, p) => sum + (p.points ?? 100), 0);
  const now = await getDbNow();
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
    solved: tAssignment("solved"),
    attempted: tAssignment("attempted"),
    untried: tAssignment("untried"),
    examBadgeScheduled: tGroups("examBadgeScheduled"),
    examBadgeWindowed: tGroups("examBadgeWindowed", { duration: assignment.examDurationMinutes ?? 0 }),
    examDuration: tAssignment("examDuration"),
  };

  // Student view — redirect to public contest page
  if (!canViewBoard) {
    redirect(`/contests/${assignmentId}`);
  }

  // Instructor/Admin view with status board
  const [assignmentStatus, examSessionsForAssignment] = await Promise.all([
    getAssignmentStatusRows(assignmentId),
    assignment.examMode === "windowed"
      ? getExamSessionsForAssignment(assignmentId)
      : Promise.resolve([]),
  ]);

  if (!assignmentStatus) {
    notFound();
  }

  // Fetch data for contest settings editor
  const availableProblemOptions = await db
    .select({ id: problems.id, title: problems.title })
    .from(problems)
    .then((rows) => rows.map((r) => ({ id: r.id, title: r.title })));

  const hasExistingSubmissions = sortedProblems.length > 0
    ? await db.query.submissions
        .findFirst({
          where: eq(submissions.problemId, sortedProblems[0]?.problem?.id ?? ""),
          columns: { id: true },
        })
        .then(Boolean)
    : false;

  const contestEditorValue: AssignmentEditorValue = {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? "",
    startsAt: assignment.startsAt ? new Date(assignment.startsAt).valueOf() : null,
    deadline: assignment.deadline ? new Date(assignment.deadline).valueOf() : null,
    lateDeadline: assignment.lateDeadline ? new Date(assignment.lateDeadline).valueOf() : null,
    latePenalty: assignment.latePenalty ?? 0,
    hasSubmissions: hasExistingSubmissions,
    problems: sortedProblems.map((p) => ({
      problemId: p.problem?.id ?? p.problemId,
      points: p.points ?? 100,
    })),
    examMode: assignment.examMode as "none" | "scheduled" | "windowed",
    visibility: assignment.visibility ?? "private",
    examDurationMinutes: assignment.examDurationMinutes ?? null,
    scoringModel: assignment.scoringModel as "ioi" | "icpc",
    freezeLeaderboardAt: assignment.freezeLeaderboardAt ? new Date(assignment.freezeLeaderboardAt).valueOf() : null,
    enableAntiCheat: assignment.enableAntiCheat ?? false,
  };

  const statusLabels = {
    not_submitted: tAssignment("notSubmitted"),
    in_progress: tAssignment("examSessionInProgress"),
    submitted: tSubmissions("status.submitted"),
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
  const nowTimestamp = now.getTime();
  const examSessionMap = new Map(
    examSessionsForAssignment.map((session) => [
      session.userId,
      {
        startedAt: session.startedAt.toISOString(),
        personalDeadline: session.personalDeadline.toISOString(),
      },
    ])
  );

  const filteredRows = assignmentStatus.rows.filter((row) => {
    if (!matchesStudentQuery(row, normalizedStudentQuery)) return false;
    if (statusFilter === "all") return true;
    const examSession = examSessionMap.get(row.userId);
    return (
      getAssignmentParticipantStatus({
        latestStatus: row.latestStatus,
        attemptCount: row.attemptCount,
        bestTotalScore: row.bestTotalScore,
        totalPoints,
        examSessionStartedAt: examSession?.startedAt ?? null,
        examSessionPersonalDeadline: examSession?.personalDeadline ?? null,
        now: nowTimestamp,
      }) === statusFilter
    );
  });

  const filterSummary = tAssignment("filterSummary", { count: filteredRows.length });

  // Quick stats
  const participantCount = assignmentStatus.rows.length;
  const submittedCount = assignmentStatus.rows.filter(
    (r) => r.latestStatus != null
  ).length;
  const avgScore =
    submittedCount > 0
      ? Math.round(
          (assignmentStatus.rows
            .filter((r) => r.latestStatus != null)
            .reduce((sum, r) => sum + r.bestTotalScore, 0) /
            submittedCount) *
            10
        ) / 10
      : 0;
  const problemsSolvedCount = assignmentStatus.problems.filter((p) =>
    assignmentStatus.rows.some((r) =>
      r.problems.some(
        (rp) => rp.problemId === p.problemId && (rp.bestScore ?? 0) >= p.points
      )
    )
  ).length;

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/contests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Link>

      {/* Header with scoring model badge */}
      <div className="space-y-2 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={assignment.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}>
            {assignment.examMode === "scheduled" ? t("modeScheduled") : t("modeWindowed")}
          </Badge>
          <Badge className={assignment.scoringModel === "icpc" ? "bg-orange-500 text-white" : "bg-teal-500 text-white"}>
            {assignment.scoringModel === "icpc" ? t("scoringModelIcpc") : t("scoringModelIoi")}
          </Badge>
          <Badge variant="outline">{t("group")}: {assignment.group?.name}</Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold sm:text-3xl truncate">{assignmentStatus.assignment.title}</h2>
            <p className="text-sm text-muted-foreground">
              {assignment.group?.name ?? tGroups("detail")} · {tAssignment("totalScore")}: {totalPoints}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <AssignmentFormDialog
              groupId={groupId}
              availableProblems={availableProblemOptions}
              initialAssignment={contestEditorValue}
              allowProblemOverride={canOverrideLockedProblems}
            />
            <ExportButton assignmentId={assignmentId} />
            <AssignmentDeleteButton
              groupId={groupId}
              assignmentId={assignmentId}
              assignmentTitle={assignment.title}
              redirectTo="/dashboard/contests"
            />
          </div>
        </div>
      </div>

      {/* Quick stats bar (auto-refreshes every 15s) */}
      <ContestQuickStats
        assignmentId={assignmentId}
        problemCount={sortedProblems.length}
        initialStats={{
          participantCount,
          submittedCount,
          avgScore,
          problemsSolvedCount,
        }}
      />

      {/* Tabbed interface */}
      <HashTabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="submissions" className="gap-1.5">{t("tabs.submissions")}</TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5">{t("tabs.leaderboard")}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">{t("tabs.analytics")}</TabsTrigger>
          {assignment.enableAntiCheat && (
            <TabsTrigger value="antiCheat" className="gap-1.5">{t("tabs.antiCheat")}</TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="candidates" className="gap-1.5">{t("tabs.candidates")}</TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="invitations" className="gap-1.5">{t("tabs.invitations")}</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <ContestAnnouncements assignmentId={assignmentId} canManage={canManage} />
          <ContestClarifications
            assignmentId={assignmentId}
            currentUserId={session.user.id}
            canManage={canManage}
            problems={sortedProblems.map((problem) => ({
              id: problem.problem?.id ?? problem.problemId,
              title: problem.problem?.title ?? "",
            }))}
          />
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AccessCodeManager assignmentId={assignmentId} />
            <InviteParticipants assignmentId={assignmentId} />
          </div>
        </TabsContent>

        {/* Submissions Tab */}
        <TabsContent value="submissions" className="mt-6 space-y-6">
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
            resetHref={`/dashboard/contests/${assignmentId}`}
          />
          <Badge variant="secondary">{filterSummary}</Badge>
          <StatusBoard
            filteredRows={filteredRows}
            problems={assignmentStatus.problems}
            totalPoints={totalPoints}
            statusLabels={statusLabels}
            locale={locale}
            timeZone={timeZone}
            groupId={groupId}
            assignmentId={assignmentId}
            isContestView
            canManageOverrides={canManage}
            examMode={assignment.examMode ?? undefined}
            currentTimeMs={nowTimestamp}
            examSessions={Array.from(examSessionMap, ([userId, session]) => ({
              userId,
              startedAt: session.startedAt,
              personalDeadline: session.personalDeadline,
            }))}
            labels={{
              boardTitle: tAssignment("boardTitle"),
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
              examSessionStatus: tAssignment("examSessionStatus"),
              examSessionNotStarted: tAssignment("examSessionNotStarted"),
              examSessionInProgress: tAssignment("examSessionInProgress"),
              examSessionCompleted: tAssignment("examSessionCompleted"),
              viewSubmissions: tAssignment("viewSubmissions"),
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
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="mt-4">
          <LeaderboardTable assignmentId={assignmentId} canViewStudentDetails />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6 space-y-6">
          <AnalyticsCharts assignmentId={assignmentId} />
        </TabsContent>

        {/* Anti-Cheat Tab (conditional) */}
        {assignment.enableAntiCheat && (
          <TabsContent value="antiCheat" className="mt-6">
            <AntiCheatDashboard assignmentId={assignmentId} />
          </TabsContent>
        )}

        {/* Candidates Tab (for instructors/admins) */}
        {canManage && (
          <TabsContent value="candidates" className="mt-6">
            <RecruiterCandidatesPanel assignmentId={assignmentId} />
          </TabsContent>
        )}

        {/* Invitations Tab (for instructors/admins) */}
        {canManage && (
          <TabsContent value="invitations" className="mt-6">
            <RecruitingInvitationsPanel assignmentId={assignmentId} />
          </TabsContent>
        )}
      </HashTabs>
    </div>
  );
}
