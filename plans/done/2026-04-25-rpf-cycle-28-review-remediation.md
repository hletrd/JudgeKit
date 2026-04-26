# RPF Cycle 28 Review Remediation Plan

**Date:** 2026-04-25
**Source:** `.context/reviews/_aggregate-cycle-28.md`
**Status:** In Progress

## Scope

This cycle addresses new findings from the cycle-28 multi-perspective review:
- AGG-1: `sessions.sessionToken` missing from `ALWAYS_REDACT` — exposed in full-fidelity backup exports
- AGG-2: `accounts` OAuth tokens and `judgeWorkers` secrets not in `ALWAYS_REDACT` — design trade-off

No cycle-28 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add `sessions.sessionToken` to `ALWAYS_REDACT` and add consistency test (AGG-1)

- **Source:** AGG-1 (CR-1, SEC-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 2 of 2 review perspectives
- **Citations:** `src/lib/db/export.ts:245-260`
- **Problem:** The `sessions.sessionToken` column is in `SANITIZED_COLUMNS` but not `ALWAYS_REDACT`. Full-fidelity backup exports include session tokens in cleartext, enabling session hijacking if the backup file is compromised. A leaked session token can be used directly with zero computational effort, unlike password hashes or encrypted API keys.
- **Plan:**
  1. Add `sessions: new Set(["sessionToken"])` to `ALWAYS_REDACT` in `src/lib/db/export.ts`.
  2. Add a test that validates `ALWAYS_REDACT` includes entries for `passwordHash`, `encryptedKey`, `hcaptchaSecret`, and `sessionToken` — preventing future regressions where a secret is added to `SANITIZED_COLUMNS` but not `ALWAYS_REDACT`.
  3. Verify all gates pass.
- **Status:** DONE (commit 55abe120)

---

### L1: Evaluate `accounts` OAuth tokens and `judgeWorkers` secrets for `ALWAYS_REDACT` inclusion (AGG-2)

- **Source:** AGG-2 (CR-2, SEC-2)
- **Severity / confidence:** LOW / MEDIUM
- **Cross-agent signal:** 2 of 2 review perspectives
- **Citations:** `src/lib/db/export.ts:245-260`
- **Problem:** The `SANITIZED_COLUMNS` map includes `accounts: ["refresh_token", "access_token", "id_token"]` and `judgeWorkers: ["secretTokenHash", "judgeClaimToken"]`, but neither appears in `ALWAYS_REDACT`. Full-fidelity backups contain these values. This is a design trade-off: full-fidelity backups need OAuth tokens for seamless restoration, but leaked OAuth tokens enable impersonation on the provider's side.
- **Plan:**
  1. Add `accounts: new Set(["refresh_token", "access_token", "id_token"])` to `ALWAYS_REDACT`. The restore process should force re-authentication for OAuth accounts anyway, which is safer than shipping live OAuth tokens in backup files.
  2. Do NOT add `judgeWorkers: new Set(["secretTokenHash", "judgeClaimToken"])` to `ALWAYS_REDACT` — `secretTokenHash` is already a hash (not plaintext), and `judgeClaimToken` is needed for worker registration in disaster recovery.
  3. Add both to the consistency test from H1.
  4. Verify all gates pass.
- **Status:** DONE (commit 55abe120)

---

## Deferred items

### DEFER-1 through DEFER-21: Carried from cycle 27 plan

All prior deferred items (DEFER-1 through DEFER-21 from cycle 27 plan) remain unchanged. See the cycle 27 plan for full details.

---

## Progress log

- 2026-04-25: Plan created from cycle-28 aggregate review. 2 findings, 2 fix tasks, 0 deferred.
- 2026-04-25: H1 DONE — added `sessions.sessionToken` to `ALWAYS_REDACT` (commit 55abe120).
- 2026-04-25: L1 DONE — added `accounts` OAuth tokens to `ALWAYS_REDACT`; kept `judgeWorkers` out (hashes, needed for DR). Both tests added (commit 55abe120). All gates green (eslint 0, tsc clean, vitest 302/302 2197 tests, next build success).
