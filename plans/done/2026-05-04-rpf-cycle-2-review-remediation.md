# RPF Cycle 2 — Review Remediation Plan (2026-05-04)

**Aggregate:** `.context/reviews/rpf-cycle-2-aggregate.md`
**HEAD:** `767b1fee`
**Status:** DONE

---

## Actionable findings (2 LOW)

### FIX-1: Add unit test for ConditionalHeader component

- **Finding:** AGG2-3
- **Severity:** LOW
- **File:** `src/components/layout/conditional-header.tsx`
- **Problem:** New ConditionalHeader component has no dedicated test.
- **Fix:** Add component test mocking `usePathname()`.
- **Status:** DONE

### FIX-2: Add expired invitation and deadline test cases

- **Finding:** AGG2-4
- **Severity:** LOW
- **File:** `tests/unit/api/recruiting-validate.route.test.ts`
- **Problem:** Missing expired invitation and deadline test cases.
- **Fix:** Add test cases for expired invitation and expired assignment deadline.
- **Status:** DONE
