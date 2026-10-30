import { buildIoiLatePenaltyCaseExpr } from "@/lib/assignments/scoring";
import { TERMINAL_SUBMISSION_STATUSES_SQL_LIST } from "@/lib/submissions/status";

/**
 * Contest stats panel queries (GET /api/v1/contests/[assignmentId]/stats).
 *
 * Kept free of the DB pool so the integration suite can run the exact SQL
 * against PostgreSQL. Both MUST stay consistent with computeContestRanking
 * (contest-scoring.ts): same late-penalty scoring, same score_overrides
 * overlay, and the same per-scoring-model semantics — the stats panel and the
 * leaderboard are shown side by side for the same contest.
 *
 * Parameters: @groupId, @assignmentId; the IOI query also takes @deadlineMs,
 * @latePenalty and @examMode.
 */

/**
 * ICPC: the board's totalScore is the SOLVED-PROBLEM COUNT (no late penalty,
 * no overrides — overrides are deliberately not overlaid for ICPC, matching
 * computeContestRanking). avgScore is the average solved count among
 * submitters; problemsSolvedCount counts problems with at least one AC.
 */
export const ICPC_CONTEST_STATS_SQL = `WITH participants AS (
      SELECT COUNT(*)::int AS count FROM enrollments WHERE group_id = @groupId
    ),
    problem_solved AS (
      SELECT
        s.user_id,
        s.problem_id,
        MAX(CASE WHEN ROUND(s.score::numeric, 2) = 100 THEN 1 ELSE 0 END) AS has_ac
      FROM submissions s
      INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
      WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
      GROUP BY s.user_id, s.problem_id
    ),
    user_totals AS (
      SELECT user_id, SUM(has_ac)::int AS solved_count
      FROM problem_solved
      GROUP BY user_id
    ),
    submission_stats AS (
      SELECT
        COUNT(*)::int AS submitted_count,
        COALESCE(ROUND(AVG(solved_count), 1), 0)::float AS avg_score
      FROM user_totals
    ),
    solved_problems AS (
      SELECT COUNT(DISTINCT problem_id)::int AS solved_count
      FROM problem_solved
      WHERE has_ac = 1
    )
    SELECT
      (SELECT count FROM participants) AS "participantCount",
      (SELECT submitted_count FROM submission_stats) AS "submittedCount",
      (SELECT avg_score FROM submission_stats) AS "avgScore",
      (SELECT solved_count FROM solved_problems) AS "problemsSolvedCount"`;

/**
 * IOI: override-aware. Leaderboard semantics: for every submitter ×
 * assignment problem, an instructor override REPLACES the judged adjusted
 * score — including on problems the user never submitted to.
 *
 * score_overrides.override_score is double precision, so totals are double
 * and must be cast to numeric before ROUND(…, 1): PostgreSQL has no
 * round(double precision, integer).
 */
export const IOI_CONTEST_STATS_SQL = `WITH participants AS (
      SELECT COUNT(*)::int AS count FROM enrollments WHERE group_id = @groupId
    ),
    submitters AS (
      SELECT DISTINCT s.user_id
      FROM submissions s
      WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
    ),
    judged_best AS (
      SELECT
        s.user_id,
        s.problem_id,
        MAX(
          ${buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")}
        ) AS judged_score
      FROM submissions s
      INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
      LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id
      WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
      GROUP BY s.user_id, s.problem_id
    ),
    user_best AS (
      SELECT
        sub.user_id,
        ap.problem_id,
        COALESCE(so.override_score, jb.judged_score) AS best_score,
        COALESCE(ap.points, 100) AS points
      FROM submitters sub
      CROSS JOIN assignment_problems ap
      LEFT JOIN judged_best jb ON jb.user_id = sub.user_id AND jb.problem_id = ap.problem_id
      LEFT JOIN score_overrides so
        ON so.assignment_id = @assignmentId AND so.user_id = sub.user_id AND so.problem_id = ap.problem_id
      WHERE ap.assignment_id = @assignmentId
        AND (jb.judged_score IS NOT NULL OR so.override_score IS NOT NULL)
    ),
    user_totals AS (
      SELECT
        ub.user_id,
        SUM(ub.best_score) AS total_score
      FROM user_best ub
      GROUP BY ub.user_id
    ),
    submission_stats AS (
      SELECT
        COUNT(*)::int AS submitted_count,
        COALESCE(ROUND(AVG(ut.total_score)::numeric, 1), 0)::float AS avg_score
      FROM user_totals ut
    ),
    solved_problems AS (
      SELECT COUNT(DISTINCT ub.problem_id)::int AS solved_count
      FROM user_best ub
      WHERE ROUND(ub.best_score::numeric, 2) >= ROUND(ub.points::numeric, 2)
    )
    SELECT
      (SELECT count FROM participants) AS "participantCount",
      (SELECT submitted_count FROM submission_stats) AS "submittedCount",
      (SELECT avg_score FROM submission_stats) AS "avgScore",
      (SELECT solved_count FROM solved_problems) AS "problemsSolvedCount"`;
