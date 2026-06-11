# Cycle 27 Aggregate Review

**Date:** 2026-04-22
**Base commit:** 14025d58
**Review artifacts:** code-reviewer.md, perf-reviewer.md, security-reviewer.md, architect.md, critic.md, verifier.md, debugger.md, test-engineer.md, tracer.md, designer.md

## Previously Fixed Items (Verified in Current Code)

All prior cycle-27 findings have been addressed:
- Clock-skew on recruit page: FIXED -- uses `getDbNow()` 
- `toLocaleString()` locale issue: FIXED -- uses `formatDateTimeInTimeZone()`
- SSE `user!` non-null assertion: FIXED
- Error boundary `console.error` gating: FIXED (4 files)
- `create-problem-form.tsx` `console.warn` gating: FIXED
- `not-found.tsx` tracking documentation comment: FIXED
- Double `.json()` anti-pattern in 3 files: FIXED (assignment-form-dialog, create-group-dialog, create-problem-form)
- `contest-quick-stats.tsx` redundant `!` assertions: FIXED
- `handleResetAccountPassword` missing `fetchAll()`: FIXED
- Compiler-client inline error display uses i18n key: FIXED

## Deduped Findings (sorted by severity then signal)

### AGG-1: Ungated `console.error` in 14 client-side components -- convention violation and information leak [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1, CR-2, CR-3, CR-4), security-reviewer (SEC-1), critic (CRI-1), architect (ARCH-1), debugger (DBG-1), verifier (V-1, V-3), tracer (TR-1), test-engineer (TE-1)
**Signal strength:** 10 of 10 review perspectives

**Files:**
- `src/components/discussions/discussion-post-form.tsx:47,54`
- `src/components/discussions/discussion-thread-form.tsx:53,61`
- `src/components/discussions/discussion-post-delete-button.tsx:29,36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:77,83,98,105`
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66`
- `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:43`
- `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:106`
- `src/app/(dashboard)/dashboard/admin/roles/role-delete-dialog.tsx:58`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
- `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:241`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`
- `src/components/code/compiler-client.tsx:292`
- `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:78`

**Description:** 14 client-side `console.error()` calls across discussion, admin, dialog, compiler, and comment components write unstructured error data to browser DevTools in production. The codebase convention (documented in `src/lib/api/client.ts:23`) says "Log errors in development only". The error boundary components were fixed in a prior cycle to gate `console.error` behind `process.env.NODE_ENV === "development"`, but these API-consuming components were not updated.

**Concrete failure scenario:** A failed API call returns `{ "error": "Internal: column 'foo' not found at query.ts:42" }`. The `console.error` writes this to the browser console, exposing the SQL column name and file path to any user who opens DevTools. The error boundary gate does not protect against this because the `console.error` fires in the API-consuming component before any error boundary is triggered.

**Fix:** Gate all 14 `console.error` calls behind `process.env.NODE_ENV === "development"`, matching the pattern already used in the 4 error boundary components.

---

### AGG-2: `admin-config.tsx` double `.json()` anti-pattern -- incomplete cycle 26 migration [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-5), security-reviewer (SEC-3), architect (ARCH-2), critic (CRI-2), debugger (DBG-2), verifier (V-2), tracer (TR-2)
**Signal strength:** 7 of 10 review perspectives

**File:** `src/lib/plugins/chat-widget/admin-config.tsx:99+103`

**Description:** The test-connection handler calls `response.json()` at line 99 in the `!response.ok` branch, then calls `response.json()` again at line 103 for the success case. Since the error branch returns early, the second call never runs after the first. However, this is the same anti-pattern fixed across 3+ files in cycle 26 (AGG-1). The codebase convention in `src/lib/api/client.ts:44-52` documents this as "DO NOT USE".

**Concrete failure scenario:** If someone removes the `return` at line 101, the second `.json()` call would throw `TypeError: Body already consumed`. The `.catch()` on the second call swallows the TypeError, producing confusing behavior (admin sees "parseError" instead of the actual error).

**Fix:** Parse response body once before branching, matching the pattern used in `assignment-form-dialog.tsx:273`, `create-group-dialog.tsx:67`, and other files fixed in cycle 26.

---

### AGG-3: `bulk-create-dialog.tsx:194` interpolates raw `err.message` into user-visible string [LOW/LOW]

**Flagged by:** security-reviewer (SEC-2), critic (CRI-3)
**Signal strength:** 2 of 10 review perspectives

**File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:194`

**Description:** `setParseError(t("bulkCsvParseError", { message: err.message }))` interpolates the raw `err.message` from papaparse into a translated string shown to the user. While papaparse errors are typically benign, this pattern contradicts the codebase's convention of never showing raw error details to users.

**Concrete failure scenario:** A papaparse internal error containing file path details is shown to the user.

**Fix:** Replace `err.message` with a sanitized version or generic fallback.

---

## Carried/Deferred Findings from Prior Cycles

### PERF-1: `contest-replay.tsx` `setInterval` vs recursive `setTimeout` [LOW/LOW]
Carried from cycle 26 AGG-5. Deferred.

### PERF-2: `active-timed-assignment-sidebar-panel.tsx` interval re-entry [LOW/LOW]
Carried from cycle 26 AGG-6. Deferred.

### ARCH-2: Inconsistent `createApiHandler` across route handlers [LOW/MEDIUM]
Carried from DEFER-17. Deferred.

### DEFER-15: `window.confirm()` replacement in `use-unsaved-changes-guard.ts` [MEDIUM/MEDIUM]
Carried from cycle 25.

### All other deferred items from prior cycles remain in effect.

## Test Coverage Gaps

### TE-1: No test for dev-only `console.error` gating convention [LOW/MEDIUM]
### TE-2: No test for `admin-config.tsx` double `.json()` regression [LOW/LOW]

## Agent Failures

None. All 10 review perspectives completed successfully.
