# RPF Cycle 16 — Test Engineer

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Reviewed test coverage, flaky tests, and TDD opportunities for:
- Recent cycle 15 changes (audit truncation, rate limiter eviction, auth config guard, token column drop)
- Export sanitization logic
- Recruiting token flow
- Judge worker auth

## Findings

### T-1: [MEDIUM] No Test for Export Sanitization Column Validity
**Confidence:** High
**Citations:** `src/lib/db/export.ts:245-253`

`SANITIZED_COLUMNS` references columns that no longer exist in the schema (`recruitingInvitations.token`, `contestAccessTokens.token`). There is no test that validates the sanitization column names against actual schema columns. This is how the stale references from CR-1 and CR-2 went undetected.

**Fix:** Add a test that imports the schema and `SANITIZED_COLUMNS`, then asserts that every column name listed in `SANITIZED_COLUMNS` actually exists in the corresponding schema table. This prevents future migration misses.

---

### T-2: [LOW] Audit Event `truncateObject` Has Edge-Case Test Coverage but Missing Boundary Tests
**Confidence:** Medium
**Citations:** `tests/unit/audit/serialize-details.test.ts`

The `truncateObject` function was added in cycle 15 with 7 unit tests. These cover the happy path and basic edge cases. Missing boundary conditions:
- Nested objects that individually fit but together exceed the budget
- Empty arrays/objects within nested structures
- Non-ASCII string values (multi-byte UTF-8)
- `undefined` values within arrays

The existing tests are adequate for the current usage (audit event details), but the boundary cases could produce invalid JSON in edge scenarios.

**Fix:** Add boundary case tests for the scenarios above.

---

## Positive Test Observations

- 2130 tests across 298 files, all passing.
- The `serializeDetails` tests added in cycle 15 are thorough for the main cases.
- In-memory rate limiter eviction has unit tests.
- Auth config build-phase guard has unit tests.
