# Cycle 18 Remediation Plan

**Date:** 2026-05-08
**Based on:** `.context/reviews/_aggregate.md` (Cycle 18)
**HEAD:** 96271bd8

---

## Active Tasks

### C18-1: Cancel RAF in contest-replay layout effect
- **File:** `src/components/contest/contest-replay.tsx:143`
- **Severity:** LOW
- **Status:** DONE
- **Commit:** `efe69281`
- **Description:** The `useIsomorphicLayoutEffect` calls `requestAnimationFrame` without storing or cancelling the handle. RAF callbacks from prior snapshots may run on detached or already-transitioned DOM elements if the component unmounts or `selectedSnapshot` changes rapidly.
- **Fix:** Store RAF handles in a local array and cancel them in the layout effect cleanup.

### C18-2: Add keyboard accessibility to file upload dropzone
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:171-196`
- **Severity:** LOW (accessibility)
- **Status:** DONE
- **Commit:** `59e07a8e`
- **Description:** The drag-and-drop zone is a `<div>` with `onClick` but lacks `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers for Enter/Space. The hidden `<input type="file">` uses Tailwind `hidden` (`display: none`), removing it from the accessibility tree.
- **Fix:** Add `role="button"`, `tabIndex={0}`, `aria-label`, and an `onKeyDown` handler that triggers the file input on Enter/Space to the dropzone div.

---

## Deferred Items

None. Both findings are LOW severity and straightforward to fix. No security/correctness/data-loss findings to defer.

---

## Gate Requirements

- [x] eslint passes
- [x] tsc --noEmit passes
- [x] next build passes
- [x] vitest run passes (314 files, 2338 tests)
- [x] vitest run --config vitest.config.component.ts passes (66 files, 179 tests)
