# Debugger — Cycle 17

## Findings

### D-1: [MEDIUM] `hcaptchaSecret` Could Leak via Logger in Server Action Error Path
**File:** `src/lib/logger.ts:5-25`, `src/lib/actions/system-settings.ts:91-100`
**Confidence:** High

Same finding as S-1. Tracing the execution path: when an admin updates system settings with a new hCaptcha secret, the server action receives the plaintext value. If an error occurs during the update (e.g., DB constraint violation, validation error after partial processing), the error is caught and logged. If the error logging includes the settings object or the request body, `hcaptchaSecret` would appear in the log output unredacted because it is not in `REDACT_PATHS`.

**Concrete failure scenario:** Admin saves hCaptcha settings. The DB write fails due to a constraint violation. The error handler logs the full settings object at error level. The pino logger does not redact `hcaptchaSecret` because it is not in `REDACT_PATHS`. The plaintext hCaptcha secret is now in the application log.

**Fix:** Add `"hcaptchaSecret"` and `"body.hcaptchaSecret"` to `REDACT_PATHS`.

---

### D-2: [LOW] Duplicate Audit Event Pruning — Redundant Work but Not a Bug
**File:** `src/lib/audit/events.ts:229-250`, `src/lib/data-retention-maintenance.ts`
**Confidence:** High

Same finding as A-2. Both `pruneOldAuditEvents()` and `pruneSensitiveOperationalData()` prune from the `auditEvents` table. They use identical batched-DELETE patterns with the same retention window. Running both means audit events are pruned twice per day, which is wasteful but not harmful (the second run finds no rows to delete).

---

### D-3: [INFO] Race Condition Window in `redeemAccessCode` Is Correctly Handled
**File:** `src/lib/assignments/access-codes.ts:108`
**Confidence:** High

Traced the `redeemAccessCode` function: the entire read-validate-write sequence runs inside a `db.transaction()`. The unique constraint on `contestAccessTokens.assignmentId + contestAccessTokens.userId` serves as the final arbiter for concurrent redemptions. The catch block handles the 23505 (unique violation) error gracefully. No TOCTOU bug here.
