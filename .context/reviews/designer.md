# UI/UX Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** designer
**Base commit:** 42ca4c9a

## Findings

### DES-1: `problem-submission-form.tsx` compiler run error shows raw API string — poor UX for non-English users [MEDIUM/HIGH]

**File:** `src/components/problem/problem-submission-form.tsx:185`

**Description:** When the compiler run fails, the error toast displays the raw API error string (e.g., "language_not_supported") instead of a localized, human-readable message. This is the same UX issue that was fixed in the discussion module (cycle 9). The submit path already uses `translateSubmissionError()` for proper i18n. The run path should too.

**Fix:** Use `translateSubmissionError()` on the compiler run error path.

**Confidence:** HIGH

---

### DES-2: `chat-widget/admin-config.tsx` "Test Connection" provides misleading feedback when key is unsaved [MEDIUM/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:86-111`

**Description:** The "Test Connection" button tests the API key currently in the form field, not the key saved in the database. If the user changes the key, tests successfully, but forgets to save, they believe the integration works when it actually doesn't. There is no visual indicator that the test result applies to unsaved changes. This is a UX issue that could lead to broken production configurations.

**Fix:** Add a visual indicator (e.g., a warning banner or note) that the test uses the current (unsaved) key. Alternatively, auto-save the key before testing.

**Confidence:** MEDIUM

---

### DES-3: `accepted-solutions.tsx` pagination controls lack `aria-label` for accessibility [LOW/MEDIUM]

**File:** `src/components/problem/accepted-solutions.tsx:188-194`

**Description:** The "Previous" and "Next" pagination buttons use text labels from i18n which is good for screen readers. However, the page indicator "Page X of Y" is plain text without an `aria-live` region, so screen reader users may not be aware of pagination changes after clicking Previous/Next.

**Fix:** Add `aria-live="polite"` to the pagination info span so that screen readers announce page changes.

**Confidence:** LOW

---

## Final Sweep

The contest replay component has good animation UX. The recruiting invitations panel has proper loading, empty, and error states with debounce and abort controller support. The discussion components now have proper i18n after the cycle 9 fixes. The dialog semantics (role="dialog", aria-modal) are properly applied to the submission overview and anti-cheat privacy notice. The main UX concern this cycle is the raw API error display in the compiler run path and the misleading test-connection feedback.
