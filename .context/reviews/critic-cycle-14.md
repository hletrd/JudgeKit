# Critic — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-CT1: `mapTokenToSession` fragility — same bug class that caused the shareAcceptedSolutions incident

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:142-168`
- **Evidence:** This is a persistent, well-known issue. The `syncTokenWithUser` side was fixed with `Object.assign`, but `mapTokenToSession` still uses manual per-field assignment. The comment on line 157 ("When adding a new preference field: add it to AUTH_PREFERENCE_FIELDS, AuthUserRecord, next-auth.d.ts (Session["user"] and JWT), AND here") is effectively a sign saying "this will break again." The fix is straightforward and low-risk — iterate over `AUTH_PREFERENCE_FIELDS` instead of listing each field.
- **Cross-agent signal:** This finding aligns with CR14-CR1 and CR14-AR1.

## CR14-CT2: Mixed clock sources in `rateLimits` table rows create subtle, hard-to-debug inconsistencies

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:** `src/lib/security/rate-limit.ts:39,77`, `src/lib/security/api-rate-limit.ts:59,226`
- **Evidence:** The `rateLimits` table is shared between two code paths that use different clocks:
  - `atomicConsumeRateLimit` and `checkServerActionRateLimit` write `windowStartedAt`, `lastAttempt`, and `blockedUntil` using DB server time
  - `getEntry()`, `recordRateLimitFailure()`, `recordRateLimitFailureMulti()`, and `evictStaleEntries()` use `Date.now()` (app-server time)

  A single row can have some fields written with DB time and others with app-server time. For example, if `atomicConsumeRateLimit` creates an entry with DB time and then `recordRateLimitFailure` updates it with app-server time, the row contains mixed timestamps. This makes debugging rate-limit issues extremely difficult — you can't tell which clock was used for any given value.
- **Cross-agent signal:** This finding aligns with CR14-CR2 and CR14-SR1.

## CR14-CT3: `leaderboard.ts` uses `Date.now()` for freeze-time comparison — same clock-skew class as prior findings

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/assignments/leaderboard.ts:52`
- **Evidence:** `const nowMs = Date.now()` is used to determine if the leaderboard should be frozen. If the app server is behind the DB server, students might see the frozen leaderboard a few seconds late. If ahead, they see it a few seconds early. This was previously deferred as CR13-D3 with the rationale that "contest freeze times are typically set well in advance" and "seconds of clock skew have minimal practical impact." I concur with the deferral but note it for completeness.
- **Cross-agent signal:** Same class as CR13-D3 (carried forward).

## Verified Prior Fixes

- All 6 prior fixes from cycles 7-12 remain present (verified)
- Cycle 13 fixes (ZIP bomb per-entry cap, DB time in atomicConsumeRateLimit) are present (verified)
