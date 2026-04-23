# Verifier Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** e2043115

## Evidence-Based Correctness Check

This review validates that the stated behavior of each recently-fixed item matches the actual code.

## Verified Fixes (All Pass)

1. **Submission route rate-limit uses `getDbNowUncached()`** — Line 251: `const dbNow = await getDbNowUncached();` Line 252: `const oneMinuteAgo = new Date(dbNow.getTime() - 60_000);` Line 321: `submittedAt: dbNow`. PASS — the cached value is reused, eliminating the extra DB round-trip.
2. **Contest join route explicit `auth: true`** — Present in the `createApiHandler` config. PASS.

## New Findings

### V-1: `validateAssignmentSubmission` uses `Date.now()` for deadline enforcement — inconsistent with established pattern [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The submission validation function uses `Date.now()` at lines 208, 220, and 268 to compare against DB-stored deadlines. This is verifiably inconsistent with the established pattern in:
- Assignment PATCH route (`src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:103`) — uses `getDbNowUncached()`
- Submission rate-limit route (`src/app/api/v1/submissions/route.ts:251`) — uses `getDbNowUncached()`
- Recruiting invitation routes — use `getDbNowUncached()`

Evidence: Line 208 `const now = Date.now();` is used to compare against `assignment.startsAt`, `assignment.lateDeadline`, and `assignment.deadline` — all DB-stored timestamps. Line 268 uses `Date.now()` directly for exam time expiration check.

**Concrete failure scenario:** Same as SEC-1 and CR-1.

**Fix:** Use `getDbNowUncached()` for the `now` variable.

**Confidence:** Medium
