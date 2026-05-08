# Cycle 16 Remediation Plan

**Date:** 2026-05-08
**Based on:** `.context/reviews/_aggregate.md` (Cycle 16)

---

## Active Tasks

### C16-1: Callback ref non-null assertion in create-problem-form
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:875,916`
- **Severity:** LOW
- **Status:** DONE
- **Description:** Test-case file input callback refs use `el!` non-null assertion. React calls refs with `null` on unmount, silently assigning `null` to the array. Ref arrays also grow indefinitely without cleanup.
- **Fix:**
  1. Changed ref types from `HTMLInputElement[]` to `(HTMLInputElement | null)[]`
  2. Removed `!` assertions in ref callbacks
  3. Added splice cleanup in `removeTestCase`
- **Commit:** `3104e401`

### C16-2: Uncancelled requestAnimationFrame in public-header
- **File:** `src/components/layout/public-header.tsx:138`
- **Severity:** LOW
- **Status:** DONE
- **Description:** `closeMobileMenu` fires an uncancelled RAF for focus restoration. Inconsistent with the RAF cleanup pattern used elsewhere in the same file.
- **Fix:** Stored RAF handle in `closeMenuRafRef`, cancel previous RAF before scheduling new one, added useEffect cleanup on unmount.
- **Commit:** `a1aae071`

---

## Deferred Items

None. Both findings are LOW severity and scheduled for implementation.

---

## Gate Requirements

- [x] eslint passes
- [x] tsc --noEmit passes
- [x] next build passes
- [x] vitest run passes (314 files, 2338 tests)
- [x] vitest run --config vitest.config.component.ts passes (66 files, 179 tests)
