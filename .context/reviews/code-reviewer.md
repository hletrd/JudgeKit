# Code Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** e2043115

## Inventory of Files Reviewed

- `src/lib/assignments/submissions.ts` — Assignment submission validation (lines 190-280)
- `src/lib/assignments/contest-scoring.ts` — Contest ranking + leaderboard (lines 85-130, 228-245)
- `src/lib/assignments/contest-analytics.ts` — Contest analytics (lines 240-275)
- `src/lib/assignments/leaderboard.ts` — Leaderboard freeze logic (lines 40-77)
- `src/lib/realtime/realtime-coordination.ts` — SSE connection management (lines 80-180)
- `src/app/api/v1/submissions/route.ts` — Submission creation (verified cycle 43 fix)
- `src/app/api/v1/judge/claim/route.ts` — Judge claim (lines 110-160)
- `src/lib/assignments/participant-status.ts` — Participant status (lines 30-80)
- `src/lib/datetime.ts` — Date formatting utilities
- `src/lib/assignments/active-timed-assignments.ts` — Active timed assignments sidebar

## Previously Fixed Items (Verified)

- Submission route rate-limit uses `getDbNowUncached()` for `oneMinuteAgo`: PASS (line 251)
- Submission route `submittedAt` reuses `dbNow`: PASS (line 321)
- Contest join route has explicit `auth: true`: PASS

## New Findings

### CR-1: `validateAssignmentSubmission` uses `Date.now()` for deadline comparisons — clock-skew bypass [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The `validateAssignmentSubmission` function compares `Date.now()` against DB-stored assignment timestamps (`startsAt`, `deadline`, `lateDeadline`) at lines 208-226, and against `examSession.personalDeadline` at line 268. These are the same class of clock-skew issues that were previously fixed in the assignment PATCH route (cycle 40) and the submission route rate-limit (cycle 43). If the app server clock is behind the DB server clock, users can submit after the actual deadline. If the app server clock is ahead, users are blocked before the deadline.

**Concrete failure scenario:** App server clock is 30 seconds behind DB. A contest deadline is 10:00:00 (DB time). At 10:00:30 DB time, the app server thinks it's 10:00:00 and allows a submission that is past the deadline. Conversely, if the app server is 30 seconds ahead, a submission at 9:59:30 DB time would be rejected even though it's 30 seconds before the deadline.

**Fix:** Use `getDbNowUncached()` for the time comparison:
```typescript
const now = (await getDbNowUncached()).getTime();
```
Note: This function is synchronous (`validateAssignmentSubmission`) but already performs async DB operations, so making it async is consistent.

**Confidence:** Medium

---

### CR-2: Non-null assertions on `Map.get()` after `has()` guard — inconsistent with recent fixes [LOW/LOW]

**Files:**
- `src/lib/assignments/contest-scoring.ts:243` — `userMap.get(row.userId)!.problems.set(...)`
- `src/lib/assignments/submissions.ts:365` — `submissionsByProblem.get(sub.problemId)!.add(...)`
- `src/lib/assignments/contest-analytics.ts:259` — `userProgressMap.get(sub.userId)!`

**Description:** These three locations use the `!.get()` pattern after a `has()` guard on the preceding line. While the `has()` check makes the non-null assertion technically safe (the Map entry was just created), this pattern was removed from other files in recent cycles (e.g., the anti-cheat route at lines 211-213 in cycle 41). The codebase is converging on explicit null-guard patterns rather than non-null assertions.

**Fix:** Replace with a pattern that captures the result of `get()` and checks for null:
```typescript
const entry = userMap.get(row.userId);
if (!entry) continue;
entry.problems.set(row.problemId, row);
```

**Confidence:** Low — the current code is technically safe due to the `has()` guard, but it's inconsistent with the codebase trend.

---

### CR-3: `computeLeaderboard` uses `Date.now()` for freeze-leaderboard check — display inconsistency under clock skew [LOW/LOW]

**File:** `src/lib/assignments/leaderboard.ts:52`

**Description:** The `computeLeaderboard` function computes `nowMs = Date.now()` and compares it against `freezeAt` (a DB-stored `freezeLeaderboardAt` timestamp) to decide whether the leaderboard is frozen. Under clock skew, the leaderboard could appear frozen slightly before or after the intended freeze time. However, this is a display-only concern — the frozen leaderboard shows submissions up to the freeze time, and the actual submission data is correct. The freeze decision timing is at most slightly inaccurate.

**Fix:** Use `getDbNowUncached()` for consistency:
```typescript
const nowMs = (await getDbNowUncached()).getTime();
```
Note: This requires making the function async, which it already is.

**Confidence:** Low — the freeze timing inaccuracy is cosmetic, not a data integrity issue.
