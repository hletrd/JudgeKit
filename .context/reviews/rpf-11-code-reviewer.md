# RPF Cycle 11 — Code Reviewer

**Date:** 2026-04-20
**Base commit:** 74353547

## Inventory of reviewed files

- `src/lib/assignments/recruiting-invitations.ts` (full file, ~540 lines)
- `src/lib/assignments/access-codes.ts` (full file, ~216 lines)
- `src/lib/db/helpers.ts` (full file)
- `src/lib/db-time.ts` (full file)
- `src/lib/db/export.ts` (full file)
- `src/lib/db/export-with-files.ts` (full file)
- `src/lib/audit/events.ts` (full file)
- `src/lib/auth/config.ts` (full file)
- `src/lib/auth/index.ts` (full file)
- `src/lib/auth/login-events.ts` (full file)
- `src/lib/security/rate-limit.ts` (full file)
- `src/lib/security/sanitize-html.ts` (full file)
- `src/lib/files/storage.ts` (full file)
- `src/lib/data-retention.ts` (full file)
- `src/lib/data-retention-maintenance.ts` (full file)
- `src/lib/realtime/realtime-coordination.ts` (full file)
- `src/lib/api/auth.ts` (full file)
- `src/app/api/v1/files/route.ts` (full file)
- `src/app/api/v1/admin/backup/route.ts` (full file)
- `src/app/api/v1/admin/restore/route.ts` (full file)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full file)
- `src/app/api/v1/judge/poll/route.ts` (full file)
- All `new Date()` usages in src/ via grep
- All `as any`, `eslint-disable`, `@ts-ignore` usages via grep
- All `dangerouslySetInnerHTML` usages via grep

## Findings

### CR-1: Recruiting token transaction path has 7 `new Date()` calls not fixed in rpf-10 M2 [MEDIUM/HIGH]

**File:** `src/lib/assignments/recruiting-invitations.ts`
**Lines:** 362, 373, 390, 478, 485, 495, 497
**Description:** The rpf-10 M2 fix addressed `updatedAt: new Date()` at lines 194, 244, 252 (the non-transactional `updateRecruitingInvitation` and `resetRecruitingInvitationAccountPassword` functions). However, the *transactional* recruiting token claim path (`redeemRecruitingToken`) still has 7 instances of `new Date()`:
- Line 362: `updatedAt: new Date()` in password reset within transaction
- Line 373: `updatedAt: new Date()` in invitation metadata update within transaction
- Line 390: `updatedAt: new Date()` in bcrypt-to-argon2 rehash within transaction
- Line 478: `enrolledAt: new Date()` when creating enrollment
- Line 485: `redeemedAt: new Date()` when creating access token
- Line 495: `redeemedAt: new Date()` in atomic invitation claim
- Line 497: `updatedAt: new Date()` in atomic invitation claim

The atomic SQL at line 503 uses `NOW()` for the security-critical expiry check, so the *access control* is sound. However, the audit trail timestamps (`enrolledAt`, `redeemedAt`, `updatedAt`) are inconsistent with the DB time used for the expiry validation, which is the exact same clock-skew pattern fixed in 20+ other routes.

The code at line 514 explicitly acknowledges this issue but defers fixing it. However, this deferment has persisted since at least cycle 10, and the fix is straightforward: the transaction already has DB access, so `getDbNowUncached()` can be called once at the start of the transaction and reused.

**Confidence:** HIGH
**Fix:** Fetch `const dbNow = await getDbNowUncached()` once at the start of the transaction and replace all 7 `new Date()` calls with `dbNow`.

### CR-2: Backup/export timestamps use `new Date()` for filenames and manifests [LOW/MEDIUM]

**Files:**
- `src/lib/db/export-with-files.ts:45` — `createdAt: new Date().toISOString()` in manifest
- `src/app/api/v1/admin/backup/route.ts:83` — `const timestamp = new Date().toISOString()` for filename
- `src/lib/db/export.ts:64` — `exportedAt: new Date().toISOString()` in export header

**Description:** Backup filenames and manifest timestamps use app server time. These are not security-critical (they don't affect access control or data integrity), but they could cause confusion if backup timestamps don't match the actual DB transaction time. The export stream runs inside a REPEATABLE READ transaction, so the data snapshot is from a consistent point in time, but the `exportedAt` header reflects app-server clock time.

**Confidence:** MEDIUM
**Fix:** For `export.ts:64`, the streaming context already has a transaction. Fetch DB time at the start and reuse. For `backup/route.ts:83`, the filename is cosmetic — low priority. For `export-with-files.ts:45`, fetch DB time once and pass through.

### CR-3: Audit events failure tracker uses `new Date()` for `lastAuditEventWriteFailureAt` [LOW/LOW]

**File:** `src/lib/audit/events.ts:117`
**Description:** `lastAuditEventWriteFailureAt = new Date().toISOString()` is used purely for health monitoring, not for any comparison or access control. This is cosmetic.

**Confidence:** LOW
**Fix:** Low priority. Could use `getDbNowUncached()` for consistency but no functional impact.

### Verified Safe

- No `as any` type casts found in the codebase.
- No `@ts-ignore` or `@ts-expect-error` found.
- Only 2 `eslint-disable` directives, both with justification comments.
- No `dangerouslySetInnerHTML` without sanitization (2 instances, both sanitized via `sanitizeHtml()` or `safeJsonForScript()`).
- No empty catch blocks.
- All SQL template literals use Drizzle's parameterized `sql` tag — no raw string interpolation.
- File storage path traversal protection is in place (`resolveStoredPath` rejects `/`, `\\`, `..`).
- ZIP upload decompression bomb protection via `validateZipDecompressedSize`.
- Backup integrity manifest validation with SHA-256 checksums.
- Rate limiting uses `SELECT FOR UPDATE` for TOCTOU prevention.
- Recruiting token hashes use SHA-256, plaintext tokens never stored.
- Auth flow: Argon2id, timing-safe dummy hash, proper token invalidation, session re-validation.
