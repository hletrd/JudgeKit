# Cycle 3 RPF Review Remediation Plan

**Date:** 2026-05-11
**Based on:** `.context/reviews/_aggregate.md` (8 findings from this cycle's deep review)
**Scope:** Fix auth form race conditions, throw-based flow control, i18n gaps, and deferred doc issues.

---

## Implementation Lane 1: Auth Form Race Conditions

### 1.1 Add AbortController to reset-password form
**Severity:** MEDIUM
**File:** `src/app/(auth)/reset-password/reset-password-form.tsx:41-65`
**Description:** The fetch call has no AbortController. If user navigates away, the fetch continues and may mutate state on unmounted component.
**Fix:** Add AbortController inside handleSubmit, pass signal to fetch, abort on cleanup/unmount.
**Estimated effort:** 10 min
**Status:** pending

### 1.2 Add AbortController to forgot-password form
**Severity:** MEDIUM
**File:** `src/app/(auth)/forgot-password/forgot-password-form.tsx:23-48`
**Description:** Same issue as 1.1. Fetch call has no AbortController.
**Fix:** Add AbortController, abort previous request on re-submit.
**Estimated effort:** 10 min
**Status:** pending

---

## Implementation Lane 2: Error Flow Control

### 2.1 Replace throw-based flow control in form dialogs
**Severity:** MEDIUM
**Files:**
- `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:278`
- `src/app/(public)/problems/create/create-problem-form.tsx:341,445`
- `src/app/(public)/groups/edit-group-dialog.tsx:92`
- `src/app/(public)/groups/create-group-dialog.tsx:72`
- `src/app/(public)/groups/[id]/group-members-manager.tsx:141,202,310`
**Description:** 7 instances of `throw new Error(getApiError(...))` used for expected API error flow control. Conflates programmer errors with user-facing conditions.
**Fix:** Replace each `throw new Error(...)` with explicit error handling (set error state + return) within the existing try/catch.
**Estimated effort:** 30 min
**Status:** pending

---

## Implementation Lane 3: UX Improvements

### 3.1 Add redirect param support to verify-email page
**Severity:** MEDIUM
**File:** `src/app/(auth)/verify-email/page.tsx:13-14,84`
**Description:** Success flow always pushes to `/login` regardless of any `redirect` search param.
**Fix:** Accept optional `redirect` search param and navigate there on success. Fall back to `/login`.
**Estimated effort:** 10 min
**Status:** pending

### 3.2 Fix hardcoded English string in signup form
**Severity:** LOW
**File:** `src/app/(auth)/signup/signup-form.tsx:208`
**Description:** `"Passwords match"` is hardcoded in English.
**Fix:** Replace with `t("passwordsMatch")` and add key to `messages/en.json` and `messages/ko.json`.
**Estimated effort:** 5 min
**Status:** pending

---

## Implementation Lane 4: Documentation & Observability

### 4.1 Narrow db-time.ts docstring scope
**Severity:** LOW
**File:** `src/lib/db-time.ts:45-47`
**Description:** Docstring claims universal `Date.now()` replacement but `execute.ts` uses raw `Date.now()` for container lifecycle.
**Fix:** Narrow docstring to "Use this for DB timestamp comparisons in transactional code".
**Estimated effort:** 2 min
**Status:** pending

### 4.2 Log pre-restore snapshot unlink failures
**Severity:** LOW
**File:** `src/lib/db/pre-restore-snapshot.ts:119`
**Description:** `unlink(fullPath).catch(() => {})` silently swallows file deletion errors.
**Fix:** Log the unlink failure with the existing pino logger.
**Estimated effort:** 5 min
**Status:** pending

---

## Deferred Findings

### Deferred: Verify-email token client-side validation
**Severity:** LOW
**File:** `src/app/(auth)/verify-email/page.tsx:31`
**Reason for deferral:** Server validates the token; client-side check is a UX optimization only. Low impact.
**Exit criterion:** Address when the verify-email page is next touched for other reasons.

---

## Acceptance Criteria

- [ ] `npm run lint` passes with 0 errors, 0 warnings
- [ ] `npm run build` passes
- [ ] `npm run test:unit` passes
- [ ] reset-password form has AbortController
- [ ] forgot-password form has AbortController
- [ ] All 7 throw-based flow control instances replaced
- [ ] verify-email page supports redirect param
- [ ] signup form uses translation key for "Passwords match"
- [ ] db-time.ts docstring narrowed
- [ ] pre-restore-snapshot unlink errors logged

---

## Deploy Status

**DEPLOY:** TBD after implementation
