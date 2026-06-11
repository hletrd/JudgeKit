# RPF Cycle 15 — Architect

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### ARCH-1: Inconsistent `getDbNowUncached()` fetching pattern across recruiting invitation routes [MEDIUM/MEDIUM]

**Files:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`, `src/app/api/v1/admin/api-keys/route.ts`

The API keys route correctly fetches `dbNow` once and reuses it. The bulk route also fetches once and reuses it. But the single-create recruiting invitations route fetches `dbNow` twice (lines 70 and 77) in different branches. This is a consistency issue — the codebase established a pattern of single-fetch-and-reuse, and the single-create route should follow it.

**Fix:** Fetch `dbNow` once before the branching logic.

**Confidence:** MEDIUM

### ARCH-2: Workspace-to-public migration Phase 4 incomplete — auth-aware public pages not started [MEDIUM/LOW]

**Files:** `src/lib/navigation/public-nav.ts`, `src/app/(public)/layout.tsx`

The migration plan calls for making public pages auth-aware (rendering additional sections or edit buttons when the user is authenticated with appropriate capabilities). Currently, the public layout already fetches `auth()` and `resolveCapabilities()`, but no public page uses this information to render auth-aware UI. The PublicHeader correctly shows different nav items based on capabilities, but the actual page content under `/practice`, `/contests`, etc. does not show any auth-specific affordances.

This is an architectural observation, not a bug. The plan notes this as remaining Phase 4 work.

**Confidence:** LOW

## Verified Safe

- `(control)` and `(workspace)` route groups fully removed — verified.
- Dashboard layout includes PublicHeader with shared nav items — verified.
- `getPublicNavItems` and `getDropdownItems` centralized in shared module — verified.
- Capability-based filtering used consistently in both PublicHeader and AppSidebar — verified.
- `withUpdatedAt()` now requires `now: Date` parameter — verified (no `new Date()` fallback).
