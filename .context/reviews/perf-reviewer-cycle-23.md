# Performance Reviewer — Cycle 23

**Date:** 2026-04-24
**Scope:** Full repository performance review

---

## P-1: [MEDIUM] Contest ranking cache uses `getDbNowMs()` on every cache check — extra DB query per leaderboard request

**Confidence:** MEDIUM
**Citations:** `src/lib/assignments/contest-scoring.ts:101,114,118,130`

`computeContestRanking` calls `getDbNowMs()` on every invocation — including cache hits. This means every leaderboard request that hits the stale-while-revalidate path makes an extra `SELECT NOW()` round-trip to the database before returning cached data. Under high traffic during a live contest, this adds a DB query per request even for cached responses.

**Concrete failure scenario:** A live contest with 200 students viewing the leaderboard every 15 seconds. Each request hits the SWR path (data is 15-30s old). Each request does `SELECT NOW()` before returning cached data. That's ~800 unnecessary DB queries per minute.

**Fix:** Cache `getDbNowMs()` results with a short TTL (e.g., 1-2 seconds) at the module level, or accept `Date.now()` for cache staleness checks (the staleness tolerance is 15s, so clock skew of <1s is negligible for this purpose). The authoritative DB time is already used for the actual ranking computation.

---

## P-2: [LOW] `connectionInfoMap` oldest-entry eviction is O(n)

**Confidence:** LOW
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

Same as CR-2. When the tracking map reaches `MAX_TRACKED_CONNECTIONS` (1000), eviction iterates all entries. With the cap at 1000, this is acceptable in practice.

**Fix:** No immediate action needed. Revisit if MAX_TRACKED_CONNECTIONS is raised significantly.

---

## Summary

- Total findings: 2
- MEDIUM: 1 (P-1)
- LOW: 1 (P-2)
