# RPF Cycle 16 — Verifier

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Evidence-based correctness check against stated behavior for:
- Cycle 15 changes (token column drop, audit truncation, rate limiter eviction, auth config guard)
- Export sanitization
- Recruiting token flow
- Judge worker auth

## Verification Results

### V-1: [CONFIRMED] `recruitingInvitations.token` Column Dropped

**Evidence:**
- Schema (schema.pg.ts:928-965) no longer contains a `token` column on `recruitingInvitations`
- The unique index `ri_token_idx` on the plaintext token is gone
- A `ri_token_hash_idx` unique index on `tokenHash` exists (line 959)
- All DB queries in `recruiting-invitations.ts` use `tokenHash` for lookups
- The `createRecruitingInvitation` function stores only `tokenHash` and returns plaintext via the response object

**Verdict:** The migration is correct. The column is not referenced in any code path.

### V-2: [FAILED] Export Sanitization Not Updated After Column Drop

**Evidence:**
- `SANITIZED_COLUMNS` in `export.ts:251` still lists `"token"` for `recruitingInvitations`
- `SANITIZED_COLUMNS` in `export.ts:252` lists `"token"` for `contestAccessTokens` — a column that never existed
- `ALWAYS_REDACT` in `export.ts:256-259` does not list `recruitingInvitations`, which is correct (no sensitive data remains)

**Verdict:** The export sanitization was NOT updated to match the schema migration. This is a verified gap.

### V-3: [CONFIRMED] Audit Event Truncation Produces Valid JSON

**Evidence:**
- The `truncateObject` function (events.ts:54-90) recursively truncates string values before serialization
- If the truncated object still exceeds `MAX_JSON_LENGTH`, it falls back to `{"_truncated":true}`
- Unit tests (serialize-details.test.ts) verify valid JSON output for various inputs
- The `serializeDetails` function (events.ts:92-109) has a final safety check for budget overflow

**Verdict:** Correct. The truncation always produces valid JSON.

### V-4: [CONFIRMED] In-Memory Rate Limiter Eviction is O(1) FIFO

**Evidence:**
- `maybeEvict()` (in-memory-rate-limit.ts:23-51) uses `store.keys().next().value` for FIFO eviction
- Map preserves insertion order in JavaScript, so `keys().next()` returns the oldest entry
- The sorted eviction that was O(n log n) has been removed

**Verdict:** Correct. The eviction is O(1) per entry.

### V-5: [CONFIRMED] Auth Config Build-Phase Guard Works

**Evidence:**
- `isBuildPhase` check (config.ts:171) uses `process.env.NEXT_PHASE === "phase-production-build"`
- `validateAuthUrl()` is only called when `!isBuildPhase` (line 173)
- `getValidatedAuthSecret()` is guarded by the same check with a placeholder fallback (line 180)

**Verdict:** Correct. The build phase is properly guarded.

## Summary

4 of 5 verifications passed. The export sanitization gap (V-2) is a verified regression from the cycle 15 migration.
