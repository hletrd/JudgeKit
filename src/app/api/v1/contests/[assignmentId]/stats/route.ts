/**
 * Contest Stats Endpoint
 *
 * GET /api/v1/contests/:assignmentId/stats
 *
 * Returns aggregate statistics for a contest assignment:
 * - participantCount: total enrolled students
 * - submittedCount: students with at least one terminal submission
 * - avgScore: IOI — average total (override-aware, late-penalty-adjusted)
 *   score among submitters; ICPC — average solved-problem count among
 *   submitters (matching the board's totalScore semantics). 1 decimal.
 * - problemsSolvedCount: IOI — problems where some submitter reached full
 *   points (override-aware); ICPC — problems with at least one AC.
 *
 * Access control: same as the leaderboard endpoint.
 * - Instructors and admins: always allowed
 * - Recruiting candidates: only with instructor access
 * - Other users: must be enrolled or have a valid contest access token
 *
 * Rate limit: "leaderboard" tier
 */
import { NextRequest } from "next/server";
import { LRUCache } from "lru-cache";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { canManageContest } from "@/lib/assignments/contests";
import { rawQueryOne } from "@/lib/db/queries";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { TERMINAL_SUBMISSION_STATUSES_SQL_LIST } from "@/lib/submissions/status";
import { buildIoiLatePenaltyCaseExpr } from "@/lib/assignments/scoring";
import { registerAssignmentCacheInvalidator } from "@/lib/assignments/contest-scoring";
import { getDbNowMs } from "@/lib/db-time";
import { logger } from "@/lib/logger";

type AssignmentAccessRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  deadline: Date | null;
  latePenalty: number | null;
  scoringModel: string | null;
};

type ContestStatsRow = {
  participantCount: number;
  submittedCount: number;
  avgScore: number;
  problemsSolvedCount: number;
};

type ContestStats = ContestStatsRow;

const CACHE_TTL_MS = 60_000;
const STALE_AFTER_MS = 15_000;
const REFRESH_FAILURE_COOLDOWN_MS = 5_000;

type CacheEntry = { data: ContestStats; createdAt: number };

const _refreshingKeys = new Set<string>();
const _lastRefreshFailureAt = new Map<string, number>();

const statsCache = new LRUCache<string, CacheEntry>({
  max: 100,
  ttl: CACHE_TTL_MS,
  dispose: (_value, key) => {
    _lastRefreshFailureAt.delete(key);
  },
});

// Drop cached stats whenever a score mutation invalidates the ranking cache
// (judge verdict, rejudge, override) — otherwise the leaderboard updates
// immediately while this panel serves pre-mutation aggregates for up to
// CACHE_TTL_MS. Keys are bare assignment ids.
registerAssignmentCacheInvalidator((assignmentId) => {
  if (assignmentId) {
    statsCache.delete(assignmentId);
  } else {
    statsCache.clear();
  }
});

async function computeContestStats(
  assignmentId: string,
  assignment: AssignmentAccessRow,
): Promise<ContestStats> {
  // Compute all stats in a single query using CTEs to reduce DB round trips.
  // MUST stay consistent with computeContestRanking (contest-scoring.ts):
  // same late-penalty scoring, same score_overrides overlay, and the same
  // per-scoring-model semantics — the stats panel and the leaderboard are
  // shown side by side for the same contest.
  const deadlineMs = assignment.deadline ? new Date(assignment.deadline).getTime() : null;
  const latePenalty = assignment.latePenalty ?? 0;
  const examMode = assignment.examMode ?? "none";
  const scoringModel = assignment.scoringModel ?? "ioi";

  const statsResult =
    scoringModel === "icpc"
      ? // ICPC: the board's totalScore is the SOLVED-PROBLEM COUNT (no late
        // penalty, no overrides — overrides are deliberately not overlaid for
        // ICPC, matching computeContestRanking). avgScore is the average
        // solved count among submitters; problemsSolvedCount counts problems
        // with at least one AC.
        await rawQueryOne<ContestStatsRow>(
          `WITH participants AS (
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
      (SELECT solved_count FROM solved_problems) AS "problemsSolvedCount"`,
          {
            groupId: assignment.groupId,
            assignmentId,
          },
        )
      : // IOI: override-aware. Leaderboard semantics: for every submitter ×
        // assignment problem, an instructor override REPLACES the judged
        // adjusted score — including on problems the user never submitted to.
        await rawQueryOne<ContestStatsRow>(
          `WITH participants AS (
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
        COALESCE(ROUND(AVG(ut.total_score), 1), 0)::float AS avg_score
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
      (SELECT solved_count FROM solved_problems) AS "problemsSolvedCount"`,
          {
            groupId: assignment.groupId,
            assignmentId,
            deadlineMs,
            latePenalty,
            examMode,
          },
        );

  return {
    participantCount: statsResult?.participantCount ?? 0,
    submittedCount: statsResult?.submittedCount ?? 0,
    avgScore: statsResult?.avgScore ?? 0,
    problemsSolvedCount: statsResult?.problemsSolvedCount ?? 0,
  };
}

async function refreshStatsCacheInBackground(
  assignmentId: string,
  assignment: AssignmentAccessRow,
  cacheKey: string,
): Promise<void> {
  if (_refreshingKeys.has(cacheKey)) return;
  _refreshingKeys.add(cacheKey);
  try {
    const fresh = await computeContestStats(assignmentId, assignment);
    statsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
    _lastRefreshFailureAt.delete(cacheKey);
  } catch (err) {
    _lastRefreshFailureAt.set(cacheKey, Date.now());
    logger.error({ err, assignmentId }, "[contest-stats] Failed to refresh stats cache");
  } finally {
    _refreshingKeys.delete(cacheKey);
  }
}

export const GET = createApiHandler({
  rateLimit: "leaderboard",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const recruitingAccess = await getRecruitingAccessContext(user.id);

    const assignment = await rawQueryOne<AssignmentAccessRow>(
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode", a.deadline, a.late_penalty AS "latePenalty", a.scoring_model AS "scoringModel"
       FROM assignments a
       INNER JOIN groups g ON g.id = a.group_id
       WHERE a.id = @assignmentId`,
      { assignmentId }
    );

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    // Access check (same as leaderboard)
    const isInstructorView = await canManageContest(user, assignment);

    if (recruitingAccess.isRecruitingCandidate && !isInstructorView) {
      return apiError("forbidden", 403);
    }

    if (!isInstructorView) {
      const hasAccess = await rawQueryOne(
        `SELECT 1 FROM enrollments WHERE group_id = @groupId AND user_id = @userId
         UNION ALL
         SELECT 1 FROM contest_access_tokens WHERE assignment_id = @assignmentId AND user_id = @userId AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        { groupId: assignment.groupId, userId: user.id, assignmentId }
      );

      if (!hasAccess) {
        return apiError("forbidden", 403);
      }

      // Contest access tokens do not have an expiry column, so users with
      // only a token (not enrolled) could access stats indefinitely after the
      // contest ends. Enforce the assignment deadline to prevent this.
      if (assignment.deadline) {
        const nowRow = await rawQueryOne<{ now: Date }>("SELECT NOW()::timestamptz AS now");
        if (nowRow?.now && nowRow.now > assignment.deadline) {
          return apiError("contestEnded", 403);
        }
      }
    }

    const cacheKey = assignmentId;
    const cached = statsCache.get(cacheKey);
    if (cached) {
      const nowMs = Date.now();
      const age = nowMs - cached.createdAt;
      if (age > STALE_AFTER_MS) {
        const lastFailure = _lastRefreshFailureAt.get(cacheKey) ?? 0;
        if (!_refreshingKeys.has(cacheKey) && nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS) {
          refreshStatsCacheInBackground(assignmentId, assignment, cacheKey).catch((err) => {
            logger.warn(
              { err, assignmentId },
              "[contest-stats] background refresh swallowed unhandled rejection",
            );
          });
        }
      }
      return apiSuccess(cached.data);
    }

    const stats = await computeContestStats(assignmentId, assignment);
    statsCache.set(cacheKey, { data: stats, createdAt: await getDbNowMs() });
    return apiSuccess(stats);
  },
});
