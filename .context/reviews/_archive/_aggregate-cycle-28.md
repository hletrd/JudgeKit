# Aggregate Review — Cycle 28

**Date:** 2026-04-25
**Reviewers:** code-reviewer, security-reviewer
**Total findings:** 3 (deduplicated to 2)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `sessions.sessionToken` missing from `ALWAYS_REDACT` — exposed in full-fidelity backup exports

**Sources:** CR-1, SEC-1 | **Confidence:** HIGH
**Cross-agent signal:** 2 of 2 review perspectives

The `sessions.sessionToken` column is included in `SANITIZED_COLUMNS` (line 247) but not in `ALWAYS_REDACT` (lines 256-260) in `src/lib/db/export.ts`. This means full-fidelity backup exports include session tokens in cleartext.

The codebase enforces a consistent "never log secrets" policy via `REDACT_PATHS` in `src/lib/logger.ts:19` (includes `sessionToken`). The `ALWAYS_REDACT` map exists to extend this policy to backup exports. The omission is inconsistent with the codebase's own secret-handling conventions — `passwordHash`, `encryptedKey`, and `hcaptchaSecret` are all in `ALWAYS_REDACT`.

A leaked `sessionToken` enables immediate session hijacking with zero computational effort, unlike `passwordHash` (which requires cracking) or `encryptedKey` (which can be rotated by deleting the API key). There is no remediation path for a leaked session token other than waiting for the session to expire or the user to log out.

**Concrete failure scenario:** An admin downloads a full-fidelity backup for disaster recovery. The JSON file contains `sessions.sessionToken: "abc123..."`. The backup is stored on a shared drive. A low-privileged user with read access to the backup can hijack any active admin session by setting the `authjs.session-token` cookie.

**Fix:**
1. Add `sessions: new Set(["sessionToken"])` to `ALWAYS_REDACT` in `src/lib/db/export.ts`.
2. Add a test that validates `ALWAYS_REDACT` includes entries for all columns in `SANITIZED_COLUMNS` that represent session/auth tokens (`sessionToken`, `refresh_token`, `access_token`, `id_token`, `secretTokenHash`, `judgeClaimToken`).

---

### AGG-2: [LOW] `accounts` OAuth tokens and `judgeWorkers` secrets not in `ALWAYS_REDACT` — design trade-off

**Sources:** CR-2, SEC-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 2 of 2 review perspectives

The `SANITIZED_COLUMNS` map includes `accounts: ["refresh_token", "access_token", "id_token"]` and `judgeWorkers: ["secretTokenHash", "judgeClaimToken"]`, but neither appears in `ALWAYS_REDACT`. Full-fidelity backups contain these values.

This is a design trade-off: full-fidelity backups are designed for disaster recovery and need to contain enough data to restore the system. Without `refresh_token` and `access_token`, OAuth-based accounts could not be seamlessly restored. The `secretTokenHash` is already a hash, not a plaintext secret, so the exposure risk is lower than for `sessionToken`.

**Fix:** Decide based on the recovery vs. security trade-off for the deployment environment. At minimum, document the trade-off explicitly in the export module. Consider adding `accounts: new Set(["refresh_token", "access_token", "id_token"])` to `ALWAYS_REDACT` for deployments where backup files are not stored in a trusted environment.

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-21 from cycle 27 plan) remain unchanged. See the cycle 27 plan for the full deferred list.

## Positive Observations

- All clock-skew-sensitive paths consistently use `getDbNowMs()` / `getDbNowUncached()` — no `Date.now()` regressions found
- No `as any` type casts in the codebase
- No `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` suppressions (1 justified eslint-disable)
- `dangerouslySetInnerHTML` usage properly sanitized (DOMPurify + safeJsonForScript)
- No `eval()`, `new Function()`, or `innerHTML` assignments
- No shell injection vectors (all `execFile`/`spawn` use argument arrays)
- Path traversal protection in `resolveStoredPath()`
- ZIP bomb protection in `validateZipDecompressedSize()`
- AES-256-GCM encryption with proper auth tag handling
- Argon2id password hashing with OWASP-recommended parameters
- All prior cycle fixes verified as still in place (hcaptchaSecret, rateLimitedResponse, analytics late penalties, participant timeline late penalties)
- ICPC ranking correctly treats same solved+penalty as tied regardless of last-AC tiebreaker

## No Agent Failures

Both review perspectives completed successfully.
