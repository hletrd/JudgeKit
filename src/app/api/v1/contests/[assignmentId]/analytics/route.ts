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

/** Tracks which cache keys currently have a background refresh in progress. */
const _refreshingKeys = new Set<string>();

/**
 * Per-key cooldown after a background refresh failure.
 *
 * Bound to the same lifecycle as `analyticsCache` via the `dispose` hook
 * below: when the cache loses an entry for any reason (capacity eviction,
 * TTL expire, explicit delete, overwrite), the corresponding cooldown
 * metadata is cleaned. Without this coupling, `_lastRefreshFailureAt`
 * would grow unboundedly over the lifetime of an app server that sees
 * many distinct assignment IDs experiencing refresh failures.
 */
const REFRESH_FAILURE_COOLDOWN_MS = 5_000;
const _lastRefreshFailureAt = new Map<string, number>();

const analyticsCache = new LRUCache<string, CacheEntry>({
  max: 100,
  ttl: CACHE_TTL_MS,
  dispose: (_value, key) => {
    // Clean up the cooldown metadata whenever the cache loses an entry.
    // Reasons covered: 'evict' (capacity), 'expire' (TTL), 'delete'
    // (explicit), 'set' (overwrite). On 'set' the new write replaces the
    // entry; if it was a successful refresh, the explicit delete in the
    // try-block already cleared this map, so this is a no-op. If it was
    // a failure, the catch-block writes a fresh entry to this map *after*
    // the dispose hook fires, preserving the cooldown signal.
    _lastRefreshFailureAt.delete(key);
  },
});

type AssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
};

/**
 * Background refresh of the analytics cache for a single assignment.
 * Called from the GET handler when the cached entry is stale-but-within-TTL.
 *
 * Lifecycle ownership: this function is the single owner of `_refreshingKeys`
 * — it adds the key on entry (idempotent guard), and the `finally` removes
 * it on exit. The caller no longer manipulates `_refreshingKeys` directly,
 * eliminating the cycle-5 AGG5-5 / DBG5-1 fragility where the add and
 * delete lived in different modules and a refactor could leak the key.
 *
 * Failure handling: any failure (compute or DB-time fetch) sets the cooldown
 * timestamp to suppress thundering-herd refresh attempts. The cooldown
 * uses Date.now() directly — there's no DB call to fail here, simplifying
 * the error path compared to the previous nested try/catch.
 */
async function refreshAnalyticsCacheInBackground(
  assignmentId: string,
  cacheKey: string,
): Promise<void> {
  // Idempotent guard: if a refresh is already in flight for this key,
  // bail out without mutating state. Belt-and-suspenders defense — the
  // caller also checks _refreshingKeys.has() before invoking, but this
  // co-located guard means a future direct caller can't accidentally
  // double-launch.
  if (_refreshingKeys.has(cacheKey)) return;
  _refreshingKeys.add(cacheKey);
  try {
    const fresh = await computeContestAnalytics(assignmentId, true);
    analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
    // Explicit delete here covers the "first set" case (no prior cache entry,
    // so dispose does NOT fire on the analyticsCache.set call above). On
    // overwrite of an existing entry, dispose has already cleared the cooldown
    // synchronously before the .set commits, making this delete a no-op for
    // that path. Either way, after this line _lastRefreshFailureAt is empty
    // for cacheKey, so subsequent stale-revalidate triggers are not blocked
    // by a stale cooldown timestamp.
    _lastRefreshFailureAt.delete(cacheKey);
  } catch (err) {
    // Use Date.now() directly for the cooldown timestamp — no DB call needed,
    // and 1-2s of clock skew is well within the 5s cooldown tolerance.
    //
    // IMPORTANT: do NOT call analyticsCache.set() in this branch — the LRU
    // dispose hook would synchronously delete the cooldown timestamp we are
    // about to set on the next line, defeating the failure cooldown. The
    // dispose hook fires for the OLD value before the new value is committed,
    // and the catch path's _lastRefreshFailureAt.set runs AFTER dispose, so
    // adding a cache.set here would silently break the cooldown contract.
    _lastRefreshFailureAt.set(cacheKey, Date.now());
    logger.error({ err, assignmentId }, "[analytics] Failed to refresh analytics cache");
  } finally {
    _refreshingKeys.delete(cacheKey);
  }
}

/**
 * Test-only accessor that exposes module-private state for unit tests.
 *
 * This export is `undefined` outside `NODE_ENV === "test"`, and the type
 * is `TestInternals | undefined` so callers MUST null-check (or
 * non-null-assert in tests). Production code MUST NOT depend on this
 * export — the type system now agrees with the runtime gate, so a
 * future call from production code is a compile-time error.
 *
 * `cacheClear` was intentionally dropped (cycle 5 AGG5-4 / CR5-1):
 * no test consumed it, and shrinking the test-only surface area
 * minimizes the production-vs-test API delta.
 */
type TestInternals = {
  hasCooldown: (key: string) => boolean;
  setCooldown: (key: string, valueMs: number) => void;
  cacheDelete: (key: string) => boolean;
};

export const __test_internals: TestInternals | undefined =
  process.env.NODE_ENV === "test"
    ? {
        hasCooldown: (key: string): boolean => _lastRefreshFailureAt.has(key),
        setCooldown: (key: string, valueMs: number): void => {
          _lastRefreshFailureAt.set(key, valueMs);
        },
        cacheDelete: (key: string): boolean => analyticsCache.delete(key),
      }
    : undefined;

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
      // The `_refreshingKeys.has()` check here is defense-in-depth; the function
      // itself also short-circuits if the key is already in flight (cycle-5
      // AGG5-5: function is the single owner of the set lifecycle).
      const lastFailure = _lastRefreshFailureAt.get(cacheKey) ?? 0;
      if (!_refreshingKeys.has(cacheKey) && nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS) {
        // Defensive outer catch logs (instead of silently swallowing) any
        // unhandled rejection from refreshAnalyticsCacheInBackground —
        // including unlikely failures inside the catch/finally blocks.
        refreshAnalyticsCacheInBackground(assignmentId, cacheKey).catch((err) => {
          logger.warn(
            { err, assignmentId },
            "[analytics] background refresh swallowed unhandled rejection",
          );
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
