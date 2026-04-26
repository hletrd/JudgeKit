import { NextRequest } from "next/server";
import { LRUCache } from "lru-cache";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { computeContestAnalytics } from "@/lib/assignments/contest-analytics";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { rawQueryOne } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { getDbNowMs } from "@/lib/db-time";

type ContestAnalytics = Awaited<ReturnType<typeof computeContestAnalytics>>;

const CACHE_TTL_MS = 60_000;
const STALE_AFTER_MS = 30_000;

type CacheEntry = { data: ContestAnalytics; createdAt: number };
const analyticsCache = new LRUCache<string, CacheEntry>({ max: 100, ttl: CACHE_TTL_MS });

/** Tracks which cache keys currently have a background refresh in progress. */
const _refreshingKeys = new Set<string>();

/** Per-key cooldown after a background refresh failure. */
const REFRESH_FAILURE_COOLDOWN_MS = 5_000;
const _lastRefreshFailureAt = new Map<string, number>();

type AssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
};

export const GET = createApiHandler({
  rateLimit: "analytics",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await rawQueryOne<AssignmentRow>(
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode"
       FROM assignments a INNER JOIN groups g ON g.id = a.group_id WHERE a.id = @assignmentId`,
      { assignmentId }
    );

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canView = await canViewAssignmentSubmissions(assignmentId, user.id, user.role);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const cacheKey = assignmentId;
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      // Use Date.now() for the staleness check instead of getDbNowMs() to avoid
      // a DB round-trip on every cache-hit request. The staleness tolerance is
      // 30 seconds, so clock skew of 1-2 seconds between app and DB servers is
      // acceptable for deciding whether to trigger a background refresh.
      // getDbNowMs() is still used for cache-write timestamps (below) where
      // authoritative time is needed.
      const nowMs = Date.now();
      const age = nowMs - cached.createdAt;
      if (age <= STALE_AFTER_MS) {
        // Fresh — return immediately
        return apiSuccess(cached.data);
      }
      // Stale but still within TTL — return stale data and trigger ONE background
      // refresh (unless a refresh failed recently — avoid amplifying DB failures).
      const lastFailure = _lastRefreshFailureAt.get(cacheKey) ?? 0;
      if (!_refreshingKeys.has(cacheKey) && nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS) {
        _refreshingKeys.add(cacheKey);
        // Use an async IIFE instead of .then()/.catch()/.finally() chain to
        // avoid unhandled-rejection risk: if getDbNowMs() throws inside a
        // .catch() handler, the resulting rejection is not caught by .finally().
        (async () => {
          try {
            const fresh = await computeContestAnalytics(assignmentId, true);
            analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
            _lastRefreshFailureAt.delete(cacheKey);
          } catch {
            // Use Date.now() as fallback for the cooldown timestamp. If the DB
            // is unreachable, getDbNowMs() will also throw, leaving the cooldown
            // unset and allowing a thundering herd on every subsequent request.
            // Date.now() is acceptable here because the cooldown is only 5s —
            // 1-2s of clock skew is tolerable.
            try {
              _lastRefreshFailureAt.set(cacheKey, await getDbNowMs());
            } catch {
              _lastRefreshFailureAt.set(cacheKey, Date.now());
            }
            logger.error({ assignmentId }, "[analytics] Failed to refresh analytics cache");
          } finally {
            _refreshingKeys.delete(cacheKey);
          }
        })().catch(() => {
          // Defensive: if getDbNowMs() itself fails in catch/finally, swallow
          // to prevent unhandled rejection that could crash the process.
        });
      }
      return apiSuccess(cached.data);
    }

    // Cache miss — compute fresh and populate cache
    const analytics = await computeContestAnalytics(assignmentId, true);
    analyticsCache.set(cacheKey, { data: analytics, createdAt: await getDbNowMs() });
    return apiSuccess(analytics);
  },
});
