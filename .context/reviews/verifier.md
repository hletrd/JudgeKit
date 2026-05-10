# Verifier Review — Cycle 37

**Reviewer:** verifier
**Date:** 2026-05-09
**HEAD:** 07174a9b

## Summary

0 new findings. All stated behaviors match implementation.

## Verified Behaviors

### apiFetchJson (src/lib/api/client.ts)
- Documentation claims "safe wrapper" — verified. Single-parse design eliminates double-.json() footgun.
- Fetch throw handling — verified. try/catch around apiFetch call present (cycle 33 fix).
- Development-only warning for parse failures — verified at line 143 (cycle 35 fix).
- Response body single-read rule documented — correctly implemented.

### Anti-Cheat Monitor (src/components/exam/anti-cheat-monitor.tsx)
- Heartbeat visibility gating — verified. Lines 187-191 only reschedule when visible.
- Timer cleanup — verified. All timers cleared in useEffect cleanup.
- Retry scheduling — verified. Uses scheduleRetryRef with exponential backoff.

### Rate Limit Eviction (src/lib/security/rate-limit.ts)
- `stopRateLimitEviction()` exists — verified at lines 83-88 (cycle 34 fix).
- `unref()` call prevents process exit blocking — verified.

### Judge Claim (src/app/api/v1/judge/claim/route.ts)
- Atomic SQL claim — verified. CTE with FOR UPDATE SKIP LOCKED.
- bigint cast for EXTRACT(EPOCH) — verified at line 199 (cycle 30 fix).
- Worker capacity check — verified. worker_slot CTE checks active_tasks < concurrency.

### Auth Config (src/lib/auth/config.ts)
- Timing-safe dummy hash — verified.
- Token invalidation — verified. Uses DB-server time for consistency.
- Rate limiting on login — verified. Both IP and username buckets.

## Conclusion

All verified behaviors match their documented contracts. No discrepancies found.
