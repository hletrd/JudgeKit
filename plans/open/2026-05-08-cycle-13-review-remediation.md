# Cycle 13 Review Remediation Plan

**Created:** 2026-05-08
**Review Head:** b3c16d3a
**Findings Source:** .context/reviews/_aggregate.md (cycle 13)

---

## Planned Fixes (to implement this cycle)

### C13-1: Add AbortController cleanup to fetch calls in 4 components [LOW]

**Files to modify:**
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`
- `src/components/lecture/submission-overview.tsx`
- `src/components/problem/accepted-solutions.tsx`
- `src/components/submissions/submission-detail-client.tsx`

**Description:** These components initiate `fetch` requests inside `useEffect` but do not attach an `AbortController.signal`. If the component unmounts while the request is in flight, the promise resolves and calls `setState` on an unmounted component. React logs a development warning.

**Fix pattern:**
```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(...);
  return () => controller.abort();
}, [...]);
```

**For accepted-solutions.tsx:** Also abort the previous fetch before starting a new one when sort/language/page changes.

**Status:** DONE

**Completed:** 2026-05-08
- Added `imageStatusAbortControllerRef` to language-config-table.tsx
- Added `fetchAbortControllerRef` to submission-overview.tsx with proper cleanup
- Added `abortControllerRef` to accepted-solutions.tsx with previous-request abort logic
- Added AbortController to submission-detail-client.tsx queue polling with proper cleanup

### C13-2: Add CountdownTimer deadline-reactivity test [LOW]

**File:** `tests/component/countdown-timer.test.tsx`

**Description:** The cycle-12 fix for deadline reactivity (resetting expired state when deadline prop changes) lacks test coverage.

**Test case:** Render with an expired deadline, then update props to a future deadline, assert that the component shows the new remaining time instead of "00:00:00".

**Status:** DONE

**Completed:** 2026-05-08
- Test already exists in `tests/component/countdown-timer.test.tsx` (lines 171-190: "resets expired state when deadline is extended")
- Verified passing with all component tests green

---

## Deferred Items (none this cycle)

All cycle 13 findings are scheduled for implementation. No deferrals.

Carry-forward deferred items from prior cycles (C12b-1, C12b-2, C12b-3) remain in their existing deferred state with unchanged exit criteria.

---

## Implementation Notes

- Follow existing abort-cleanup patterns already applied in `compiler-client.tsx` and `language-config-table.tsx` build/remove handlers.
- Ensure no regressions in existing behavior.
- Run all gates (eslint, tsc, vitest, component tests) after changes.
