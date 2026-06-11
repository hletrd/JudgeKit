# Cycle 20 Code Reviewer Findings

**Date:** 2026-04-19
**Reviewer:** Code quality, logic, SOLID, maintainability
**Base commit:** 95f06e5b

---

## Findings

### F1: `withRecruitingContextCache` is never called — ALS cache is dead code

- **File**: `src/lib/recruiting/request-cache.ts:67`, `src/lib/recruiting/access.ts:7,38,50,88`
- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: The `withRecruitingContextCache` function was added in cycle 19 to provide per-request caching for API routes via `AsyncLocalStorage`. However, it is never called from anywhere in the codebase. Without calling `withRecruitingContextCache` to initialize the ALS store, `recruitingContextStore.getStore()` always returns `undefined`, which means:
  - `getCachedRecruitingContext()` always returns `undefined` (line 33-34 of request-cache.ts)
  - `setCachedRecruitingContext()` silently does nothing (line 51-55 — the `if (store)` guard fails)
  
  The result is that the entire ALS caching layer is dead code. `loadRecruitingAccessContext` in access.ts calls `getCachedRecruitingContext` and `setCachedRecruitingContext`, but they are no-ops. Only React `cache()` provides actual deduplication, and it only works within RSC renders, not in API routes. This means AGG-1 from the cycle 19 aggregate (N+1 DB queries in API routes) is NOT actually fixed.
- **Concrete failure scenario**: An API route handler calls `canAccessProblem` for each item in a list of 20 problems. Each call triggers `getRecruitingAccessContext`, which calls `loadRecruitingAccessContext`. The ALS cache check at line 38 always returns `undefined`, and the ALS cache write at line 88 always silently fails. This results in 40+ redundant DB queries for the recruiting context data — the exact problem the ALS cache was supposed to solve.
- **Suggested fix**: Initialize the ALS store in the request lifecycle. Options:
  1. Add `withRecruitingContextCache` wrapper to the API handler middleware (`createApiHandler` in `src/lib/api/handler.ts`)
  2. Add it to Next.js middleware (`src/middleware.ts`)
  3. Use Next.js's built-in ALS context which is automatically available per-request (but needs a different initialization pattern)

### F2: `updateRecruitingInvitation` still uses `Record<string, unknown>` — carry-forward from AGG-3

- **File**: `src/lib/assignments/recruiting-invitations.ts:193`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Carry-forward. The function builds updates as `Record<string, unknown>`, bypassing Drizzle's type checking. This was identified as AGG-3 in cycle 19 but not yet fixed.
- **Suggested fix**: Use `Partial<typeof recruitingInvitations.$inferInsert>` or `withUpdatedAt()` pattern.

### F3: Admin import route still has DRY violation between form-data and JSON paths — carry-forward from AGG-4(c18)

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:38-111,113-188`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Carry-forward. The import route has two nearly identical code paths for form-data and JSON. The `needsRehash` handling was added to both paths in cycle 19, but the underlying DRY violation remains.
- **Suggested fix**: Extract common logic into a shared helper function.

---

## Verified Safe (No Issue)

### VS1: `needsRehash` handling correctly added to import and restore routes
- **Files**: `src/app/api/v1/admin/migrate/import/route.ts:58-75,157-174`, `src/app/api/v1/admin/restore/route.ts:56-73`
- Both routes properly destructure `needsRehash`, check it, and rehash on success with error handling. AGG-2 from cycle 19 is correctly fixed.

### VS2: `any` type removed from users route
- **File**: `src/app/api/v1/users/route.ts:90-91`
- The `let created: any` has been replaced with a properly typed `SafeUserRow`. AGG-9 from cycle 19 is correctly fixed.

### VS3: Mobile menu focus restoration correctly implemented
- **File**: `src/components/layout/public-header.tsx:123-127`
- The route-change effect now restores focus to `toggleRef.current` via `requestAnimationFrame`. AGG-7 from cycle 19 is correctly fixed.

### VS4: Server action origin bypass warning correctly added
- **File**: `src/lib/security/server-actions.ts:26-28,33-35`
- Warning logs are emitted when the origin check is bypassed in development mode. AGG-4 from cycle 19 is correctly fixed.

### VS5: Breadcrumb correctly moved to sticky header
- **File**: `src/app/(dashboard)/layout.tsx:99-101`
- The breadcrumb is now in a sticky header above main content with proper backdrop-blur styling. AGG-6 from cycle 19 is correctly fixed.
