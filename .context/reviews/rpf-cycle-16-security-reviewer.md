# RPF Cycle 16 — Security Reviewer

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Reviewed security posture across:
- Authentication (session, JWT, API keys, judge auth, recruiting tokens)
- Authorization (role hierarchy, capability resolution, proxy guards)
- Cryptography (encryption, key derivation, hashing, timing-safe comparison)
- CSRF protection
- Input validation and sanitization
- Data-at-rest protection (plaintext columns, export redaction)
- IP extraction and trust boundaries
- Secrets management

## Findings

### S-1: [HIGH] Stale `recruitingInvitations.token` Reference in Export Sanitization
**Confidence:** High
**Citations:** `src/lib/db/export.ts:251`

The `recruitingInvitations.token` column was dropped in cycle 15, but the export sanitization still references it. If the export engine resolves column indices dynamically, a missing column entry could cause:
1. A runtime crash during export (denial of service on backup/restore)
2. If silently skipped, a false sense of security — operators believe the token column is being sanitized when it no longer exists

This is not a direct data leak (the column doesn't exist), but it indicates the migration was incomplete and the export path was not tested against the updated schema.

**Fix:** Remove `"token"` from the `recruitingInvitations` entry in `SANITIZED_COLUMNS`. Add a test that validates `SANITIZED_COLUMNS` entries match actual schema columns.

---

### S-2: [MEDIUM] Phantom `contestAccessTokens.token` in Export Sanitization
**Confidence:** High
**Citations:** `src/lib/db/export.ts:252`

The `contestAccessTokens` table has no `token` column (schema.pg.ts:994-1014), yet `SANITIZED_COLUMNS` lists `"token"` for it. This is either a leftover from a previously-dropped column or a mistake. Same implications as S-1.

**Fix:** Remove the `contestAccessTokens` entry from `SANITIZED_COLUMNS`.

---

### S-3: [MEDIUM] `judgeWorkers.secretToken` Column Still in Schema and Export
**Confidence:** High
**Citations:** `src/lib/db/schema.pg.ts:418`, `src/lib/db/export.ts:250`

Carry-over from DEFER-66. The `secretToken` plaintext column still exists in the `judgeWorkers` schema. While new registrations set it to `null` and auth rejects workers without `secretTokenHash`, any legacy rows with plaintext tokens are exposed in a DB compromise. The column is also listed in `SANITIZED_COLUMNS` and `ALWAYS_REDACT`, indicating the team is aware of the risk.

This is already tracked as DEFER-66 but the security reviewer re-escalates because it is a plaintext secret at rest.

**Fix:** Drop the column and create a Drizzle migration. Remove from `SANITIZED_COLUMNS` and `ALWAYS_REDACT` after migration.

---

### S-4: [LOW] `RUNNER_AUTH_TOKEN` Fallback to `JUDGE_AUTH_TOKEN` in Docker Client
**Confidence:** High
**Citations:** `src/lib/docker/client.ts:8`

Already tracked as DEFER-64. The fallback `process.env.RUNNER_AUTH_TOKEN || process.env.JUDGE_AUTH_TOKEN` violates unique-credentials-per-service principle. Reiterated for completeness — no new finding.

---

### S-5: [LOW] Hardcoded Dev Encryption Key
**Confidence:** High
**Citations:** `src/lib/security/encryption.ts:14-17`

Already tracked as DEFER-65. Reiterated for completeness — no new finding.

---

## Positive Security Observations

- All auth token comparisons use `safeTokenCompare()` (HMAC-based timing-safe comparison).
- Recruiting tokens are hashed before DB storage; plaintext is only returned on creation.
- CSRF protection requires `X-Requested-With: XMLHttpRequest` header on mutating requests.
- CSP headers are generated per-request with nonces.
- Encryption uses AES-256-GCM with proper IV and auth tag handling.
- The `decrypt()` function rejects plaintext values in production by default.
- Rate limiting uses DB server time (`getDbNowMs`) to avoid clock skew issues.
- Judge worker IP allowlist provides defense-in-depth for the judge API.
- Logger redacts sensitive fields (passwords, tokens, auth headers).
- `sanitizeHtml()` uses DOMPurify with a strict allowlist.
- `safeJsonForScript()` prevents `</script>` injection in JSON-LD.
