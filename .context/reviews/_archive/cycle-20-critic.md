# Cycle 20 Critic Findings

**Date:** 2026-04-19
**Reviewer:** Multi-perspective critique of the whole change surface
**Base commit:** 95f06e5b

---

## Findings

### F1: Cycle 19 ALS cache fix is completely non-functional — the most critical fix from last cycle is dead code

- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: The most impactful fix from cycle 19 was the addition of AsyncLocalStorage caching for `getRecruitingAccessContext` in API routes (commit a5628451). However, `withRecruitingContextCache` is never called anywhere, so the ALS store is never initialized. This means the cache tests pass (they manually call `withRecruitingContextCache`), but the production code never activates the store. The fix is an illusion — the N+1 query problem from AGG-1 (cycle 19) persists in production.
- **Concrete failure scenario**: Production API routes continue to hit the database for recruiting access context on every `canAccessProblem` call. The cycle 19 commit gave a false sense of resolution.
- **Suggested fix**: Wire `withRecruitingContextCache` into the API handler pipeline immediately.

### F2: Admin route DRY violations persist across 3 cycles — tech debt accumulating

- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The admin import route DRY violation (AGG-4 from cycle 18, AGG-4(c18b), and now carried forward) has been deferred across multiple cycles. While the `needsRehash` handling was correctly added to both paths, the underlying duplication remains. Each time a new security fix is needed for these routes, developers must remember to apply it to both the form-data and JSON paths. This is exactly the risk the original finding identified.
- **Suggested fix**: Prioritize extracting the shared logic into a helper function in the next cycle.

---

## Verified Safe

### VS1: Cycle 19 fixes for needsRehash, any type, mobile focus, origin bypass, and breadcrumb are all correctly implemented
- All five AGG items from cycle 19 that were marked as fixed are verified as correctly implemented.
