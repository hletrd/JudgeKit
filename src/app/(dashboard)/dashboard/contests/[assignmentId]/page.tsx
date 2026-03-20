import Link from "next/link";
import { ArrowLeft, Users, FileText, BarChart3, Trophy } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HashTabs } from "@/components/hash-tabs";
import { auth } from "@/lib/auth";
import {
  canViewAssignmentSubmissions,
  getAssignmentStatusRows,
  getStudentProblemStatuses,
} from "@/lib/assignments/submissions";
import { canManageGroupResources } from "@/lib/assignments/management";
import { assertUserRole } from "@/lib/security/constants";
import { db } from "@/lib/db";
import { assignments, enrollments } from "@/lib/db/schema";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { formatRelativeTimeFromNow } from "@/lib/datetime";
import { notFound, redirect } from "next/navigation";
import { getExamSession, getExamSessionsForAssignment } from "@/lib/assignments/exam-sessions";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import { StartExamButton } from "@/components/exam/start-exam-button";
import { AssignmentOverview } from "../../groups/[id]/assignments/[assignmentId]/assignment-overview";
import { FilterForm } from "../../groups/[id]/assignments/[assignmentId]/filter-form";
import { StatusBoard } from "../../groups/[id]/assignments/[assignmentId]/status-board";
import { LeaderboardTable } from "@/components/contest/leaderboard-table";
import { AccessCodeManager } from "@/components/contest/access-code-manager";
import { AntiCheatMonitor } from "@/components/exam/anti-cheat-monitor";
import { AntiCheatDashboard } from "@/components/contest/anti-cheat-dashboard";
import { AnalyticsCharts } from "@/components/contest/analytics-charts";
import { ExportButton } from "@/components/contest/export-button";

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

  const role = assertUserRole(session.user.role as string);

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
    if (role === "super_admin" || role === "admin") {
      hasAccess = true;
    } else if (role === "instructor" && assignment.group?.instructorId === session.user.id) {
      hasAccess = true;
    } else {
      const enrollment = await db.query.enrollments.findFirst({
        where: and(
          eq(enrollments.userId, session.user.id),
          eq(enrollments.groupId, groupId)
        ),
      });
      hasAccess = Boolean(enrollment);
    }
  }

  if (!hasAccess) {
    redirect("/dashboard/contests");
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
    examBadgeScheduled: tGroups("examBadgeScheduled"),
    examBadgeWindowed: tGroups("examBadgeWindowed", { duration: assignment.examDurationMinutes ?? 0 }),
    examDuration: tAssignment("examDuration"),
  };

  // Student view (not instructor/admin with board access)
  if (!canViewBoard) {
    const studentProblemStatuses = await getStudentProblemStatuses(assignmentId, session.user.id);

    let examSession = null;
    if (assignment.examMode === "windowed") {
      examSession = await getExamSession(assignmentId, session.user.id);
    }

    const isExamExpired = assignment.examMode === "windowed" && examSession != null
      && new Date(examSession.personalDeadline) < now;

    return (
      <div className="space-y-6">
        <AntiCheatMonitor
          assignmentId={assignmentId}
          enabled={Boolean(assignment.enableAntiCheat)}
        />

        <Link
          href="/dashboard/contests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {tCommon("back")}
        </Link>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge className={assignment.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}>
              {assignment.examMode === "scheduled" ? t("modeScheduled") : t("modeWindowed")}
            </Badge>
            <Badge className={assignment.scoringModel === "icpc" ? "bg-orange-500 text-white" : "bg-teal-500 text-white"}>
              {assignment.scoringModel === "icpc" ? t("scoringModelIcpc") : t("scoringModelIoi")}
            </Badge>
            <Badge variant="outline">{t("group")}: {assignment.group?.name}</Badge>
          </div>
          <h2 className="text-3xl font-bold">{assignment.title}</h2>
        </div>

        {isUpcoming && (
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <p className="text-muted-foreground">{t("contestNotStarted")}</p>
              {assignment.startsAt && (
                <p className="text-sm text-muted-foreground">
                  {t("startsIn")}: {formatRelativeTimeFromNow(assignment.startsAt, locale)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {!isUpcoming && !isPast && assignment.examMode === "scheduled" && assignment.deadline && (
          <CountdownTimer deadline={new Date(assignment.deadline).getTime()} label={tGroups("examTimeRemaining")} />
        )}

        {!isUpcoming && !isPast && assignment.examMode === "windowed" && !examSession && (
          <div className="rounded-lg border p-6 text-center space-y-4">
            <p className="text-muted-foreground">{tGroups("examNotStarted")}</p>
            <StartExamButton
              groupId={groupId}
              assignmentId={assignmentId}
              durationMinutes={assignment.examDurationMinutes ?? 0}
            />
          </div>
        )}

        {!isUpcoming && assignment.examMode === "windowed" && examSession && (
          <CountdownTimer
            deadline={new Date(examSession.personalDeadline).getTime()}
            label={tGroups("examTimeRemaining")}
          />
        )}

        {isExamExpired && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center space-y-2 dark:border-red-900 dark:bg-red-950">
            <p className="font-medium text-red-600 dark:text-red-400">{tGroups("examTimeExpired")}</p>
          </div>
        )}

        {isPast && !isExamExpired && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">{t("contestClosed")}</p>
            </CardContent>
          </Card>
        )}

        {!isUpcoming && (assignment.examMode !== "windowed" || (examSession && !isExamExpired)) && (
          <>
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
            <LeaderboardTable assignmentId={assignmentId} currentUserId={session.user.id} />
          </>
        )}
      </div>
    );
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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={assignment.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}>
            {assignment.examMode === "scheduled" ? t("modeScheduled") : t("modeWindowed")}
          </Badge>
          <Badge className={assignment.scoringModel === "icpc" ? "bg-orange-500 text-white" : "bg-teal-500 text-white"}>
            {assignment.scoringModel === "icpc" ? t("scoringModelIcpc") : t("scoringModelIoi")}
          </Badge>
          <Badge variant="outline">{t("group")}: {assignment.group?.name}</Badge>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{assignmentStatus.assignment.title}</h2>
            <p className="text-sm text-muted-foreground">
              {assignment.group?.name ?? tGroups("detail")} · {tAssignment("totalScore")}: {totalPoints}
            </p>
          </div>
          <div className="shrink-0 pt-1">
            <ExportButton assignmentId={assignmentId} />
          </div>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <Users className="size-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold">{participantCount}</p>
              <p className="text-xs text-muted-foreground">{t("quickStats.participants")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <FileText className="size-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold">{submittedCount}</p>
              <p className="text-xs text-muted-foreground">{t("quickStats.submissions")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <BarChart3 className="size-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold">{avgScore}</p>
              <p className="text-xs text-muted-foreground">{t("quickStats.avgScore")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <Trophy className="size-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold">{problemsSolvedCount}/{sortedProblems.length}</p>
              <p className="text-xs text-muted-foreground">{t("quickStats.problemsSolved")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed interface */}
      <HashTabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="overview" className="gap-1.5">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="submissions" className="gap-1.5">{t("tabs.submissions")}</TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5">{t("tabs.leaderboard")}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">{t("tabs.analytics")}</TabsTrigger>
          {assignment.enableAntiCheat && (
            <TabsTrigger value="antiCheat" className="gap-1.5">{t("tabs.antiCheat")}</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
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
          <AccessCodeManager assignmentId={assignmentId} />
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
            canManageOverrides={canManageGroupResources(
              assignment.group?.instructorId ?? null,
              session.user.id,
              role
            )}
            examMode={assignment.examMode ?? undefined}
            examSessions={examSessionsForAssignment.map((s) => ({
              userId: s.userId,
              startedAt: s.startedAt.toISOString(),
              personalDeadline: s.personalDeadline.toISOString(),
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
      </HashTabs>
    </div>
  );
}
