# RPF Cycle 11 — Security Reviewer

**Date:** 2026-04-20
**Base commit:** 74353547

## Inventory of reviewed files

Same as code-reviewer. Focus: OWASP Top 10, secrets, unsafe patterns, auth/authz, injection, data exposure.

## Findings

### SEC-1: Recruiting token claim path: 7 `new Date()` writes inconsistent with atomic `NOW()` check [MEDIUM/HIGH]

**File:** `src/lib/assignments/recruiting-invitations.ts:362,373,390,478,485,495,497`
**Description:** Same issue as CR-1 but from security perspective. The atomic SQL at line 503 uses `NOW()` for the authoritative expiry validation, so access control is NOT compromised. However, the written timestamps (`enrolledAt`, `redeemedAt`, `updatedAt`) are from the app server clock. If the app server clock is behind the DB clock, a user could see a `redeemedAt` that is earlier than the actual DB time of the atomic claim. This creates an inconsistent audit trail that could complicate forensic investigation. Additionally, `enrolledAt` at line 478 is written *before* the atomic claim at line 490 — if the claim fails and the transaction rolls back, the enrollment is also rolled back, so this is safe from a data integrity perspective. But the timestamp value itself is still wrong relative to DB time.
**Confidence:** HIGH
**Fix:** Same as CR-1 — fetch DB time once at transaction start.

### SEC-2: Backup manifest `createdAt` uses app server time [LOW/MEDIUM]

**File:** `src/lib/db/export-with-files.ts:45`
**Description:** The backup integrity manifest's `createdAt` field uses `new Date().toISOString()`. This timestamp is part of the integrity manifest that is validated on restore. If the app server clock is significantly off, the manifest timestamp won't match the actual data snapshot time. However, this is a cosmetic/diagnostic issue — the SHA-256 checksums are the actual integrity check.
**Confidence:** MEDIUM
**Fix:** Pass DB time to `createBackupIntegrityManifest`.

### SEC-3: Export header `exportedAt` uses app server time within REPEATABLE READ transaction [LOW/MEDIUM]

**File:** `src/lib/db/export.ts:64`
**Description:** The streaming export runs inside a `REPEATABLE READ READ ONLY` transaction for consistent snapshots. But the `exportedAt` header uses `new Date().toISOString()`, which is the app server clock, not the DB transaction start time. This means the `exportedAt` could be earlier or later than the actual snapshot time. For disaster recovery, this discrepancy could cause confusion about which point in time the backup represents.
**Confidence:** MEDIUM
**Fix:** Fetch DB time at transaction start and use it for `exportedAt`.

## Verified Safe

- No SQL injection: all queries use Drizzle ORM parameterized queries or `sql` tagged template literals.
- No XSS: `dangerouslySetInnerHTML` only used with `sanitizeHtml()` or `safeJsonForScript()`.
- CSRF protection in place for server actions and API routes (skipped for API key auth).
- Rate limiting uses PostgreSQL `SELECT FOR UPDATE` for atomic check+increment.
- Recruiting tokens: plaintext never stored, only SHA-256 hash. Atomic claim via SQL `WHERE` + `NOW()` prevents TOCTOU.
- Auth: Argon2id hashing, timing-safe dummy hash for user enumeration prevention, exponential backoff rate limiting.
- Session invalidation checked on every JWT refresh cycle.
- File upload: MIME type validation, size limits, ZIP bomb protection, path traversal prevention.
- Backup/restore: password re-confirmation required, integrity manifest with SHA-256, sanitized exports rejected for restore.
- Encryption key for plugin configs derived from env var, validated at startup.
- No secrets hardcoded in source code.
