# Architect — Cycle 19

**Date:** 2026-04-24
**Base commit:** f1817fdf

---

## Findings

### A-1: [LOW] `systemSettings` Redaction Config Fragmented Across Three Modules — Schema Drift Risk

**Files:** `src/lib/db/export.ts:245-258`, `src/lib/logger.ts:5-27`, `src/lib/actions/system-settings.ts:182-188`
**Confidence:** HIGH

Secret column handling is spread across three independent configuration points:

1. **Logger `REDACT_PATHS`** (`src/lib/logger.ts:5-27`): Controls which fields are redacted from log output. Now includes `hcaptchaSecret` (added in cycle 17).

2. **Export `SANITIZED_COLUMNS` / `ALWAYS_REDACT`** (`src/lib/db/export.ts:245-258`): Controls which columns are nulled in backup exports. Does NOT include `systemSettings.hcaptchaSecret`.

3. **Audit redaction** (`src/lib/actions/system-settings.ts:182-188`): Ad-hoc inline redaction of `hcaptchaSecret` in the audit details object using a manual `map()` check. Not reusable.

Each system must be manually updated when a new secret column is added. The logger got `hcaptchaSecret` in cycle 17, but the export module was never updated. This fragmentation makes omissions likely.

**Concrete failure scenario:** A developer adds an `oauthClientSecret` column to `systemSettings`. They add it to `REDACT_PATHS` in the logger (because the security review catches it), but forget to update `SANITIZED_COLUMNS` and `ALWAYS_REDACT` in `export.ts`. Full-fidelity backups now leak the encrypted OAuth secret.

**Fix:** Create a single source-of-truth constant (e.g., `SECRET_COLUMNS` in a shared module) that lists all secret columns by table. Derive `REDACT_PATHS`, `SANITIZED_COLUMNS`, and `ALWAYS_REDACT` from it. Add a test that validates all three are consistent.

---

### A-2: [LOW] `computeLeaderboard` Is Synchronous-Compatible but Uses Mixed Clock Sources

**File:** `src/lib/assignments/leaderboard.ts:52`
**Confidence:** MEDIUM

`computeLeaderboard()` at line 52 uses `Date.now()` while `computeContestRanking()` (called on lines 58 and 68) uses DB-derived timestamps in its SQL queries. The function is already async and could use `getDbNowMs()`. All other contest boundary checks (anti-cheat, submissions, assignment PATCH) use DB time. This is the only contest-related function that uses `Date.now()` for a boundary decision.

**Fix:** Replace `Date.now()` with `await getDbNowMs()` at line 52.

---

## Verified Safe

### VS1: API handler abstraction is well-designed
`createApiHandler` in `src/lib/api/handler.ts` provides a clean, consistent middleware chain: rate limiting, auth, role/capability checks, CSRF, Zod validation, error handling. All routes that use it get the same protection.

### VS2: Stale-while-revalidate pattern is consistent
Both `contest-scoring.ts` and `analytics/route.ts` use the same SWR pattern: 15s stale threshold, 30s TTL, per-key refresh lock, failure cooldown. This is a well-tested pattern in the codebase.

### VS3: Export streaming uses backpressure
`waitForReadableStreamDemand()` properly respects the stream controller's desired size, preventing memory bloat on large exports.
