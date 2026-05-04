# Cycle 14 -- Remediation Plan (2026-05-03)

**HEAD:** `4cd03c2b`
**Source:** `_aggregate-cycle-14.md`
**Findings:** 0 HIGH, 0 MEDIUM, 1 LOW

---

## Finding C14-1 -- Missing trailing newline in conditional-header.tsx

**File:** `src/components/layout/conditional-header.tsx`
**Severity:** LOW | **Confidence:** High

### Problem

The file ends without a trailing newline. POSIX convention and common linters expect a final newline character. `git diff` will show `\ No newline at end of file` warning.

### Fix

Add a trailing newline after the closing brace `}`.

### Steps

1. Edit `src/components/layout/conditional-header.tsx` to add a trailing newline after the closing brace.
2. Also fix trailing newlines in `src/app/(auth)/recruit/[token]/results/loading.tsx` and `src/app/(public)/loading.tsx` (same issue from prior i18n changes).
3. Verify the change doesn't break existing behavior by running tests.

### Status: [x] Done

---

## Deferred items

All 20 carry-forward deferred items from prior cycles remain deferred with unchanged exit criteria. See `_aggregate-cycle-14.md` for the full list.

---

## Implementation order

1. C14-1 (trailing newline) -- trivial single-character addition

This is a LOW severity style fix that can be committed independently.