# Verifier — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** verifier
**Scope:** Evidence-based correctness check against stated behavior

## Findings

### VR12-1: `preparePluginConfigForStorage` stores malformed `enc:v1:` values — contradicts documented invariant

**File:** `src/lib/plugins/secrets.ts:132-136`
**Severity:** LOW / Confidence: HIGH

The code comment on line 133 states: "Already encrypted (e.g. round-tripped from a previous save) — keep as-is." This implies the value is a valid encrypted secret that was previously stored by the system. However, `isEncryptedPluginSecret` only checks the prefix, so a value like `enc:v1:not-really-encrypted` will be stored. This contradicts the invariant that `preparePluginConfigForStorage` only stores properly encrypted values for secret keys.

**Evidence:** I traced the data flow:
1. Admin submits `enc:v1:malformed` as a secret key value
2. `preparePluginConfigForStorage` checks `isEncryptedPluginSecret(incomingValue)` → true (prefix match)
3. Value is stored as-is to DB
4. On read, `decryptPluginSecret` fails and throws
5. `decryptPluginConfigForUse` catches the error and sets the key to `""`
6. Plugin silently loses its configuration

The documented behavior (keep already-encrypted values as-is) does not match the actual behavior (keep anything with the right prefix as-is, even if it's malformed).

**Fix:** Either strengthen `isEncryptedPluginSecret` to validate structure, or add a validation step after the prefix check in `preparePluginConfigForStorage`.

### VR12-2: `atomicConsumeRateLimit` uses `Date.now()` while `checkServerActionRateLimit` uses DB time — verification needed

**Files:** `src/lib/security/api-rate-limit.ts:56` vs `src/lib/security/api-rate-limit.ts:223`
**Severity:** LOW / Confidence: MEDIUM

Verified that `atomicConsumeRateLimit` (line 56) uses `const now = Date.now()` while `checkServerActionRateLimit` (line 223) uses `const now = (await getDbNowUncached()).getTime()`. Both write `windowStartedAt` and `lastAttempt` to the same `rateLimits` table. If a key is first written by `atomicConsumeRateLimit` (app time) and later checked by `checkServerActionRateLimit` (DB time), the window comparison could be off by the clock skew.

**Evidence:** In the same file, two different time sources are used for the same logical operation (rate-limiting). This is an inconsistency, but the practical impact depends on the magnitude of clock skew, which is typically small in a well-configured deployment.

**Fix:** Use a consistent time source throughout the file. DB time is preferred since the DB is the source of truth for `windowStartedAt`.

## Verified Correct Behaviors

- CR11-1 fix verified: `preparePluginConfigForStorage` now checks `isEncryptedPluginSecret` before encrypting
- CSRF validation verified: Three-layer check (X-Requested-With, Sec-Fetch-Site, Origin)
- Password hashing verified: Argon2id with bcrypt migration, dummy hash for timing-safe comparison
- SQL LIKE escaping verified: `escapeLikePattern` used consistently with `ESCAPE '\\'`
- Path traversal protection verified: `resolveStoredPath` rejects `..`, `/`, `\`
