# Cycle 18 Performance Reviewer Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** Performance, concurrency, CPU/memory/UI responsiveness
**Base commit:** 75d82a17
**Previous review:** cycle-18-perf-reviewer.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | `getRecruitingAccessContext` redundant DB queries | **PARTIALLY ADDRESSED** — `withRecruitingContextCache` added in `api/handler.ts:109` |
| F2 | Contest analytics progression not parallelized | **STILL OPEN** — unchanged |
| F3 | Export polling loop wastes CPU | **STILL OPEN** — unchanged |

---

## New Findings

### N1: `getAssignmentStatusRows` Heavy SQL Aggregation

- **File**: `src/lib/assignments/submissions.ts:606-640`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Status board uses a CTE with `ROW_NUMBER() OVER (PARTITION BY ...)` plus `GROUP BY` on all (userId, problemId) pairs. For 500 students x 10 problems = 5,000 groups. Query scans all submissions and computes window functions. Not paginated.
- **Impact**: Status board latency scales with total submissions.
- **Fix**: Add server-side pagination or cache aggregated results.

### N2: Rate Limit Row Locking Contention Under Load

- **File**: `src/lib/security/rate-limit.ts:99`, `src/lib/security/api-rate-limit.ts:95`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: `SELECT ... FOR UPDATE` on `rateLimits` table serializes concurrent requests. Burst traffic from same IP queues up.
- **Fix**: Consider advisory locks or upsert-based atomic increment.

### N3: Docker Build Output Buffer Unbounded in Memory

- **File**: `src/lib/docker/client.ts:239-292`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Up to 2MB of build output accumulated in memory per build. Modest but adds up for concurrent builds.
- **Fix**: Stream output to logs instead of buffering.

### N4: Chat Widget Passes Full `editorCode` to AI Provider

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:54`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: `editorCode` allows 100,000 chars passed unfiltered to AI provider. Increases token cost and latency.
- **Fix**: Truncate or send only relevant snippet.

---

## Verified Improvements

- **VI1**: `userConnectionCounts` Map eliminates O(n) SSE counting (fixed since April).
- **VI2**: Default 30s timeout added to `apiFetch`.
- **VI3**: `withRecruitingContextCache` reduces duplicate recruiting queries.
