# RPF Cycle 35 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** 218a1a93

## PERF-1: SSE connection tracking uses O(n) linear scan for oldest-by-age eviction [LOW/MEDIUM]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** When the `connectionInfoMap` exceeds `MAX_TRACKED_CONNECTIONS` (1000), the eviction loop scans all entries to find the oldest one, which is O(n). Under high connection churn, this could be called multiple times per eviction cycle. For 500+ concurrent SSE connections with rapid connect/disconnect, this creates a linear scan on every new connection when near capacity.

**Concrete failure scenario:** During a large contest with 500+ simultaneous SSE connections, every new connection triggers a full scan of the connection map to find and evict the oldest entry, adding latency to the connection establishment.

**Fix:** Use a sorted data structure (e.g., a min-heap by `createdAt`) or maintain a separate sorted index for efficient eviction. Alternatively, use a ring buffer approach where the oldest entries are evicted first by position.

**Confidence:** MEDIUM

---

## PERF-2: Contest stats CTE query recomputes user_best for both submittedCount and problemsSolvedCount [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:80-119`

**Description:** The stats query uses three CTEs (`participants`, `user_best`, `user_totals`, `submission_stats`, `solved_problems`). The `solved_problems` CTE separately scans the `submissions` table and joins `assignment_problems` instead of reusing the `user_best` CTE which already computed `MAX(score)` per user+problem. This means the submissions table for the assignment is scanned twice (once in `user_best`, once in `solved_problems`), which is wasteful for large contests.

**Concrete failure scenario:** A contest with 500 participants and 10 problems generates ~5000 submissions. The stats endpoint scans all 5000 submissions twice instead of once, doubling query time.

**Fix:** Refactor `solved_problems` to reference `user_best` instead of re-scanning `submissions`:
```sql
solved_problems AS (
  SELECT COUNT(DISTINCT ub.problem_id)::int AS solved_count
  FROM user_best ub
  INNER JOIN assignment_problems ap ON ap.assignment_id = @assignmentId AND ap.problem_id = ub.problem_id
  WHERE ROUND(ub.best_score, 2) >= ROUND(COALESCE(ap.points, 100), 2)
)
```

**Confidence:** HIGH

---

## PERF-3: Chat widget `scrollToBottom` callback recreates on `isStreaming` change despite ref fix [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-105`

**Description:** The `scrollToBottom` callback still has `isStreaming` in its dependency array (line 105), which means it is recreated every time streaming starts/stops. The ref fix in cycle 34 correctly removed `isStreaming` from `sendMessage`'s dependency array, but `scrollToBottom` still depends on it to choose between rAF-batched and smooth scrolling. This causes `scrollToBottom` recreation, which cascades to the scroll effect (line 107-115) re-subscribing. While this is a minor perf concern (2 recreations per message), it's unnecessary — a ref-based approach similar to `isStreamingRef` could stabilize `scrollToBottom` as well.

**Concrete failure scenario:** Each time `isStreaming` flips from false to true (start of streaming), the scroll effect re-subscribes, causing a brief gap in scroll tracking.

**Fix:** Use `isStreamingRef.current` inside `scrollToBottom` and remove `isStreaming` from its dependency array.

**Confidence:** LOW (minor, two recreations per message)
