# RPF Cycle 4 — Architect

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### ARCH-1: `apiJson` helper added but never adopted — dead code pattern [MEDIUM/MEDIUM]

**File:** `src/lib/api/client.ts:61-80`
**Confidence:** HIGH

The `apiJson` helper was added in cycle 3 as a type-safe alternative to the manual `response.ok` + `.json()` pattern. However, zero client components use it. All components still use the manual `response.ok` check + `.json().catch(() => ({}))` pattern. Having two approaches for the same problem adds cognitive load and confusion about which pattern to use.

**Fix:** Either migrate client components to use `apiJson`, or remove it and standardize on the manual pattern. The manual pattern is already consistent and well-understood; removing `apiJson` may be the pragmatic choice.

---

### ARCH-2: Polling pattern fragmentation — three different polling implementations in the codebase [MEDIUM/MEDIUM]

**Confidence:** HIGH

The codebase now has three different polling patterns:
1. `useVisibilityPolling` hook (used by clarifications, announcements, quick-stats, leaderboard)
2. `SubmissionListAutoRefresh` with fetch-based backoff (used by submissions pages)
3. Manual `setInterval` (used by `countdown-timer.tsx`, `active-timed-assignment-sidebar-panel.tsx`)

Pattern 1 is the recommended approach and handles visibility correctly. Pattern 2 is specialized for the submission list case where error-detectable backoff is needed. Pattern 3 is the legacy approach that doesn't handle visibility at all.

The `countdown-timer.tsx` case is particularly notable because it's in an exam context where timer accuracy matters most.

**Fix:** Migrate `countdown-timer.tsx` to at least add a `visibilitychange` listener for immediate recalibration on tab focus. Consider whether `useVisibilityPolling` could be extended to support timer-style use cases.

---

### ARCH-3: Dynamic vs static clipboard import inconsistency [LOW/MEDIUM]

**Confidence:** MEDIUM

`recruiting-invitations-panel.tsx` uses a static import for `copyToClipboard` (fixed in cycle 3), while `access-code-manager.tsx` still uses a dynamic `await import()`. These are in the same feature area and should use the same pattern.

**Fix:** Convert `access-code-manager.tsx` to use a static import, matching the established pattern.

---

## Verified Safe

- `useVisibilityPolling` hook correctly implements the ref-based callback pattern to avoid stale closures
- SSE events route uses shared polling manager to avoid N+1 queries
- Anti-cheat monitor uses recursive `setTimeout` instead of `setInterval` for heartbeat (cycle 3 fix confirmed)
- Recruiting invitations panel properly split fetch functions to avoid dependency cycles
