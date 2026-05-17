import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, enrollments, contestAccessTokens, examSessions } from "@/lib/db/schema";
import { getContestStatus, canManageContest, type ContestStatus } from "@/lib/assignments/contests";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";
import type { ExamMode, ScoringModel } from "@/types";
import { getDbNow } from "@/lib/db-time";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export type PublicContestEntry = {
  id: string;
  title: string;
  description: string | null;
  groupName: string;
  examMode: ExamMode;
  scoringModel: ScoringModel;
  startsAt: Date | null;
  deadline: Date | null;
  problemCount: number;
  publicProblemCount: number;
  status: ContestStatus;
};

export type PublicContestDetail = PublicContestEntry & {
  publicProblems: Array<{
    id: string;
    title: string;
    difficulty: number | null;
  }>;
};

export async function getPublicContests(): Promise<PublicContestEntry[]> {
  const now = await getDbNow();
  const rows = await db.query.assignments.findMany({
    where: and(eq(assignments.visibility, "public"), ne(assignments.examMode, "none")),
    with: {
      group: {
        columns: { name: true },
      },
      assignmentProblems: {
        with: {
          problem: {
            columns: { id: true, visibility: true },
          },
        },
      },
    },
    orderBy: [asc(assignments.startsAt), asc(assignments.createdAt)],
  });

  return rows.map((assignment) => {
    const contest = {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description ?? null,
      groupName: assignment.group.name,
      examMode: assignment.examMode as ExamMode,
      scoringModel: assignment.scoringModel as ScoringModel,
      startsAt: assignment.startsAt ? new Date(assignment.startsAt) : null,
      deadline: assignment.deadline ? new Date(assignment.deadline) : null,
      problemCount: assignment.assignmentProblems.length,
      publicProblemCount: assignment.assignmentProblems.filter((entry) => entry.problem?.visibility === "public").length,
    };

    return {
      ...contest,
      status: getContestStatus(
        {
          ...contest,
          groupId: assignment.groupId,
          examDurationMinutes: assignment.examDurationMinutes ?? null,
          freezeLeaderboardAt: assignment.freezeLeaderboardAt ? new Date(assignment.freezeLeaderboardAt) : null,
          enableAntiCheat: Boolean(assignment.enableAntiCheat),
          startedAt: null,
          personalDeadline: null,
        },
        now
      ),
    };
  });
}

export async function getPublicContestById(assignmentId: string): Promise<PublicContestDetail | null> {
  const assignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), eq(assignments.visibility, "public"), ne(assignments.examMode, "none")),
    with: {
      group: {
        columns: { name: true },
      },
      assignmentProblems: {
        with: {
          problem: {
            columns: { id: true, title: true, visibility: true, difficulty: true },
          },
        },
      },
    },
  });

  if (!assignment) return null;

  const base = {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? null,
    groupName: assignment.group.name,
    examMode: assignment.examMode as ExamMode,
    scoringModel: assignment.scoringModel as ScoringModel,
    startsAt: assignment.startsAt ? new Date(assignment.startsAt) : null,
    deadline: assignment.deadline ? new Date(assignment.deadline) : null,
    problemCount: assignment.assignmentProblems.length,
    publicProblemCount: assignment.assignmentProblems.filter((entry) => entry.problem?.visibility === "public").length,
  };

  const now = await getDbNow();

  return {
    ...base,
    status: getContestStatus(
      {
        ...base,
        groupId: assignment.groupId,
        examDurationMinutes: assignment.examDurationMinutes ?? null,
        freezeLeaderboardAt: assignment.freezeLeaderboardAt ? new Date(assignment.freezeLeaderboardAt) : null,
        enableAntiCheat: Boolean(assignment.enableAntiCheat),
        startedAt: null,
        personalDeadline: null,
      },
      now
    ),
    publicProblems: assignment.assignmentProblems
      .filter((entry) => entry.problem?.visibility === "public")
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
      .map((entry) => ({
        id: entry.problem?.id ?? entry.problemId,
        title: entry.problem?.title ?? "",
        difficulty: entry.problem?.difficulty ?? null,
      })),
  };
}

// --- Enrolled contest detail (for auth-aware public pages) ---

export type EnrolledContestProblem = {
  id: string;
  title: string;
  difficulty: number | null;
  visibility: string | null;
  points: number;
  sortOrder: number;
};

export type EnrolledContestDetail = {
  id: string;
  title: string;
  description: string | null;
  groupId: string;
  groupName: string;
  examMode: ExamMode;
  examDurationMinutes: number | null;
  scoringModel: ScoringModel;
  startsAt: Date | null;
  deadline: Date | null;
  lateDeadline: Date | null;
  freezeLeaderboardAt: Date | null;
  enableAntiCheat: boolean;
  status: ContestStatus;
  problems: EnrolledContestProblem[];
  publicProblemCount: number;
  examSession: {
    startedAt: Date;
    personalDeadline: Date;
  } | null;
  canManage: boolean;
};

/**
 * Check whether a user is enrolled in (or can manage) a contest.
 * Returns "enrolled", "managing", or null.
 */
export async function getUserContestAccess(
  assignmentId: string,
  userId: string,
  role: string
): Promise<"enrolled" | "managing" | null> {
  const assignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), ne(assignments.examMode, "none")),
    columns: {
      id: true,
      groupId: true,
      visibility: true,
    },
    with: {
      group: {
        columns: { id: true, instructorId: true },
      },
    },
  });

  if (!assignment) return null;

  // Check management access first (instructor/admin)
  const canManage = await canManageContest(
    { id: userId, role },
    { groupId: assignment.groupId, instructorId: assignment.group.instructorId }
  );
  if (canManage) return "managing";

  // Check enrollment (student with group enrollment or access token).
  // Only `groups.view_all` grants blanket "managing" access. `submissions.view_all`
  // is for cross-group submission review — it must not promote an instructor
  // into a manage view on another instructor's private contest.
  const caps = await resolveCapabilities(role);
  if (caps.has("groups.view_all")) return "managing";

  const enrollmentRow = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.groupId, assignment.groupId),
      eq(enrollments.userId, userId)
    ),
    columns: { id: true },
  });
  if (enrollmentRow) return "enrolled";

  const tokenRow = await db.query.contestAccessTokens.findFirst({
    where: and(
      eq(contestAccessTokens.assignmentId, assignmentId),
      eq(contestAccessTokens.userId, userId)
    ),
    columns: { id: true },
  });
  if (tokenRow) return "enrolled";

  // Public contests are viewable but not "enrolled"
  if (assignment.visibility === "public") return null;

  return null;
}

/**
 * Get full contest detail for an enrolled user.
 * Returns null if the user has no access (not enrolled, not managing, not public).
 * For public contests the user is not enrolled in, returns null — use getPublicContestById instead.
 */
export async function getEnrolledContestDetail(
  assignmentId: string,
  userId: string,
  role: string
): Promise<EnrolledContestDetail | null> {
  const assignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), ne(assignments.examMode, "none")),
    with: {
      group: {
        columns: { id: true, name: true, instructorId: true },
      },
      assignmentProblems: {
        with: {
          problem: {
            columns: {
              id: true,
              title: true,
              difficulty: true,
              visibility: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) return null;

  const canManage = await canManageContest(
    { id: userId, role },
    { groupId: assignment.groupId, instructorId: assignment.group.instructorId }
  );

  // Check if user has access
  const caps = await resolveCapabilities(role);
  const canViewAll =
    caps.has("groups.view_all") || caps.has("submissions.view_all");

  if (!canManage && !canViewAll) {
    const enrollmentRow = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.groupId, assignment.groupId),
        eq(enrollments.userId, userId)
      ),
      columns: { id: true },
    });
    const tokenRow = enrollmentRow ? null : await db.query.contestAccessTokens.findFirst({
      where: and(
        eq(contestAccessTokens.assignmentId, assignmentId),
        eq(contestAccessTokens.userId, userId)
      ),
      columns: { id: true },
    });
    if (!enrollmentRow && !tokenRow) return null;
  }

  const sortedProblems = [...assignment.assignmentProblems]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const examSession = assignment.examMode === "windowed"
    ? await db.query.examSessions.findFirst({
        where: and(
          eq(examSessions.assignmentId, assignmentId),
          eq(examSessions.userId, userId)
        ),
        columns: {
          startedAt: true,
          personalDeadline: true,
        },
      })
    : null;

  const now = await getDbNow();

  const base = {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? null,
    groupId: assignment.groupId,
    groupName: assignment.group.name,
    examMode: assignment.examMode as ExamMode,
    examDurationMinutes: assignment.examDurationMinutes ?? null,
    scoringModel: assignment.scoringModel as ScoringModel,
    startsAt: assignment.startsAt ? new Date(assignment.startsAt) : null,
    deadline: assignment.deadline ? new Date(assignment.deadline) : null,
    lateDeadline: assignment.lateDeadline ? new Date(assignment.lateDeadline) : null,
    freezeLeaderboardAt: assignment.freezeLeaderboardAt ? new Date(assignment.freezeLeaderboardAt) : null,
    enableAntiCheat: Boolean(assignment.enableAntiCheat),
  };

  return {
    ...base,
    status: getContestStatus(
      {
        ...base,
        problemCount: sortedProblems.length,
        startedAt: examSession?.startedAt ? new Date(examSession.startedAt) : null,
        personalDeadline: examSession?.personalDeadline ? new Date(examSession.personalDeadline) : null,
      },
      now
    ),
    problems: sortedProblems.map((ap) => ({
      id: ap.problem?.id ?? ap.problemId,
      title: ap.problem?.title ?? "",
      difficulty: ap.problem?.difficulty ?? null,
      visibility: ap.problem?.visibility ?? null,
      points: ap.points ?? DEFAULT_PROBLEM_POINTS,
      sortOrder: ap.sortOrder ?? 0,
    })),
    publicProblemCount: sortedProblems.filter(
      (ap) => ap.problem?.visibility === "public"
    ).length,
    examSession: examSession
      ? {
          startedAt: new Date(examSession.startedAt),
          personalDeadline: new Date(examSession.personalDeadline),
        }
      : null,
    canManage,
  };
}
