# Cycle 19 Architect Findings

**Date:** 2026-04-19
**Reviewer:** Architectural/design risks, coupling, layering
**Base commit:** 301afe7f

---

## Findings

### F1: React `cache()` scope mismatch between RSC and API routes — architectural gap in caching strategy

- **File**: `src/lib/recruiting/access.ts:79-85`, `src/lib/auth/permissions.ts`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The codebase uses React `cache()` as the deduplication mechanism for `getRecruitingAccessContext`. This works for RSC renders but not for API route handlers, which are outside the React rendering lifecycle. The permission layer (`src/lib/auth/permissions.ts`) is called from both contexts, creating an architectural inconsistency: the same function has different performance characteristics depending on where it's called from. This violates the principle of least surprise.
- **Concrete failure scenario**: A developer adds a new API endpoint that checks `canAccessProblem`. They expect the same caching behavior as the dashboard pages, but the caching doesn't apply. The endpoint has a hidden N+1 query problem that only surfaces under load.
- **Suggested fix**: Adopt a per-request caching strategy that works in both RSC and API route contexts. Options: (1) Use `AsyncLocalStorage` to store the recruiting context for the duration of a single request, (2) Pass the context explicitly through the call chain, (3) Create a `getRequestScope()` utility that returns the appropriate cache for the current context. Document the limitation of React `cache()` for non-RSC callers.

### F2: Admin data-management routes have a third round of duplicated logic — restore route still not DRY

- **File**: `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/export/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: This is a carry-forward from previous reviews (AGG-4). The four admin data-management routes share the same auth/capability/CSRF/rate-limit/password-verification pattern. The backup and export routes were fixed for `needsRehash` in cycle 18b, but the import and restore routes were not. This is exactly the divergence risk that the DRY concern was raising — different security fixes applied to different copies of the same logic.
- **Concrete failure scenario**: A new auth requirement (e.g., MFA verification for destructive operations) is added to the backup and restore routes but the migrate routes are missed because they're in a different directory.
- **Suggested fix**: Extract the common admin data-management auth pattern into a shared middleware or wrapper function. All four routes call the wrapper before their specific logic.

### F3: Breadcrumb component placement is still in main content area — not in the top navbar as planned

- **File**: `src/app/(dashboard)/layout.tsx:100`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Per the workspace-to-public migration plan (Phase 3), the breadcrumb should be moved to the top navbar area. It's currently rendered inside `<main>` as `<Breadcrumb className="mb-4" />`. This creates a visual disconnect where the breadcrumb is below the sidebar and navbar, reducing its utility as a navigation aid.
- **Concrete failure scenario**: A user navigates deep into a group's assignment page. The breadcrumb shows the path but it's not in the expected position (top navbar), causing momentary disorientation.
- **Suggested fix**: Move the breadcrumb into the `PublicHeader` component or the `SidebarInset` header area, above the main content but below the top navbar.

---

## Verified Safe

### VS1: Navigation architecture is correctly unified
- The `PublicHeader` component is now shared between public and dashboard layouts via `getPublicNavItems` and `getPublicNavActions`. The AppSidebar correctly filters items by capability and platform mode.

### VS2: Recruiting access caching is architecturally sound for RSC context
- The React `cache()` wrapper correctly deduplicates calls within a single RSC render. The limitation for API routes is documented in the code-reviewer findings.

### VS3: SSE connection tracking uses proper shared coordination for multi-instance deployments
- The `realtime-coordination.ts` module correctly implements PostgreSQL advisory locks for shared coordination and warns about single-instance deployments.
