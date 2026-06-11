# Architect — Cycle 17

## Findings

### A-1: [MEDIUM] `hcaptchaSecret` Not in Logger REDACT_PATHS — Cross-Cutting Concern
**File:** `src/lib/logger.ts:5-25`
**Confidence:** High

Same finding as S-1 and CR-1. The logger redaction configuration is a cross-cutting concern that must be kept in sync with all columns containing secrets. Currently `encryptedKey` is in the redaction list but `hcaptchaSecret` is not, despite both being encrypted-at-rest secrets. This is a systemic risk: any new secret column must be manually added to `REDACT_PATHS`, and there is no automated check.

**Fix:** Add `hcaptchaSecret` to `REDACT_PATHS`. Long-term: derive the redaction list from the schema's `ALWAYS_REDACT` + `SANITIZED_COLUMNS` configuration in `export.ts`, or add a test that validates logger redaction paths against known secret columns.

---

### A-2: [LOW] Two Separate Pruning Systems for the Same Table
**File:** `src/lib/audit/events.ts:229-250`, `src/lib/data-retention-maintenance.ts`
**Confidence:** High

There are two independent pruning systems:
1. `pruneOldAuditEvents()` in `src/lib/audit/events.ts` — runs on its own 24-hour timer
2. `pruneSensitiveOperationalData()` in `src/lib/data-retention-maintenance.ts` — also runs on a 24-hour timer and prunes audit events via `batchedDelete`

Both prune from `auditEvents` using the same `DATA_RETENTION_DAYS.auditEvents` cutoff. They use the same batched-delete pattern. Running both means audit events may be pruned twice per day (wasteful but not harmful). More importantly, it creates a maintenance risk: if the retention policy for audit events changes, both systems must be updated in lockstep.

**Fix:** Consolidate audit event pruning into a single system. The `pruneSensitiveOperationalData` function in `data-retention-maintenance.ts` appears to be the more comprehensive one (it prunes multiple entity types). Move audit event pruning there and remove the duplicate in `events.ts`.

---

### A-3: [LOW] `systemSettings.hcaptchaSecret` Encryption Bypass Path in Development
**File:** `src/lib/security/encryption.ts:90-109`, `src/lib/security/hcaptcha.ts:20-23`
**Confidence:** Medium

In `hcaptcha.ts`, the hCaptcha secret is read from settings and decrypted with `{ allowPlaintextFallback: true }`. In non-production, this means a plaintext hCaptcha secret in the DB would be returned as-is. While this is intended for migration, it creates a path where the encryption can be bypassed in development, which could mask bugs in the encryption/decryption flow.

**Fix:** No immediate code change needed. Consider adding a startup check that warns if any `systemSettings.hcaptchaSecret` value doesn't start with `enc:` in non-production, prompting the admin to re-save the setting to trigger encryption.
