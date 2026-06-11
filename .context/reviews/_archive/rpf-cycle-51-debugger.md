# Cycle 51 — Debugger

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** debugger

## Inventory of Reviewed Files

- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/judge/claim/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/proxy.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)

## Latent Bug Surface Analysis

### Failure Mode: Recruiting Token Redeem Race

The `redeemRecruitingToken` transaction at `recruiting-invitations.ts:311-533` has a well-designed atomic claim via SQL UPDATE WHERE. If two concurrent requests attempt to redeem the same token, the SQL `WHERE status = 'pending'` ensures only one succeeds. The loser gets `updated === undefined` and receives "alreadyRedeemed" error. This is correct.

### Failure Mode: SSE Connection Leak

The SSE route at `events/route.ts:302-462` properly removes connections in the `close()` function which is called on abort, timeout, and terminal result. The periodic cleanup at line 101-115 also handles stale connections. No leak path identified.

### Failure Mode: Judge Claim Stale Submissions

The judge claim route at `claim/route.ts:129-228` uses `FOR UPDATE SKIP LOCKED` to prevent concurrent claims on the same submission. Stale claims are detected by comparing `judge_claimed_at < NOW() - staleClaimTimeoutMs`. The `claimCreatedAt` is set from `getDbNowUncached()` — consistent with the SQL NOW() comparison. No bug.

### Failure Mode: Anti-Cheat LRU Cache Bypass

The anti-cheat heartbeat dedup at `anti-cheat/route.ts:91-98` uses an in-memory LRU cache for single-instance mode. The `Date.now()` usage here is acceptable because it's purely in-memory dedup with no DB consistency requirement. The shared coordination path uses `getDbNowUncached()`.

### Failure Mode: In-Memory Rate Limit Eviction

The eviction logic in `in-memory-rate-limit.ts:23-49` has a potential issue: the FIFO eviction on line 41-47 sorts all entries when over capacity, which is O(n log n). However, with a max of 10000 entries and eviction triggered only when the limit is exceeded, this is acceptable for the expected load.

## Findings

No new findings this cycle.

### Carry-Over Confirmations

All prior carry-over items remain valid.
