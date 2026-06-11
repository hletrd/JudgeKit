# Cycle 3 Debugger Review

**Date:** 2026-04-19
**Base commit:** f637c590
**Reviewer:** debugger

## Findings

### F1 — Chat-logs `parseInt` page parameter produces NaN for non-numeric input
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/chat-logs/route.ts:19`
- **Evidence:** `Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))` — `parseInt("abc", 10)` returns `NaN`, and `Math.max(1, NaN)` returns `NaN` (not 1). This propagates `NaN` into `offset = (page - 1) * limit = NaN * 50 = NaN`.
- **Failure scenario:** Request `/api/v1/admin/chat-logs?page=abc` returns empty results or SQL error.
- **Suggested fix:** Use `parsePositiveInt(url.searchParams.get("page"), 1)`.

### F2 — Admin submissions CSV export unbounded query can OOM the server
- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/submissions/export/route.ts:95-111`
- **Evidence:** No `.limit()` on the Drizzle query. The entire result set is loaded into memory, then mapped to CSV strings.
- **Failure scenario:** On a deployment with 500K+ submissions, the server process runs out of memory and crashes with OOM, potentially taking down the entire application.
- **Suggested fix:** Add `.limit(10000)` as a hard cap.

### F3 — Exam session creation race condition handled by `onConflictDoNothing` + re-fetch
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/assignments/exam-sessions.ts:87-102`
- **Evidence:** `startExamSession` inserts with `.onConflictDoNothing()` then re-fetches the existing row. If two concurrent requests both pass the "no existing session" check, one insert succeeds and the other is silently ignored. The re-fetch then returns the winner's row. This is correct but relies on the unique constraint on `(assignmentId, userId)`.
- **Failure scenario:** No actual failure — the pattern is sound. But if the unique constraint is ever removed, duplicate exam sessions could be created.
- **Suggested fix:** Add a code comment documenting the dependency on the unique constraint.

### F4 — Contest scoring `computeIcpcPenalty` uses `Math.floor` for minutes
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/assignments/contest-scoring.ts:16`
- **Evidence:** `const minutesToAc = Math.floor((firstAcMs - contestStartMs) / 60_000);` — This truncates partial minutes. An AC at 59 seconds gets 0 minutes penalty, while an AC at 60 seconds gets 1 minute. This matches ICPC convention (whole minutes only), so it's correct by intent.
- **Failure scenario:** None — this is correct ICPC behavior.
- **Suggested fix:** No fix needed; add a comment confirming this matches ICPC rules.

## Summary

Found 4 issues: 1 HIGH (unbounded CSV export), 1 MEDIUM (parseInt NaN in chat-logs), 2 LOW (exam session race condition documentation, ICPC penalty convention). The unbounded CSV export is the most critical.
