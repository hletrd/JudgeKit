# Critic — Cycle 24

**Date:** 2026-04-24
**Reviewer:** critic
**Scope:** Multi-perspective critique of the whole change surface

---

## Findings

### C-1: [MEDIUM] Missing Security Headers in Proxy — `Referrer-Policy` and `X-Content-Type-Options`

**Confidence:** HIGH
**Cross-agent signal:** Also flagged by S-1, S-2, CR-1

The proxy sets CSP and HSTS but omits `Referrer-Policy` and `X-Content-Type-Options`. The Referrer-Policy omission is the more serious concern: contest access tokens and recruiting tokens appear in URLs, and without `strict-origin-when-cross-origin`, these tokens leak in Referer headers to any cross-origin navigation.

This is a recurring class of issue: the proxy was built incrementally and CSP was added early, but the full set of OWASP-recommended security headers was never audited as a checklist.

**Fix:** Add both headers to `createSecuredNextResponse` in proxy.ts.

---

### C-2: [MEDIUM] `getRetentionCutoff` Clock Skew Inconsistency

**Confidence:** HIGH
**Cross-agent signal:** Also flagged by CR-4, P-2, V-1

Four review perspectives independently identified that `getRetentionCutoff` uses `Date.now()` while all other time-sensitive operations use DB server time. This is a pattern inconsistency that the codebase otherwise avoids carefully. The function already has an optional `nowMs` parameter, making the fix trivial — just pass DB time from the callers.

**Fix:** Update `data-retention-maintenance.ts` and `db/cleanup.ts` to pass `await getDbNowMs()` as the `nowMs` parameter.

---

### C-3: [MEDIUM] ZIP Bomb Validation Decompresses Everything

**Confidence:** HIGH
**Cross-agent signal:** Also flagged by CR-2, P-1, TE-1

Three review perspectives identified that `validateZipDecompressedSize` decompresses all ZIP entries to measure size. This is:
1. Wasteful (metadata is available without decompressing)
2. A potential OOM vector on small instances
3. Untested (TE-1 flags missing test coverage)

The per-entry cap (50 MB) and entry count cap (10,000) prevent unbounded memory, but the sequential allocation/deallocation of hundreds of MB per validation request is unnecessary.

**Fix:** Use ZIP metadata (`uncompressedSize`) when available. Add unit tests for the validation function.

---

### C-4: [LOW] Argon2 `needsRehash` Not Implemented for Parameter Changes

**Confidence:** MEDIUM
**Cross-agent signal:** Also flagged by S-3, V-2

Two review perspectives identified that `verifyPassword` returns `needsRehash: false` for Argon2 hashes even when the hash parameters differ from the current policy. The `argon2.needsRehash()` function exists in the library but is not called.

This is a defense-in-depth concern: if the Argon2 parameters are ever tightened, existing hashes will not be automatically upgraded. The bcrypt-to-argon2 migration path works correctly, but the argon2-parameter-change path does not.

**Fix:** Call `argon2.needsRehash(storedHash, ARGON2_OPTIONS)` after successful Argon2 verification.

---

## Positive Observations

- The codebase consistently uses `getDbNowMs()` for all time-sensitive contest boundary checks
- The `createApiHandler` wrapper correctly awaits `params` for Next.js 16 compatibility
- The `escapeLikePattern` function is used correctly with `ESCAPE '\\'` clauses
- The `resolveStoredPath` function properly prevents path traversal
- The `namedToPositional` function validates parameter names and prevents SQL injection
- The CSP is well-configured with nonce-based script-src and proper frame-ancestors
- Password hashing uses Argon2id with OWASP-recommended parameters
- The dummy password hash prevents user-enumeration via timing

---

## Files Reviewed

All files reviewed by the specialist agents, plus cross-referencing for deduplication.
