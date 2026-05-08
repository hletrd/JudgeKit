# Cycle 16 Remediation Plan

**Date:** 2026-05-08
**Based on:** `.context/reviews/_aggregate.md` (Cycle 16)

---

## Active Tasks

### C16-1: Callback ref non-null assertion in create-problem-form
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:875,916`
- **Severity:** LOW
- **Status:** OPEN
- **Description:** Test-case file input callback refs use `el!` non-null assertion. React calls refs with `null` on unmount, silently assigning `null` to the array. Ref arrays also grow indefinitely without cleanup.
- **Fix:**
  1. Change ref types from `HTMLInputElement[]` to `(HTMLInputElement | null)[]`
  2. Remove `!` assertions in ref callbacks
  3. Clean up ref entries in `removeTestCase` with `splice(index, 1)`

### C16-2: Uncancelled requestAnimationFrame in public-header
- **File:** `src/components/layout/public-header.tsx:138`
- **Severity:** LOW
- **Status:** OPEN
- **Description:** `closeMobileMenu` fires an uncancelled RAF for focus restoration. Inconsistent with the RAF cleanup pattern used elsewhere in the same file.
- **Fix:** Store RAF handle in a ref, cancel it in a useEffect cleanup, matching the pattern at lines 79-85.

---

## Deferred Items

None. Both findings are LOW severity and scheduled for implementation.

---

## Gate Requirements

- [ ] eslint passes
- [ ] tsc --noEmit passes
- [ ] next build passes
- [ ] vitest run passes
- [ ] vitest run --config vitest.config.component.ts passes
