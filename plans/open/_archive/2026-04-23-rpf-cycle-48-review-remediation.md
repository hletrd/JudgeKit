# Cycle 48 Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 48/100
**Base commit:** 6831c05e

## Findings to Address

### Lane 1: Replace `Date.now()` with `getDbNowUncached()` in judge claim route [MEDIUM/MEDIUM]

**Source:** AGG-1 (10-agent consensus: CR-1, PERF-1, SEC-1, ARCH-1, CRI-1, V-1, DBG-1, TE-1, TR-1, DOC-1)

**File:**
- `src/app/api/v1/judge/claim/route.ts:122`

**Changes:**
1. Import `getDbNowUncached` from `@/lib/db-time` (likely not yet imported in this file)
2. In the claim handler, move `claimCreatedAt` computation inside the transaction or just before it, replacing `Date.now()` with `(await getDbNowUncached()).getTime()`
3. Add a comment explaining the clock-skew rationale (consistent with `realtime-coordination.ts`, `api-rate-limit.ts`)
4. Verify existing tests still pass — the claim route tests should work since the function is already async

**Exit criteria:** Judge claim route uses DB time for `claimCreatedAt`, ensuring stale claim detection is consistent with DB `NOW()`.

---

### Lane 2: Fix `rateLimitedResponse` X-RateLimit-Reset header to use DB-consistent time [LOW/LOW]

**Source:** AGG-2 (4-agent: CR-2, CRI-2, V-3, DBG-2)

**File:**
- `src/lib/security/api-rate-limit.ts:125`

**Changes:**
1. Change `rateLimitedResponse` to accept an optional `nowMs` parameter
2. When called from `consumeApiRateLimit` / `consumeUserApiRateLimit`, pass the DB-consistent timestamp from the `atomicConsumeRateLimit` call
3. Update the `X-RateLimit-Reset` header to use the passed-in `nowMs` instead of `Date.now()`

**Exit criteria:** `X-RateLimit-Reset` header reflects DB-consistent time, not app-server time.

---

## Deferred Items (from this cycle's reviews)

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-3: Practice page unsafe type assertion | practice/page.tsx:128-129 | LOW/LOW | Type-safe by runtime validation; cosmetic carry-over from cycle 47 | Module refactoring cycle |
| AGG-4: Anti-cheat privacy notice accessibility | anti-cheat-monitor.tsx:261 | LOW/LOW | Requires manual keyboard testing; no code change identified yet | Manual a11y audit |

All prior deferred items from cycles 37-47 remain deferred as documented in `_aggregate.md`.

## Progress

- [x] Lane 1: Judge claim route clock-skew fix (commit cb730300)
- [x] Lane 2: rateLimitedResponse header fix (commit 750e5082)
- [x] Test fix: mock getDbNowUncached in judge claim route tests (commit 73dd32da)
