# Cycle 20 Verifier Findings

**Date:** 2026-04-19
**Reviewer:** Evidence-based correctness check against stated behavior
**Base commit:** 95f06e5b

---

## Findings

### F1: ALS cache is never activated — `withRecruitingContextCache` has zero production callers

- **File**: `src/lib/recruiting/request-cache.ts:67`
- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: Verified by grep: `withRecruitingContextCache` appears only in its own definition (request-cache.ts:67) and in the test file (request-cache.test.ts). It is never imported or called by any production code. The test suite creates a false passing signal because it manually calls `withRecruitingContextCache` to set up the ALS context. In production, the cache is never active.
- **Evidence**: 
  - `grep -rn "withRecruitingContextCache" src/` returns only `src/lib/recruiting/request-cache.ts:67`
  - `setCachedRecruitingContext` checks `const store = recruitingContextStore.getStore()` at line 51 — without `withRecruitingContextCache.run()`, `getStore()` always returns `undefined`, so the `if (store)` guard at line 52 always fails
  - `getCachedRecruitingContext` checks `const store = recruitingContextStore.getStore()` at line 33 — same issue, always `undefined`
- **Suggested fix**: Wire `withRecruitingContextCache` into `createApiHandler` in `src/lib/api/handler.ts`.

---

## Verified Safe

### VS1: `needsRehash` handling verified correct in import and restore routes
- **Files**: `src/app/api/v1/admin/migrate/import/route.ts:58-75,157-174`, `src/app/api/v1/admin/restore/route.ts:56-73`
- Both paths correctly destructure `needsRehash`, check it, and rehash on success. Error handling wraps the rehash in try/catch. Pattern is consistent with backup and export routes.

### VS2: `SafeUserRow` type verified correct
- **File**: `src/app/api/v1/users/route.ts:90`
- The `SafeUserRow` type alias matches the return type of `safeUserSelect`. The `let created: SafeUserRow | undefined` declaration is type-safe.

### VS3: Mobile menu focus restoration verified
- **File**: `src/components/layout/public-header.tsx:123-127`
- The route-change effect correctly restores focus to `toggleRef.current` via `requestAnimationFrame`. The cleanup function cancels the animation frame.

### VS4: Breadcrumb sticky header verified
- **File**: `src/app/(dashboard)/layout.tsx:99-101`
- The breadcrumb is in a sticky header with `top-0 z-10` and backdrop-blur. The `px-6 py-3` padding matches the main content area.
