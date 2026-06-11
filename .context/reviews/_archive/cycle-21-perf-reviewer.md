# Cycle 21 Performance Reviewer

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Performance, concurrency, CPU/memory/UI responsiveness

---

## F1: `participant-audit.ts` full leaderboard computation for single-user lookup

- **File**: `src/lib/assignments/participant-audit.ts:13`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Same as code-reviewer F1. `getParticipantAuditData` calls `computeContestRanking` which computes the entire leaderboard, then extracts one entry. The contest-scoring cache mitigates repeated calls within the 15s freshness window, but the first call per cache window is O(n) in participants. For a 2000-person contest, this wastes CPU on computing 1999 unused entries.
- **Concrete failure scenario**: During a large contest, multiple instructors open different student audit views simultaneously. Each first request computes the full leaderboard. With 10 instructors and 2000 participants, this is 20,000 entry computations per cache window instead of 10.
- **Fix**: Create a single-user variant of the ranking computation, or at minimum document the performance characteristic.

## F2: Anti-cheat heartbeat gap detection loads up to 5000 rows into memory per GET request

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:189-198`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: When `userIdFilter` is provided, the GET endpoint fetches up to 5000 heartbeat rows and reverses them for gap detection. This is a fixed upper bound, so memory usage is bounded. However, the gap detection is O(n) with a constant factor, and it runs on every GET request even if the instructor is just browsing paginated events. The gap detection could be computed lazily (only when requested) or cached.
- **Concrete failure scenario**: An instructor refreshes the anti-cheat event list 10 times while investigating a student. Each request re-fetches and re-processes 5000 heartbeat rows. The gap results are identical each time but recomputed from scratch.
- **Fix**: Add a `?includeGaps=true` query parameter so gap detection is only computed when explicitly requested. Or cache the gap results per assignmentId:userId with a short TTL.

## F3: `contest-analytics.ts` makes 5+ sequential DB queries per computation

- **File**: `src/lib/assignments/contest-analytics.ts:92-292`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `computeContestAnalytics` makes the following sequential DB queries: (1) `computeContestRanking`, (2) problems query, (3) firstAcMap query, (4) submissionRows (if timeline), (5) contestMeta, (6) cheatRows. Queries 2-6 could be parallelized with `Promise.all`. The cache mitigates repeated calls, but cold-cache latency could be significant.
- **Concrete failure scenario**: A cold-cache analytics request for a large contest with timeline enabled takes 5 sequential DB round-trips. If each query takes 50ms, that's 250ms instead of the ~50ms possible with parallelization.
- **Fix**: Wrap independent queries (problems, firstAcMap, contestMeta, cheatRows) in a `Promise.all` to parallelize them. The `computeContestRanking` call must remain first since it's needed for the entry-based calculations.

## Previously Verified Safe (Cycle 20)

- SSE connection tracking with per-user counts — O(1) lookup maintained
- Leaderboard table O(1) per-problem lookup — `entryProblemMap` used correctly
- Contest scoring stale-while-revalidate cache — correctly avoids redundant refreshes
