# Cycle 52 — Debugger

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** debugger

## Inventory of Reviewed Files

- `src/lib/assignments/recruiting-invitations.ts` (full — focus on failure modes)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full — focus on SSE lifecycle)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/proxy.ts` (full)

## Findings

No new latent bug findings this cycle.

### Failure Mode Analysis

1. **redeemRecruitingToken transaction failure**: If the atomic UPDATE at line 493-509 returns no rows, the transaction throws "alreadyRedeemed" which is caught by the outer try/catch. Other unexpected errors propagate normally. The `tokenExpired` error branch at line 538 is dead code (nothing throws "tokenExpired" in the current flow) but is harmless as a safety net. NOT A BUG.

2. **SSE connection cleanup**: The `close()` function in the SSE route at line 307-323 is idempotent (checks `closed` flag). The `abort` event listener uses `{ once: true }`. The `setTimeout` for timeout is properly cleared. The shared poll subscription is properly unsubscribed. VERIFIED — no resource leak.

3. **SSE re-auth IIFE**: The re-authentication check at lines 397-438 uses an async IIFE with `.catch()` to prevent unhandled promise rejections. The IIFE checks `closed` at multiple points to avoid acting on stale state. VERIFIED.

4. **In-memory rate limiter eviction**: The `maybeEvict()` function uses a simple timestamp check (`now - lastEviction < 60_000`) which could miss evictions if the function is called less frequently than every 60 seconds, but entries will still be evicted on the next call. The MAX_ENTRIES cap (10,000) provides a hard upper bound. VERIFIED — no memory leak risk.

5. **Proxy auth cache FIFO eviction**: When the cache reaches 500 entries, the oldest entry (first key in insertion order) is deleted. This is correct FIFO behavior. The 2-second TTL ensures entries don't persist long. VERIFIED.

6. **ICPC leaderboard with no startsAt**: The guard at line 216-219 of `contest-scoring.ts` returns an empty ranking with a warning log. This prevents absurd penalty values (millions of minutes). VERIFIED.

### Carry-Over Confirmations

All deferred items from prior cycles remain valid.
