# Performance Reviewer — Cycle 6b Deep Review

**Date:** 2026-04-19
**Base commit:** 64f02d4d

## Findings

### P1: Submissions GET route uses dual count+data queries (offset pagination path)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/submissions/route.ts:111-159`
- **Issue:** The offset-based pagination path (non-cursor) issues separate `count(*)` and data queries. This is the same pattern that was fixed for rankings (RANK-01), chat-logs (CHAT-LOG-01), and admin chat-logs in prior cycles. Under concurrent writes, the count and data can be inconsistent. The cursor-based path does not have this issue.
- **Fix:** Use `COUNT(*) OVER()` window function in the data query for the offset path.

### P2: Files GET route dual count+data queries
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/files/route.ts:162-186`
- **Issue:** Same dual-query pattern as P1. Files list is lower-traffic than submissions.
- **Fix:** Use `COUNT(*) OVER()` in the data query.

### P3: Users GET route dual count+data queries
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/users/route.ts:38-51`
- **Issue:** Same pattern. Admin-only route, lower traffic.
- **Fix:** Use `COUNT(*) OVER()` in the data query.

### P4: Groups/[id]/assignments GET route dual count+data queries
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/groups/[id]/assignments/route.ts:45-67`
- **Issue:** Same pattern. Instructor-only route.
- **Fix:** Use `COUNT(*) OVER()` in the data query.

### P5: SSE connection tracking cleanup timer runs even with no connections
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:71-84`
- **Issue:** The global `setInterval` for cleanup runs every 60 seconds regardless of whether any SSE connections exist. The `unref()` call allows the process to exit, but the timer still fires in a long-running server. Under zero connections, it iterates an empty map.
- **Fix:** Consider starting/stopping the cleanup timer in tandem with the shared poll timer. Low priority — the empty-map iteration is negligible.

### P6: Submissions summary query issues a THIRD query in the same request
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/submissions/route.ts:137-148`
- **Issue:** When `includeSummary=1`, the offset path issues a third query for status grouping. This could be combined with the count query using a single `GROUP BY` with `ROLLUP` or by computing the summary client-side from the already-fetched data.
- **Fix:** Consider merging the count and summary queries, or computing the total from the summary aggregation.
