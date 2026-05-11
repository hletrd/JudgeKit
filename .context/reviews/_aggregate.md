# Aggregate Review — Cycle 3 (RPF Loop)

**Date:** 2026-05-11
**Reviewers:** code-reviewer, security-reviewer (orchestrator direct — Agent tool unavailable)
**Scope:** Auth surfaces, error handling, i18n — follow-up to cycle 2 deferred items

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| MEDIUM   | 4     |
| LOW      | 4     |
| **Total**| **8** |

---

## MEDIUM

### M1: Reset-Password Form Missing AbortController — Race Condition on Navigation
- **File:** `src/app/(auth)/reset-password/reset-password-form.tsx:41-65`
- **Reviewer:** code-reviewer, security-reviewer
- **Confidence:** High
- **Description:** The `fetch("/api/v1/auth/reset-password")` call has no AbortController. If the user navigates away while the request is in flight, the fetch continues in the background. When it eventually resolves, `setSuccess` / `setError` mutate state on an unmounted component or overwrite newer state if the component remounts. Same pattern as cycle 2 verify-email finding TR1.
- **Fix:** Add an AbortController inside `handleSubmit`, pass its signal to fetch, and abort on cleanup/unmount.

### M2: Forgot-Password Form Missing AbortController — Race Condition on Re-submit
- **File:** `src/app/(auth)/forgot-password/forgot-password-form.tsx:23-48`
- **Reviewer:** code-reviewer, security-reviewer
- **Confidence:** High
- **Description:** Same issue as M1. The fetch call has no AbortController. If the user clicks submit multiple times or navigates away, multiple requests race and state may be mutated after unmount.
- **Fix:** Add AbortController, abort previous request on re-submit.

### M3: Widespread `throw new Error(getApiError(...))` Pattern for Flow Control
- **Files:** 
  - `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:278`
  - `src/app/(public)/problems/create/create-problem-form.tsx:341,445`
  - `src/app/(public)/groups/edit-group-dialog.tsx:92`
  - `src/app/(public)/groups/create-group-dialog.tsx:72`
  - `src/app/(public)/groups/[id]/group-members-manager.tsx:141,202,310`
- **Reviewer:** code-reviewer
- **Confidence:** High
- **Description:** Multiple form dialogs throw `new Error()` with a translation key when the API returns an error response. This conflates programmer errors with expected user-facing conditions. If an error boundary or global error reporter (Sentry) is added later, routine form validation errors will be reported as uncaught exceptions.
- **Fix:** Replace `throw new Error(getApiError(...) || "key")` with explicit error handling: set error state and return. The surrounding try/catch already catches these, so the fix is straightforward.

### M4: Verify-Email Page Does Not Preserve Redirect Param After Success
- **File:** `src/app/(auth)/verify-email/page.tsx:13-14,84`
- **Reviewer:** code-reviewer
- **Confidence:** Medium
- **Description:** The component extracts only `token` from search params. If the URL contains additional params (e.g., `?token=abc&redirect=/dashboard`), the redirect target is lost. The success flow always pushes to `/login` regardless of where the user should go next. Deferred from cycle 2 (CR2/L5).
- **Fix:** Accept an optional `redirect` search param and navigate there on success. Fall back to `/login` only when no redirect is provided.

---

## LOW

### L1: Signup Form Contains Hardcoded English String
- **File:** `src/app/(auth)/signup/signup-form.tsx:208`
- **Reviewer:** code-reviewer
- **Confidence:** High
- **Description:** The text `"Passwords match"` is hardcoded in English, bypassing the translation system. All other UI strings in the file use `t()`. This was likely missed during the hardcoded-string cleanup in cycle 1.
- **Fix:** Replace with `t("passwordsMatch")` and add the key to translation files.

### L2: Pre-Restore Snapshot Silently Swallows Unlink Errors
- **File:** `src/lib/db/pre-restore-snapshot.ts:119`
- **Reviewer:** code-reviewer
- **Confidence:** Medium
- **Description:** `await unlink(fullPath).catch(() => {})` silently swallows file deletion errors in a cleanup path. Failure to delete a partial snapshot could leave a truncated file that a later restore might mistake for a valid rollback artifact.
- **Fix:** Log the unlink failure with the existing logger.

### L3: db-time.ts Docstring Claims Universal `Date.now()` Replacement
- **File:** `src/lib/db-time.ts:45-47`
- **Reviewer:** code-reviewer
- **Confidence:** Medium
- **Description:** The docstring claims to replace all server-side `Date.now()` calls, but `src/lib/compiler/execute.ts:874` uses raw `Date.now()` for container age calculation. The docstring creates a false expectation. Deferred from cycle 2.
- **Fix:** Narrow the docstring scope to clarify it's for DB timestamp comparisons only.

### L4: Verify-Email Token Not Validated Client-Side Before Fetch
- **File:** `src/app/(auth)/verify-email/page.tsx:31`
- **Reviewer:** security-reviewer
- **Confidence:** Low
- **Description:** The verify token is sent to the server via POST without client-side format validation. While the server validates it, a minimal client-side check could prevent unnecessary network requests. Deferred from cycle 2.
- **Fix:** Add a minimal length/format check before calling the API.

---

## Cross-Agent Agreement

- **Auth forms missing AbortController:** code-reviewer and security-reviewer both flagged reset-password and forgot-password forms.
- **throw-based flow control:** code-reviewer identified 7 instances across 5 files — this is a systemic pattern that should be addressed.

---

## Recommended Priority for Fixes

1. **Immediate:** M1, M2 (AbortController for auth forms) — real race conditions
2. **Immediate:** M3 (throw for flow control) — code quality, Sentry noise bomb
3. **Short-term:** M4 (redirect param) — UX improvement
4. **Medium-term:** L1-L4 — defensive improvements
