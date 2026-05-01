# RPF Cycle 2 (2026-05-01) — Security Reviewer

**Date:** 2026-05-01
**HEAD reviewed:** `70c02a02`

## Findings

### C2-SR-1: [MEDIUM] encryption.ts JSDoc says "base64" but implementation uses "hex"

- **File:** `src/lib/security/encryption.ts:5-6`
- **Description:** Module-level JSDoc says "followed by base64(IV || authTag || ciphertext)" but the actual implementation uses `toString("hex")`. The code is internally consistent and secure. However, the misleading documentation could cause a developer implementing a decryptor in another language (e.g., a migration tool, a monitoring sidecar) to use base64 decoding on hex-encoded data, producing silent data corruption without any error. This is a documentation-security mismatch.
- **Confidence:** HIGH
- **Fix:** Change "base64(IV || authTag || ciphertext)" to "hex(IV || authTag || ciphertext)" in the module-level JSDoc.

### C2-SR-2: [LOW] Dead _context parameter in validateAndHashPassword

- **File:** `src/lib/users/core.ts:57`
- **Description:** The `_context` parameter is unused after cycle 1's password policy change. While not a security issue itself, dead parameters in security-critical functions can confuse reviewers into thinking validation is happening when it isn't.
- **Confidence:** HIGH
- **Fix:** Remove the parameter and update the one call site that still passes it (`bulk/route.ts:73`).

## Carry-forward verification

- C7-AGG-7 (encryption plaintext fallback): still DEFERRED with doc mitigation at `src/lib/security/encryption.ts:98-117`
- C1-AGG-4 (chmod 0o770): still at `src/lib/compiler/execute.ts:660`
- D1/D2 (JWT clock-skew/DB-per-request): still DEFERRED
- All other carry-forwards unchanged
