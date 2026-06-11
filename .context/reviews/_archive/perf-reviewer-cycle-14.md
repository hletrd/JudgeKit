# Performance Reviewer — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-PERF1: `in-memory-rate-limit.ts` FIFO eviction sorts entire map on overflow

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/security/in-memory-rate-limit.ts:41-47`
- **Evidence:** When the map exceeds 10,000 entries and the first-pass (stale entry) eviction isn't enough, the code creates `[...store.entries()]` (copying all 10,000+ entries) and sorts them by `lastAttempt`. This is O(n log n) in the worst case and allocates a large temporary array. Under sustained traffic from 10,000+ unique IPs, this sort could fire on every insertion.
- **Impact:** In practice, the 10,000-entry map limit combined with the 24-hour eviction window means the sort only fires when there are 10,000+ active (non-stale) entries — an extremely high traffic scenario. The sort is a single operation, not in a hot loop.
- **Suggested fix:** Consider a doubly-linked list alongside the Map for O(1) oldest-entry tracking, or increase the eviction interval so the map rarely hits the cap.

## CR14-PERF2: `getEntry()` in rate-limit.ts queries DB time on every call but could cache

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/security/rate-limit.ts` (if CR14-SR1 fix is applied)
- **Evidence:** If the security fix for CR14-SR1 is applied (replacing `Date.now()` with `getDbNowMs()`), every `getEntry()` call would add a `SELECT NOW()` query. While this is within a transaction, and `getDbNow()` uses React.cache(), the `getEntry` function is also called from `consumeRateLimitAttemptMulti` which processes multiple keys in a single transaction. Each call to `getDbNowMs()` would issue a separate query unless React.cache() deduplicates within the same request scope.
- **Suggested fix:** Call `getDbNowMs()` once at the top of `consumeRateLimitAttemptMulti` and `recordRateLimitFailureMulti` and pass the value down to `getEntry()`.

## Verified Prior Fixes

- ZIP bomb validation has per-entry decompressed size cap (verified in `src/lib/files/validation.ts:44`)
