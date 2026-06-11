# Cycle 53 — Debugger

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** debugger

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts`
- `src/lib/assignments/leaderboard.ts`
- `src/lib/security/api-rate-limit.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `src/lib/db-time.ts`
- `src/lib/realtime/realtime-coordination.ts`

## Findings

No new latent bugs identified this cycle.

### Edge Cases Examined

1. **ICPC tie-breaker stability:** With the new userId.localeCompare fallback (contest-scoring.ts:358), `Array.prototype.sort()` becomes effectively stable regardless of engine implementation. No risk of ordering flip between requests. OK.
2. **Leaderboard freeze race:** freeze_leaderboard_at is read once per request. If the freeze toggle flips mid-request, the boundary is stable for that one request. OK.
3. **SSE connection eviction:** Iterating `connectionInfoMap` inside addConnection while deleting entries is safe because Map iteration tolerates deletion of already-visited keys. The oldest-key selection completes before any mutation. OK.
4. **Heartbeat dedup:** `lastHeartbeatTime.get()` returning `undefined` is coerced to `0`, ensuring first heartbeat after server restart is always recorded. OK.
5. **Rate-limit transaction retries:** `execTransaction` wraps in a Postgres transaction; SELECT FOR UPDATE serializes concurrent consumers on the same key. OK.

### Failure Modes Not Present

- No unhandled promise rejection paths in critical flows (verified via grep for `.then` without `.catch` and via explicit try/catch inspection in event handlers).
- No division-by-zero risk in leaderboard scoring (computeContestRanking uses guarded Math.max on empty arrays).
- No NaN propagation: quick-create Zod schema rejects NaN-producing inputs; date parsing is guarded.
