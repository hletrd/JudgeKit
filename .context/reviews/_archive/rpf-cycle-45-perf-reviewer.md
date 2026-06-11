# Cycle 45 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### PERF-1: Analytics route fetches all submissions for student progression without pagination [MEDIUM/LOW]

**File:** `src/lib/assignments/contest-analytics.ts:242-250`

```typescript
const submissionRows = await rawQueryAll<SubmissionTimeRow>(
  `SELECT s.user_id AS "userId", u.name, s.problem_id AS "problemId", s.score, s.submitted_at AS "submittedAt",
          COALESCE(ap.points, 100) AS points
   FROM submissions s
   INNER JOIN users u ON u.id = s.user_id
   INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
   WHERE s.assignment_id = @assignmentId
   ORDER BY s.submitted_at ASC`,
  { assignmentId }
);
```

This query fetches ALL submissions for a contest into memory when `includeTimeline` is true. For a large contest with 200 students and 10 problems and 50 attempts each, this could be 100,000 rows. The data is then processed in a single-pass in-memory aggregation.

This is gated behind `includeTimeline` which is only used on the analytics page, so it's not in the hot path for the main contest experience. However, for very large contests this could cause significant memory pressure and slow API response times.

**Fix (if needed):** Add a LIMIT clause or use cursor-based pagination. Alternatively, compute the progression server-side using a window function SQL query instead of fetching all rows.

---

### PERF-2: SSE stale connection cleanup iterates entire connectionInfoMap [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:102-111`

```typescript
globalThis.__sseCleanupTimer = setInterval(() => {
  if (connectionInfoMap.size === 0) return;
  const now = Date.now();
  const staleThreshold = getStaleThreshold();
  for (const [connId, info] of connectionInfoMap) {
    if (now - info.createdAt > staleThreshold) {
      removeConnection(connId)
    }
  }
}, CLEANUP_INTERVAL_MS);
```

This is the known deferred item (SSE O(n) eviction scan). The map is bounded by `MAX_TRACKED_CONNECTIONS` (1000), so the scan is O(1000) every 60 seconds — negligible. No new finding.

---

### PERF-3: Score distribution computation iterates all entries twice [LOW/LOW]

**File:** `src/lib/assignments/contest-analytics.ts:106-121`

The score distribution computation iterates all entries once to compute bucket counts. This is O(n) where n is the number of leaderboard entries. For typical contest sizes (under 500 participants), this is negligible. Not a real performance concern.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| PERF-1 | MEDIUM/LOW | Analytics student progression fetches all submissions without limit |
| PERF-2 | LOW/LOW | SSE stale connection cleanup (known deferred, not new) |
| PERF-3 | LOW/LOW | Score distribution double iteration (negligible) |
