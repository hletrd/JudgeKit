# Aggregate Review — Cycle 4 (RPF Loop)

**Date:** 2026-05-11
**Reviewers:** code-reviewer, security-reviewer, test-engineer (orchestrator direct — Agent tool unavailable)
**Scope:** Auth surfaces, group/assignment dialogs, create-problem-form, db utilities — follow-up to cycle 3 fixes

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 6     |
| **Total**| **7** |

---

## MEDIUM

### M1: `isDirty` in CreateProblemForm Missing Test Cases and Float Error Fields
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:122-141`
- **Reviewer:** code-reviewer
- **Confidence:** High
- **Description:** The `isDirty` flag that drives `useUnsavedChangesGuard` does not compare `testCases`, `floatAbsoluteError`, `floatRelativeError`, or `testCaseOverrideEnabled`. Users can edit test cases or float tolerances and navigate away without a warning — data loss.
- **Fix:** Add the missing fields to the `isDirty` comparison.

---

## LOW

### L1: ForgotPasswordForm Leaks `loading` State on Success
- **File:** `src/app/(auth)/forgot-password/forgot-password-form.tsx:55`
- **Reviewer:** code-reviewer
- **Confidence:** High
- **Fix:** Add `setLoading(false)` after `setSuccess(true)`.

### L2: ResetPasswordForm Leaks `loading` State on Success
- **File:** `src/app/(auth)/reset-password/reset-password-form.tsx:73`
- **Reviewer:** code-reviewer
- **Confidence:** High
- **Fix:** Add `setLoading(false)` after `setSuccess(true)`.

### L3: Bulk Enrollment Hardcodes "student" Role
- **File:** `src/app/api/v1/groups/[id]/members/bulk/route.ts:71-72`
- **Reviewer:** code-reviewer
- **Confidence:** Medium
- **Description:** Inconsistent with single-member route which uses role levels. Breaks custom-role deployments.
- **Fix:** Replace hardcoded `"student"` with role-level filtering (`level === 0`).

### L4: Verify-Email API Returns Raw Internal Errors
- **File:** `src/app/api/v1/auth/verify-email/route.ts:24`
- **Reviewer:** security-reviewer
- **Confidence:** Medium
- **Description:** Unmapped errors from `verifyEmail` are forwarded directly to the client, potentially leaking internal details.
- **Fix:** Add a default case that returns sanitized `verifyFailed` instead of `result.error`.

### L5: `handleTestCaseFileChange` Unnecessarily `async`
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:379`
- **Reviewer:** code-reviewer
- **Confidence:** High
- **Fix:** Remove `async` keyword.

### L6: VerifyEmail Page `useEffect` Missing `redirect` Dependency
- **File:** `src/app/(auth)/verify-email/page.tsx:61`
- **Reviewer:** code-reviewer
- **Confidence:** Low
- **Fix:** Add `redirect` to dependency array.

---

## Cross-Agent Agreement

- None — findings are from individual reviewer specializations.

---

## Recommended Priority for Fixes

1. **Immediate:** M1 (`isDirty` test case tracking) — real data-loss risk
2. **Immediate:** L1, L2 (loading state leaks) — one-line fixes, correctness
3. **Short-term:** L4 (verify-email error sanitization) — defensive security
4. **Medium-term:** L3 (bulk enrollment role consistency) — custom-role correctness
5. **Trivial:** L5, L6 — hygiene fixes
