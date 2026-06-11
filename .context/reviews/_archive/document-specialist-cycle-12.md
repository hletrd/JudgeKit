# Document Specialist — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** document-specialist
**Scope:** Doc-code mismatches against authoritative sources

## Findings

### DS12-1: `decrypt()` JSDoc says "plaintext fallback for data stored before encryption" but no migration deadline or disable mechanism is documented

**File:** `src/lib/security/encryption.ts:75-78`
**Severity:** LOW / Confidence: HIGH

The JSDoc comment says: "If the value does not start with `enc:`, it is returned as-is (plaintext fallback for data that was stored before encryption was enabled)." This implies a temporary migration path, but:
1. There is no deadline for removing this fallback
2. There is no configuration flag to disable it in production
3. There is no documentation on when the migration will be complete
4. The warning log in production (`logger.warn(...)`) is the only runtime indication

**Fix:** Add a comment with a migration timeline and a tracking issue reference. Consider adding a `DISABLE_ENCRYPTION_PLAINTEXT_FALLBACK` env var for production.

### DS12-2: `isEncryptedPluginSecret` JSDoc missing — function has no documentation

**File:** `src/lib/plugins/secrets.ts:10-12`
**Severity:** LOW / Confidence: HIGH

`isEncryptedPluginSecret()` has no JSDoc. After the CR11-1 fix, this function is now a security-critical gatekeeper (it determines whether a value is stored as-is or encrypted). The lack of documentation makes it easy for a future developer to misunderstand its behavior (prefix-only check, no structural validation).

**Fix:** Add JSDoc:
```
/**
 * Check whether a value starts with the `enc:v1:` prefix.
 * WARNING: This only checks the prefix — it does NOT validate the
 * cryptographic structure (iv, tag, ciphertext). Use for gating
 * storage decisions only, not for validating encrypted data integrity.
 */
 */
```

### DS12-3: `rate-limit.ts` has clear TOCTOU warnings on read-only functions but `api-rate-limit.ts` lacks equivalent documentation

**File:** `src/lib/security/api-rate-limit.ts`
**Severity:** LOW / Confidence: MEDIUM

`rate-limit.ts` has excellent documentation: `isRateLimited()` and `isAnyKeyRateLimited()` both carry WARNING comments about TOCTOU races. However, `api-rate-limit.ts` has no equivalent documentation for its `sidecarConsume` function, which has its own race condition risk (sidecar says "allowed" but DB state changed between the two checks).

**Fix:** Add a comment to `consumeApiRateLimit` noting the two-tier strategy and the inherent race window between sidecar and DB.
