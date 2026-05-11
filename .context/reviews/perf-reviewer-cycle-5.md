# Performance Review — Cycle 5 (RPF Loop)

**Date:** 2026-05-11
**Reviewer:** perf-reviewer (orchestrator direct — Agent tool unavailable)
**Scope:** Code snapshot diffing, judge polling transaction, SSE cleanup

---

## Summary

2 findings: 1 MEDIUM, 1 LOW. Both are resource-efficiency issues under load.

---

## MEDIUM

### P5-M1: `buildCodeSnapshotDiff` O(n×m) Memory Can Exhaust Heap
- **File:** `src/lib/code-snapshots/diff.ts:28-30`
- **Confidence:** High
- **Description:** Same as C5-M1 (code-reviewer). The LCS matrix allocates `(n+1) × (m+1)` integers. For competitive programming submissions, 5,000+ line files are common (generated test cases, large boilerplate). At 5K lines this is ~25M integers = ~200MB. At 10K lines it's ~100M integers = ~800MB. With concurrent diffs or limited heap (e.g., 1GB container), this causes OOM crashes.
- **Performance impact:** OOM crash, process restart, dropped judge results, degraded user experience.
- **Fix:** Space-optimized LCS with O(min(n,m)) memory using two rolling rows.

---

## LOW

### P5-L1: Missing `sharedPollTimer` Cleanup on Server Shutdown
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:181-210`
- **Confidence:** Medium
- **Description:** The SSE route creates a `sharedPollTimer` via `setInterval` that queries the database periodically. Unlike `__sseCleanupTimer` (which has `stopSseCleanupTimer()` exported for test teardown), there is no exported function to stop `sharedPollTimer`. On graceful shutdown, this timer keeps the process alive until it fires again, delaying shutdown by up to the poll interval (default 1-5 seconds).
- **Performance impact:** Delayed graceful shutdown, potential dropped connections during deploys.
- **Fix:** Export `stopSharedPollTimer()` and call it from the shutdown handler alongside `stopSseCleanupTimer()`.

---

## Verification of Prior Fixes

- **SSE connection caps:** Verified — per-user and global connection limits enforced.
- **SSE cleanup timer:** Verified — `stopSseCleanupTimer()` exported and used in tests.
- **Judge claim SQL:** Verified — uses `FOR UPDATE SKIP LOCKED` for lock-free claiming.
