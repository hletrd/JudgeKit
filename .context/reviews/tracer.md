# Tracer Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** e2043115

## Causal Tracing of Suspicious Flows

### TR-1: `validateAssignmentSubmission` uses `Date.now()` while DB stores deadlines — two different time sources for access-control comparison [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Causal trace:**
1. User sends POST /api/v1/submissions with `assignmentId` and `problemId`
2. Line 194: `assignment = await getAssignmentAccessRecord(...)` — fetches assignment from DB (timestamps stored in DB time)
3. Line 208: `now = Date.now()` — threshold computed from app-server wall clock
4. Line 212: `startsAt && startsAt > now` — DB-stored `startsAt` compared against app-server time
5. Line 220: `effectiveCloseAt && effectiveCloseAt < now` — DB-stored deadline compared against app-server time
6. Line 268: `examSession.personalDeadline.valueOf() < Date.now()` — DB-stored personal deadline compared against app-server time

The comparisons at steps 4, 5, and 6 cross a trust boundary: app-server time (untrusted relative to DB) is compared against DB-stored timestamps (authoritative). Under clock skew where `T_app < T_db`, the effective deadline window widens, allowing post-deadline submissions.

**Competing hypotheses:**
- H1: Clock skew is negligible in production (container NTP syncs). **Rejected:** The codebase has fixed clock-skew bugs in at least 5 previous cycles, indicating it is a real production concern.
- H2: The assignment PATCH route was fixed but this validation path was missed. **Accepted:** This function is called from the submission creation route, but the clock-skew fix in cycle 43 only addressed the rate-limit check, not the validation check.

**Fix:** Use `getDbNowUncached()` for all deadline comparisons.

**Confidence:** Medium
