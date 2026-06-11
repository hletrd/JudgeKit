# Cycle 3 Test Engineer Review

**Date:** 2026-04-19
**Base commit:** f637c590
**Reviewer:** test-engineer

## Findings

### F1 — No tests for admin submissions CSV export
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/submissions/export/route.ts` (untested)
- **Evidence:** Searched test files — no unit or integration tests exist for the submissions export endpoint. This route has an unbounded query bug (no row limit) that would have been caught by a basic test.
- **Risk:** Regressions in CSV formatting, escaping, or row limits will go undetected.
- **Suggested fix:** Add unit tests verifying: (1) CSV output format, (2) CSV injection prevention, (3) row limit enforcement, (4) date/status filtering.

### F2 — No tests for admin chat-logs endpoint
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/chat-logs/route.ts` (untested)
- **Evidence:** No test coverage for the chat-logs admin endpoint. The `parseInt` NaN bug on the `page` parameter would have been caught.
- **Risk:** Regressions in pagination, session filtering, and audit event recording will go undetected.
- **Suggested fix:** Add unit tests for: (1) session list pagination, (2) NaN page parameter, (3) transcript access audit event, (4) userId filtering.

### F3 — No tests for contest anti-cheat GET endpoint
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (GET handler untested)
- **Evidence:** The POST handler (event logging) is more critical, but the GET handler (instructor view) has no test coverage for pagination, heartbeat gap detection, or eventType filtering.
- **Risk:** Regressions in anti-cheat event retrieval will go undetected.
- **Suggested fix:** Add unit tests for the GET handler.

### F4 — SSE connection tracking cleanup timer has no test
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:66-84`
- **Evidence:** The `setInterval` cleanup timer at line 72 removes stale connection entries, but there is no test verifying the cleanup behavior.
- **Risk:** The eviction logic (flagged in prior cycles as AGG-5/AGG-11) could regress without detection.
- **Suggested fix:** Add a unit test that creates stale entries and verifies the cleanup timer removes them.

## Summary

Found 4 issues: 2 MEDIUM (no tests for submissions export, no tests for chat-logs), 2 LOW (no tests for anti-cheat GET, no tests for SSE cleanup). The lack of test coverage for the submissions export endpoint directly contributed to the unbounded query bug going undetected.
