# Cycle 19 Critic Findings

**Date:** 2026-04-19
**Reviewer:** Multi-perspective critique of the whole change surface
**Base commit:** 301afe7f

---

## Findings

### F1: React `cache()` is an incomplete solution for `getRecruitingAccessContext` — API routes are the primary callers

- **File**: `src/lib/recruiting/access.ts:79-85`, `src/lib/auth/permissions.ts`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The `cache()` fix for `getRecruitingAccessContext` was the right approach for RSC renders, but it doesn't address the primary use case: API route handlers that check permissions. Looking at the call sites, the permission functions (`canAccessGroup`, `canAccessProblem`, `canAccessSubmission`) are called from API routes more frequently than from RSC pages. The `cache()` wrapper provides no benefit in the API route context. This means the N+1 problem identified in cycle 18 is only partially fixed — it's fixed for dashboard page loads but not for API endpoints that check permissions per-item.
- **Concrete failure scenario**: The submissions list API endpoint checks `canAccessSubmission` for each returned row. For a user with recruiting access, each check triggers 2 fresh DB queries. The `cache()` wrapper provides no caching in this context. The performance improvement from cycle 18b doesn't apply here.
- **Suggested fix**: Implement a request-scoped cache that works in both RSC and API contexts. `AsyncLocalStorage` is the standard Node.js approach for per-request state that works across both contexts.

### F2: Incomplete `needsRehash` coverage creates false sense of security

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:58,143`, `src/app/api/v1/admin/restore/route.ts:56`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The `needsRehash` handling was added to backup and export routes in cycle 18b, but import and restore routes still discard it. This creates an inconsistent security posture where some admin routes migrate bcrypt hashes and others don't. A security auditor reviewing the codebase would see the `needsRehash` handling in backup/export and assume all admin routes handle it, which is incorrect.
- **Concrete failure scenario**: A security audit flags that all admin routes should handle `needsRehash`. The auditor sees that backup and export routes do, and marks the item as complete. The import and restore routes are missed, and the bcrypt-to-argon2 migration stalls for admins who use those routes.
- **Suggested fix**: Add `needsRehash` handling to all four admin data-management routes. The code is trivial (6 lines per route) and the inconsistency is the real risk.

---

## Verified Safe

### VS1: Navigation unification is well-executed
- The shared `getPublicNavItems`/`getPublicNavActions` module and `PublicHeader` usage across both layouts is a clean pattern.

### VS2: Korean letter spacing compliance is correctly handled
- Both `AppSidebar` (line 269) and `PublicHeader` (line 328) correctly skip `tracking-wider`/`tracking-wide` for Korean locale.
