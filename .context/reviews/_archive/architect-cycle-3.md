# Architect Pass — RPF Cycle 3/100

**Date:** 2026-04-26
**Lane:** architect
**Scope:** Cross-module coupling, layering, abstraction quality

## Summary

Architecture is clean and stable after cycle 2. The cycle-2 introduction of `getAuthSessionCookieNames()` (single source of truth for both cookie names, used by `proxy.ts`) and the named `refreshAnalyticsCacheInBackground` function both improved layering. No new architectural smells introduced this cycle.

The remaining open seams are previously-deferred cycle-2 items (anti-cheat monolith size, `_refreshingKeys/_lastRefreshFailureAt` cohesion) plus the long-running workspace-to-public migration. Neither requires immediate action this cycle; both are tracked.

## Findings

### ARCH3-1: [LOW] Analytics module-level state (`_refreshingKeys`, `_lastRefreshFailureAt`, `analyticsCache`) lacks cohesion

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:17-24`
**Confidence:** LOW

Three module-level variables back the same caching feature. They share lifecycle, key space (`cacheKey = assignmentId`), and failure semantics. They're ripe for encapsulation in a single `AnalyticsCache` class or factory:

```ts
const analyticsCache = new AnalyticsCacheStore<ContestAnalytics>({
  ttlMs: CACHE_TTL_MS,
  staleAfterMs: STALE_AFTER_MS,
  cooldownMs: REFRESH_FAILURE_COOLDOWN_MS,
  max: 100,
  refresh: async (key) => computeContestAnalytics(key, true),
});
```

Pros: handler is a 10-line route. The cache type is reusable for the next caching surface (e.g., leaderboard, scoring summaries). Single concern boundary.
Cons: bigger PR; refactor without behavior change; test surface stays the same.

**Fix:** Defer. Track for a future cycle when a second cache surface needs the same shape (leaderboard would).

**Exit criterion:** A second route in the codebase wants the same stale-while-revalidate + cooldown semantic.

---

### ARCH3-2: [LOW] `src/components/exam/anti-cheat-monitor.tsx` is now 336 lines

**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Confidence:** MEDIUM

Cycle 2 added the `performFlush` extraction and a doc comment, taking the file from 332 → 336 lines. Borderline single-component complexity. Per cycle-2 deferral notes, the refactor would split into `useAntiCheatEventReporter`, `usePendingEventQueue`, `useAntiCheatListeners` hooks.

**Fix:** Defer. Per cycle-2 deferred AGG-14 exit criterion: reopen when adding a feature that pushes the file past 400 lines.

---

### ARCH3-3: [INFO] Workspace-to-public migration — no review-surfaced opportunity this cycle

**Files:** `src/lib/navigation/public-nav.ts`, `src/components/layout/app-sidebar.tsx`
**Confidence:** N/A (informational)

The user-injected directive `user-injected/workspace-to-public-migration.md` calls for incremental migration of dashboard-only pages to the public top navbar where appropriate. This cycle's review surfaced no specific candidate page or navigation issue. Continue tracking under `plans/open/2026-04-19-workspace-to-public-migration.md`.

**Fix:** None this cycle. Keep watching.

---

### ARCH3-4: [INFO] Cycle-2 architectural improvements

**Confidence:** N/A (informational, no fix needed)

For provenance: cycle 2 made three positive architectural moves —

1. `getAuthSessionCookieNames()` factory: single source of truth for cookie names; `proxy.ts` no longer hardcodes them. Future cookie-name changes touch one file.
2. `refreshAnalyticsCacheInBackground`: extracted the IIFE body to a named top-level function. Reduced nesting from 4 levels to 2, made the contract testable in isolation, named the operation for tracing/log search.
3. `performFlush` extraction in anti-cheat: removed code duplication between the user-triggered flush and the retry-timer callback. Single place to fix bugs.

These compound: cycle-1 introduced the abstraction, cycle-2 used it, and cycle-3 baseline benefits from both.

## Verification Notes

- `git log --since="3 days ago"` shows clean conventional + gitmoji history with no monolithic commits.
- `git diff HEAD~5 HEAD --stat` shows only the analytics, anti-cheat, env.ts, proxy.ts surfaces touched, plus tests + plan docs. No accidental cross-module changes.
- No abstraction leaks introduced; cycle 2 cleaned up (rather than added) coupling.

## Confidence

No HIGH or MEDIUM findings actionable this cycle. ARCH3-1 and ARCH3-2 carry forward as deferred items with concrete exit criteria. ARCH3-3 is informational. Cycle 3 is a steady-state architectural cycle — small or absent code-change footprint expected.
