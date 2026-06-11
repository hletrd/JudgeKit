# Cycle 6 Document Specialist Review

**Date:** 2026-04-20
**Base commit:** 528cdf29

## Findings

### DOC-1: `getDbNow()` JSDoc says "use instead of new Date()" but 4 server components still use `new Date()` [LOW/LOW]

**File:** `src/lib/db-time.ts:7-9`
**Description:** The JSDoc for `getDbNow()` states: "Use this instead of `new Date()` for temporal comparisons (expiry, deadline) in server components and API routes to avoid clock skew." However, 4 server component pages still use `new Date()` for temporal comparisons:
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:188`
- `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:159,187`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`
- `src/app/(dashboard)/dashboard/contests/page.tsx:95`

The documentation correctly describes the intended pattern, but the codebase hasn't fully adopted it.
**Fix:** Update the 4 pages to use `getDbNow()`, making the code match the documented pattern.
**Confidence:** LOW

## Verified Safe

- `getDbNow()` and `getDbNowUncached()` JSDoc documentation is accurate and comprehensive.
- The deferred items in the cycle-5 plan are properly documented with severity, reason, and exit criteria.
- Previous review findings have been properly addressed with matching code changes.
