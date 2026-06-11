# Architect — Cycle 6b Deep Review

**Date:** 2026-04-19
**Base commit:** 64f02d4d

## Findings

### A1: Inconsistent route handler patterns — 12 routes bypass createApiHandler
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:** See code-reviewer F1 for the full list.
- **Issue:** The `createApiHandler` wrapper was introduced to centralize auth, CSRF, rate limiting, body parsing, and error handling. However, 12 routes still use the manual `getApiUser` + `csrfForbidden` pattern. This creates maintenance burden and inconsistency. New developers may copy the manual pattern instead of using the wrapper.
- **Fix:** Establish a convention: all new routes must use `createApiHandler`. Migrate existing manual routes incrementally, prioritizing admin routes (backup/restore/migrate) for the security benefits.

### A2: PublicHeader `loggedInUser` prop passes `role` as a plain string
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/public-header.tsx:36-42`
- **Issue:** `loggedInUser.role` is typed as `string | undefined` and used in `getDropdownItems` with string comparison (`role === "instructor"`, etc.). If the `UserRole` type is refactored (e.g., adding new roles), the string comparisons won't catch it at compile time.
- **Fix:** Type `loggedInUser.role` as `UserRole` and use the `isInstructor`/`isAdmin` helper pattern from `@/lib/security/constants` or `@/lib/auth/role-helpers`.

### A3: Proxy matcher gaps — missing `/users/:path*` and `/problem-sets/:path*`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/proxy.ts:306-324`
- **Issue:** The middleware matcher does not include `/users/:path*` or `/problem-sets/:path*`. These are public routes that should receive CSP headers, nonce injection, and locale resolution. Without the matcher, these pages skip all middleware processing.
- **Fix:** Add the missing patterns to `config.matcher`.

### A4: Contest export route uses raw SQL queries alongside Drizzle ORM
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:39-77`
- **Issue:** The contest export route uses `rawQueryOne` and `rawQueryAll` for its data fetching, while the rest of the codebase uses Drizzle ORM. This creates two different query patterns in the same codebase. The raw SQL is used because of complex JOIN/aggregation needs, but Drizzle supports those.
- **Fix:** Consider migrating to Drizzle's relational query API. Low priority since the raw queries work correctly and are well-structured.

### A5: No shared utility for CSV export + row cap pattern
- **Severity:** LOW
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/contests/[assignmentId]/export/route.ts:14`
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:14`
  - `src/app/api/v1/admin/submissions/export/route.ts`
- **Issue:** All three CSV export routes duplicate the same pattern: `MAX_EXPORT_ROWS = 10_000`, truncation check, BOM prefix, truncation indicator. This should be a shared utility.
- **Fix:** Extract a shared `exportCsv({ headers, rows, maxRows })` utility.
