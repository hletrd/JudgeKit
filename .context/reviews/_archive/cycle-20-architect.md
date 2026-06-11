# Cycle 20 Architect Findings

**Date:** 2026-04-19
**Reviewer:** Architectural/design risks, coupling, layering
**Base commit:** 95f06e5b

---

## Findings

### F1: ALS cache module violates "initialize before use" contract — architectural gap

- **File**: `src/lib/recruiting/request-cache.ts:67`, `src/lib/recruiting/access.ts:38,88`
- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: The `request-cache.ts` module exports `withRecruitingContextCache` but the access module (`access.ts`) that consumes the cache does not call it, nor does any middleware or handler. This is a "dangling abstraction" — the cache layer exists but is never wired into the request lifecycle. From an architectural perspective, this is worse than not having the cache at all, because:
  1. The codebase now has a false sense of security (developers see "ALS cache" in the code and assume it works)
  2. The `loadRecruitingAccessContext` function has dead code paths that always execute the same way
  3. The `withRecruitingContextCache` function is tested but never used in production
  
  The correct architectural pattern is to initialize the ALS store at the request entry point (middleware or API handler wrapper) so it's available to all downstream code without requiring each consumer to remember to set it up.
- **Suggested fix**: Wire `withRecruitingContextCache` into the API handler pipeline. The cleanest approach is to wrap the handler in `createApiHandler` with the ALS context. This ensures the cache is always available for API routes without requiring changes to individual route handlers.

### F2: `loadRecruitingAccessContext` has dual caching with inconsistent scoping — confusing for maintainers

- **File**: `src/lib/recruiting/access.ts:34-91`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The function implements a dual caching strategy (React `cache()` + ALS) but the ALS cache is never active (see F1). Even if it were active, the interaction between the two caches is subtle: React `cache()` deduplicates at the function call level, while ALS deduplicates at the request level. If both are active and a request makes two separate calls to `getRecruitingAccessContext`, React `cache()` returns the cached result on the second call, and the ALS cache is never checked. But if React's cache scope has expired (e.g., between RSC and API contexts), the ALS cache would be the fallback. This dual-cache interaction should be documented more explicitly.
- **Suggested fix**: Add a detailed comment in `loadRecruitingAccessContext` explaining the cache priority order and when each cache applies. When the ALS cache is wired in, add tests for the interaction between the two caches.

### F3: Dashboard layout still has separate sequential async blocks — can be consolidated

- **File**: `src/app/(dashboard)/layout.tsx:34-48,55-64`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The layout has two `Promise.all` blocks that could be partially consolidated. This is a carry-forward observation — the data dependencies allow some calls to be parallelized. See perf-reviewer F2 for details.
- **Suggested fix**: Merge independent async operations into the first `Promise.all` block.

---

## Verified Safe

### VS1: Breadcrumb moved to sticky header — good architectural move
- **File**: `src/app/(dashboard)/layout.tsx:99-101`
- Moving the breadcrumb from `<main>` to a sticky `<header>` within `SidebarInset` is architecturally correct. It keeps the breadcrumb visible while scrolling and aligns with the workspace-to-public migration plan Phase 3.
