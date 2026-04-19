import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import { computeContestRanking } from "./contest-scoring";
import type { LeaderboardEntry } from "./contest-scoring";
import type { ScoringModel } from "@/types";
import { TERMINAL_SUBMISSION_STATUSES_SQL_LIST } from "@/lib/submissions/status";
import { buildIoiLatePenaltyCaseExpr } from "./scoring";

type AssignmentFreezeRow = {
  freezeLeaderboardAt: Date | null;
  scoringModel: string;
  startsAt: Date | null;
};

type FrozenLeaderboardResult = {
  scoringModel: ScoringModel;
  entries: LeaderboardEntry[];
  frozen: boolean;
  frozenAt: number | null;
  startsAt: number | null;
};

/**
 * Get the problem list for the leaderboard header.
 */
export async function getLeaderboardProblems(assignmentId: string): Promise<{ problemId: string; title: string; points: number; sortOrder: number }[]> {
  return rawQueryAll<{ problemId: string; title: string; points: number; sortOrder: number }>(
    `SELECT ap.problem_id AS "problemId", p.title, COALESCE(ap.points, 100) AS points, COALESCE(ap.sort_order, 0) AS "sortOrder"
     FROM assignment_problems ap
     INNER JOIN problems p ON p.id = ap.problem_id
     WHERE ap.assignment_id = @assignmentId
     ORDER BY ap.sort_order, p.title`,
    { assignmentId }
  );
}

/**
 * Compute leaderboard with freeze support.
 * - For instructors/admins: always returns live data with `frozen: false`
 * - For students: returns frozen data if past freeze time, using cutoff filtering
 */
export async function computeLeaderboard(
  assignmentId: string,
  isInstructorView: boolean
): Promise<FrozenLeaderboardResult> {
  const meta = await rawQueryOne<AssignmentFreezeRow>(
    `SELECT freeze_leaderboard_at AS "freezeLeaderboardAt", scoring_model AS "scoringModel", starts_at AS "startsAt" FROM assignments WHERE id = @assignmentId`,
    { assignmentId }
  );

  const freezeAt = meta?.freezeLeaderboardAt ? new Date(meta.freezeLeaderboardAt).getTime() : null;
  const startsAt = meta?.startsAt ? new Date(meta.startsAt).getTime() : null;
  const nowMs = Date.now();
  const isFrozen = !isInstructorView && freezeAt != null && nowMs >= freezeAt;

  if (isFrozen && freezeAt) {
    // Compute ranking using only submissions before freeze time
    const freezeSec = Math.floor(freezeAt / 1000);
    const { scoringModel, entries } = await computeContestRanking(assignmentId, freezeSec);
    return {
      scoringModel,
      entries,
      frozen: true,
      frozenAt: freezeAt,
      startsAt,
    };
  }

  const { scoringModel, entries } = await computeContestRanking(assignmentId);

  return {
    scoringModel,
    entries,
    frozen: false,
    frozenAt: freezeAt,
    startsAt,
  };
}

/**
 * Compute a single user's live rank without computing the full leaderboard.
 * This is used when the leaderboard is frozen for students — we show the
 * frozen leaderboard but want to display the student's own live rank.
 * Avoids running the full computeContestRanking a second time just to
 * find one user's position.
 */
export async function computeSingleUserLiveRank(
  assignmentId: string,
  userId: string,
): Promise<number | null> {
  const meta = await rawQueryOne<{ scoringModel: string; latePenalty: number | null; examMode: string; deadline: Date | null }>(
    `SELECT scoring_model AS "scoringModel", late_penalty AS "latePenalty", exam_mode AS "examMode", deadline
     FROM assignments WHERE id = @assignmentId`,
    { assignmentId },
  );

  if (!meta) return null;

  const scoringModel = (meta.scoringModel ?? "ioi") as ScoringModel;

  // Use the same scoring query structure as computeContestRanking for consistency,
  // but filtered to a single user + count of users ranked above them.
  // Returns null when the user has no scored submissions (they are not on the
  // leaderboard, so "rank 1" would be misleading).
  if (scoringModel === "icpc") {
    // ICPC: rank = 1 + count of users with more problems solved OR (same solved + less penalty)
    type IcpcRankRow = { rank: number | null; hasSubmissions: boolean };
    const result = await rawQueryOne<IcpcRankRow>(
      `WITH user_score AS (
        SELECT
          s.user_id,
          COUNT(*) AS attempt_count,
          MAX(CASE WHEN ROUND(s.score, 2) = 100 THEN 1 ELSE 0 END) AS has_ac,
          MIN(CASE WHEN ROUND(s.score, 2) = 100 THEN s.submitted_at ELSE NULL END) AS first_ac_at
        FROM submissions s
        INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
        WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
        GROUP BY s.user_id
      ),
      user_totals AS (
        SELECT
          us.user_id,
          SUM(us.has_ac) AS solved_count,
          SUM(
            CASE WHEN us.has_ac = 1 THEN
              EXTRACT(EPOCH FROM us.first_ac_at)::bigint / 60 + 20 * (us.attempt_count - us.has_ac)
            ELSE 0 END
          ) AS total_penalty
        FROM user_score us
        GROUP BY us.user_id
      ),
      target AS (
        SELECT solved_count, total_penalty FROM user_totals WHERE user_id = @userId
      )
      SELECT
        CASE WHEN t.solved_count IS NULL THEN NULL ELSE COALESCE(1 + COUNT(*), 1) END AS rank,
        t.solved_count IS NOT NULL AS "hasSubmissions"
      FROM user_totals ut, target t
      WHERE ut.solved_count > t.solved_count
         OR (ut.solved_count = t.solved_count AND ut.total_penalty < t.total_penalty)
      GROUP BY t.solved_count, t.total_penalty`,
      { assignmentId, userId },
    );
    // When the cross-join target is empty (user has no submissions), the query
    // returns no rows — result is undefined. Fall back to an explicit check.
    if (!result) return null;
    if (!result.hasSubmissions) return null;
    return result.rank;
  }

  // IOI: rank = 1 + count of users with higher total adjusted score
  // Uses the same scoring logic as contest-scoring.ts, including windowed
  // exam mode late penalties applied against the per-user personal_deadline.
  type IoiRankRow = { rank: number | null; hasSubmissions: boolean };
  const result = await rawQueryOne<IoiRankRow>(
    `WITH user_scores AS (
      SELECT
        s.user_id,
        ROUND(SUM(
          CASE WHEN s.score IS NOT NULL THEN
            ${buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")}
          ELSE 0
        END), 2) AS total_score
      FROM submissions s
      INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
      LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id
      WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
      GROUP BY s.user_id
    ),
    target AS (
      SELECT total_score FROM user_scores WHERE user_id = @userId
    )
    SELECT
      CASE WHEN t.total_score IS NULL THEN NULL ELSE COALESCE(1 + COUNT(*), 1) END AS rank,
      t.total_score IS NOT NULL AS "hasSubmissions"
    FROM user_scores us, target t
    WHERE ROUND(us.total_score, 2) > ROUND(t.total_score, 2)
    GROUP BY t.total_score`,
    {
      assignmentId,
      userId,
      deadline: meta.deadline ? Math.floor(new Date(meta.deadline).getTime() / 1000) : null,
      latePenalty: meta.latePenalty ?? 0,
      examMode: meta.examMode ?? "none",
    },
  );
  if (!result) return null;
  if (!result.hasSubmissions) return null;
  return result.rank;
}
