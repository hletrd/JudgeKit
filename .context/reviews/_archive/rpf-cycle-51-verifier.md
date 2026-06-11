# Cycle 51 — Verifier

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** verifier

## Verification of Claimed Behavior

### 1. ICPC Leaderboard Deterministic Sort

**Claim:** ICPC leaderboard sorts deterministically using userId as final tie-breaker.
**Evidence:** `contest-scoring.ts:346-359` — sort function applies: (1) more problems solved first, (2) less penalty first, (3) earlier last AC first, (4) userId localeCompare as final tie-breaker. All four levels are deterministic.
**Verdict:** CONFIRMED

### 2. Recruiting Token Redeem Atomicity

**Claim:** Token redemption is atomic with no TOCTOU race.
**Evidence:** `recruiting-invitations.ts:492-509` — the `UPDATE ... WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > NOW())` SQL clause is the authoritative check. If the invitation was claimed concurrently or expired, the UPDATE returns 0 rows and the transaction rolls back.
**Verdict:** CONFIRMED

### 3. Anti-Cheat Heartbeat Gap Detection

**Claim:** Heartbeat gaps are detected correctly using DB timestamps.
**Evidence:** `anti-cheat/route.ts:189-224` — gap detection uses `createdAt` from DB rows, compares with `GAP_THRESHOLD_MS` (120s), and produces accurate gap intervals. Null-safety is handled with `continue` on missing timestamps.
**Verdict:** CONFIRMED

### 4. Exam Session DB-Consistent Time

**Claim:** Exam sessions use DB server time to avoid clock skew.
**Evidence:** `exam-sessions.ts:52-56` — uses `rawQueryOne("SELECT NOW()::timestamptz")` for `now` value, which is used for startsAt/deadline comparisons and personalDeadline computation.
**Verdict:** CONFIRMED

### 5. SSE Connection Cleanup

**Claim:** Stale SSE connections are cleaned up periodically.
**Evidence:** `events/route.ts:101-115` — periodic cleanup runs every 60 seconds, removes connections older than `staleThreshold` (SSE timeout + 30s, max 2h). Timer has `.unref()` to allow process exit.
**Verdict:** CONFIRMED

### 6. Rate Limit X-RateLimit-Reset Uses DB Time

**Claim:** The X-RateLimit-Reset header uses DB-consistent time.
**Evidence:** `api-rate-limit.ts:122-131` — `rateLimitedResponse` uses `nowMs` from `atomicConsumeRateLimit` (which uses `Date.now()` — known deferred item). When called from `checkServerActionRateLimit`, it uses `getDbNowUncached().getTime()`. The API rate-limit path still uses `Date.now()` (deferred).
**Verdict:** PARTIALLY CONFIRMED — server action rate limit uses DB time; API rate limit uses Date.now() (deferred).

## Findings

No new findings. All prior fixes verified intact.
