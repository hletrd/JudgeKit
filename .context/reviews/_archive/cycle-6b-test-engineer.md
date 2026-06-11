# Test Engineer — Cycle 6b Deep Review

**Date:** 2026-04-19
**Base commit:** 64f02d4d

## Findings

### T1: No tests for tags GET route
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/tags/route.ts` — no corresponding test file
- **Issue:** The tags route had a LIKE escaping bug (fixed in cycle 5) that had no test coverage. While a LIKE escaping unit test was added in cycle 5 (TEST-08), there is still no route-level test verifying auth checks, pagination, and search behavior.
- **Fix:** Add route-level tests for: auth required, search with `q` parameter, limit parameter, empty query returns all tags.

### T2: No tests for files GET (list) route
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/files/route.ts` — only POST and DELETE are tested
- **Issue:** The files list endpoint has no test coverage. This route has pagination, filtering by category, search, and capability-based access control — all untested.
- **Fix:** Add tests for: capability check (files.manage vs files.upload), pagination, category filter, search, uploader-name join.

### T3: No tests for groups/[id]/assignments route
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/groups/[id]/assignments/route.ts` — no corresponding test file
- **Issue:** Both GET (list assignments) and POST (create assignment) are untested. The POST route has complex validation and permission checks.
- **Fix:** Add tests for: group access check, instructor-only creation, pagination, assignment problem validation.

### T4: No tests for PublicHeader dropdown role-based rendering
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Note:** This was identified as M5 in the rpf-cycle-5 plan and is still TODO.
- **File:** `src/components/layout/public-header.tsx`
- **Fix:** Add component tests for `getDropdownItems` with different roles (student, instructor, admin). Test desktop dropdown and mobile menu rendering.

### T5: No tests for users GET (list) route with role filter
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/users/route.ts`
- **Issue:** The users list endpoint has role filtering and pagination, but no route-level test.
- **Fix:** Add tests for: capability check, role filter validation, pagination.

### T6: No route-level tests for admin backup, restore, or migrate endpoints
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/admin/backup/route.ts`
  - `src/app/api/v1/admin/restore/route.ts`
  - `src/app/api/v1/admin/migrate/export/route.ts`
  - `src/app/api/v1/admin/migrate/import/route.ts`
  - `src/app/api/v1/admin/migrate/validate/route.ts`
- **Issue:** These destructive admin endpoints have no test coverage. Password re-confirmation, CSRF checks, and rate limiting are all untested.
- **Fix:** Add tests for: auth check, capability check (system.backup), password re-confirmation, invalid password, CSRF, rate limiting.
