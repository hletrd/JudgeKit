# Test Engineer Review — Cycle 4/100

**Date:** 2026-05-08
**Scope:** Test coverage gaps, flaky test risks, and missing test scenarios
**Approach:** Analysis of existing test files against code findings

---

## Findings

### T1 — No test for breadcrumb i18n key completeness
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/layout/breadcrumb.tsx`
- **Problem:** The `SEGMENT_LABEL_MAP` maps URL segments to i18n keys, but there is no automated test verifying that all mapped keys exist in the message files. The `discussions` key was missing but no test caught it.
- **Fix:** Add a unit test that loads `messages/en.json` and `messages/ko.json`, iterates over `SEGMENT_LABEL_MAP` values, and asserts each key exists in the `nav` namespace.

### T2 — No test for SubmissionListAutoRefresh timer cleanup
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/submission-list-auto-refresh.tsx`
- **Problem:** The timer leak on unmount (found by code-reviewer and perf-reviewer) would have been caught by a test that mounts the component, triggers a refresh cycle, unmounts, and verifies no further timers are scheduled.
- **Fix:** Add a component test that mocks `apiFetch` and `router.refresh`, then verifies timer cleanup on unmount.

### T3 — No contract test for hash-tabs hydration safety
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/hash-tabs.tsx`
- **Problem:** The hash-tabs component reads `window.location.hash` in useEffect to avoid SSR mismatch. No test verifies this behavior or the rAF cleanup.
- **Fix:** Add a source-grep contract test verifying the `requestAnimationFrame` + `cancelAnimationFrame` pattern.

---

## No Other Test Gaps Found

Existing test suite covers API handlers, auth middleware, and core utilities well. The cycle 3 fixes (audit logs scope, date filtering, ctid batch delete) were accompanied by appropriate test updates.
