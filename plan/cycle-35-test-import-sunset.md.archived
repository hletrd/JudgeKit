# Cycle 35 Plan: Add test for import route Sunset/Deprecation headers

## Source Finding
- TE-2 from cycle 35 test-engineer review
- CR-1, SEC-1, V-1, CRI-1 from other reviewers

## Problem
The deprecated JSON body import path returns `Deprecation: true` and `Sunset` headers, but there is no automated test verifying these headers are present and contain a future date. The past-date bug (fixed in commit 5547624b) would have been caught by such a test.

## Implementation

Add a unit test in `tests/unit/db/import-transfer.test.ts` or create a new test file that verifies the JSON body path response includes:
1. `Deprecation: true` header
2. `Sunset` header with a date in the future

Note: This requires mocking the auth and other dependencies, or using a structural test that inspects the source code.

## Exit Criteria
- Tests verify Deprecation and Sunset headers on the JSON body path
- All gates pass

## Status
- [x] Create test file: `tests/unit/api/import-sunset-headers.route.test.ts`
- [x] Run tests to verify they pass: All 5 tests pass
- [x] Run gates: eslint, tsc --noEmit, vitest run, vitest run --config vitest.config.component.ts, next build all pass
