# Tracer — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## Findings

### C29-TR-1: Recruiting token auth flow — unbounded input before validation

- **Entry:** `src/lib/auth/config.ts:204-215`
- **Flow:**
  1. Client POSTs to `/api/auth/callback/credentials` with recruitToken
  2. `authorize()` receives credentials object
  3. `credentials.recruitToken` accessed with only `typeof` and length > 0 checks
  4. Regex `/^[-A-Za-z0-9_]{16,}$/` executed on unbounded string
  5. String allocation happens before regex can reject
  6. If token passes regex, rate limit consumed
  7. `authorizeRecruitingToken()` called with full string
  8. Token flows to `redeemRecruitingToken()` → DB query
- **Root Cause:** No length guard before regex. Input validation should have bounds.
- **Fix:** Add upper bound to regex or explicit length check.

---

## Verified Safe Flows

### Judge Claim Flow
- Atomic CTE with SKIP LOCKED prevents race conditions
- Worker capacity check before claim
- Token comparison uses timing-safe compare

### Chat Widget Flow
- Double DB query pattern is intentional (least-privilege decryption)
- Stream cleanup verified: reader.releaseLock() in finally blocks
- Abort signal handled via apiFetch timeout

### Auth Flow
- Session creation uses DB server time (avoids clock skew)
- Token invalidation check verified
- Rate limiting on both IP and username

## Final Sweep

No additional suspicious flows identified.
