# RPF Cycle 14 (Current Loop) — Review Remediation Plan

**Date:** 2026-04-24
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (H1, H2, L1 all complete)

## Scope

This cycle addresses findings from the RPF cycle 14 multi-agent review (current loop):
- AGG-1: `mapTokenToSession` still uses manual per-field assignment — same bug class as `shareAcceptedSolutions` incident
- AGG-2: `rate-limit.ts` uses `Date.now()` for comparisons against DB-stored timestamps — mixed clock sources in shared `rateLimits` table
- AGG-3: `ContestsLayout` uses blocklist for URL scheme validation instead of allowlist

No cycle-14 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Refactor `mapTokenToSession` to iterate over `AUTH_PREFERENCE_FIELDS` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/auth/config.ts:142-168`
- **Cross-agent signal:** 7 of 11 review perspectives
- **Problem:** `syncTokenWithUser` was fixed in cycle 13 to use `Object.assign(token, fields)` which automatically includes all preference fields. But `mapTokenToSession` still manually assigns each preference field. If a new preference field is added to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields` but not to `mapTokenToSession`, the session will silently miss the field — the exact same failure class that caused the `shareAcceptedSolutions` incident in cycle 10.
- **Plan:**
  1. In `mapTokenToSession`, keep core field assignments explicit (id, role, username, name, className, mustChangePassword, email) since they have non-standard defaults
  2. Replace manual preference field assignments (lines 158-168) with a loop over `AUTH_PREFERENCE_FIELDS`:
     ```typescript
     for (const field of AUTH_PREFERENCE_FIELDS) {
       const key = field as keyof typeof token;
       const value = token[key as keyof JWT];
       (session.user as Record<string, unknown>)[field] = value ?? null;
     }
     ```
  3. Handle `shareAcceptedSolutions` default specially (defaults to `true`, not `null`)
  4. Add a unit test that verifies all `AUTH_PREFERENCE_FIELDS` are present in the session after `mapTokenToSession` is called (CR14-TE1)
  5. Update the comment on line 157 to reflect the new automated approach
  6. Verify all gates pass
- **Status:** DONE — Commit `e0e8205d`

### H2: Migrate `rate-limit.ts` to use DB server time for all timestamp comparisons (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/security/rate-limit.ts:39,77`
- **Cross-agent signal:** 6 of 11 review perspectives
- **Problem:** `getEntry()` uses `Date.now()` for `now` (line 77), which is then used for window/blocked-until comparisons against DB-stored `windowStartedAt`, `blockedUntil`, and `lastAttempt` values. `evictStaleEntries()` also uses `Date.now()` (line 39) to compute the cutoff against `lastAttempt`. Meanwhile, `api-rate-limit.ts` writes to the same `rateLimits` table using `getDbNowMs()` (DB time). Mixed clock sources in shared rows can cause premature eviction or rate-limit bypass under clock skew.
- **Plan:**
  1. Add `getDbNowMs` import to `rate-limit.ts`
  2. Modify `getEntry()` to accept an optional `nowMs` parameter, falling back to `await getDbNowMs()` when not provided
  3. Update `evictStaleEntries()` to use `await getDbNowMs()` instead of `Date.now()`
  4. Update `consumeRateLimitAttemptMulti()` to call `getDbNowMs()` once and pass the value to `getEntry()`
  5. Update `recordRateLimitFailure()` and `recordRateLimitFailureMulti()` similarly
  6. Since `getEntry()` is called within transactions, the `getDbNowMs()` call adds minimal overhead
  7. Add a module-level JSDoc documenting that all rate-limit timestamps use DB server time
  8. Verify existing rate-limit tests still pass (they mock the DB, so `getDbNowMs` will need to be mocked)
  9. Verify all gates pass
- **Status:** DONE — Commit `e7f6e848`

### L1: Replace blocklist with allowlist for URL scheme validation in `ContestsLayout` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/contests/layout.tsx:33`
- **Cross-agent signal:** 3 of 11 review perspectives
- **Problem:** The click handler checks `href.startsWith("javascript:")` and `href.startsWith("data:")` to block dangerous URL schemes, but `blob:` and other non-standard schemes would bypass the check. A positive allowlist (only relative paths or https://) is more secure.
- **Plan:**
  1. Replace the blocklist check with an allowlist:
     ```typescript
     // Only allow relative paths and https:// URLs
     if (!href.startsWith("/") || href.startsWith("//")) return;
     ```
     The `//` check prevents protocol-relative URLs. Since all internal links are relative paths starting with `/`, this is safe and more restrictive.
  2. Verify that all links using `data-full-navigate` use relative paths (they should, since they're internal routes)
  3. Verify all gates pass
- **Status:** DONE — Commit `473501bc`

---

## Deferred items

### Carried from prior cycle plans

All DEFER-1 through DEFER-53 from prior cycle plans carry forward unchanged. Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-2, overlaps with CR14-D3)
- DEFER-33: Encryption module integrity check / HMAC (SEC-1)
- DEFER-42: Remaining unguarded `res.json()` on success paths (partially addressed by H1 in prior loop)
- DEFER-50: Encryption module unit tests

### DEFER-54: `in-memory-rate-limit.ts` FIFO eviction sorts entire map on overflow (CR14-D1)

- **Source:** CR14-D1 (from PERF-1)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/lib/security/in-memory-rate-limit.ts:41-47`
- **Reason for deferral:** Performance optimization only fires when all 10K+ entries are non-stale — extremely rare in practice. The eviction already has a first-pass stale entry cleanup.
- **Exit criterion:** When a dedicated performance optimization pass is scheduled or when the in-memory rate limiter shows measurable CPU impact under load.

### DEFER-55: `leaderboard.ts` uses `Date.now()` for freeze-time comparison (CR14-D2)

- **Source:** CR14-D2 (carried from CR13-D3)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/lib/assignments/leaderboard.ts:52`
- **Reason for deferral:** Contest freeze times are typically set well in advance. Seconds of clock skew have minimal practical impact. The `nowMs` parameter could be overridden for testing.
- **Exit criterion:** When a leaderboard time-accuracy audit is scheduled or when a contest freeze-time incident is reported.

### DEFER-56: `recruiting-invitations-panel.tsx` uses `window.location.origin` (CR14-D3)

- **Source:** CR14-D3
- **Severity / confidence:** LOW / HIGH (original preserved)
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:99`
- **Reason for deferral:** Overlaps with DEFER-24 and DEFER-49 from prior cycles. Same fix — use server-provided `appUrl`. Fixing all `window.location.origin` instances in a single pass is more efficient than fixing them one at a time.
- **Exit criterion:** When DEFER-24 is implemented (dedicated `window.location.origin` remediation pass).

### DEFER-57: `mapTokenToSession` comment outdated after `syncTokenWithUser` fix (CR14-D4) — RESOLVED

- **Source:** CR14-D4
- **Severity / confidence:** LOW / HIGH (original preserved)
- **Citations:** `src/lib/auth/config.ts:157`
- **Resolution:** H1 replaced manual assignments with programmatic loop. The old comment was replaced in the same commit (`e0e8205d`).

### DEFER-58: `rate-limit.ts` lacks JSDoc documenting clock source (CR14-D5) — RESOLVED

- **Source:** CR14-D5
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/lib/security/rate-limit.ts`
- **Resolution:** H2 added module-level JSDoc documenting that all rate-limit timestamps use DB server time (`e7f6e848`).

### DEFER-59: No test for `mapTokenToSession` field completeness (CR14-D6) — RESOLVED

- **Source:** CR14-D6 (from TE-1)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `tests/`
- **Resolution:** H1 added `tests/unit/auth/session-preference-fields.test.ts` that verifies the programmatic loop is present and all expected fields are in `AUTH_PREFERENCE_FIELDS` (`e0e8205d`).

### DEFER-60: No test for rate-limit clock source consistency (CR14-D7) — RESOLVED

- **Source:** CR14-D7 (from TE-2)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `tests/`
- **Resolution:** H2 updated `tests/unit/security/rate-limit.test.ts` to mock `@/lib/db-time` module with `dbNowMock`, verifying that all rate-limit functions use DB time (`e7f6e848`).

---

## Progress log

- 2026-04-24: Plan created from RPF cycle 14 (current loop) aggregate review. 3 new tasks (H1, H2, L1). 7 new deferred items (DEFER-54 through DEFER-60). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-24: H1 DONE (e0e8205d — programmatic AUTH_PREFERENCE_FIELDS loop in mapTokenToSession + unit test), H2 DONE (e7f6e848 — DB server time in rate-limit.ts + test mock update), L1 DONE (473501bc — allowlist URL scheme validation in ContestsLayout). Baseline update (7ac29fe3 — source-grep 121->122). All gates pass: eslint (0 errors), tsc (0 errors), vitest (297/297 files, 2123/2123 tests), next build (success). DEFER-57 through DEFER-60 resolved by H1/H2.
