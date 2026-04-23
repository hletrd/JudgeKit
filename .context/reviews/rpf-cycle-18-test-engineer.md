# Test Engineer — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## TE-1: No test for practice page progress filter query logic [LOW/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:410-517`
**Description:** The progress-filter Path B has significant logic: fetching all matching problem IDs, fetching user submissions, filtering by progress status (solved/attempted/unsolved), then paginating. This logic is embedded in the server component and has no unit test coverage. The code even acknowledges a potential performance issue (10k+ problems) that could be a regression risk.
**Concrete failure scenario:** A refactor introduces a bug where "unsolved" filter shows "attempted" problems instead of "attempted + untried", and there is no test to catch this.
**Fix:** Extract the progress-filter logic into a testable function in `src/lib/practice/data.ts` and add unit tests covering: (1) solved filter shows only solved, (2) unsolved shows attempted + untried but not solved, (3) attempted shows only attempted, (4) empty result set, (5) pagination boundaries.

## TE-2: No test for `formatNumber` locale-awareness in submission-status-badge [LOW/LOW]

**File:** `src/components/submission-status-badge.tsx:44-46`
**Description:** `formatNumber` uses `toLocaleString("en-US")`. If this is changed to be locale-aware, there should be a test verifying correct formatting for different locales.
**Fix:** Add a unit test for `formatNumber` that verifies output for "en-US" and "ko-KR" locales.

## TE-3: No test for access-code-manager share URL locale handling [LOW/LOW]

**File:** `src/components/contest/access-code-manager.tsx:126`
**Description:** The share URL is constructed without locale prefix. If this is fixed to include the locale, a test should verify the URL format.
**Fix:** Add a test verifying the share URL includes the locale prefix after the fix is applied.

## Verified Safe

- Recruit page clock-skew fix (using `getDbNow()` instead of `new Date()`) was confirmed in the last aggregate review and is working.
- SSE connection cleanup logic has been stable across multiple cycles.
