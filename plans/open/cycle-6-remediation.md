# Cycle 6 Review Remediation Plan

**Date:** 2026-05-09
**Review source:** `.context/reviews/_aggregate.md` (cycle 6/100)
**HEAD:** main / 75d82a17
**Goal:** Fix all findings from cycle 6 code review.

---

## Items to implement this cycle

### 1. C6-AGG-1 — Fix SSE JSON parse failure leaving `isPolling` stuck true
- **File:** `src/hooks/use-submission-polling.ts` (lines 136-148)
- **Task:** In the SSE "result" event handler catch block, call `setIsPolling(false)` and `setError(true)` so the UI stops showing a loading spinner when JSON parse fails.
- **Status:** DONE

### 2. C6-AGG-2 — Add error handling to locale-switcher cookie assignment
- **File:** `src/components/layout/locale-switcher.tsx` (line 43)
- **Task:** Wrap `document.cookie = ...` in try/catch. On failure, still attempt `window.location.reload()`.
- **Status:** DONE

---

## Deferred

None — both findings are actionable this cycle and are correctness/UI quality issues that should not be deferred.

---

## Gate requirements

- `npx eslint .` — must pass 0 errors, 0 warnings
- `npx tsc --noEmit` — must pass
- `npx next build` — must pass
- `npx vitest run` — must pass (2338 tests)
- `npx vitest run --config vitest.config.component.ts` — must pass (179 tests)
