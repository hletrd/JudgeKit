# Debugger Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** 42ca4c9a

## Findings

### DBG-1: `problem-submission-form.tsx:185` raw API error on compiler run — same class as cycle 9 AGG-4 (discussion raw errors) [MEDIUM/HIGH]

**File:** `src/components/problem/problem-submission-form.tsx:185`

**Description:** On the compiler run error path, line 185 displays the raw API error string to the user: `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))`. If the API returns an internal error message like `"docker_container_start_failed"`, the user sees the raw string. The submit path on line 248 correctly uses `translateSubmissionError()` to map known error codes to i18n keys. The `translateSubmissionError` function is already available in this component but not used on the run path.

**Concrete failure scenario:** A user runs their code. The API returns `{ error: "language_not_supported" }`. The user sees the literal string "language_not_supported" in a toast. If they submit the same code instead, they see a properly localized error message.

**Fix:** Replace `(errorBody as { error?: string }).error ?? tCommon("error")` with `translateSubmissionError((errorBody as { error?: string }).error)` on line 185.

**Confidence:** HIGH

---

### DBG-2: `group-members-manager.tsx:225` dead `response.json()` call can mask real bugs — maintenance hazard [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:225`

**Description:** After a successful DELETE, line 225 calls `await response.json().catch(() => ({}))` and discards the result. This is the same dead-code anti-pattern that was cleaned up in discussion components (cycle 9 AGG-1). While it doesn't cause a user-visible bug, it could mask a future bug: if a developer adds logic that depends on the response body after this line, they might assume the `.json()` call populated a variable. The `.catch(() => ({}))` also silently swallows any parse errors.

**Fix:** Remove line 225.

**Confidence:** HIGH

---

### DBG-3: `chat-widget/admin-config.tsx:97` sends API key in request body to test-connection — if stored key differs, test is misleading [MEDIUM/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:97`

**Description:** The test-connection feature sends the current (potentially unsaved) API key from the form to the test-connection endpoint. This means the test verifies the key the user just typed, NOT the key that is actually stored in the database. If the user modifies the key, clicks "Test Connection" (which succeeds with the new key), but then doesn't save, the stored key remains the old one. The user thinks the connection works, but the saved configuration is broken.

**Concrete failure scenario:** An admin updates their OpenAI API key in the form. They click "Test Connection" which succeeds. They navigate away without clicking "Save". The stored key is still the old (expired) one. The chat widget fails in production.

**Fix:** Add a visual indicator that the test-connection result is for the unsaved key, or require saving before testing. Alternatively, the endpoint should test with the stored key.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 9 and 10 fixes are properly implemented and verified. The discussion components now properly use i18n keys for error messages. The pagination upper bound prevents DoS. The dialog semantics are in place. The anti-cheat monitoring works correctly. The main new finding this cycle is the raw API error display in the compiler run path of `problem-submission-form.tsx` — the same class of bug that was fixed in discussion components but missed here. The chat-widget test-connection UX issue could mislead admins about their configuration state.
