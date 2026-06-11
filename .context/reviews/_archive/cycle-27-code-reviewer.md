# Cycle 27 Code Reviewer

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### CR-1: `console.error` in 6 discussion components not gated behind dev-only check [MEDIUM/MEDIUM]

**Files:**
- `src/components/discussions/discussion-post-form.tsx:47`
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:53`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:29`
- `src/components/discussions/discussion-post-delete-button.tsx:36`

**Description:** All three discussion components (`discussion-post-form`, `discussion-thread-form`, `discussion-post-delete-button`) use `console.error()` unconditionally in both the `!response.ok` branch and the catch block. The codebase convention (documented in `src/lib/api/client.ts:23`) says "Log errors in development only". The error boundary components were fixed in a prior cycle to gate `console.error` behind `process.env.NODE_ENV === "development"`, but these discussion components were not updated to follow the same pattern.

**Failure scenario:** Production errors in discussion features write unstructured error data (including potentially sensitive API error messages or stack traces) to browser DevTools.

**Fix:** Gate all `console.error` calls in these three files behind `process.env.NODE_ENV === "development"`, matching the pattern used in the error boundary components.

**Confidence:** HIGH

### CR-2: `console.error` in 4 admin/dialog components not gated behind dev-only check [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66`
- `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:43`
- `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:106`
- `src/app/(dashboard)/dashboard/admin/roles/role-delete-dialog.tsx:58`

**Description:** Same pattern as CR-1. These four dialog components use `console.error()` in `getErrorMessage()` default branches or catch blocks without a dev-only guard. The `edit-group-dialog` and `create-group-dialog` use it for "Unmapped error" logging; the role editor and delete dialogs log raw errors.

**Failure scenario:** Production errors in group management or role management write sensitive error details to browser DevTools.

**Fix:** Gate behind `process.env.NODE_ENV === "development"`.

**Confidence:** HIGH

### CR-3: `console.error` in 3 additional components not gated behind dev-only check [LOW/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
- `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:241`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`

**Description:** Same pattern. `create-problem-form` and `problem-set-form` log "Unmapped error" in default branches. `bulk-create-dialog` logs "Bulk create failed" with the raw API error body.

**Fix:** Gate behind `process.env.NODE_ENV === "development"`.

**Confidence:** HIGH

### CR-4: `console.error` in `compiler-client.tsx:292` not gated behind dev-only check [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:292`

**Description:** The compiler run catch block logs `console.error("Compiler run failed:", err)` unconditionally. While the user-visible error display correctly uses `t("networkError")`, the raw error (which may include network details) is logged to the console in production.

**Fix:** Gate behind `process.env.NODE_ENV === "development"`.

**Confidence:** MEDIUM

### CR-5: `admin-config.tsx` double `.json()` anti-pattern [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`

**Description:** The test-connection handler calls `response.json()` at line 99 in the `!response.ok` branch, then calls `response.json()` again at line 103 for the success case. Since the error branch returns early, the second call never runs after the first, so this is not a runtime bug. However, this is the same anti-pattern that was fixed across 3+ files in cycle 26 (AGG-1). The codebase convention in `src/lib/api/client.ts:44-52` documents this as "DO NOT USE".

**Failure scenario:** If someone removes the `return` at line 101, the second `.json()` call would throw `TypeError: Body already consumed`.

**Fix:** Parse response body once before branching, matching the pattern used in `assignment-form-dialog.tsx:273`, `create-group-dialog.tsx:67`, and other files fixed in cycle 26.

**Confidence:** MEDIUM

## Verified Safe

- All prior cycle-27 findings (clock-skew, non-null assertion, toLocaleString) confirmed fixed.
- Error boundary components properly gate `console.error` behind dev-only check.
- `create-problem-form.tsx:228` properly gates `console.warn` behind dev-only check.
- No `as any` type casts in production code.
- No `@ts-ignore` or `@ts-expect-error`.
- Only 2 `eslint-disable` directives, both with justification.
- `dangerouslySetInnerHTML` used only in 2 places, both sanitized.
- Korean letter-spacing properly locale-conditional.
- `assignment-form-dialog.tsx:273` and `create-group-dialog.tsx:67` properly use "parse once, then branch" pattern.
- `problem-set-form.tsx` already uses "parse once, then branch" pattern (lines 129, 158, 180, 214).
