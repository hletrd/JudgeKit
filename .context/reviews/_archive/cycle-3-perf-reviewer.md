# Cycle 3 Performance Review

**Date:** 2026-04-19
**Base commit:** f637c590
**Reviewer:** perf-reviewer

## Findings

### F1 — Admin submissions CSV export loads all rows into memory
- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/submissions/export/route.ts:95-111`
- **Evidence:** The Drizzle query at lines 95-111 has no `.limit()`. On a deployment with 100K+ submissions, all rows are fetched, then iterated to build a CSV string, then the entire CSV is held in memory for the response.
- **Impact:** Memory usage scales linearly with submission count. For a deployment with 500K submissions at ~500 bytes per row, this is ~250MB of CSV data plus the JS objects — potentially exceeding container memory limits.
- **Suggested fix:** Add `.limit(10000)` as a hard cap. If more data is needed, implement streaming CSV via ReadableStream.

### F2 — Chat-logs session list query runs two separate CTEs
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/chat-logs/route.ts:56-119`
- **Evidence:** The session list endpoint runs a complex CTE query for data (lines 69-110) and a separate `COUNT(DISTINCT session_id)` query for total count (lines 114-119). The CTE computation (filtered → session_bounds → session_first) is effectively duplicated.
- **Impact:** Doubles query cost on every page load. For deployments with many chat sessions, this adds unnecessary DB load.
- **Suggested fix:** Use `COUNT(*) OVER()` window function in the main query, consistent with the rankings fix (RANK-01) from cycle 2.

### F3 — Anti-cheat heartbeat gap detection loads up to 5000 rows per request
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:189-201`
- **Evidence:** When `userIdFilter` is provided, the endpoint fetches up to 5000 heartbeat rows from `antiCheatEvents` and reverses them in JS. For a contest with many participants, multiple concurrent instructor views could create significant DB load.
- **Impact:** Each instructor viewing anti-cheat data for a specific user loads 5000 rows. Low impact for typical usage.
- **Suggested fix:** Consider caching the heartbeat gap results for 30 seconds, similar to the contest-scoring cache pattern.

### F4 — Contest scoring query uses `OVER (PARTITION BY ...)` window function in CTE
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/assignments/contest-scoring.ts:153-154`
- **Evidence:** `MIN(CASE WHEN ROUND(s.score, 2) = 100 THEN s.submitted_at ELSE NULL END) OVER (PARTITION BY s.user_id, s.problem_id) AS first_ac_at` — The window function computes `first_ac_at` for every row, but only the minimum is needed. This causes PostgreSQL to materialize the full window before aggregation.
- **Impact:** For contests with many submissions per user-problem pair, this adds unnecessary computation. Low impact because the outer GROUP BY already aggregates.
- **Suggested fix:** Could be optimized by moving `first_ac_at` computation into a separate subquery, but the current approach is correct and reasonably efficient.

## Summary

Found 4 issues: 1 HIGH (unbounded CSV export), 1 MEDIUM (dual CTE in chat-logs), 2 LOW. The unbounded CSV export is the most critical.
