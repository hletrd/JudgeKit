/**
 * Contest Stats Endpoint
 *
 * GET /api/v1/contests/:assignmentId/stats
 *
 * Returns aggregate statistics for a contest assignment:
 * - participantCount: total enrolled students
 * - submittedCount: students with at least one terminal submission
 * - avgScore: average total score among submitters (1 decimal)
 * - problemsSolvedCount: problems with at least one full-score submission
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
import { getDbNowMs } from "@/lib/db-time";
import { logger } from "@/lib/logger";

type AssignmentAccessRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  deadline: Date | null;
  latePenalty: number | null;
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

async function computeContestStats(
  assignmentId: string,
  assignment: AssignmentAccessRow,
): Promise<ContestStats> {
  // Compute all stats in a single query using CTEs to reduce DB round trips.
  // Uses the same late-penalty scoring as the leaderboard (via
  // buildIoiLatePenaltyCaseExpr) so stats are consistent with ranking data.
  const deadlineSec = assignment.deadline ? Math.floor(new Date(assignment.deadline).getTime() / 1000) : null;
  const latePenalty = assignment.latePenalty ?? 0;
  const examMode = assignment.examMode ?? "none";

  const statsResult = await rawQueryOne<ContestStatsRow>(
    `WITH participants AS (
      SELECT COUNT(*)::int AS count FROM enrollments WHERE group_id = @groupId
    ),
    user_best AS (
      SELECT
        s.user_id,
        s.problem_id,
        MAX(
          ${buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")}
        ) AS best_score
      FROM submissions s
      INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
      LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id
      WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
      GROUP BY s.user_id, s.problem_id
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
      INNER JOIN assignment_problems ap ON ap.assignment_id = @assignmentId AND ap.problem_id = ub.problem_id
      WHERE ROUND(ub.best_score, 2) >= ROUND(COALESCE(ap.points, 100), 2)
    )
    SELECT
      (SELECT count FROM participants) AS "participantCount",
      (SELECT submitted_count FROM submission_stats) AS "submittedCount",
      (SELECT avg_score FROM submission_stats) AS "avgScore",
      (SELECT solved_count FROM solved_problems) AS "problemsSolvedCount"`,
    {
      groupId: assignment.groupId,
      assignmentId,
      deadline: deadlineSec,
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
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode", a.deadline, a.late_penalty AS "latePenalty"
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
