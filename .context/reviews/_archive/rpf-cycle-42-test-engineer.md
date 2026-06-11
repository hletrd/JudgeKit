# RPF Cycle 42 — Test Engineer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Test coverage gaps, flaky tests, TDD opportunities

## Findings

### TE-1: No test for `problemPoints`/`problemIds` length mismatch in quick-create [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts`

**Description:** There is no test case for when `problemPoints` has fewer or more elements than `problemIds`. This is an untested edge case that could lead to silent scoring errors. A test should verify that the endpoint either:
- Rejects the request with a validation error, or
- Correctly maps points to problems (with explicit documentation of the default behavior)

Currently, the behavior is undocumented and untested.

**Fix:** Add test cases:
1. `problemPoints` shorter than `problemIds` — should fail validation
2. `problemPoints` longer than `problemIds` — should fail validation
3. `problemPoints` matching `problemIds` — should assign correct points

**Confidence:** Medium

---

### TE-2: No test for access-code route capability enforcement [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`

**Description:** Since the access-code routes don't use capability-based auth at the `createApiHandler` level, there's no test verifying that a non-admin user without contest management permissions is rejected. The inner `canManageContest()` check is the only guard. A regression test would ensure this remains enforced.

**Fix:** Add integration test verifying that a student cannot manage access codes.

**Confidence:** Low

---

## Sweep: Files Reviewed

- Test files in `__tests__/` and `*.test.ts` / `*.spec.ts` patterns
- API route files for untested edge cases
