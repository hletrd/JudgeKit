import { LRUCache } from "lru-cache";
import { computeContestAnalytics } from "@/lib/assignments/contest-analytics";
import { registerAssignmentCacheInvalidator } from "@/lib/assignments/contest-scoring";
import { getDbNowMs } from "@/lib/db-time";
import { logger } from "@/lib/logger";

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
 * metadata is cleaned.
 */
const REFRESH_FAILURE_COOLDOWN_MS = 5_000;
const _lastRefreshFailureAt = new Map<string, number>();

const analyticsCache = new LRUCache<string, CacheEntry>({
  max: 100,
  ttl: CACHE_TTL_MS,
  dispose: (_value, key) => {
    _lastRefreshFailureAt.delete(key);
  },
});

// Drop cached analytics whenever a score mutation invalidates the ranking
// cache (judge verdict, rejudge, override) — otherwise the leaderboard
// updates immediately while this surface serves pre-mutation aggregates for
// up to CACHE_TTL_MS. Keys are bare assignment ids.
registerAssignmentCacheInvalidator((assignmentId) => {
  if (assignmentId) {
    analyticsCache.delete(assignmentId);
  } else {
    analyticsCache.clear();
  }
});

/**
 * Background refresh of the analytics cache for a single assignment.
 * Called from the GET handler when the cached entry is stale-but-within-TTL.
 */
async function refreshAnalyticsCacheInBackground(
  assignmentId: string,
  cacheKey: string,
): Promise<void> {
  if (_refreshingKeys.has(cacheKey)) return;
  _refreshingKeys.add(cacheKey);
  try {
    const fresh = await computeContestAnalytics(assignmentId, true);
    analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
    _lastRefreshFailureAt.delete(cacheKey);
  } catch (err) {
    _lastRefreshFailureAt.set(cacheKey, Date.now());
    logger.error({ err, assignmentId }, "[analytics] Failed to refresh analytics cache");
  } finally {
    _refreshingKeys.delete(cacheKey);
  }
}

export async function getContestAnalyticsCached(assignmentId: string): Promise<ContestAnalytics> {
  const cacheKey = assignmentId;
  const cached = analyticsCache.get(cacheKey);
  if (cached) {
    const nowMs = Date.now();
    const age = nowMs - cached.createdAt;
    if (age <= STALE_AFTER_MS) {
      return cached.data;
    }

    const lastFailure = _lastRefreshFailureAt.get(cacheKey) ?? 0;
    if (!_refreshingKeys.has(cacheKey) && nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS) {
      refreshAnalyticsCacheInBackground(assignmentId, cacheKey).catch((err) => {
        logger.warn(
          { err, assignmentId },
          "[analytics] background refresh swallowed unhandled rejection",
        );
      });
    }
    return cached.data;
  }

  const analytics = await computeContestAnalytics(assignmentId, true);
  analyticsCache.set(cacheKey, { data: analytics, createdAt: await getDbNowMs() });
  return analytics;
}

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
