# Security Reviewer — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-SR1: `rate-limit.ts getEntry()` and `evictStaleEntries()` use `Date.now()` for comparisons against DB-stored timestamps

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/security/rate-limit.ts:39, 77`
- **Evidence:** `evictStaleEntries()` at line 39 computes `cutoff = Date.now() - RATE_LIMIT_EVICTION_AGE_MS` and deletes rows where `lastAttempt < cutoff`. But `lastAttempt` values are written by functions that now use DB server time (`atomicConsumeRateLimit` uses `getDbNowMs()`, `checkServerActionRateLimit` uses `getDbNowUncached()`). If the app server clock is ahead of the DB server clock, entries appear older than they are and get evicted prematurely, causing rate limit state loss. Similarly, `getEntry()` at line 77 uses `const now = Date.now()` for window calculations while the stored `windowStartedAt` and `blockedUntil` values may have been written using DB time.
- **Failure scenario:** Attacker is rate-limited with `blockedUntil` written as DB-time. App server is 10 seconds ahead. `getEntry()` computes `now = Date.now()` (10s ahead). The check `entry.blockedUntil > now` may return false prematurely, unblocking the attacker 10 seconds early. For login rate limiting with exponential backoff, this could allow brute-force attempts to proceed faster than intended.
- **Suggested fix:** Replace `Date.now()` with `await getDbNowMs()` in `getEntry()` and `evictStaleEntries()`. The `getEntry` function already receives a transaction client parameter, so the DB time query can run within the same transaction.

## CR14-SR2: `ContestsLayout` click handler `javascript:` check is blocklist-based, not allowlist-based

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(dashboard)/dashboard/contests/layout.tsx:33`
- **Evidence:** The click handler prevents navigation for `javascript:` and `data:` URLs, but uses a blocklist approach. An `href` like `blob:https://example.com/...` or other non-standard schemes would bypass the check. While DOMPurify and React's JSX rendering generally prevent XSS through attributes, this is a defense-in-depth gap in the layout's event handler.
- **Suggested fix:** Replace the blocklist with an allowlist that only permits relative paths (`/`-prefixed) or `https?://` URLs.

## CR14-SR3: `in-memory-rate-limit.ts` is not clock-skew-aware but is used alongside DB-backed rate limits

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/security/in-memory-rate-limit.ts`
- **Evidence:** The in-memory rate limiter uses `Date.now()` throughout (lines 22, 24, 57, 76, 101, 150). This is acceptable because it's an in-process store with no DB dependency — all writes and reads use the same clock. However, if a request is first checked against the in-memory limiter and then falls through to the DB-backed limiter, the two checks use different clocks. This is the existing design (the in-memory limiter is a fast pre-check), and the discrepancy is small in practice.
- **Suggested fix:** Document the assumption that the in-memory limiter's `Date.now()` is consistent within a single process and does not need DB-time alignment.

## Verified Prior Fixes

- `atomicConsumeRateLimit` uses `getDbNowMs()` (verified)
- `checkServerActionRateLimit` uses `getDbNowUncached()` (verified)
- ZIP bomb validation has per-entry size cap (verified)
- `encrypt/decrypt` uses GCM with strict mode in production (verified)
- `preparePluginConfigForStorage` checks `isValidEncryptedPluginSecret` (verified via CR11-1 fix)
