# Debugger Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** e2043115

## Inventory of Files Reviewed

- `src/lib/assignments/submissions.ts` — Submission validation (failure mode analysis)
- `src/lib/assignments/leaderboard.ts` — Leaderboard freeze logic
- `src/lib/realtime/realtime-coordination.ts` — SSE connection management
- `src/app/api/v1/judge/claim/route.ts` — Judge claim

## Previously Fixed Items (Verified)

- All prior fixes intact and working

## New Findings

### DBG-1: `validateAssignmentSubmission` deadline enforcement uses `Date.now()` — inaccurate under clock skew [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The `validateAssignmentSubmission` function uses `Date.now()` to compute the current time for comparing against DB-stored deadline timestamps. Under clock skew between the app server and DB server, the deadline check is inaccurate.

**Failure mode:** If the app server clock is behind the DB server clock:
- `startsAt > now` check at line 212: Users can access assignments that have already started in DB time (false negative — allows access when it shouldn't, but this is less harmful).
- `effectiveCloseAt < now` check at line 220: Users can submit after the actual deadline (more harmful — allows late submissions).
- `personalDeadline < Date.now()` check at line 268: Exam time appears unexpired longer than it should (allows extra exam time).

If the app server clock is ahead:
- Users are blocked from submitting before the actual deadline (more harmful — blocks legitimate submissions).

**Fix:** Use `getDbNowUncached()` for the time computation.

**Confidence:** Medium
