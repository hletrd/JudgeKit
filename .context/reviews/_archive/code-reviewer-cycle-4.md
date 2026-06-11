# Code Review — Cycle 4 (RPF Loop)

**Date:** 2026-05-11
**Reviewer:** code-reviewer (orchestrator direct — Agent tool unavailable)
**Scope:** Files changed since cycle 3: auth forms, group/assignment dialogs, create-problem-form, db-time, pre-restore-snapshot, messages

---

## Summary

6 findings: 1 MEDIUM, 5 LOW. All are logic bugs or consistency issues in recently-modified code. No critical security or data-loss issues.

---

## MEDIUM

### C4-M1: `isDirty` in CreateProblemForm Missing Test Cases and Float Error Fields
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:122-141`
- **Confidence:** High
- **Description:** The `isDirty` flag that drives `useUnsavedChangesGuard` compares title, description, sequenceNumber, timeLimitMs, memoryLimitMb, problemType, visibility, showCompileOutput, showDetailedResults, showRuntimeErrors, allowAiAssistant, comparisonMode, difficulty, defaultLanguage, and currentTags. It does NOT compare `testCases`, `floatAbsoluteError`, `floatRelativeError`, or `testCaseOverrideEnabled`. A user can add/edit/remove test cases, change float tolerances, or toggle the test-case override and then navigate away without any warning — data loss.
- **Failure scenario:** Instructor edits 10 test cases, accidentally clicks Back. The navigation guard (`useUnsavedChangesGuard`) does not intercept because `isDirty` is still `false`. All test-case edits are lost.
- **Fix:** Add comparisons for the missing fields:
  ```tsx
  JSON.stringify(testCases) !== JSON.stringify(initialProblem?.testCases ?? []) ||
  floatAbsoluteError !== (initialProblem?.floatAbsoluteError?.toString() ?? "1e-6") ||
  floatRelativeError !== (initialProblem?.floatRelativeError?.toString() ?? "1e-6") ||
  testCaseOverrideEnabled !== false
  ```
  (The last one only matters when `testCasesLocked` is true; when false, `testCaseOverrideEnabled` starts false and can't change the effective data.)

---

## LOW

### C4-L1: ForgotPasswordForm Leaks `loading` State on Success
- **File:** `src/app/(auth)/forgot-password/forgot-password-form.tsx:55`
- **Confidence:** High
- **Description:** On successful API response, `setSuccess(true)` is called but `setLoading(false)` is never called. The `loading` state remains `true` for the lifetime of the component. While the success branch (lines 63-73) renders different JSX that doesn't show the loading button, this is still a state leak. If the component is reused or the success state is conditional on external props, the stale `loading` state could cause unexpected behavior.
- **Fix:** Add `setLoading(false)` after `setSuccess(true)` on line 55.

### C4-L2: ResetPasswordForm Leaks `loading` State on Success
- **File:** `src/app/(auth)/reset-password/reset-password-form.tsx:73`
- **Confidence:** High
- **Description:** Same pattern as C4-L1: `setSuccess(true)` without `setLoading(false)`.
- **Fix:** Add `setLoading(false)` after `setSuccess(true)` on line 73.

### C4-L3: Bulk Enrollment Hardcodes "student" Role
- **File:** `src/app/api/v1/groups/[id]/members/bulk/route.ts:71-72`
- **Confidence:** Medium
- **Description:** The bulk enrollment route filters valid users with `equals(usersTable.role, "student")`. The single-member route (`members/route.ts:96-98`) uses `getRoleLevel(student.role)` and rejects any role with `level > 0`. If a deployment defines a custom role that is student-like (level 0) but has a different name, the bulk route will reject it while the single-member route would accept it. This inconsistency breaks custom-role deployments.
- **Fix:** Replace the hardcoded `"student"` check with a role-level query: resolve role levels for all matched users and filter to those with `level === 0`.

### C4-L4: `handleTestCaseFileChange` Unnecessarily Declared `async`
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:379`
- **Confidence:** High
- **Description:** The function is declared `async` but contains no `await` expressions (`updateTestCase` is synchronous, `event.target.value = ""` is synchronous). The `async` keyword is misleading and adds unnecessary promise overhead.
- **Fix:** Remove the `async` keyword from the function declaration.

### C4-L5: VerifyEmail Page `useEffect` Missing `redirect` in Dependencies
- **File:** `src/app/(auth)/verify-email/page.tsx:61`
- **Confidence:** Low
- **Description:** The `useEffect` dependency array is `[token, t]`, but `redirect` is read inside the effect (line 85). If the redirect param changes after mount (e.g., via client-side navigation or query-string manipulation), the effect will still use the stale `redirect` value. In practice this is unlikely because the page is typically loaded with a fixed URL.
- **Fix:** Add `redirect` to the dependency array: `[token, t, redirect]`.

---

## Final Sweep

- No remaining `throw new Error(getApiError(...))` patterns found in the codebase.
- All auth forms now use AbortController correctly.
- i18n keys for recently modified auth features are present in both `en.json` and `ko.json`.
- No unused imports or variables in the recently changed files.
