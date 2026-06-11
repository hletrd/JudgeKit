# Test Engineer — Cycle 17

## Findings

### T-1: [LOW] No Test for Logger REDACT_PATHS Coverage Against Secret Columns
**File:** `src/lib/logger.ts:5-25`
**Confidence:** High

There is no automated test that validates the logger's `REDACT_PATHS` array covers all known secret columns in the schema. This is the same systemic gap that existed for `SANITIZED_COLUMNS` (fixed in cycle 16 with AGG-5). If a new secret column is added to the schema, it must be manually added to `REDACT_PATHS`, and there is no test to catch omissions.

Current `REDACT_PATHS` covers: `authorization`, `password`, `passwordHash`, `recruitAccountPassword`, `recruitToken`, `workerSecret`, `judgeClaimToken`, `sessionToken`, `access_token`, `refresh_token`, `id_token`, `encryptedKey`, `authToken`, `runnerAuthToken`.

Missing: `hcaptchaSecret`, `secretTokenHash` (though `secretToken` plaintext was removed in cycle 16, `secretTokenHash` could still leak the hash if logged).

**Fix:** Add a test that validates `REDACT_PATHS` includes entries for all columns in `SANITIZED_COLUMNS` and `ALWAYS_REDACT` from `export.ts`, plus any additional secret fields known to the schema.

---

### T-2: [LOW] `sanitizeMarkdown` Has No Unit Test for Control Character Stripping
**File:** `src/lib/security/sanitize-html.ts:85-88`
**Confidence:** Medium

The `sanitizeMarkdown` function strips control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F) but there is no dedicated unit test for this function. While the function is simple, control character injection can be a security concern (null byte injection in downstream systems).

**Fix:** Add a unit test for `sanitizeMarkdown` that verifies: null bytes are stripped, other control characters are stripped, newlines/tabs/carriage returns are preserved, normal text passes through unchanged.
