# Cycle 15 Remediation Plan

**Date:** 2026-05-08
**Based on:** `.context/reviews/_aggregate.md` (Cycle 15)

---

## Active Tasks

### C15-1: Unstable React key in bulk-create-dialog preview table
- **File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:347`
- **Severity:** LOW
- **Status:** TODO
- **Description:** CSV upload preview table uses array index `i` as React key. Should use composite key based on row data.
- **Fix:** Change `key={i}` to `key={`${row.username}-${row.name}-${i}`}`.

### C15-2: Index-based state update in file upload dialog
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:89-120`
- **Severity:** LOW
- **Status:** TODO
- **Description:** `handleUpload` updates queue items by index position rather than by stable ID.
- **Fix:** Update queue items by matching `item.id === queue[i].id` instead of `idx === i`.

### C15-3: Math.random() for ephemeral queue IDs
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:52`
- **Severity:** LOW
- **Status:** TODO
- **Description:** Upload queue item IDs use `Math.random()`. Should use `nanoid()` for stronger uniqueness.
- **Fix:** Import `nanoid` and use it for queue item IDs.

---

## Deferred Items

None. All findings are LOW severity and scheduled for implementation.

---

## Gate Requirements

- [ ] eslint passes
- [ ] tsc --noEmit passes
- [ ] next build passes
- [ ] vitest run passes
- [ ] vitest run --config vitest.config.component.ts passes
