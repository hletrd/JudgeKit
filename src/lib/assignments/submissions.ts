import { db } from "@/lib/db";
import { rawQueryAll } from "@/lib/db/queries";
import {
  antiCheatEvents,
  assignmentProblems,
  assignments,
  contestAccessTokens,
  enrollments,
  examSessions,
  groups,
  problems,
  scoreOverrides,
  submissions,
  users,
} from "@/lib/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { SubmissionStatus } from "@/types";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { getAssignedTeachingGroupIds, hasGroupInstructorRole } from "@/lib/assignments/management";
import { getDbNowUncached } from "@/lib/db-time";
import { TERMINAL_SUBMISSION_STATUSES_SQL_LIST } from "@/lib/submissions/status";
import { buildIoiLatePenaltyCaseExpr } from "@/lib/assignments/scoring";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";

type AssignmentValidationError =
  | "invalidAssignmentId"
  | "assignmentNotFound"
  | "assignmentNotStarted"
  | "assignmentClosed"
  | "assignmentEnrollmentRequired"
  | "assignmentProblemMismatch"
  | "examNotStarted"
  | "examTimeExpired"
  | "antiCheatHeartbeatRequired";

type AssignmentAccessRecord = {
  id: string;
  groupId: string;
  instructorId: string | null;
  startsAt: Date | null;
  deadline: Date | null;
  lateDeadline: Date | null;
  examMode: string;
  examDurationMinutes: number | null;
  enableAntiCheat: boolean;
};

// Maximum age of the latest anti-cheat browser event before a submission is
// rejected on an exam-mode assignment with anti-cheat enabled. Server-side
// heartbeat throttle is 60 s; allow some clock skew + network jitter on top.
// Tightening this further reduces the curl-only-submit window; loosening it
// is friendlier to flaky wifi but defeats the purpose of the correlation.
const ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS = 90_000;

type AssignmentValidationSuccess = {
  ok: true;
  assignment: {
    id: string;
    groupId: string;
    instructorId: string | null;
  };
};

type AssignmentValidationFailure = {
  ok: false;
  status: 400 | 403 | 404;
  error: AssignmentValidationError;
};

export type AssignmentSubmissionValidationResult =
  | AssignmentValidationSuccess
  | AssignmentValidationFailure;

export type AssignmentProblemStatusRow = {
  problemId: string;
  title: string;
  points: number;
  sortOrder: number;
  bestScore: number | null;
  attemptCount: number;
  latestSubmissionId: string | null;
  latestStatus: SubmissionStatus | null;
  latestSubmittedAt: Date | null;
  isOverridden: boolean;
};

export type AssignmentStudentStatusRow = {
  userId: string;
  username: string;
  name: string;
  className: string | null;
  bestTotalScore: number;
  attemptCount: number;
  latestSubmissionId: string | null;
  latestStatus: SubmissionStatus | null;
  latestSubmittedAt: Date | null;
  problems: AssignmentProblemStatusRow[];
};

export type AssignmentStatusRows = {
  assignment: {
    id: string;
    title: string;
    groupId: string;
    instructorId: string | null;
  };
  problems: Array<{
    problemId: string;
    title: string;
    points: number;
    sortOrder: number;
  }>;
  rows: AssignmentStudentStatusRow[];
};

export type StudentAssignmentProblemContext = {
  assignmentId: string;
  title: string;
  groupId: string;
  groupName: string;
  startsAt: Date | null;
  deadline: Date | null;
  lateDeadline: Date | null;
  examMode: string;
  examDurationMinutes: number | null;
  personalDeadline?: Date | null;
};

async function getAssignmentAccessRecord(
  assignmentId: string
): Promise<AssignmentAccessRecord | null> {
  const normalizedAssignmentId = assignmentId.trim();

  if (!normalizedAssignmentId) {
    return null;
  }

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, normalizedAssignmentId),
    columns: {
      id: true,
      groupId: true,
      startsAt: true,
      deadline: true,
      lateDeadline: true,
      examMode: true,
      examDurationMinutes: true,
      enableAntiCheat: true,
    },
    with: {
      group: {
        columns: {
          instructorId: true,
        },
      },
    },
  });

  if (!assignment) {
    return null;
  }

  return {
    id: assignment.id,
    groupId: assignment.groupId,
    instructorId: assignment.group?.instructorId ?? null,
    startsAt: assignment.startsAt ?? null,
    deadline: assignment.deadline ?? null,
    lateDeadline: assignment.lateDeadline ?? null,
    examMode: assignment.examMode ?? "none",
    examDurationMinutes: assignment.examDurationMinutes ?? null,
    enableAntiCheat: assignment.enableAntiCheat ?? false,
  };
}

export async function getSubmissionReviewGroupIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  const caps = await resolveCapabilities(role);
  if (caps.has("submissions.view_all")) {
    return null;
  }

  if (!caps.has("assignments.view_status")) {
    return [];
  }

  return getAssignedTeachingGroupIds(userId);
}

export async function validateAssignmentSubmission(
  assignmentId: string,
  problemId: string,
  userId: string,
  role: string
): Promise<AssignmentSubmissionValidationResult> {
  const normalizedAssignmentId = assignmentId.trim();

  if (!normalizedAssignmentId) {
    return {
      ok: false,
      status: 400,
      error: "invalidAssignmentId",
    };
  }

  const assignment = await getAssignmentAccessRecord(normalizedAssignmentId);

  if (!assignment) {
    return {
      ok: false,
      status: 404,
      error: "assignmentNotFound",
    };
  }

  const caps = await resolveCapabilities(role);
  const isAdminLevel = caps.has("system.settings");

  // Use DB server time for deadline checks to avoid clock skew
  // between app and DB servers, consistent with other schedule checks.
  const now = isAdminLevel ? 0 : (await getDbNowUncached()).getTime();

  if (!isAdminLevel) {
    const startsAt = assignment.startsAt?.valueOf() ?? null;
    const effectiveCloseAt = assignment.lateDeadline?.valueOf() ?? assignment.deadline?.valueOf() ?? null;

    if (startsAt && startsAt > now) {
      return {
        ok: false,
        status: 403,
        error: "assignmentNotStarted",
      };
    }

    if (effectiveCloseAt && effectiveCloseAt < now) {
      return {
        ok: false,
        status: 403,
        error: "assignmentClosed",
      };
    }
  }

  if (!isAdminLevel) {
    const [enrollment, examSession] = await Promise.all([
      db.query.enrollments.findFirst({
        where: and(eq(enrollments.groupId, assignment.groupId), eq(enrollments.userId, userId)),
        columns: { id: true },
      }),
      assignment.examMode === "windowed"
        ? db.query.examSessions.findFirst({
            where: and(eq(examSessions.assignmentId, assignment.id), eq(examSessions.userId, userId)),
            columns: { personalDeadline: true },
          })
        : Promise.resolve(null),
    ]);

    if (!enrollment) {
      // Check for contest access token as enrollment alternative
      const accessToken = await db.query.contestAccessTokens.findFirst({
        where: and(
          eq(contestAccessTokens.assignmentId, assignment.id),
          eq(contestAccessTokens.userId, userId)
        ),
        columns: { id: true },
      });

      if (!accessToken) {
        return {
          ok: false,
          status: 403,
          error: "assignmentEnrollmentRequired",
        };
      }
    }

    // Windowed exam validation
    if (assignment.examMode === "windowed") {
      if (!examSession) {
        return { ok: false, status: 403, error: "examNotStarted" };
      }

      if (examSession.personalDeadline && examSession.personalDeadline.valueOf() < now) {
        return { ok: false, status: 403, error: "examTimeExpired" };
      }
    }

    // Anti-cheat heartbeat correlation: when an assignment runs in any
    // exam mode AND the instructor enabled anti-cheat, the candidate must
    // have a recent browser-issued event before a submission is accepted.
    // This blocks the curl-only attack path documented in
    // .context/reviews/2026-05-03/07-security.md F1: a candidate with a
    // valid session cookie cannot bypass the in-browser monitor and submit
    // from a second device while their decoy tab sits idle.
    if (assignment.enableAntiCheat && assignment.examMode !== "none") {
      const latest = await db
        .select({ createdAt: antiCheatEvents.createdAt })
        .from(antiCheatEvents)
        .where(
          and(
            eq(antiCheatEvents.assignmentId, assignment.id),
            eq(antiCheatEvents.userId, userId),
          ),
        )
        .orderBy(desc(antiCheatEvents.createdAt))
        .limit(1);

      const latestEventAt = latest[0]?.createdAt?.valueOf() ?? null;
      const fresh =
        latestEventAt !== null && now - latestEventAt <= ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS;
      if (!fresh) {
        return { ok: false, status: 403, error: "antiCheatHeartbeatRequired" };
      }
    }
  }

  const assignmentProblem = await db.query.assignmentProblems.findFirst({
    where: and(
      eq(assignmentProblems.assignmentId, normalizedAssignmentId),
      eq(assignmentProblems.problemId, problemId)
    ),
    columns: { id: true },
  });

  if (!assignmentProblem) {
    return {
      ok: false,
      status: 400,
      error: "assignmentProblemMismatch",
    };
  }

  return {
    ok: true,
    assignment: {
      id: assignment.id,
      groupId: assignment.groupId,
      instructorId: assignment.instructorId,
    },
  };
}

export async function canViewAssignmentSubmissions(
  assignmentId: string | null,
  userId: string,
  role: string
): Promise<boolean> {
  if (!assignmentId) {
    return false;
  }

  const caps = await resolveCapabilities(role);
  if (caps.has("submissions.view_all")) {
    return true;
  }

  if (!caps.has("assignments.view_status")) {
    return false;
  }

  const assignment = await getAssignmentAccessRecord(assignmentId);

  if (!assignment) {
    return false;
  }

  return hasGroupInstructorRole(
    assignment.groupId,
    userId,
    assignment.instructorId
  );
}

export type StudentProblemProgress = "solved" | "attempted" | "untried";

export type StudentProblemStatus = {
  problemId: string;
  progress: StudentProblemProgress;
};

export async function getStudentProblemStatuses(
  assignmentId: string,
  userId: string
): Promise<StudentProblemStatus[]> {
  const assignmentProblemRows = await db
    .select({ problemId: assignmentProblems.problemId })
    .from(assignmentProblems)
    .where(eq(assignmentProblems.assignmentId, assignmentId));

  const studentSubmissions = await db
    .select({
      problemId: submissions.problemId,
      status: submissions.status,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.assignmentId, assignmentId),
        eq(submissions.userId, userId)
      )
    );

  const submissionsByProblem = new Map<string, Set<string>>();
  for (const sub of studentSubmissions) {
    if (!submissionsByProblem.has(sub.problemId)) {
      submissionsByProblem.set(sub.problemId, new Set());
    }
    const entry = submissionsByProblem.get(sub.problemId);
    if (entry) {
      entry.add(sub.status ?? "");
    }
  }

  return assignmentProblemRows.map((row) => {
    const statuses = submissionsByProblem.get(row.problemId);
    let progress: StudentProblemProgress;
    if (!statuses || statuses.size === 0) {
      progress = "untried";
    } else if (statuses.has("accepted")) {
      progress = "solved";
    } else {
      progress = "attempted";
    }
    return { problemId: row.problemId, progress };
  });
}

export async function getStudentAssignmentContextsForProblem(
  problemId: string,
  userId: string
): Promise<StudentAssignmentProblemContext[]> {
  const recruitingAccess = await getRecruitingAccessContext(userId);
  const assignmentScope = recruitingAccess.isRecruitingCandidate
    ? recruitingAccess.assignmentIds
    : null;

  if (assignmentScope && assignmentScope.length === 0) {
    return [];
  }

  return db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      groupId: assignments.groupId,
      groupName: groups.name,
      startsAt: assignments.startsAt,
      deadline: assignments.deadline,
      lateDeadline: assignments.lateDeadline,
      examMode: assignments.examMode,
      examDurationMinutes: assignments.examDurationMinutes,
      personalDeadline: examSessions.personalDeadline,
    })
    .from(assignmentProblems)
    .innerJoin(assignments, eq(assignments.id, assignmentProblems.assignmentId))
    .innerJoin(groups, eq(groups.id, assignments.groupId))
    .innerJoin(
      enrollments,
      and(eq(enrollments.groupId, assignments.groupId), eq(enrollments.userId, userId))
    )
    .leftJoin(
      examSessions,
      and(eq(examSessions.assignmentId, assignments.id), eq(examSessions.userId, userId))
    )
    .where(
      assignmentScope
        ? and(
            eq(assignmentProblems.problemId, problemId),
            inArray(assignments.id, assignmentScope)
          )
        : eq(assignmentProblems.problemId, problemId)
    )
    .orderBy(asc(assignments.deadline), asc(assignments.title));
}

export async function getRequiredAssignmentContextsForProblem(
  problemId: string,
  userId: string,
  role: string
): Promise<StudentAssignmentProblemContext[]> {
  const caps = await resolveCapabilities(role);
  if (
    caps.has("submissions.view_all")
    || caps.has("assignments.view_status")
    || caps.has("groups.view_all")
  ) {
    return [];
  }

  return getStudentAssignmentContextsForProblem(problemId, userId);
}

/**
 * Per-problem aggregation row returned from the SQL query.
 * All aggregation (attempt count, best adjusted score, latest submission)
 * is pushed to PostgreSQL via GROUP BY + window functions so we fetch
 * O(students * problems) rows instead of O(total submissions).
 */
type ProblemAggRow = {
  userId: string;
  problemId: string;
  attemptCount: number;
  bestAdjustedScore: number | null;
  latestSubId: string | null;
  latestStatus: string | null;
  latestSubmittedAt: string | Date | null; // PostgreSQL timestamp
};

/**
 * Per-user "overall latest submission" row returned from a separate aggregate.
 */
type UserLatestRow = {
  userId: string;
  totalAttempts: number;
  latestSubId: string | null;
  latestStatus: string | null;
  latestSubmittedAt: string | Date | null;
};

export async function getAssignmentStatusRows(
  assignmentId: string
): Promise<AssignmentStatusRows | null> {
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: {
      id: true,
      title: true,
      groupId: true,
      deadline: true,
      lateDeadline: true,
      latePenalty: true,
      examMode: true,
    },
    with: {
      group: {
        columns: {
          instructorId: true,
        },
      },
    },
  });

  if (!assignment) {
    return null;
  }

  const [assignmentProblemRows, enrolledStudents] = await Promise.all([
    db
      .select({
        problemId: assignmentProblems.problemId,
        title: problems.title,
        points: assignmentProblems.points,
        sortOrder: assignmentProblems.sortOrder,
      })
      .from(assignmentProblems)
      .innerJoin(problems, eq(problems.id, assignmentProblems.problemId))
      .where(eq(assignmentProblems.assignmentId, assignmentId))
      .orderBy(asc(assignmentProblems.sortOrder), asc(problems.title)),
    db
      .select({
        userId: users.id,
        username: users.username,
        name: users.name,
        className: users.className,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(eq(enrollments.groupId, assignment.groupId))
      .orderBy(asc(users.name), asc(users.username)),
  ]);

  const problemDefinitions = assignmentProblemRows.map((row) => ({
    problemId: row.problemId,
    title: row.title,
    points: row.points ?? DEFAULT_PROBLEM_POINTS,
    sortOrder: row.sortOrder ?? 0,
  }));

  // ---- SQL-aggregated per-(userId, problemId) stats ----
  //
  // The adjusted score mirrors mapSubmissionPercentageToAssignmentPoints():
  //   base  = ROUND(MIN(MAX(score,0),100) / 100.0 * points, 2)
  //   if submittedAt > deadline AND latePenalty > 0:
  //     adjusted = ROUND(base * (1 - latePenalty/100), 2)
  //   else:
  //     adjusted = base
  //
  // For the "latest submission" within each (userId, problemId) group we need
  // the row with MAX(submitted_at), tiebreak MAX(id). We use a ROW_NUMBER
  // CTE to identify the latest row per group, then aggregate in one query.

  const deadlineVal = assignment.deadline ?? null;
  const latePenalty = assignment.latePenalty ?? 0;

  // Build the per-problem adjusted-score expression via raw SQL.
  // Uses buildIoiLatePenaltyCaseExpr() as the canonical scoring source of truth
  // (same function used by the leaderboard and stats endpoints) to ensure
  // consistency across all views. This includes the windowed-exam branch that
  // applies late penalties against the per-user personal_deadline.
  // Run the raw SQL aggregation and score overrides query in parallel since
  // they are independent — both only need the assignmentId.
  const [problemAggRows, overrideRows] = await Promise.all([
    rawQueryAll<ProblemAggRow>(`
      WITH scored AS (
        SELECT
          s.user_id,
          s.problem_id,
          s.id AS sub_id,
          s.status,
          s.submitted_at,
          s.score,
          ap.points AS problem_points,
          ${buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")}
            AS adjusted_score,
          ROW_NUMBER() OVER (
            PARTITION BY s.user_id, s.problem_id
            ORDER BY s.submitted_at DESC, s.id DESC
          ) AS rn
        FROM submissions s
        INNER JOIN assignment_problems ap
          ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
        LEFT JOIN exam_sessions es
          ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id
        WHERE s.assignment_id = @assignmentId
          AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
      )
      SELECT
        user_id   AS "userId",
        problem_id AS "problemId",
        COUNT(*)  AS "attemptCount",
        MAX(adjusted_score) AS "bestAdjustedScore",
        MAX(CASE WHEN rn = 1 THEN sub_id END)       AS "latestSubId",
        MAX(CASE WHEN rn = 1 THEN status END)        AS "latestStatus",
        MAX(CASE WHEN rn = 1 THEN submitted_at END)  AS "latestSubmittedAt"
      FROM scored
      GROUP BY user_id, problem_id
    `, {
      deadline: deadlineVal,
      latePenalty,
      examMode: assignment.examMode ?? "none",
      assignmentId,
    }),
    db
      .select({
        problemId: scoreOverrides.problemId,
        userId: scoreOverrides.userId,
        overrideScore: scoreOverrides.overrideScore,
      })
      .from(scoreOverrides)
      .where(eq(scoreOverrides.assignmentId, assignmentId)),
  ]);

  // ---- Build lookup maps from aggregated rows ----
  // Key: "userId:problemId" -> ProblemAggRow
  const problemAggMap = new Map<string, ProblemAggRow>();
  for (const row of problemAggRows) {
    problemAggMap.set(`${row.userId}:${row.problemId}`, row);
  }

  // ---- Derive per-user aggregates from problem-level data (avoids duplicate table scan) ----
  const userLatestMap = new Map<string, UserLatestRow>();
  for (const row of problemAggRows) {
    const existing = userLatestMap.get(row.userId);
    if (!existing) {
      userLatestMap.set(row.userId, {
        userId: row.userId,
        totalAttempts: row.attemptCount,
        latestSubId: row.latestSubId,
        latestStatus: row.latestStatus,
        latestSubmittedAt: row.latestSubmittedAt,
      });
    } else {
      existing.totalAttempts += row.attemptCount;
      const rowDate = row.latestSubmittedAt != null ? new Date(row.latestSubmittedAt) : null;
      const existDate = existing.latestSubmittedAt != null ? new Date(existing.latestSubmittedAt) : null;
      if (
        rowDate != null &&
        (existDate == null || rowDate > existDate)
      ) {
        existing.latestSubId = row.latestSubId;
        existing.latestStatus = row.latestStatus;
        existing.latestSubmittedAt = row.latestSubmittedAt;
      }
    }
  }

  const overrideMap = new Map<string, number>();
  for (const o of overrideRows) {
    overrideMap.set(`${o.userId}:${o.problemId}`, o.overrideScore);
  }

  // ---- Assemble result rows in memory (only enrolled students * problems) ----
  const rows = enrolledStudents.map<AssignmentStudentStatusRow>((student) => {
    const userLatest = userLatestMap.get(student.userId);

    const problemStatuses: AssignmentProblemStatusRow[] = problemDefinitions.map((problem) => {
      const key = `${student.userId}:${problem.problemId}`;
      const agg = problemAggMap.get(key);
      const overrideScore = overrideMap.get(key);
      const isOverridden = overrideScore !== undefined;

      let bestScore: number | null = agg?.bestAdjustedScore != null ? Number(agg.bestAdjustedScore) : null;
      if (bestScore !== null && isNaN(bestScore)) bestScore = null;
      if (isOverridden) {
        bestScore = overrideScore;
      }

      return {
        problemId: problem.problemId,
        title: problem.title,
        points: problem.points,
        sortOrder: problem.sortOrder,
        bestScore,
        attemptCount: Number(agg?.attemptCount) || 0,
        latestSubmissionId: agg?.latestSubId ?? null,
        latestStatus: (agg?.latestStatus as SubmissionStatus) ?? null,
        latestSubmittedAt: agg?.latestSubmittedAt
          ? new Date(agg.latestSubmittedAt)
          : null,
        isOverridden,
      };
    });

    const bestTotalScore = problemStatuses.reduce(
      (total, p) => total + (p.bestScore ?? 0),
      0
    );

    return {
      userId: student.userId,
      username: student.username,
      name: student.name,
      className: student.className,
      bestTotalScore,
      attemptCount: userLatest?.totalAttempts ?? 0,
      latestSubmissionId: userLatest?.latestSubId ?? null,
      latestStatus: (userLatest?.latestStatus as SubmissionStatus) ?? null,
      latestSubmittedAt: userLatest?.latestSubmittedAt
        ? new Date(userLatest.latestSubmittedAt)
        : null,
      problems: problemStatuses,
    };
  });

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      groupId: assignment.groupId,
      instructorId: assignment.group?.instructorId ?? null,
    },
    problems: problemDefinitions,
    rows,
  };
}
