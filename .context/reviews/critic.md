# Critic Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** critic
**Base commit:** e2043115

## Inventory of Files Reviewed

- All API routes and core libraries (cross-cutting concern analysis)
- Focus: clock-skew consistency, non-null assertion patterns, error handling

## Previously Fixed Items (Verified)

- All cycle 43 fixes verified and intact

## New Findings

### CRI-1: `validateAssignmentSubmission` is the last server-side access-control function using `Date.now()` — pattern inconsistency [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The codebase has established a clear convention: use `getDbNowUncached()` for all schedule comparisons against DB-stored timestamps. This convention was applied to the assignment PATCH route, the submission rate-limit route, and the recruiting invitation routes. The `validateAssignmentSubmission` function is the only remaining server-side code that uses `Date.now()` for an access-control decision.

The pattern inconsistency is a maintenance risk: new developers seeing `Date.now()` in this function may assume it's the correct pattern for deadline enforcement, perpetuating the clock-skew problem.

**Fix:** Use `getDbNowUncached()` for all deadline comparisons in `validateAssignmentSubmission`.

**Confidence:** Medium

---

### Positive Observations

- The `active-timed-assignments.ts` module correctly documents the requirement to use DB time with a clear comment.
- The `participant-status.ts` module correctly uses an injectable `now` parameter with `Date.now()` default, allowing testability.
- The submission route rate-limit fix (cycle 43) properly caches `dbNow` and reuses it for `submittedAt`, eliminating an extra DB round-trip.
- No new security regressions introduced since cycle 43.
