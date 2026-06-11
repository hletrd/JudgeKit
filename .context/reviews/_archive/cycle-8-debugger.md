# Cycle 8 Debugger Review

**Date:** 2026-04-20
**Reviewer:** debugger
**Base commit:** ddffef18

## Findings

### DBG-1: `submittedAt` uses `new Date()` while exam deadline check uses SQL `NOW()` — direct clock-skew bug in exam submissions [MEDIUM/HIGH]

**File:** `src/app/api/v1/submissions/route.ts:317`
**Description:** The submission creation route runs inside a transaction that first checks the exam deadline using SQL `NOW()` (via the exam session validation). If the deadline check passes, it then writes `submittedAt: new Date()` using the app server clock. If the app server clock has drifted ahead of the DB clock, a submission that passes the deadline check could have a `submittedAt` timestamp that is after the deadline. Conversely, if the app clock is behind, a submission that should have been rejected could be recorded as on-time.
**Concrete failure scenario:** DB time is 12:01 AM (past deadline). App server time is 11:58 PM (before deadline). The SQL `NOW()` check sees 12:01 AM and correctly rejects the submission. But if the DB time is 11:58 PM and app time is 12:01 AM, the SQL check allows the submission but `submittedAt` records 12:01 AM — making it appear late in any subsequent audit.
**Fix:** Use `await getDbNowUncached()` for `submittedAt` so the stored timestamp is consistent with the deadline check.
**Confidence:** HIGH

### DBG-2: Judge poll `judgedAt` uses `new Date()` — can cause submission ordering anomalies [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/judge/poll/route.ts:75,142`
**Description:** Same pattern as DBG-1. The `judgedAt` timestamp is used for submission ordering and contest result display. Clock skew can cause submissions to appear in the wrong order.
**Fix:** Use `await getDbNowUncached()` for `judgedAt` and `judgeClaimedAt`.
**Confidence:** MEDIUM

### DBG-3: Community thread `updatedAt` uses `new Date()` while thread post also uses `new Date()` [LOW/LOW]

**File:** `src/app/api/v1/community/threads/[id]/route.ts:43`, `src/app/api/v1/community/threads/[id]/posts/route.ts:52`
**Description:** Thread and post updates use `new Date()` for `updatedAt`. These are display-only timestamps with no security implications.
**Fix:** Low priority — use `await getDbNowUncached()` for consistency.
**Confidence:** LOW

## Verified Safe

- SSE `viewerId` capture at line 198 is correct — `user.id` is captured after the null check at line 194.
- No null-pointer risks from `Map.get()` with non-null assertions in the reviewed routes.
