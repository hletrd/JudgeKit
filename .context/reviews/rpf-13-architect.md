# RPF Cycle 13 — Architect Reviewer

**Date:** 2026-04-20
**Reviewer:** architect

---

## ARCH-1: `createBackupIntegrityManifest` optional `dbNow` parameter undermines DB-time consistency contract [LOW/MEDIUM]

**File:** `src/lib/db/export-with-files.ts:42-56`
**Problem:** `createBackupIntegrityManifest()` accepts `dbNow?: Date` and falls back to `new Date()`. All current callers pass `dbNow`, making the fallback dead code. However, the optional parameter creates a trap: a future caller that doesn't pass `dbNow` will silently introduce a clock-skew inconsistency in the manifest timestamp. This is the same pattern that caused the original `withUpdatedAt()` bug across 20+ routes.
**Fix:** Make `dbNow` a required parameter. This is a small, safe API change since all callers already provide it.
**Confidence:** MEDIUM

## ARCH-2: Inconsistent client-side time source pattern [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:248`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:270`
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:52`

**Problem:** The server codebase has been systematically migrated to use `getDbNow()`/`getDbNowUncached()` for all temporal comparisons. However, client components still use `new Date()` for:
1. Expiry status badges (recruiting invitations, API keys)
2. Download filenames (backup restore)
3. Date picker min values (recruiting invitations)

This creates a layering inconsistency: server is DB-time-authoritative, client is browser-time. The server is always the correct gate, so this is not a security issue, but the display inconsistency could confuse users. A proper fix would be to add server-computed status fields (`isExpired`, `isClosed`, etc.) to API responses, making the client a pure renderer of server-determined state.

**Fix:** Add computed boolean fields to API responses for time-dependent statuses. Client components should only render these server-provided fields, not compute them from raw timestamps.
**Confidence:** MEDIUM

## ARCH-3: `streamBackupWithFiles` memory buffering architecture [MEDIUM/HIGH]

**File:** `src/lib/db/export-with-files.ts:112-182`
**Problem:** The backup-with-files path buffers the entire database export JSON in memory before creating the ZIP. This is architecturally at odds with `streamDatabaseExport()`, which was designed to stream data in chunks. The streaming design is undermined by the need to collect all JSON for the ZIP. For small/medium databases this is fine, but it limits scalability.
**Fix:** Long-term: migrate to a streaming ZIP library. Short-term: document the memory characteristics and add a warning log for large exports.
**Confidence:** HIGH — this is a real architectural concern, but it's a known tradeoff.

## Verified Safe

- `getDbNow()` with React.cache() is a good pattern for server components — single DB query per request.
- `getDbNowUncached()` for API routes and transactions — correct separation.
- `withUpdatedAt()` docstring clearly warns about the `new Date()` default.
- Audit buffer with batched flush is appropriate for the write pattern.
