# Critic Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** critic
**Base commit:** a717b371

## Inventory of Reviewed Files

Full sweep of all critical source files across src/lib, src/app/api, src/proxy.ts, and src/components. Cross-referenced against the 21-item deferred registry from the cycle 3 aggregate.

## Multi-Perspective Critique

### Overall Assessment

The JudgeKit codebase is in a mature, stable state. The 21 deferred items are well-documented with proper severity, reason, and exit criteria. The codebase shows consistent patterns:

1. **Clock-skew discipline** is well-established: `getDbNowUncached()` is used in `checkServerActionRateLimit`, `realtime-coordination.ts`, `judge/claim/route.ts`, and the anti-cheat route. The remaining `Date.now()` uses are either in non-DB contexts (client-side, in-memory caches, process-local timers) or explicitly deferred with rationale.

2. **Security posture** is strong: CSRF protection, CSP headers, path traversal protection, SQL injection prevention via parameterized queries, constant-time token comparison, and proper auth caching (no negative-result caching).

3. **Error handling** is consistent: `createApiHandler` wraps routes with auth/CSRF/rate-limit/validation/error handling. Manual routes (SSE, judge) handle their own error paths.

### Areas of Concern (Carry-Over Only)

1. The 21 deferred items are all LOW or cosmetic, or are MEDIUM with explicit architectural rationale. None are security, correctness, or data-loss findings.

2. The `Date.now()` in `atomicConsumeRateLimit` (AGG-2) is the most significant open item at MEDIUM/MEDIUM, but the deferral rationale is sound: adding a DB round-trip per API request is costlier than the clock-skew risk for values that are internally consistent within a single server instance.

3. The missing `no-Date-now-in-transaction` lint guard (ARCH-4, new this cycle) is a reasonable risk mitigation but not urgent.

### Blind Spot Check

- No untracked `Date.now()` calls in DB-transaction contexts that were not already deferred.
- No untracked `console.error` in client components beyond what's already deferred.
- No untracked security issues beyond what's already deferred.
- No untracked test gaps beyond what's already deferred.

## New Findings

**No new findings this cycle.** The codebase is stable and all prior findings are properly tracked. The new ARCH-4 observation (no lint guard against `Date.now()` in DB transactions) is noted but is a process improvement, not a code bug.
