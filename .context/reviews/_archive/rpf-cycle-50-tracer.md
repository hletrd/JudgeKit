# Cycle 50 — Tracer

**Date:** 2026-04-23
**Base commit:** 6463cdda
**Reviewer:** tracer

## Findings

No new causal chains with security or correctness impact found this cycle.

### TR-Sweep: Data Flow Verification

Traced the following data flows to verify correctness:

1. **ICPC Leaderboard Sort** (contest-scoring.ts:346-359): Sort -> Rank Assignment -> Return. The userId tie-breaker ensures deterministic sort output. Rank assignment only checks `totalScore` and `totalPenalty` for tie detection (line 372), which is correct — users with identical scores AND penalties get the same rank regardless of their last AC time or userId.

2. **Stale-while-revalidate Cache** (contest-scoring.ts:96-130): Cache lookup -> Age check -> Background refresh -> Return. The background refresh uses `Date.now()` for `createdAt` in the cache, but this is appropriate because it's an in-memory TTL comparison (both read and write use app-server time).

3. **Judge Claim Route** (judge/claim/route.ts:122-126): `getDbNowUncached()` -> `claimCreatedAt` -> SQL `to_timestamp()` -> stale detection via `NOW()`. The data flow is now DB-consistent.

## Sweep Notes

No competing hypotheses or suspicious flows identified.
