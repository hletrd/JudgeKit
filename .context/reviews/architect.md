# Architecture Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** f8ba7334

## Inventory of Files Reviewed

- `src/lib/security/api-rate-limit.ts` — Rate limiting architecture (Date.now consistency)
- `src/lib/realtime/realtime-coordination.ts` — Verified cycle 46 fix
- `src/lib/assignments/contest-analytics.ts` — Analytics caching and query patterns
- `src/proxy.ts` — Auth proxy cache (FIFO design)
- `src/lib/assignments/leaderboard.ts` — Leaderboard freeze mechanism

## Previously Fixed Items (Verified)

- `realtime-coordination.ts` uses `getDbNowUncached()`: PASS
- Date.now() replaced in assignment PATCH: PASS

## New Findings

### ARCH-1: `checkServerActionRateLimit` uses `Date.now()` inside DB transaction — architectural inconsistency [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** The codebase has converged on `getDbNowUncached()` for all DB-timestamp comparisons inside transactions. `checkServerActionRateLimit` is the only remaining function that uses `Date.now()` for this purpose. While `atomicConsumeRateLimit` also uses `Date.now()` (deferred due to hot-path concerns), server actions are low-frequency and can tolerate the extra DB round-trip.

**Fix:** Use `getDbNowUncached()` at the start of the transaction.

**Confidence:** Medium

---

### Carry-Over Items

- **Prior ARCH-2:** Stale-while-revalidate cache pattern duplication (LOW/LOW, deferred)
