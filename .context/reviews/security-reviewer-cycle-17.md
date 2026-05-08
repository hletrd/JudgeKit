# Security Reviewer — Cycle 17

## Findings

### S-1: [MEDIUM] `hcaptchaSecret` Missing from Logger Redaction Paths
**File:** `src/lib/logger.ts:5-25`
**Confidence:** High

The pino logger's `REDACT_PATHS` array does not include `hcaptchaSecret` or `body.hcaptchaSecret`. The hCaptcha secret is stored encrypted at rest (`systemSettings.hcaptchaSecret` column uses `encrypt()` before write), and API responses redact it via `redactSecret()`. However, the server action in `src/lib/actions/system-settings.ts` and the admin API route in `src/app/api/v1/admin/settings/route.ts` handle the secret in plaintext before encrypting. If either of those code paths logs the settings object at error level, the encrypted ciphertext (or in a race, the plaintext before encryption) could appear in logs.

The risk is elevated because the system settings server action processes the plaintext `hcaptchaSecret` value before encrypting it for storage. If the action fails after receiving the plaintext but before encryption, an error log containing the settings object could leak the secret.

**Fix:** Add `"hcaptchaSecret"` and `"body.hcaptchaSecret"` to `REDACT_PATHS`.

---

### S-2: [LOW] `accessCode` Stored in Plaintext in `assignments` Table
**File:** `src/lib/db/schema.pg.ts:344`
**Confidence:** High

The `assignments.accessCode` column stores access codes as plaintext. Access codes are 8-character alphanumeric values used to join contests. Unlike API keys and recruiting tokens (which are hashed), these codes are stored verbatim. A DB compromise would expose all active access codes, allowing unauthorized contest entry.

This is a known design tradeoff: access codes need to be displayed to instructors and compared during redemption, making hashing less straightforward. The codes are also short-lived (tied to contest deadlines) and provide limited access (contest participation only, not account takeover).

**Fix:** Hash access codes with SHA-256 (like `recruitingInvitations.tokenHash`) and compare submitted codes against the hash. Display the plaintext only at creation time.

---

### S-3: [LOW] Legacy Plaintext Fallback in `decrypt()` Could Mask Data Tampering
**File:** `src/lib/security/encryption.ts:90-109`
**Confidence:** Medium

The `decrypt()` function allows a plaintext fallback in non-production environments (`allowPlaintextFallback` defaults to `true` when not in production). This is documented and intentional for migration purposes. However, the development fallback means that a developer running against a production database (even accidentally) could have plaintext values silently accepted, masking data tampering. The production default of `false` mitigates this.

**Fix:** No code change needed. This is informational. The production default is correct.

---

### S-4: [INFO] Comprehensive Security Posture
**Confidence:** High

The codebase demonstrates strong security practices:
- Timing-safe token comparison via HMAC ephemeral key
- AES-256-GCM encryption with auth tags for secrets
- HKDF key derivation with domain separation
- Argon2id password hashing with bcrypt migration path
- CSP headers with nonce-based script allowlisting
- CSRF via X-Requested-With + Origin/Sec-Fetch-Site validation
- IP extraction with trusted proxy hop validation
- DOMPurify with strict allowlist for HTML sanitization
- No `eval()`, `Function()`, or `innerHTML` usage (except properly sanitized `dangerouslySetInnerHTML`)
- Atomic SQL operations with advisory locks to prevent TOCTOU races
- DB server time used consistently for temporal comparisons
