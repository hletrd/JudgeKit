# Cycle 25 Test Engineer Review

**Date:** 2026-04-20
**Base commit:** cbae7efd

## Findings

### TE-1: No test coverage for hardcoded "Solved" string localization [LOW/MEDIUM]

**File:** `src/components/problem/public-problem-set-detail.tsx:81`
**Description:** The "Solved" badge uses a hardcoded English string. There is no test verifying that this string is localized. Adding a prop-based approach (as recommended) would make it testable.
**Fix:** When fixing the hardcoded string, add a test that verifies the component renders the `solvedLabel` prop.

### TE-2: Korean letter-spacing regression test gap [LOW/LOW]

**Description:** There is no automated test that catches hardcoded `tracking-tight` on Korean-reachable text. The previous cycle's fix was verified manually. A lint rule or test that checks for non-conditional tracking utilities on i18n-rendered text would prevent regression.
**Fix:** Consider adding a custom ESLint rule that flags `tracking-*` classes on elements containing `t(...)` or i18n-bound text, unless locale-conditional logic is present.
