# Security Reviewer — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** security-reviewer
**Scope:** Authentication, authorization, encryption, rate limiting, CSRF, input validation, data exposure

## Findings

### SR12-1: `encrypt()` plaintext fallback in production allows silent decryption bypass

**File:** `src/lib/security/encryption.ts:79-88`
**Severity:** MEDIUM / Confidence: HIGH

When `decrypt()` encounters a value that doesn't start with `enc:`, it returns the raw value. In production, this only logs a warning. This creates a silent bypass path: if an attacker can write a plaintext value into an encrypted column (via SQL injection, compromised admin, or a bug in a different code path), `decrypt()` will happily return it without any error. The `decryptPluginSecret()` in `secrets.ts` is safer (throws on failure), but the general-purpose `decrypt()` is used by `hcaptcha.ts` and potentially other callers.

**Concrete failure scenario:** If the `hcaptchaSecret` column in system_settings is overwritten with a plaintext value (e.g., via a future admin API bug), `decrypt()` will return it silently, and the hCaptcha verification will proceed with the attacker-controlled secret — allowing them to bypass CAPTCHA entirely.

**Fix:** In production, when `decrypt()` encounters a non-`enc:` value, throw an error instead of returning plaintext. Add an explicit `allowPlaintextFallback: true` option for the migration path only.

### SR12-2: `isEncryptedPluginSecret` prefix-only check allows malformed `enc:v1:` values to pass through storage

**File:** `src/lib/plugins/secrets.ts:10-12`
**Severity:** LOW / Confidence: HIGH (residual from CR11-1)

`isEncryptedPluginSecret()` only checks the `enc:v1:` string prefix. It does not validate that the remaining structure contains valid iv/tag/ciphertext components. After the CR11-1 fix, `preparePluginConfigForStorage` trusts `isEncryptedPluginSecret` to gate the "already encrypted" path. A malformed value starting with `enc:v1:` will be stored as-is and fail on read, causing the secret to be silently replaced with an empty string.

**Security impact:** LOW — requires admin role, no data exfiltration, only denial-of-service on a single plugin config. But it violates the invariant that stored encrypted values should be decryptable.

**Fix:** Add structural validation to `isEncryptedPluginSecret` or add a separate `isValidEncryptedPluginSecret()` that validates the full `enc:v1:base64url:base64url:base64url` structure.

### SR12-3: `in-memory-rate-limit.ts` module-level `store` Map is not bounded in multi-instance deployments

**File:** `src/lib/security/in-memory-rate-limit.ts:17`
**Severity:** LOW / Confidence: MEDIUM

The in-memory rate limiter uses a module-level `Map` with `MAX_ENTRIES = 10000`. In a multi-instance deployment (multiple Next.js server processes), each instance has its own independent rate-limit state. An attacker can distribute requests across instances to multiply their effective rate limit by the number of instances. The PostgreSQL-backed rate limiter (`rate-limit.ts`) does not have this issue because it uses shared DB state.

**Note:** The codebase already has the PostgreSQL-backed `api-rate-limit.ts` as the primary rate limiter with the sidecar as a fast path. The in-memory rate limiter appears to be a fallback. The risk is LOW because the in-memory limiter is not used for the primary API rate limiting path (which uses `consumeApiRateLimit` / `consumeUserApiRateLimit`).

**Fix:** Document that the in-memory rate limiter is per-instance and should not be relied upon for accurate rate limiting in multi-instance deployments.

### Verified Security Controls

- CSRF: `validateCsrf()` checks X-Requested-With, Sec-Fetch-Site, and Origin — all three layers present
- Argon2id password hashing with bcrypt migration path — correct
- SQL injection: All LIKE queries use `escapeLikePattern()` with `ESCAPE '\\'` — consistent
- Path traversal: `resolveStoredPath()` rejects `..`, `/`, `\` — correct
- Docker sandbox: `--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534:65534`, seccomp — defense in depth
- Shell command validation: Both basic (`validateShellCommand`) and strict (`validateShellCommandStrict`) checks present
- hCaptcha verification: Proper server-side token verification with secret
- ZIP bomb protection: `validateZipDecompressedSize()` with entry count and total size limits
- API key storage: Hashed with `keyHash`, encrypted with `encryptedKey` — correct
