# Cycle 51 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** perf-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/(public)/practice/page.tsx` (full)
- `src/proxy.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)

## Findings

No new performance findings this cycle.

### Carry-Over Confirmations

- **PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows (MEDIUM/MEDIUM) — deferred. The query at `anti-cheat/route.ts:195-204` uses `LIMIT 5000` with `DESC` ordering for gap detection. For long contests (83+ hours), this could transfer significant data per request. The trade-off is documented with a comment explaining the 5000-row cap.
- **SSE O(n) eviction scan** (LOW/LOW) — deferred. The `addConnection` function in `events/route.ts:44-55` does an O(n) scan for oldest entry when `MAX_TRACKED_CONNECTIONS` is exceeded. Acceptable given the cap (1000 entries) and infrequent triggering.
- **`atomicConsumeRateLimit` uses Date.now() in hot path** (MEDIUM/MEDIUM) — deferred. Using `getDbNowUncached()` here would add a DB round-trip to every rate-limited API call. The `Date.now()` is acceptable for in-memory rate limiting where the comparison is against in-memory data.

### Performance Positive Observations

1. The stale-while-revalidate pattern in contest-scoring and analytics routes avoids thundering-herd DB queries by serving stale data during background refresh.
2. The shared SSE poll timer batches all submission status checks into a single `inArray` query, avoiding N+1 DB queries per connection.
3. The in-memory rate limiter (`in-memory-rate-limit.ts`) avoids DB queries entirely for rate-limit checks, with FIFO eviction at 10000 entries and 24-hour TTL.
4. The `parseRetentionOverride` function in `data-retention.ts` correctly parses env vars once at module load time, not per-request.
5. The auth user cache in `proxy.ts` uses a 2-second TTL with FIFO eviction, keeping DB queries minimal for repeated requests.
