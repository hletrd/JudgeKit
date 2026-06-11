# Code Quality and Logic Review: JudgeKit — Cycle 3 (2026-05-11)

**Reviewer:** code-reviewer (orchestrator direct — Agent tool unavailable)
**Date:** 2026-05-11
**Scope:** Auth surfaces, error handling, i18n — follow-up to cycle 2 deferred items

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 4     |
| LOW      | 3     |
| **Total**| **7** |

---

## MEDIUM

### C1: Reset-Password Form Missing AbortController — Race Condition on Navigation
- **File:** `src/app/(auth)/reset-password/reset-password-form.tsx:41-65`
- **Confidence:** High
- **Description:** The `fetch("/api/v1/auth/reset-password")` call has no AbortController. If the user navigates away while the request is in flight, the fetch continues in the background. When it eventually resolves, `setSuccess` / `setError` mutate state on an unmounted component or overwrite newer state if the component remounts. Same pattern as cycle 2 verify-email finding TR1.
- **Fix:** Add an AbortController inside `handleSubmit`, pass its signal to fetch, and abort on cleanup/unmount.

### C2: Forgot-Password Form Missing AbortController — Race Condition on Re-submit
- **File:** `src/app/(auth)/forgot-password/forgot-password-form.tsx:23-48`
- **Confidence:** High
- **Description:** Same issue as C1. The fetch call has no AbortController. If the user clicks submit multiple times or navigates away, multiple requests race and state may be mutated after unmount.
- **Fix:** Add AbortController, abort previous request on re-submit.

### C3: Widespread `throw new Error(getApiError(...))` Pattern for Flow Control
- **Files:** 
  - `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:278`
  - `src/app/(public)/problems/create/create-problem-form.tsx:341,445`
  - `src/app/(public)/groups/edit-group-dialog.tsx:92`
  - `src/app/(public)/groups/create-group-dialog.tsx:72`
  - `src/app/(public)/groups/[id]/group-members-manager.tsx:141,202,310`
- **Confidence:** High
- **Description:** Multiple form dialogs throw `new Error()` with a translation key when the API returns an error response. This conflates programmer errors with expected user-facing conditions. If an error boundary or global error reporter (Sentry) is added later, routine form validation errors will be reported as uncaught exceptions.
- **Fix:** Return an error result object instead of throwing. Use explicit error propagation. The surrounding try/catch in each file already catches these, so the fix is to replace `throw new Error(...)` with `setError(...); return;` pattern.

### C4: Verify-Email Page Does Not Preserve Redirect Param After Success
- **File:** `src/app/(auth)/verify-email/page.tsx:13-14,84`
- **Confidence:** Medium
- **Description:** The component extracts only `token` from search params. If the URL contains additional params (e.g., `?token=abc&redirect=/dashboard`), the redirect target is lost. The success flow always pushes to `/login` regardless of where the user should go next. Deferred from cycle 2 (CR2/L5).
- **Fix:** Accept an optional `redirect` search param and navigate there on success. Fall back to `/login` only when no redirect is provided.

---

## LOW

### C5: Signup Form Contains Hardcoded English String
- **File:** `src/app/(auth)/signup/signup-form.tsx:208`
- **Confidence:** High
- **Description:** The text `"Passwords match"` is hardcoded in English, bypassing the translation system. All other UI strings in the file use `t()`. This was likely missed during the hardcoded-string cleanup in cycle 1.
- **Fix:** Replace with `t("passwordsMatch")` and add the key to translation files.

### C6: Pre-Restore Snapshot Silently Swallows Unlink Errors
- **File:** `src/lib/db/pre-restore-snapshot.ts:119`
- **Confidence:** Medium
- **Description:** `await unlink(fullPath).catch(() => {})` silently swallows file deletion errors in a cleanup path. Failure to delete a partial snapshot could leave a truncated file that a later restore might mistake for a valid rollback artifact.
- **Fix:** Log the unlink failure with the existing logger.

### C7: db-time.ts Docstring Claims Universal `Date.now()` Replacement
- **File:** `src/lib/db-time.ts:45-47`
- **Confidence:** Medium
- **Description:** The docstring claims to replace all server-side `Date.now()` calls, but `src/lib/compiler/execute.ts:874` uses raw `Date.now()` for container age calculation. The docstring creates a false expectation. Deferred from cycle 2.
- **Fix:** Narrow the docstring scope to clarify it's for DB timestamp comparisons only.

---

## Cross-File Observations

- The auth surfaces (verify-email, reset-password, forgot-password) share common patterns. Verify-email was hardened in cycle 2; reset-password and forgot-password were not.
- The `throw new Error()` anti-pattern for flow control is widespread across 5 files with 7 instances. All are caught by surrounding try/catch, making them latent Sentry noise bombs.
