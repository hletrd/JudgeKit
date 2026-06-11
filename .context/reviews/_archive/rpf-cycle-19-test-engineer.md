# Test Engineer Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** test-engineer
**Base commit:** 77da885d

## Findings

### TE-1: No unit tests for `formatNumber` utility in `datetime.ts` [LOW/MEDIUM]

**Files:** `src/lib/datetime.ts:62-67`
**Description:** The `formatNumber` utility was added in commit 131dc046 but has no unit tests. Since this is a shared utility used across multiple components (and intended to replace ad-hoc `.toFixed()` calls), it should have test coverage for edge cases: `NaN`, `Infinity`, `0`, negative numbers, large numbers, and different locale inputs.
**Fix:** Add unit tests for `formatNumber` covering edge cases and locale-specific formatting.

### TE-2: No tests for `formatBytes`/`formatFileSize` utility functions [LOW/LOW]

**Files:** `src/app/(dashboard)/dashboard/admin/files/page.tsx:50-54`, `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx:13-18`
**Description:** The byte-formatting functions in admin pages are untested. Once they are consolidated into a shared utility (per ARCH-1), they should have test coverage.
**Fix:** Add tests when consolidating into shared utility.

### TE-3: Practice page Path B (progress filter) has no integration/performance test [LOW/MEDIUM]

**Files:** `src/app/(public)/practice/page.tsx:410-519`
**Description:** The progress filter path in the practice page fetches all matching problem IDs and user submissions into memory. There is no test that validates this path works correctly with a realistic dataset, and no performance test to catch regression if the dataset grows.
**Fix:** Add an integration test that exercises the progress filter with a mocked dataset. Consider a performance benchmark test that fails if query time exceeds a threshold.
