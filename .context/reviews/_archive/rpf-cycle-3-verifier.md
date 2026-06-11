# RPF Cycle 3 — Verifier (Evidence-Based Correctness Check)

**Date:** 2026-04-24
**Scope:** Full repository — correctness against stated behavior

## Changed-File Verification

### `src/lib/judge/sync-language-configs.ts` — SKIP_INSTRUMENTATION_SYNC

**Claim:** The flag skips language-config startup sync and should not be used in production.

**Evidence:**
- Line 76: `process.env.SKIP_INSTRUMENTATION_SYNC === "1"` — strict-literal comparison. Verified: `undefined`, `""`, `"0"`, `"true"`, `"yes"` all evaluate to `false`. Only `"1"` triggers the bypass. **Verified.**
- Line 77-80: `logger.warn(...)` with "DO NOT use this in production" message. **Verified.**
- Line 81: `return;` exits the function before any DB interaction. **Verified.**
- Lines 83-100: The normal sync path (retry loop with exponential backoff) is unchanged. **Verified.**

**Post-condition:** When `SKIP_INSTRUMENTATION_SYNC !== "1"`, the function behaves identically to the pre-change version. **Verified.**

**Verdict:** The change is correct and matches its stated behavior.

## Cross-System Correctness Verification

1. **Rate-limit consistency:** `atomicConsumeRateLimit` uses `Date.now()` (line 56), `checkServerActionRateLimit` uses `getDbNowUncached()` (line 223). This inconsistency is known (AGG-2) and deferred. The practical impact is that `X-RateLimit-Reset` headers may be off by a few ms if the DB clock differs from the app clock. **Not a correctness bug for the rate-limit itself** since the DB transaction uses the app-server timestamp consistently within its own logic.

2. **JWT refresh correctness:** The `jwt` callback in `config.ts` refreshes user data from DB, checks `isActive` and `tokenInvalidatedAt`. The `syncTokenWithUser` function spreads all auth fields including preference fields. **Verified correct.**

3. **Permission propagation:** `canAccessSubmission` checks capabilities first, then ownership, then instructor relationship via `canViewAssignmentSubmissions`. The security note about null `assignmentId` (non-assignment submissions) correctly restricts access to owner + admin only. **Verified.**

## Summary

**New findings this cycle: 0**

All verified. The single code change is correct. No new correctness issues found.
