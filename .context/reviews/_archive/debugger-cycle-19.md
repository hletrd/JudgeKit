# Debugger — Cycle 19

**Date:** 2026-04-24
**Base commit:** f1817fdf

---

## Findings

### D-1: [MEDIUM] Export Redaction Omission: `systemSettings.hcaptchaSecret` Leaked in All Exports

**File:** `src/lib/db/export.ts:245-258`
**Confidence:** HIGH

The `ALWAYS_REDACT` map (line 255-258) protects `users.passwordHash` and `apiKeys.encryptedKey` from appearing even in full-fidelity backups. However, `systemSettings.hcaptchaSecret` is not included. The `systemSettings` table is not listed in either `SANITIZED_COLUMNS` or `ALWAYS_REDACT`.

**Failure mode:** A full-fidelity backup contains the encrypted hCaptcha secret. If the backup file and `NODE_ENCRYPTION_KEY` are both compromised (common in disaster recovery scenarios where `.env` and backup are co-located), the hCaptcha secret is exposed. This allows an attacker to bypass CAPTCHA verification.

**Root cause analysis:** The `hcaptchaSecret` column was added to `REDACT_PATHS` in the logger (cycle 17, AGG-1) but the parallel update to `export.ts` redaction maps was never made. The fragmented configuration pattern (logger, export, audit each have their own redaction lists) makes this class of omission likely.

**Fix:** Add `systemSettings: new Set(["hcaptchaSecret"])` to both `SANITIZED_COLUMNS` and `ALWAYS_REDACT` in `src/lib/db/export.ts`. Add a test that validates consistency between the three redaction systems.

---

### D-2: [LOW] `computeLeaderboard` Clock Source Mismatch — `Date.now()` vs DB Time for Freeze Decision

**File:** `src/lib/assignments/leaderboard.ts:52-53`
**Confidence:** MEDIUM

The function uses `Date.now()` to decide if the leaderboard should be frozen (`nowMs >= freezeAt`), while the freeze time `freezeAt` is derived from a PostgreSQL `timestamp` column. All other contest boundary checks use DB server time. Under clock skew, this can cause the leaderboard freeze to trigger too early or too late relative to the contest's actual deadline.

**Failure mode:** The app server clock is 5 seconds ahead. A contest with `freezeLeaderboardAt = 14:00:00` will show the frozen leaderboard starting at 13:59:55 local time, which is 5 seconds before the actual freeze time as recorded in the database. Students see stale leaderboard data for those 5 seconds.

**Fix:** Replace `const nowMs = Date.now()` with `const nowMs = await getDbNowMs()` at line 52. The function is already async, so this is a drop-in replacement.

---

## Verified Safe

### VS1: All cycle 17-18b fixes verified working
- `hcaptchaSecret` in `REDACT_PATHS` (logger)
- Audit pruning consolidated into `data-retention-maintenance.ts`
- Proxy auth cache expired entry cleanup on `set`
- Cron cleanup endpoint gated behind `ENABLE_CRON_CLEANUP`
- Audit buffer re-buffer preserves chronological order

### VS2: No empty catch blocks with silently swallowed errors
All catch blocks either log the error, return a fallback value, or propagate the error. Client-side localStorage catches are the only empty ones and are documented.
