# RPF Cycle 13 — Critic

**Date:** 2026-04-20
**Reviewer:** critic

---

## CRI-1: Client-side time comparisons remain the last frontier of clock-skew inconsistency [MEDIUM/MEDIUM]

**Files:** `src/components/contest/recruiting-invitations-panel.tsx:248`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:270`
**Problem:** After 12+ cycles of systematically migrating server-side code from `new Date()` to `getDbNow()`, the remaining `new Date()` calls in client components are the last frontier. These are not security vulnerabilities (the server is the authoritative gate), but they represent a user-experience inconsistency: the server says "valid" but the UI says "expired" (or vice versa). This is especially problematic for recruiting candidates who may be in different timezones with misconfigured clocks.

The most impactful instance is `recruiting-invitations-panel.tsx:248` — an instructor managing invitations sees incorrect "Expired" badges if their browser clock is off. This could lead to premature revocation or unnecessary re-creation of invitations.

**Fix:** For the invitations panel and API keys, add server-computed `isExpired`/`statusExpired` fields to the API responses. For the backup filename, parse the `Content-Disposition` header from the server response.
**Confidence:** MEDIUM

## CRI-2: `createBackupIntegrityManifest` optional `dbNow` parameter is a latent trap [LOW/MEDIUM]

**File:** `src/lib/db/export-with-files.ts:42-56`
**Problem:** This is the same pattern that caused the original clock-skew bug across 20+ routes: an optional time parameter that falls back to `new Date()`. While all current callers pass `dbNow`, the optional parameter creates a maintenance trap. The codebase has already demonstrated that this pattern leads to bugs when new code paths are added.
**Fix:** Make `dbNow` required. One-line API change.
**Confidence:** MEDIUM

## CRI-3: Health endpoint timestamps using `new Date()` is acceptable [INFO]

**Files:** `src/lib/ops/admin-health.ts:53`, `src/app/api/v1/health/route.ts:31`
**Assessment:** These are diagnostic/monitoring timestamps that should reflect "when this health check ran" from the app server's perspective. Using `getDbNow()` here would add a DB round-trip to every health check, which is counterproductive. The current approach is correct for this use case.

## Verified Safe

- The systematic DB-time migration across server code is thorough and consistent.
- Server-side validation is always authoritative — client-side display issues don't affect security.
- `withUpdatedAt()` docstring provides adequate warning.
- The `getDbNow()`/`getDbNowUncached()` split is well-designed.
