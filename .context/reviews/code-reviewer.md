# Code Review — Cycle 18/100

**Reviewer:** code-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** 2b3e22c1
**Scope:** Full TypeScript/TSX source review, focusing on RAF cleanup, accessibility, and re-verification of cycles 15-17 fixes

---

## NEW FINDINGS

### C18-CR-1 — Uncancelled RAF in contest-replay layout effect [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/contest/contest-replay.tsx:143`
- **Problem:** The `useIsomorphicLayoutEffect` calls `requestAnimationFrame` without storing or cancelling the handle:
  ```tsx
  requestAnimationFrame(() => {
    row.style.transition = "transform 450ms ease";
    row.style.transform = "";
  });
  ```
  If `selectedSnapshot` changes rapidly (e.g., fast-forward at 8x speed) or the component unmounts during the 450ms transition, RAF callbacks from prior snapshots may run on detached or already-transitioned DOM elements. While style mutations on detached elements are no-ops in modern browsers, this is a dangling-reference pattern inconsistent with the RAF cleanup used elsewhere in the codebase.
- **Fix:** Store RAF handles in a ref array and cancel them in the layout effect cleanup.

### C18-CR-2 — File upload dropzone lacks keyboard accessibility [LOW]
- **Severity:** LOW (accessibility)
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:171-196`
- **Problem:** The drag-and-drop zone is a `<div>` with `onClick` handler but lacks `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers for Enter/Space. The nested `<input type="file" className="hidden">` uses Tailwind `hidden` (`display: none`), which removes it from the accessibility tree. Keyboard-only users cannot activate the file picker.
- **Fix:** Add `role="button"`, `tabIndex={0}`, `aria-label`, and an `onKeyDown` handler that triggers the file input on Enter/Space to the dropzone div.

## Previously Fixed (Verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C17-CR-1 (DropdownMenuShortcut tracking-widest) | FIXED | Commit 7d700bef |
| C17-CR-2 (public-footer SSR/hydration) | FIXED | Commit 99ec0351 |
| C17-CR-3 (node-shutdown beforeExit catch) | FIXED | Commit d75041f3 |
| C17-SEC-1 (json-ld U+2028/U+2029) | FIXED | Commit 6fdf3e3c |
| C17-SEC-2 (locale-switcher Secure flag) | FIXED | Commit 19e7ddc2 |
| C16-CR-1 (create-problem-form refs) | FIXED | Commit 3104e401 |
| C16-CR-2 (public-header RAF cleanup) | FIXED | Commit a1aae071 |
| C15-CR-1 (bulk-create React key) | FIXED | Commit bcdfe429 |
| C15-CR-2/3 (file-upload nanoid IDs) | FIXED | Commit 3c4506cd |

## Carry-forward Deferred Items (NOT re-reported)

- All deferred items from prior aggregates remain deferred with unchanged exit criteria.
