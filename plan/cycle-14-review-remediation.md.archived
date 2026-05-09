# Cycle 14 Review Remediation Plan

**Cycle:** 14/100
**Date:** 2026-05-08
**HEAD:** fe8f8866
**Source:** `.context/reviews/_aggregate.md`

---

## Implementation Queue

### Task A — Separate AbortControllers per operation in language admin [MEDIUM]
**Finding:** C14-CR-1
**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:87,150-177,183-207,214-224`
**Issue:** A single `abortControllerRef` is shared between build, remove, and prune operations. Starting any operation aborts any in-progress operation of a different type.
**Fix:** Replace the single `abortControllerRef` with separate refs for each operation type, or use a record keyed by operation. Update cleanup effect to abort all active controllers.
**Estimated:** ~20 lines changed
**Status:** TODO

### Task B — Fix CopyCodeButton timer leak [LOW]
**Finding:** C14-CR-2
**File:** `src/components/code/copy-code-button.tsx:19-27`
**Issue:** `handleCopy` overwrites `copiedTimer.current` without clearing the previous timer. Rapid clicks cause premature state reset and timer accumulation.
**Fix:** Add `if (copiedTimer.current) clearTimeout(copiedTimer.current);` before line 26.
**Estimated:** ~2 lines
**Status:** TODO

### Task C — Add submission-detail-client component tests [LOW]
**Finding:** C14-TE-1
**File:** `tests/component/submission-detail-client.test.tsx` (new)
**Issue:** No component tests exist for `submission-detail-client.tsx`. The cycle 13 AbortController cleanup for queue status polling is not verified.
**Fix:** Create test file covering: mount triggers queue-status fetch with AbortController signal; unmount aborts in-flight request; visibility change triggers immediate poll.
**Estimated:** ~80 lines new file
**Status:** TODO

### Task D — Add abort-on-filter-change test to AcceptedSolutions [LOW]
**Finding:** C14-TE-2
**File:** `tests/component/accepted-solutions.test.tsx`
**Issue:** Existing test covers loading but not the concurrent-fetch-prevention behavior (abort previous request when sort/language/page changes).
**Fix:** Add test that starts a slow fetch, changes sort, and verifies the first fetch signal was aborted.
**Estimated:** ~30 lines
**Status:** TODO

### Task E — Add CopyCodeButton component tests [LOW]
**Finding:** C14-TE-3
**File:** `tests/component/copy-code-button.test.tsx` (new)
**Issue:** No component tests exist for CopyCodeButton. The timer leak would be caught by a rapid-click test.
**Fix:** Create test file covering: click shows checkmark; rapid click keeps checkmark for full 2 seconds from last click; unmount clears timer.
**Estimated:** ~50 lines new file
**Status:** TODO

---

## Deferred Items

None. All findings are scheduled for implementation this cycle.

Prior deferred items remain unchanged (C12b-1, C12b-2, C12b-3).

---

## Gate Results

- `npx tsc --noEmit`: PASS (verified before cycle start)
- `npx vitest run`: PASS (314 files, 2338 tests)
- `npx next build`: To be run after implementation
- `npx vitest run --config vitest.config.component.ts`: To be run after implementation
- `npx eslint .`: To be run after implementation
