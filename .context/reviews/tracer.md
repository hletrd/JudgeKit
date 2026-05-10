# Tracer Review — Cycle 37

**Reviewer:** tracer
**Date:** 2026-05-09
**HEAD:** 07174a9b

## Summary

0 new findings. No suspicious flows or competing hypotheses require investigation.

## Traced Flows

### Login → Rate Limit → Auth Flow
1. Credentials submitted to NextAuth authorize callback
2. Rate limit checked via `consumeRateLimitAttemptMulti` with IP + username keys
3. On success, rate limits cleared; on failure, attempts recorded
4. Token created with DB-server authenticatedAt timestamp
5. Token invalidated check uses DB-server time for consistency
- No TOCTOU races detected. All rate limit operations are atomic within transactions.

### Judge Claim → SQL Execution → Worker Response
1. IP allowlist check
2. Rate limiting via `consumeUserApiRateLimit`
3. Worker auth validation
4. Atomic SQL claim with CTEs
5. Test cases and language config fetched
6. Response returned with adjusted time limits
- No race conditions. FOR UPDATE SKIP LOCKED prevents double-claims.

### Anti-Cheat → Event Recording → Retry Logic
1. Event recorded with MIN_INTERVAL_MS debouncing
2. Immediate send attempted
3. On failure, event saved to localStorage with retry count
4. scheduleRetryRef handles exponential backoff
5. Cleanup clears all timers and listeners
- Timer lifecycle is properly managed.

## Conclusion

No suspicious flows or causal anomalies detected in this cycle.
