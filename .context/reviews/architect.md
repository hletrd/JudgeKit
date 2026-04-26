# Architect Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** architect
**Scope:** Cross-module coupling, layering, abstraction quality

## Summary

Architecture remains clean. Cycle-1 plan deferred AGG-7 (function-wrapped constant) but the cycle-2 introduction of `getAuthSessionCookieNames()` (returning both variants) actually justifies a function abstraction now since the proxy needs both names — single-callsite concern is now resolved. Recommendation: keep as function.

## Findings

### ARCH2-1: [HIGH] Working-tree contains 3 production-source changes that need to be committed or stashed
**Files:** `src/proxy.ts`, `src/lib/security/env.ts`, `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`
**Confidence:** HIGH

Cycle 1 committed test/refactor changes that depend on production source updates that were NOT committed. This is an architectural integrity issue: the test suite passes against the working tree but would fail against HEAD. Any developer who clones at HEAD and runs tests gets failures.

**Fix:** Commit the source changes (one commit per concern: env.ts factory, proxy.ts cookie-clearing using factory, analytics time-reconciliation).

### ARCH2-2: [LOW] Anti-cheat monitor is now 332 lines — borderline single-component complexity
**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Confidence:** MEDIUM

The component holds privacy notice dialog state, event reporting with debouncing, pending event persistence, retry scheduling with exponential backoff, heartbeat scheduling, and multiple event listeners (visibility, blur, copy, paste, contextmenu, online).

Splitting into `useAntiCheatEventReporter`, `usePendingEventQueue`, `useAntiCheatListeners` hooks would clarify responsibilities. Tests would be easier to write per-hook.

**Fix:** Defer — refactor without behavior change. Track for future cycle when refactor is needed for new feature.

### ARCH2-3: [LOW] `_refreshingKeys` and `_lastRefreshFailureAt` should be in a `RefreshState` object for cohesion
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:20-24`
**Confidence:** LOW

Two related module-level state variables. Single object would make their relationship explicit.

**Fix:** Defer; cosmetic.

### ARCH2-4: [INFO] Time-domain inconsistency in analytics route is the only architectural smell
File: `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:62,79,88,90`. Already covered in code-reviewer CR2-2 and cycle-1 AGG-2. Architectural fix: commit to one time domain throughout — proposed: `Date.now()` everywhere for in-process cache state; `getDbNowMs()` only when comparing against persisted DB rows.

## Verification Notes

- ARCH-2 from cycle 1 (anti-cheat 321→332 lines) — slight growth from doc comments and aria-hidden change. No functional explosion.
- Cookie naming abstraction is now in the right place (`@/lib/security/env`) since production code (`proxy.ts`) imports it. Architectural consistency improved over cycle 1.

## Confidence

ARCH2-1 is the most actionable finding — uncommitted changes need to flow through.
