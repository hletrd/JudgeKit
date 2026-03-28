import { sqlite } from "@/lib/db";
import { isAdmin, isInstructor } from "@/lib/api/auth";
import type { UserRole, ExamMode, ScoringModel } from "@/types";

export type ContestEntry = {
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
  freezeLeaderboardAt: Date | null;
  enableAntiCheat: boolean;
  problemCount: number;
  startedAt: Date | null;
  personalDeadline: Date | null;
};

export type ContestStatus =
  | "upcoming"
  | "open"
  | "in_progress"
  | "expired"
  | "closed";

export function getContestStatus(
  contest: ContestEntry,
  now: Date = new Date()
): ContestStatus {
  const nowMs = now.getTime();

  if (contest.examMode === "scheduled") {
    if (contest.startsAt && nowMs < contest.startsAt.getTime()) return "upcoming";
    if (contest.deadline && nowMs >= contest.deadline.getTime()) return "closed";
    return "open";
  }

  // windowed
  if (contest.startsAt && nowMs < contest.startsAt.getTime()) return "upcoming";
  const effectiveClose = contest.deadline?.getTime();
  if (effectiveClose && nowMs >= effectiveClose) return "closed";
  if (contest.personalDeadline && nowMs >= contest.personalDeadline.getTime()) return "expired";
  if (contest.startedAt) return "in_progress";
  return "open";
}

type RawContestRow = {
  id: string;
  title: string;
  description: string | null;
  group_id: string;
  group_name: string;
  exam_mode: string;
  exam_duration_minutes: number | null;
  scoring_model: string;
  starts_at: number | null;
  deadline: number | null;
  freeze_leaderboard_at: number | null;
  enable_anti_cheat: number;
  problem_count: number;
  started_at: number | null;
  personal_deadline: number | null;
};

function toDate(epochSec: number | null): Date | null {
  return epochSec != null ? new Date(epochSec * 1000) : null;
}

function mapRow(row: RawContestRow): ContestEntry {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    groupId: row.group_id,
    groupName: row.group_name,
    examMode: row.exam_mode as ExamMode,
    examDurationMinutes: row.exam_duration_minutes,
    scoringModel: (row.scoring_model ?? "ioi") as ScoringModel,
    startsAt: toDate(row.starts_at),
    deadline: toDate(row.deadline),
    freezeLeaderboardAt: toDate(row.freeze_leaderboard_at),
    enableAntiCheat: Boolean(row.enable_anti_cheat),
    problemCount: row.problem_count,
    startedAt: toDate(row.started_at),
    personalDeadline: toDate(row.personal_deadline),
  };
}

const BASE_SELECT = `
  SELECT
    a.id,
    a.title,
    a.description,
    a.group_id,
    g.name AS group_name,
    a.exam_mode,
    a.exam_duration_minutes,
    a.scoring_model,
    a.starts_at,
    a.deadline,
    a.freeze_leaderboard_at,
    a.enable_anti_cheat,
    (SELECT COUNT(*) FROM assignment_problems ap WHERE ap.assignment_id = a.id) AS problem_count,
    es.started_at,
    es.personal_deadline
  FROM assignments a
  INNER JOIN groups g ON g.id = a.group_id
`;

const ORDER_BY = `
  ORDER BY
    CASE WHEN a.starts_at IS NOT NULL AND a.starts_at > unixepoch('now') THEN 0 ELSE 1 END,
    CASE WHEN a.starts_at IS NOT NULL AND a.starts_at > unixepoch('now') THEN a.starts_at END ASC,
    CASE WHEN a.deadline IS NOT NULL AND a.deadline <= unixepoch('now') THEN a.deadline END DESC,
    a.starts_at ASC
`;

export function getContestsForUser(
  userId: string,
  role: UserRole
): ContestEntry[] {
  if (role === "super_admin" || role === "admin") {
    const rows = sqlite
      .prepare<[string], RawContestRow>(
        `${BASE_SELECT}
         LEFT JOIN exam_sessions es ON es.assignment_id = a.id AND es.user_id = ?
         WHERE a.exam_mode != 'none'
         ${ORDER_BY}`
      )
      .all(userId);
    return rows.map(mapRow);
  }

  if (role === "instructor") {
    const rows = sqlite
      .prepare<[string, string], RawContestRow>(
        `${BASE_SELECT}
         LEFT JOIN exam_sessions es ON es.assignment_id = a.id AND es.user_id = ?
         WHERE a.exam_mode != 'none'
           AND g.instructor_id = ?
         ${ORDER_BY}`
      )
      .all(userId, userId);
    return rows.map(mapRow);
  }

  // student: enrolled OR has access token
  const rows = sqlite
    .prepare<[string, string, string], RawContestRow>(
      `${BASE_SELECT}
       LEFT JOIN exam_sessions es ON es.assignment_id = a.id AND es.user_id = ?
       WHERE a.exam_mode != 'none'
         AND (
           EXISTS (
             SELECT 1 FROM enrollments e
             WHERE e.group_id = a.group_id AND e.user_id = ?
           )
           OR EXISTS (
             SELECT 1 FROM contest_access_tokens cat
             WHERE cat.assignment_id = a.id AND cat.user_id = ?
           )
         )
       ${ORDER_BY}`
    )
    .all(userId, userId, userId);
  return rows.map(mapRow);
}

export type ContestAssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  enableAntiCheat: boolean;
  startsAt: Date | null;
  deadline: Date | null;
};

/**
 * Check if a user can manage a contest (admin or owning instructor).
 */
export function canManageContest(user: { id: string; role: string }, assignment: ContestAssignmentRow): boolean {
  return isAdmin(user.role) || (isInstructor(user.role) && assignment.instructorId === user.id);
}

type RawContestAssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  enableAntiCheat: number;
  starts_at: number | null;
  deadline: number | null;
};

export function getContestAssignment(assignmentId: string): ContestAssignmentRow | undefined {
  const row = sqlite
    .prepare<[string], RawContestAssignmentRow>(
      `SELECT a.group_id AS groupId, g.instructor_id AS instructorId, a.exam_mode AS examMode, a.enable_anti_cheat AS enableAntiCheat, a.starts_at, a.deadline
       FROM assignments a INNER JOIN groups g ON g.id = a.group_id WHERE a.id = ?`
    )
    .get(assignmentId);
  if (!row) return undefined;
  return {
    groupId: row.groupId,
    instructorId: row.instructorId,
    examMode: row.examMode,
    enableAntiCheat: Boolean(row.enableAntiCheat),
    startsAt: toDate(row.starts_at),
    deadline: toDate(row.deadline),
  };
}
