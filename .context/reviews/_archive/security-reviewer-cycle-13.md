# Security Reviewer — Cycle 13

**Date:** 2026-04-24
**HEAD:** main branch (cycle 13)

## Findings

### CR13-1: `atomicConsumeRateLimit` uses `Date.now()` for rate-limit window computation — inconsistent with `checkServerActionRateLimit` using DB time

**File:** `src/lib/security/api-rate-limit.ts:56`

**Severity:** MEDIUM / HIGH

The `atomicConsumeRateLimit()` function computes `now` using `Date.now()` on line 56, while `checkServerActionRateLimit()` on line 223 uses `(await getDbNowUncached()).getTime()`. Both write to the same `rateLimits` table. This clock-source inconsistency means that in a deployment where the app server and DB server clocks diverge, rate-limit windows can be miscalculated. An attacker could exploit a clock skew where the app server is behind the DB server to get extra requests through (the DB thinks the window has expired but the app server has not yet reset it).

This is a security-relevant variant of the code-quality finding. The `rateLimits` table is shared between both functions, and the `windowStartedAt` values written by one function will be read by the other. Inconsistent time sources violate the invariant that all entries in the table use the same clock.

**Fix:** Use `getDbNowUncached()` in `atomicConsumeRateLimit` to match the clock source used by `checkServerActionRateLimit`.

---

### CR13-4: `getRetentionCutoff` defaults to `Date.now()` — data-retention pruning uses app-server time to decide which DB rows to delete

**File:** `src/lib/data-retention.ts:38-40`

**Severity:** MEDIUM / HIGH

Data retention pruning deletes rows from the database where `createdAt < getRetentionCutoff(days)`. The cutoff is computed using `Date.now()` by default, but the comparison is against DB-stored timestamps. If the app server clock is ahead of the DB, rows will be deleted up to N hours early (premature data destruction). If behind, rows that should be pruned survive past their retention period (potential compliance violation).

While the `now` parameter allows callers to pass a custom timestamp, no caller in `data-retention-maintenance.ts` passes it -- they all use the default.

**Fix:** Have `pruneSensitiveOperationalData` in `data-retention-maintenance.ts` fetch DB time once and pass it to each `getRetentionCutoff` call.

---

### CR13-5: Leaderboard freeze-time comparison uses `Date.now()` — contest fairness impact

**File:** `src/lib/assignments/leaderboard.ts:52-53`

**Severity:** LOW / MEDIUM

The freeze determination compares `Date.now()` against `freezeAt` (DB-stored). Clock skew could cause premature or delayed freeze, affecting contest fairness. In high-stakes contests, even a few seconds of skew could matter.

**Fix:** Use `getDbNowUncached()` for the freeze-time comparison.

## Verified Prior Fixes

All prior security fixes remain intact:
- CR9-SR1: SSE re-auth awaits before processing
- CR9-SR3: Tags route has rate limiting
- CR11-1: `preparePluginConfigForStorage` uses `isValidEncryptedPluginSecret`
- CR12-1: `isValidEncryptedPluginSecret` validates full `enc:v1:iv:tag:ciphertext` structure
- CR12-2: `decrypt()` has `allowPlaintextFallback` with production-safe defaults
