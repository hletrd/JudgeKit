# Cycle 53 — Tracer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** tracer

## Inventory of Traced Flows

- Contest leaderboard freeze path: `leaderboard.ts:41-77 → contest-scoring.ts:computeContestRanking → cache hit/miss → _computeContestRankingInner`.
- Anti-cheat heartbeat path: `anti-cheat-monitor.tsx → POST /api/v1/contests/[assignmentId]/anti-cheat → 60s dedup → DB insert`.
- Rate-limit path: `consumeApiRateLimit → sidecar pre-check → atomicConsumeRateLimit → DB transaction with SELECT FOR UPDATE`.
- Recruiting token redemption: `redeemRecruitingToken → getDbNowUncached → atomic UPDATE on (tokenHash, status='pending', expiryTimestamp > now)`.

## Findings

No competing hypotheses required. Every traced flow matches the documented intent.

### Carry-Over Confirmations

- Leaderboard freeze uses `Date.now()` for comparing against DB `freeze_leaderboard_at` (leaderboard.ts:52). The impact is sub-second inaccuracy; acceptable per the cycle 42-46 rationale.

### Observations

1. SSE connection cleanup has two timers: a 60-second cleanup for stale entries and a per-connection auth recheck every 30 seconds. Both correctly `unref()` so they do not block process exit.
2. The contest-scoring stale-while-revalidate cache has a cooldown (REFRESH_FAILURE_COOLDOWN_MS) to prevent amplifying DB failures — a prior observation this cycle confirms the cooldown fires on promise rejection via the `.catch` handler.
3. The rate-limit sidecar client (`rate-limiter-client.ts`) implements a circuit breaker: `FAILURE_THRESHOLD` consecutive failures open the circuit for `RECOVERY_WINDOW_MS` during which all sidecar calls short-circuit to `null` (fail-open), preventing cascading failures.
