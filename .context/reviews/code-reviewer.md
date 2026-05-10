# Code Review — Cycle 37

**Reviewer:** code-reviewer
**Date:** 2026-05-09
**HEAD:** 07174a9b

## Summary

0 new findings. All previously identified issues remain properly deferred or fixed.

## Reviewed Areas

- `src/lib/api/client.ts` — apiFetchJson improvements from cycle 33 are sound. The helper correctly catches fetch() throws, wraps JSON parsing in try/catch, and returns a typed `{ ok, data }` tuple. The development-only warning for parse failures (cycle 35) is present at line 143.
- `src/components/exam/anti-cheat-monitor.tsx` — The cycle 35 heartbeat visibility gating is correct. Lines 187-191 properly skip heartbeat sends when tab is hidden and only reschedule when visible.
- `src/app/api/v1/judge/claim/route.ts` — The bigint cast fix for EXTRACT(EPOCH) is present and correct (line 199). Atomic claim SQL remains sound.
- `src/lib/plugins/chat-widget/providers.ts` — SSE parser fix from cycle 32 (avoiding controller.close() after controller.error()) is verified. No new streaming bugs detected.
- `src/lib/auth/config.ts` — Auth flow is well-structured with timing-safe comparisons, rate limiting, token invalidation, and proper session management.
- `judge-worker-rs/src/docker.rs` and `executor.rs` — Rust worker code is solid with proper sandboxing, seccomp handling, resource limits, and dead-letter persistence.
- `src/lib/security/rate-limit.ts` — `stopRateLimitEviction()` exists (lines 83-88), addressing the cycle 34 finding.

## Deferred Items Verified (unchanged)

- C25-6: Remaining ungated console.error instances — still tracked, low severity
- DEFER-C30-6: `as { error?: string }` unsafe type assertions (15 instances) — still tracked
- DEFER-C30-5: Raw API error strings without i18n — incremental ongoing work
- DEFER-C30-4: `.json()` before `.ok` in non-critical components — large refactor deferred

## Conclusion

No new code quality issues found in this cycle.
