# Document Specialist Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** document-specialist
**Base commit:** 42ca4c9a

## Findings

### DOC-1: `apiFetch` JSDoc example shows raw error display pattern — contradicts established i18n convention [LOW/MEDIUM]

**File:** `src/lib/api/client.ts:37`

**Description:** The `apiFetch` JSDoc example on line 37 shows: `toast.error((errorBody as { error?: string }).error ?? "Request failed")`. This displays the raw API error string to the user. The established convention in the codebase (after cycle 9 fixes) is to use i18n keys for user-facing error messages and log the raw API error to the console. The JSDoc example should reflect the recommended pattern.

**Fix:** Update the JSDoc example to show the i18n-first pattern: `toast.error(errorLabel)` with a `console.error` for the raw API error.

**Confidence:** HIGH

---

### DOC-2: `translateSubmissionError` function in `problem-submission-form.tsx` not documented — missed by reviewers in prior cycles [LOW/LOW]

**File:** `src/components/problem/problem-submission-form.tsx` (function definition not visible in the read range)

**Description:** The `translateSubmissionError` function is used in the submit path but not documented with JSDoc. Its existence and purpose should be documented so that future developers know to use it for the run path as well. The fact that it was not used on the run path suggests that its purpose was not clear to the developer who added the run feature.

**Fix:** Add JSDoc to `translateSubmissionError` explaining that it should be used for ALL API error display in the component, including both the submit and run paths.

**Confidence:** MEDIUM

---

## Final Sweep

The code documentation is generally good. The `apiFetch` JSDoc is well-maintained but the example now contradicts the established convention. The `useVisibilityPolling` JSDoc is comprehensive. The `normalizePage` function has clear documentation. The main gap is the JSDoc example showing a now-discouraged pattern.
