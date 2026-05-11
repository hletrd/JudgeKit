# Cycle 4 RPF Review Remediation Plan

**Date:** 2026-05-11
**Source:** `.context/reviews/_aggregate-cycle-4.md`
**Status:** COMPLETED

---

## Overview

7 findings from cycle 4 review: 1 MEDIUM, 6 LOW. All scheduled for implementation. No deferred items (data-loss, correctness, and security findings are not deferrable per project rules).

---

## Task 1: Fix `isDirty` in CreateProblemForm to include test cases and float fields [M1]
**Priority:** MEDIUM (data-loss risk)
**Confidence:** High
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:122-141`

**What to do:**
Add missing fields to the `isDirty` comparison:
- `testCases` (compare via JSON.stringify)
- `floatAbsoluteError` (string comparison)
- `floatRelativeError` (string comparison)
- `testCaseOverrideEnabled` (boolean comparison, relevant when `testCasesLocked`)

**Verification:**
1. Render form with initial test cases
2. Edit a test case
3. Verify `isDirty` becomes `true`
4. Verify `useUnsavedChangesGuard` warns on navigation

---

## Task 2: Fix forgot-password form loading state leak [L1]
**Priority:** LOW (correctness)
**Confidence:** High
**File:** `src/app/(auth)/forgot-password/forgot-password-form.tsx:55`

**What to do:**
Add `setLoading(false)` after `setSuccess(true)` on line 55.

**Verification:** Unit test or manual: submit form, success message appears, `loading` state is `false`.

---

## Task 3: Fix reset-password form loading state leak [L2]
**Priority:** LOW (correctness)
**Confidence:** High
**File:** `src/app/(auth)/reset-password/reset-password-form.tsx:73`

**What to do:**
Add `setLoading(false)` after `setSuccess(true)` on line 73.

**Verification:** Same as Task 2.

---

## Task 4: Sanitize verify-email API error responses [L4]
**Priority:** LOW (defensive security)
**Confidence:** Medium
**File:** `src/app/api/v1/auth/verify-email/route.ts:20-25`

**What to do:**
Replace the catch-all `return NextResponse.json({ error: result.error }, ...)` with a sanitized default:
```ts
if (!result.success) {
  if (result.error === "invalid_token" || result.error === "expired") {
    return NextResponse.json({ error: "invalidOrExpiredToken" }, { status: 400 });
  }
  return NextResponse.json({ error: "verifyFailed" }, { status: 400 });
}
```

**Verification:** Mock `verifyEmail` to return an unknown error; assert response is `{ error: "verifyFailed" }`.

---

## Task 5: Remove unnecessary `async` from `handleTestCaseFileChange` [L5]
**Priority:** LOW (hygiene)
**Confidence:** High
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:379`

**What to do:**
Remove the `async` keyword from the function declaration.

**Verification:** `tsc --noEmit` passes; no behavioral change.

---

## Task 6: Add `redirect` to verify-email useEffect dependencies [L6]
**Priority:** LOW (hygiene)
**Confidence:** Low
**File:** `src/app/(auth)/verify-email/page.tsx:61`

**What to do:**
Change dependency array from `[token, t]` to `[token, t, redirect]`.

**Verification:** `tsc --noEmit` and eslint pass.

---

## Task 7: Fix bulk enrollment hardcoded "student" role [L3]
**Priority:** LOW (custom-role correctness)
**Confidence:** Medium
**File:** `src/app/api/v1/groups/[id]/members/bulk/route.ts:66-74`

**What to do:**
Replace the hardcoded `equals(usersTable.role, "student")` filter with a role-level check. Query all matched users with their role, resolve role levels, and filter to those with `level === 0` (same logic as single-member route).

**Verification:**
- Create a custom role with level 0
- Create a user with that role
- Bulk enroll via username — user should be accepted
- Bulk enroll a non-student (level > 0) — user should be rejected with appropriate nonStudent response

---

## Progress Tracking

| Task | Status | Commit |
|------|--------|--------|
| Task 1: isDirty test cases | DONE | `50693dc7` |
| Task 2: forgot-password loading | DONE | `c4dcba79` |
| Task 3: reset-password loading | DONE | `5bcdace1` |
| Task 4: verify-email sanitization | DONE | `6b324e8a` |
| Task 5: remove async | RETRACTED | `a0aac716` — finding was false positive; `await selectedFile.text()` requires `async` |
| Task 6: redirect dependency | DONE | `46bdb97e` |
| Task 7: bulk enrollment role | DONE | `c0a5e3cd` |

All quality gates green: eslint (0 errors, 0 warnings), next build (success), vitest (317 files, 2399 tests passed).

**DEPLOY:** per-cycle-success (`oj-internal.maum.ai` responding HTTP 200).
