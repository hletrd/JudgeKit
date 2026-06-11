# RPF Cycle 13 — Code Reviewer

**Date:** 2026-04-20
**Reviewer:** code-reviewer
**Scope:** Full repository, focus on recently changed files + cross-file interactions

---

## CR-1: Client-side `new Date()` for expiry badge in recruiting invitations panel [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:248`
**Code:** `if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) return <Badge variant="secondary">{t("statusExpired")}</Badge>;`
**Problem:** The client-side expiry badge compares `new Date(inv.expiresAt)` against `new Date()` using the browser's clock. If the server stores expiry in UTC and the user's browser clock is wrong (even slightly), the "Expired" badge may show incorrectly. More importantly, this is inconsistent with the server-side approach: the server uses `getDbNow()` and `NOW()` for all time comparisons, but this client check uses the browser clock.
**Concrete failure scenario:** A user in a timezone with a misconfigured clock sees a pending invitation incorrectly labelled "Expired" or a truly expired invitation shown as "Pending" until the server rejects the redeem attempt.
**Fix:** Either (a) include a computed `isExpired` boolean from the server in the API response (preferred — single source of truth), or (b) accept the minor cosmetic inconsistency and document it. The server-side `NOW()` check at redeem time remains the authoritative gate.
**Confidence:** MEDIUM — this is a cosmetic/client-side display issue only; the server correctly validates expiry.

## CR-2: Client-side `new Date()` for date picker min value [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:380`
**Code:** `min={new Date().toISOString().split("T")[0]}`
**Problem:** Uses browser clock for the date picker's minimum date. This is purely a UX hint to prevent picking past dates. If the browser clock is wrong, the user might see an incorrect min date, but the server still validates the actual expiry.
**Fix:** Low priority cosmetic. No security or correctness impact.
**Confidence:** LOW

## CR-3: Client-side `new Date()` for API key expiry check [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:270`
**Code:** `if (key.expiresAt && new Date(key.expiresAt) < new Date()) {`
**Problem:** Same pattern as CR-1. The "expired" badge on API keys uses the browser clock for the comparison. The API key authentication on the server validates expiry using DB time, so this is purely a display inconsistency.
**Fix:** Include an `isExpired` computed field from the server API response.
**Confidence:** MEDIUM

## CR-4: Client-side `new Date()` for backup filename timestamp [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:52`
**Code:** `const timestamp = new Date().toISOString().replace(/[:.]/g, "-");`
**Problem:** The backup download filename uses the browser's `new Date()` instead of the server-provided timestamp. The server already generates a DB-time-based filename in the `Content-Disposition` header, but this client-side code overrides it with a local timestamp. The downloaded file therefore has a browser-clock-based name, not matching the DB-time-based snapshot inside.
**Fix:** Extract the filename from the response `Content-Disposition` header instead of generating it client-side. The server already sets `contentDispositionAttachment(backupName, backupExtension)`.
**Confidence:** LOW — purely cosmetic filename mismatch; the actual backup content has correct DB timestamps.

## CR-5: `admin-health.ts` uses `new Date().toISOString()` for health snapshot timestamp [LOW/LOW]

**File:** `src/lib/ops/admin-health.ts:53`
**Code:** `const timestamp = new Date().toISOString();`
**Problem:** The admin health snapshot timestamp uses app-server time. The health endpoint is a diagnostic/monitoring tool; the timestamp does not affect any business logic or comparison.
**Fix:** Low priority. Could use `getDbNowUncached()` for consistency, but this would add a DB query to every health check, which is counterproductive for a monitoring endpoint.
**Confidence:** LOW

## CR-6: `health/route.ts` uses `new Date().toISOString()` for public health timestamp [LOW/LOW]

**File:** `src/app/api/v1/health/route.ts:31`
**Code:** `timestamp: new Date().toISOString(),`
**Problem:** Same as CR-5. The public health endpoint's timestamp is cosmetic/diagnostic only.
**Fix:** Same rationale as CR-5 — adding a DB query to a health check endpoint is counterproductive.
**Confidence:** LOW

## CR-7: `export-with-files.ts` manifest fallback to `new Date()` when `dbNow` not passed [LOW/MEDIUM]

**File:** `src/lib/db/export-with-files.ts:47`
**Code:** `createdAt: (dbNow ?? new Date()).toISOString(),`
**Problem:** `createBackupIntegrityManifest()` falls back to `new Date()` if `dbNow` is not provided. All current callers pass `dbNow`, so this fallback is currently dead code. However, a future caller could forget to pass it, silently introducing a clock-skew timestamp.
**Fix:** Make `dbNow` a required parameter in `createBackupIntegrityManifest()`.
**Confidence:** MEDIUM

## Verified Safe

- Recruiting token `redeemRecruitingToken` transaction path: all 8 timestamps use `dbNow` (fix verified).
- Export `exportedAt` uses `getDbNowUncached()` (fix verified).
- Backup manifest `createdAt` uses `dbNow` (fix verified).
- `getContestStatus()` requires `now: Date` parameter, no default to `new Date()`.
- `selectActiveTimedAssignments()` requires `now: Date` parameter.
- Server components use `getDbNow()` for deadline/status checks.
- `withUpdatedAt()` has clear docstring warning about `new Date()` default.
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any` type casts or `@ts-ignore` suppressions in production code.
- Only 2 justified `eslint-disable` directives.
- SQL queries use parameterized values via Drizzle ORM — no SQL injection.
- LIKE patterns use `escapeLikePattern()` for escaping.
