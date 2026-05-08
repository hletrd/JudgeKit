# Cycle 15 Remediation Plan

**Date:** 2026-05-08
**Based on:** `.context/reviews/_aggregate.md` (Cycle 15)

---

## Active Tasks

### C15-1: Unstable React key in bulk-create-dialog preview table
- **File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:347`
- **Severity:** LOW
- **Status:** DONE
- **Description:** CSV upload preview table uses array index `i` as React key. Should use composite key based on row data.
- **Fix:** Changed `key={i}` to `key={`${row.username}-${row.name}-${i}`}`.
- **Commit:** `bcdfe429`

### C15-2: Index-based state update in file upload dialog
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:89-120`
- **Severity:** LOW
- **Status:** DONE
- **Description:** `handleUpload` updates queue items by index position rather than by stable ID.
- **Fix:** Updated queue items by matching `item.id === itemId` instead of `idx === i`.
- **Commit:** `3c4506cd`

### C15-3: Math.random() for ephemeral queue IDs
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:52`
- **Severity:** LOW
- **Status:** DONE
- **Description:** Upload queue item IDs use `Math.random()`. Should use `nanoid()` for stronger uniqueness.
- **Fix:** Imported `nanoid` and replaced `Math.random()` with `nanoid()` for queue item IDs.
- **Commit:** `3c4506cd`

---

## Deferred Items

None. All findings are LOW severity and scheduled for implementation.

---

## Gate Requirements

- [x] eslint passes
- [x] tsc --noEmit passes
- [x] next build passes
- [x] vitest run passes (314 files, 2338 tests)
- [x] vitest run --config vitest.config.component.ts passes (66 files, 179 tests)
