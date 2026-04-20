import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import type { ExamMode, ScoringModel } from "@/types";
import { resolveCapabilities } from "@/lib/capabilities/cache";

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

/**
 * Determine the current status of a contest based on its temporal properties.
 *
 * IMPORTANT: The `now` parameter should come from `getDbNow()` in server
 * components and API routes to avoid clock skew between the app server and
 * the database server. Using `new Date()` here will produce incorrect status
 * labels under clock skew.
 */
export function getContestStatus(
  contest: ContestEntry,
  now: Date
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
  starts_at: Date | null;
  deadline: Date | null;
  freeze_leaderboard_at: Date | null;
  enable_anti_cheat: boolean;
  problem_count: number;
  started_at: Date | null;
  personal_deadline: Date | null;
};

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
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    deadline: row.deadline ? new Date(row.deadline) : null,
    freezeLeaderboardAt: row.freeze_leaderboard_at ? new Date(row.freeze_leaderboard_at) : null,
    enableAntiCheat: Boolean(row.enable_anti_cheat),
    problemCount: row.problem_count,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    personalDeadline: row.personal_deadline ? new Date(row.personal_deadline) : null,
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
    CASE WHEN a.starts_at IS NOT NULL AND a.starts_at > NOW() THEN 0 ELSE 1 END,
    CASE WHEN a.starts_at IS NOT NULL AND a.starts_at > NOW() THEN a.starts_at ELSE NULL END ASC,
    CASE WHEN a.deadline IS NOT NULL AND a.deadline <= NOW() THEN a.deadline ELSE NULL END DESC,
    a.starts_at ASC
`;

export async function getContestsForUser(
  userId: string,
  role: string
): Promise<ContestEntry[]> {
  const caps = await resolveCapabilities(role);
  const canViewAllContests =
    caps.has("groups.view_all") ||
    caps.has("submissions.view_all");
  const canManageOwnedContests =
    caps.has("assignments.view_status") ||
    caps.has("contests.view_analytics") ||
    caps.has("anti_cheat.view_events") ||
    caps.has("recruiting.manage_invitations");

  if (canViewAllContests) {
    const rows = await rawQueryAll<RawContestRow>(
      `${BASE_SELECT}
       LEFT JOIN exam_sessions es ON es.assignment_id = a.id AND es.user_id = @userId
       WHERE a.exam_mode != 'none'
       ${ORDER_BY}`,
      { userId }
    );
    return rows.map(mapRow);
  }

  if (canManageOwnedContests) {
    const rows = await rawQueryAll<RawContestRow>(
      `${BASE_SELECT}
       LEFT JOIN exam_sessions es ON es.assignment_id = a.id AND es.user_id = @userId
       WHERE a.exam_mode != 'none'
         AND (
           g.instructor_id = @userId
           OR EXISTS (
             SELECT 1 FROM group_instructors gi
             WHERE gi.group_id = a.group_id AND gi.user_id = @userId
           )
         )
       ${ORDER_BY}`,
      { userId }
    );
    return rows.map(mapRow);
  }

  // student: enrolled OR has access token
  const rows = await rawQueryAll<RawContestRow>(
    `${BASE_SELECT}
     LEFT JOIN exam_sessions es ON es.assignment_id = a.id AND es.user_id = @userId
     WHERE a.exam_mode != 'none'
       AND (
         EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.group_id = a.group_id AND e.user_id = @userId
         )
         OR EXISTS (
           SELECT 1 FROM contest_access_tokens cat
           WHERE cat.assignment_id = a.id AND cat.user_id = @userId
         )
       )
     ${ORDER_BY}`,
    { userId }
  );
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
export async function canManageContest(
  user: { id: string; role: string },
  assignment: Pick<ContestAssignmentRow, "groupId" | "instructorId">
): Promise<boolean> {
  return canManageGroupResourcesAsync(
    assignment.instructorId,
    user.id,
    user.role,
    assignment.groupId
  );
}

type RawContestAssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  enableAntiCheat: boolean;
  starts_at: Date | null;
  deadline: Date | null;
};

export async function getContestAssignment(assignmentId: string): Promise<ContestAssignmentRow | undefined> {
  const row = await rawQueryOne<RawContestAssignmentRow>(
    `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode", a.enable_anti_cheat AS "enableAntiCheat", a.starts_at, a.deadline
     FROM assignments a INNER JOIN groups g ON g.id = a.group_id WHERE a.id = @assignmentId`,
    { assignmentId }
  );
  if (!row) return undefined;
  return {
    groupId: row.groupId,
    instructorId: row.instructorId,
    examMode: row.examMode,
    enableAntiCheat: Boolean(row.enableAntiCheat),
    startsAt: row.starts_at ? new Date(row.starts_at) : null,
    deadline: row.deadline ? new Date(row.deadline) : null,
  };
}
