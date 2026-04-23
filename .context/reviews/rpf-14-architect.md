# RPF Cycle 14 - Architect

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### ARCH-1: `withUpdatedAt()` has inconsistent time-source default across the codebase [MEDIUM/MEDIUM]

**File:** `src/lib/db/helpers.ts:20`

**Description:** The `withUpdatedAt()` helper defaults to `new Date()` when `now` is not passed. This creates a split-brain pattern where some updates use DB time (when callers remember to pass it) and most use app-server time. The codebase has already invested significant effort in migrating from `new Date()` to `getDbNow()` across all temporal comparisons and route handlers, but `withUpdatedAt()` remains a holdout that silently reintroduces the problem on every update operation.

Of 11 call sites, only 2 pass `now` explicitly:
- `src/lib/actions/plugins.ts:52` - passes `now`
- `src/app/api/v1/admin/api-keys/[id]/route.ts:53` - uses `getDbNowUncached()`

The remaining 9 callers (users, groups, roles, plugins, profile, preferences) all use the `new Date()` default.

**Fix:** Make `now` required (same pattern as `createBackupIntegrityManifest` was fixed). This will force all callers to be explicit about their time source.

**Confidence:** High

### ARCH-2: Client-side expiry duration computation pattern is a systemic design flaw [MEDIUM/HIGH]

**Files:**
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:162`
- `src/components/contest/recruiting-invitations-panel.tsx:141`

**Description:** Two independent client components compute `expiresAt` timestamps using browser time and send them to the server as ISO strings. This is an architectural anti-pattern: the server should own temporal authority. The correct pattern is for the client to send a *duration* (e.g., "30 days") and for the server to compute the absolute timestamp using DB time. This is the same principle that was applied to expiry *checks* (AGG-1 from rpf-13), but it hasn't been applied to expiry *creation*.

This pattern creates a class of bugs that is hard to detect in testing (clock skew is rare in dev) but can cause real problems in production.

**Fix:** Create a shared convention: clients send `expiryDuration` (e.g., `{ days: 30 }` or `"30d"`), and servers compute `expiresAt` using `getDbNowUncached() + interval`. Enforce via API schema validation.

**Confidence:** High

## Verified Safe

- DB-time migration is thorough for reads/comparisons across routes and server components.
- `getDbNow()` (React.cache-wrapped) for server components, `getDbNowUncached()` for API routes - correct layering.
- Schema `$defaultFn` for INSERT timestamps is appropriate (runs once at row creation).
- Real-time coordination uses advisory locks for concurrency control - well-designed.
