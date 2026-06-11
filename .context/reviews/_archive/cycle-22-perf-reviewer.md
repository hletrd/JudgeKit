# Performance Reviewer — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### PERF-1: Practice page Path B progress filter still fetches all matching IDs + submissions into memory [MEDIUM/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:412-449`
**Description:** This was identified in cycle 18 (AGG-3) and remains unfixed. When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, then paginates. The code has a comment acknowledging this should be moved to SQL (lines 413-415). This is a deferred item (DEFER-1) in the cycle-21 plan.
**Concrete failure scenario:** With 10,000+ public problems, this path could take several seconds and consume significant memory on the server.
**Fix:** Move the progress filter logic into a SQL CTE or subquery.
**Confidence:** MEDIUM

### PERF-2: Workers page polls every 10 seconds regardless of tab visibility [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:244`
**Description:** `setInterval(fetchData, 10_000)` runs regardless of tab visibility. When the admin switches to another tab, the polling continues, wasting network and server resources.
**Concrete failure scenario:** An admin has the workers page open in a background tab all day. 360 requests per hour are made with no user benefit.
**Fix:** Use `visibilitychange` event to pause/resume polling, matching the pattern in `SubmissionListAutoRefresh` which checks `document.visibilityState`.
**Confidence:** LOW

## Verified Safe

- Public problem detail page parallelizes independent queries with `Promise.all` (line 128).
- `SubmissionListAutoRefresh` properly checks `document.visibilityState` before refreshing.
- `CountdownTimer` properly cleans up its interval on unmount.
- Chat widget uses streaming SSE, not polling.
