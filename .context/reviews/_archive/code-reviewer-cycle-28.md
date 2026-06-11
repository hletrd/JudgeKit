# Code Reviewer — Cycle 28

**Date:** 2026-04-25
**Reviewer:** code-reviewer
**Scope:** Full repository, 567 TypeScript/TSX files

## Review Inventory

Examined all critical server-side modules:
- `src/lib/assignments/contest-scoring.ts` — ranking computation, caching, late penalties
- `src/lib/assignments/leaderboard.ts` — freeze boundary, single-user live rank
- `src/lib/assignments/contest-analytics.ts` — student progression, late penalties
- `src/lib/assignments/participant-timeline.ts` — timeline with late penalties
- `src/lib/assignments/scoring.ts` — SQL and TS late-penalty expressions
- `src/lib/security/api-rate-limit.ts` — rate limiting with DB-consistent time
- `src/lib/security/encryption.ts` — AES-256-GCM encryption
- `src/lib/security/password-hash.ts` — Argon2id with bcrypt migration
- `src/lib/security/hcaptcha.ts` — hCaptcha verification
- `src/lib/db/export.ts` — export with redaction maps
- `src/lib/db/import.ts` — import with schema drift detection
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination with pg_advisory_lock
- `src/lib/data-retention-maintenance.ts` — pruning with DB time
- `src/lib/audit/events.ts` — audit event recording with truncation
- `src/lib/api/handler.ts` — createApiHandler middleware
- `src/lib/files/storage.ts` — path traversal protection
- `src/lib/files/validation.ts` — ZIP bomb protection
- `src/lib/docker/client.ts` — Docker API with input validation
- `src/lib/logger.ts` — Pino with redaction
- `src/proxy.ts` — auth cache, nonce, UA hashing
- `src/app/api/v1/admin/restore/route.ts` — database restore
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE connection tracking
- `src/lib/ops/admin-health.ts` — health check endpoints

## Findings

### CR-1: [MEDIUM] `sessions.sessionToken` missing from `ALWAYS_REDACT` — exposed in full-fidelity backup exports

**Confidence:** HIGH
**Citation:** `src/lib/db/export.ts:245-260`

`SANITIZED_COLUMNS` includes `sessions.sessionToken` (line 247), but `ALWAYS_REDACT` (lines 256-260) does not. This means full-fidelity backup exports include session tokens in cleartext.

Unlike `passwordHash` (which can be rotated on next login) or `encryptedKey` (which can be rotated by deleting and recreating the API key), a leaked `sessionToken` enables immediate session hijacking with no remediation until the session expires or the user explicitly logs out. The `ALWAYS_REDACT` map exists specifically for columns that should never appear in any export format, regardless of the redaction mode.

The codebase's own `REDACT_PATHS` in `src/lib/logger.ts` includes `sessionToken`, and the `hcaptchaSecret` was added to `ALWAYS_REDACT` in a prior cycle for the same reason — secrets that should never leave the system even in disaster recovery backups.

**Concrete failure scenario:** An admin downloads a full-fidelity backup for disaster recovery. The JSON file contains `sessions.sessionToken: "abc123..."`. The backup file is stored on a shared drive. A low-privileged user with read access to the backup can hijack any active admin session by setting the `authjs.session-token` cookie.

**Fix:** Add `sessions: new Set(["sessionToken"])` to `ALWAYS_REDACT` in `src/lib/db/export.ts`. Consider also adding `accounts: new Set(["refresh_token", "access_token", "id_token"])` and `judgeWorkers: new Set(["secretTokenHash", "judgeClaimToken"])` since OAuth tokens and worker secrets have similar hijacking potential.

---

### CR-2: [LOW] `accounts` OAuth tokens and `judgeWorkers` secrets not in `ALWAYS_REDACT`

**Confidence:** MEDIUM
**Citation:** `src/lib/db/export.ts:245-260`

The `SANITIZED_COLUMNS` map includes `accounts: ["refresh_token", "access_token", "id_token"]` and `judgeWorkers: ["secretTokenHash", "judgeClaimToken"]`, but neither appears in `ALWAYS_REDACT`. This means full-fidelity backups contain OAuth tokens and worker authentication secrets.

OAuth tokens (`refresh_token`, `access_token`) can be used to impersonate users on the OAuth provider's side. Worker secrets (`secretTokenHash`, `judgeClaimToken`) can be used to submit fraudulent judge results. However, `secretTokenHash` is already a hash, not a plaintext secret, so the exposure risk is lower.

The counter-argument is that full-fidelity backups are designed for disaster recovery and need to contain enough data to restore the system. Without `sessionToken` in the backup, a restore would invalidate all active sessions, forcing all users to re-authenticate. Without `refresh_token`, OAuth-based accounts could not be seamlessly restored. This is a design trade-off.

**Fix:** At minimum, add `sessions: new Set(["sessionToken"])` to `ALWAYS_REDACT` (CR-1). For `accounts` and `judgeWorkers`, decide based on the recovery vs. security trade-off for the deployment environment.

---

## Positive Observations

- All clock-skew-sensitive paths consistently use `getDbNowMs()` / `getDbNowUncached()` — contest boundaries, rate limiting, data retention, SSE coordination, leaderboard freeze
- No `as any` type casts in the codebase
- No `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` suppressions (1 justified eslint-disable for plugin admin components)
- `dangerouslySetInnerHTML` usage is properly sanitized (DOMPurify + safeJsonForScript)
- No `eval()`, `new Function()`, or `innerHTML` assignments
- No shell injection vectors (all `execFile`/`spawn` use argument arrays)
- Path traversal protection in `resolveStoredPath()` (checks `/`, `\`, `..`)
- ZIP bomb protection in `validateZipDecompressedSize()`
- Password hashing uses Argon2id with OWASP-recommended parameters
- AES-256-GCM encryption with proper auth tag handling
- Proxy auth cache cleanup properly throttled to 90% capacity
- Console.error calls properly gated behind `NODE_ENV === "development"` check
- All prior cycle fixes verified as still in place (hcaptchaSecret redaction, rateLimitedResponse DB time, analytics late penalties, participant timeline late penalties)
- Batched DELETEs with inter-batch delays prevent WAL bloat
- SSE shared polling batches all active submissions into one DB query
- `contestAccessTokens` table correctly has no sensitive token columns requiring redaction
- ICPC ranking correctly treats same solved+penalty as tied regardless of last-AC tiebreaker
