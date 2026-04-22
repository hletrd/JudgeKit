# Architectural Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** architect
**Base commit:** 42ca4c9a

## Findings

### ARCH-1: `problem-submission-form.tsx` has inconsistent error handling between "Run" and "Submit" paths — same component, different patterns [MEDIUM/HIGH]

**File:** `src/components/problem/problem-submission-form.tsx:183-191` vs `246-257`

**Description:** The compiler run error path (handleRun, line 185) displays raw API error strings to the user, while the submission error path (handleSubmit, line 248) uses `translateSubmissionError()` to map API errors to i18n keys. Within the same component, two similar API calls follow different error handling architectures. This violates the principle of consistent error handling within a single component. The `translateSubmissionError` function is already available in the component — it should be used for both paths.

**Fix:** Replace `(errorBody as { error?: string }).error ?? tCommon("error")` on line 185 with `translateSubmissionError((errorBody as { error?: string }).error)`.

**Confidence:** HIGH

---

### ARCH-2: `group-members-manager.tsx:225` dead `await response.json().catch(() => ({}))` call on remove success path — leftover from partial fix [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:225`

**Description:** After a successful DELETE, line 221-223 properly checks `response.ok` and throws on error (success-first pattern, fixed in a prior cycle). However, line 225 still has `await response.json().catch(() => ({}))` which is dead code — the response body is not used after a member removal. This was partially addressed in AGG-11 but the dead `.json()` call was not removed.

**Fix:** Remove line 225.

**Confidence:** HIGH

---

### ARCH-3: No centralized error-to-i18n mapping utility — each component implements its own pattern [MEDIUM/LOW]

**Files:** Multiple components across the codebase

**Description:** The codebase has at least four distinct patterns for mapping API errors to user-facing i18n strings:
1. `translateSubmissionError()` in problem-submission-form.tsx (custom mapping function)
2. `getErrorMessage()` in edit-group-dialog.tsx (switch-case mapping)
3. Direct `throw new Error(errorLabel)` pattern in discussion components (props-based i18n)
4. Raw API error display in some components

This architectural inconsistency makes it harder to maintain and update error messages across the application. A centralized error code mapping utility would provide a single source of truth.

**Fix:** Consider extracting a shared `mapApiError(errorCode: string, fallbackKey: string): string` utility that components can use consistently. This is a refactor suggestion, not a bug.

**Confidence:** LOW

---

## Final Sweep

The cycle 9 fixes are properly implemented. The discussion components now use i18n keys consistently. The `normalizePage` function has proper bounds. The `DestructiveActionDialog` and `AlertDialog` patterns are consistently applied. The auth layer, CSRF protection, and permission system remain well-layered. The proxy middleware properly handles locale resolution, CSP headers, and auth state. The main architectural concern this cycle is the inconsistent error handling within `problem-submission-form.tsx` — a single component should not have two different error handling patterns.
