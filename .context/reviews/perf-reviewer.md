# Performance Review: JudgeKit

**Reviewer:** perf-reviewer
**Date:** 2026-05-10
**Scope:** Performance, concurrency, CPU/memory efficiency, UI responsiveness

---

## Summary

Several performance issues were identified, primarily around pagination strategy, audit event serialization, and polling behavior. Most are MEDIUM severity with concrete impact under load.

---

## MEDIUM Severity

### 1. Offset Pagination Without Index Optimization
**File:** `src/app/api/v1/submissions/route.ts:114-133`
**Severity:** MEDIUM
**Confidence:** High

The default pagination mode uses `OFFSET` with `COUNT(*) OVER()`:
```sql
SELECT ..., count(*) over() FROM submissions ... ORDER BY submitted_at DESC LIMIT ? OFFSET ?
```

As the table grows and users paginate deeper (page 100+), OFFSET scans progressively more rows. The `count(*) over()` window function also adds overhead. With 1M+ submissions, deep pagination becomes slow.

**Fix:** Prefer cursor-based pagination (already supported but not the default). For offset mode, add a composite index on `(submitted_at DESC, id DESC)` and consider requiring a filter (problemId or assignmentId) to limit scan scope.

### 2. truncateObject Has O(n^2) JSON Serialization
**File:** `src/lib/audit/events.ts:55-91`
**Severity:** MEDIUM
**Confidence:** High

The `truncateObject` function calls `JSON.stringify` inside a loop:
```typescript
for (const item of obj) {
  const truncated = truncateObject(item, remaining - 1);
  const serialized = JSON.stringify(truncated);  // <-- Called repeatedly
  ...
}
```

For deeply nested audit details objects, JSON.stringify is called at every level of recursion, then again for the parent. This creates redundant serialization work.

**Fix:** Serialize once at the top level, then truncate the string directly, or use a single-pass approach.

### 3. Infinite Polling Retry Without Error Classification
**File:** `src/hooks/use-submission-polling.ts:267`
**Severity:** MEDIUM
**Confidence:** High

On fetch polling error, delay doubles up to 30s but polling continues indefinitely:
```typescript
delayMs = Math.min(delayMs * 2, 30000);
scheduleRefresh();
```

A 404 (submission deleted) or 403 (session expired) will poll forever at 30s intervals, wasting client and server resources.

**Fix:** Check response status code. Stop polling on 404/403. Only retry on 5xx and network errors.

### 4. N+1 Query in Cursor Pagination
**File:** `src/app/api/v1/submissions/route.ts:61-68`
**Severity:** MEDIUM
**Confidence:** High

For cursor-based pagination, an extra query resolves the cursor timestamp:
```typescript
const cursorRow = await db.query.submissions.findFirst({
  where: eq(submissions.id, cursor),
  columns: { submittedAt: true },
});
```

This is an N+1 pattern: the client provides a cursor ID, and the server must look up that ID's timestamp before running the main query.

**Fix:** Encode the timestamp into the cursor itself (e.g., base64-encoded `id:timestamp`), avoiding the lookup query.

### 5. Double Query for includeSummary
**File:** `src/app/api/v1/submissions/route.ts:139-148`
**Severity:** MEDIUM
**Confidence:** Medium

When `includeSummary=true`, a second GROUP BY query runs:
```typescript
const grouped = await db.select({ status: submissions.status, count: sql<number>`count(*)` })
```

This could be computed from the main query's `_total` window function or cached separately.

**Fix:** For small result sets, compute summary from the returned rows. For large sets, cache per-user summary in Redis or a materialized view.

---

## LOW Severity

### 6. Rate Limit Eviction Timer Never Stops in Tests
**File:** `src/lib/security/rate-limit.ts:70-81`
**Severity:** LOW
**Confidence:** High

Already identified by security-reviewer (M7). The timer runs forever. In test suites, this can delay process exit and cause Jest/Vitest "open handles" warnings.

**Fix:** Already has `stopRateLimitEviction()` exported. Ensure it's called in test teardown.

### 7. Compiler Container Concurrency Limit Uses CPU Count
**File:** `src/lib/compiler/execute.ts:32`
**Severity:** LOW
**Confidence:** Medium

```typescript
const executionLimiter = pLimit(Math.max(cpus().length - 1, 1));
```

On a 64-core server, this allows 63 concurrent compiler containers. Each container uses 256MB RAM, so peak usage is ~16GB. This may exceed available memory.

**Fix:** Also cap by available memory: `Math.max(cpus().length - 1, 1, Math.floor(totalMemMB / 512))`.

---

## Final Sweep

Files examined: src/app/api/v1/submissions/route.ts, src/lib/audit/events.ts, src/hooks/use-submission-polling.ts, src/lib/security/rate-limit.ts, src/lib/compiler/execute.ts, src/app/api/v1/judge/claim/route.ts, src/lib/db/queries.ts, src/components/submissions/submission-detail-client.tsx, src/components/contest/leaderboard-table.tsx
