# Verifier — Cycle 17

## Findings

### V-1: [MEDIUM] `hcaptchaSecret` Not Redacted in Logger — Verified Against Code Path
**File:** `src/lib/logger.ts:5-25`
**Confidence:** High

Verified by tracing the full code path from `src/lib/actions/system-settings.ts:91` through to the logger. The server action destructures `hcaptchaSecret` from the form data, and if an error occurs during processing, the error is logged. The logger's redaction list does not include `hcaptchaSecret`, so it would not be redacted. This confirms S-1, CR-1, A-1, and D-1.

The `REDACT_PATHS` list includes `encryptedKey` (for API keys) but not `hcaptchaSecret` (for system settings), despite both being encrypted-at-rest secrets. This inconsistency is the core issue.

**Fix:** Add `"hcaptchaSecret"` and `"body.hcaptchaSecret"` to `REDACT_PATHS`.

---

### V-2: [LOW] Duplicate Audit Pruning — Verified Both Systems Run Independently
**File:** `src/lib/audit/events.ts:258-271`, `src/lib/data-retention-maintenance.ts:102-114`
**Confidence:** High

Verified that both `startAuditEventPruning()` and `startSensitiveDataPruning()` are called during instrumentation and both set up independent 24-hour intervals. Both prune from `auditEvents` with the same retention window. The duplication is confirmed.

---

### V-3: [INFO] Cycle 16 Fixes Verified
**Confidence:** High

- AGG-1 (stale SANITIZED_COLUMNS): Verified — `recruitingInvitations` now only has `tokenHash`, `contestAccessTokens` entry is removed.
- AGG-2 (secretToken column): Verified — `judgeWorkers` schema no longer has `secretToken` column. Only `secretTokenHash` exists.
- AGG-3 (claimTokenPresent): Verified — poll route no longer includes `claimTokenPresent` in audit details.
- AGG-4 (isExpired DRY): Verified — shared `isExpiredExpr` is used in all 4 query locations.
- AGG-5 (export column validity test): Verified — test exists and would catch stale references.
- AGG-6 (truncateObject boundary tests): Verified — boundary test file exists with edge cases.
