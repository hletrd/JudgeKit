# Cycle 24 Verification Review

**Date:** 2026-05-09
**HEAD:** c86576a1
**Scope:** Evidence-based correctness check of recent changes

---

## Verified Behaviors

### V-1: Contest access token expiry correctly implemented

**Evidence:**
- Migration `0022_contest_access_token_expiry.sql` adds `expires_at` column
- Schema at `schema.pg.ts:1024` defines `expiresAt: timestamp("expires_at", { withTimezone: true })`
- Creation in `access-codes.ts:194` sets `expiresAt: assignment.deadline`
- Creation in `recruiting-invitations.ts:686` sets `expiresAt: assignment.deadline`
- All 5 contest route handlers check `(expires_at IS NULL OR expires_at > NOW())`
- `platform-mode-context.ts` checks expiry in 3 SQL queries
- `contests.ts` checks expiry in student query

**Status:** CORRECT. All access verification paths enforce expiry.

### V-2: Centralized secrets registry correctly integrated

**Evidence:**
- `secrets.ts` exports 4 constants used by 3 modules
- `export.ts:15-16` imports `EXPORT_SANITIZED_COLUMNS` and `EXPORT_ALWAYS_REDACT_COLUMNS`
- `export.ts:78` uses them in active redaction map
- `logger.ts:2` imports `LOGGER_REDACT_PATHS`
- `settings/route.ts:10` imports `SECRET_SETTINGS_KEYS`

**Status:** CORRECT. All three consumers use the centralized registry.

### V-3: ICPC tie-breaker direction corrected

**Evidence:**
- Commit 68c05b6e changed `ut.last_ac_at > t.last_ac_at` to `ut.last_ac_at < t.last_ac_at`
- Test at `leaderboard-live-rank-logic.test.ts:63` verifies `ut.last_ac_at < t.last_ac_at`
- Comment at `leaderboard.ts:114` explains "Earlier last AC (smaller timestamp) ranks better"

**Status:** CORRECT. Earlier last AC now correctly ranks better.

### V-4: Retention cutoff uses DB time

**Evidence:**
- `data-retention-maintenance.ts:117` calls `getDbNowMs()` and passes to all prune functions
- `cleanup.ts:37` calls `getDbNowMs()` for cutoff calculation
- `data-retention.ts:53-58` documents the requirement

**Status:** CORRECT. Both callers use DB time.

### V-5: Security headers present in proxy

**Evidence:**
- `proxy.ts:240` sets `X-Content-Type-Options: nosniff`
- `proxy.ts:241` sets `Referrer-Policy: strict-origin-when-cross-origin`

**Status:** CORRECT. Both OWASP-recommended headers are present.

---

## No Evidence Required

All stated behaviors in recent commits are verified correct at HEAD.
