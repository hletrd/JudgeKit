# Cycle 20 Performance Reviewer Findings

**Date:** 2026-04-19
**Reviewer:** Performance, concurrency, CPU/memory/UI responsiveness
**Base commit:** 95f06e5b

---

## Findings

### F1: ALS recruiting cache is dead code — N+1 DB queries in API routes persist

- **File**: `src/lib/recruiting/request-cache.ts:67`, `src/lib/recruiting/access.ts:38,88`
- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: Same root cause as code-reviewer F1. The `withRecruitingContextCache` function is never called, so the AsyncLocalStorage-based cache is never active. The `loadRecruitingAccessContext` function calls `getCachedRecruitingContext` (always returns undefined) and `setCachedRecruitingContext` (always no-ops). The only effective cache is React `cache()`, which does not work in API route handlers. This means every `canAccessProblem` call from an API route triggers 2 fresh DB queries for the recruiting context. The performance fix from cycle 19 (commit a5628451) is non-functional.
- **Concrete failure scenario**: The community threads API calls `canAccessProblem` per thread. For 20 threads, that's 40 redundant DB queries for recruiting context data.
- **Suggested fix**: Initialize the ALS store in `createApiHandler` middleware or Next.js middleware.

### F2: Dashboard layout makes two sequential `await Promise.all` blocks — can be parallelized

- **File**: `src/app/(dashboard)/layout.tsx:34-48,55-64`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The dashboard layout has two sequential `Promise.all` blocks. The first (line 34-48) resolves `getRecruitingAccessContext`, translations, and capabilities. The second (line 55-64) resolves system settings, lecture mode check, and active timed assignments. The second block depends on `canBypassTimedAssignmentPanel` which depends on `capabilities` from the first block, and `session.user.role` / `session.user.id` which are available from the start. However, `getResolvedSystemSettings` and `isInstructorOrAboveAsync` do not depend on the first block's results — they could be moved to the first `Promise.all`.
- **Concrete failure scenario**: Each sequential block adds ~50-100ms of latency. If the two independent calls were parallelized, the layout would render 50-100ms faster.
- **Suggested fix**: Move `getResolvedSystemSettings` and `isInstructorOrAboveAsync` into the first `Promise.all` block since they don't depend on its results. Keep the `getActiveTimedAssignmentsForSidebar` call in the second block since it depends on `canBypassTimedAssignmentPanel`.

---

## Verified Safe

### VS1: Breadcrumb sticky header does not add significant layout shift
- **File**: `src/app/(dashboard)/layout.tsx:99-101`
- The sticky header with backdrop-blur uses `top-0` which anchors to the viewport. No CLS concern since it's a fixed-height element.

### VS2: React `cache()` correctly wraps `getRecruitingAccessContext`
- **File**: `src/lib/recruiting/access.ts:102-108`
- The `cache()` wrapper is correctly applied and will deduplicate within RSC renders. The issue is only with API routes where ALS is not initialized.
