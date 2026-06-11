# Code Reviewer — Cycle 6b Deep Review

**Date:** 2026-04-19
**Base commit:** 64f02d4d

## Findings

### F1: 12 API routes still use manual `getApiUser` pattern instead of `createApiHandler`
- **Severity:** LOW
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/tags/route.ts`
  - `src/app/api/v1/submissions/[id]/events/route.ts`
  - `src/app/api/v1/admin/migrate/export/route.ts`
  - `src/app/api/v1/admin/backup/route.ts`
  - `src/app/api/v1/files/[id]/route.ts`
  - `src/app/api/v1/files/route.ts` (POST only; GET uses createApiHandler)
  - `src/app/api/v1/admin/migrate/import/route.ts`
  - `src/app/api/v1/admin/migrate/validate/route.ts`
  - `src/app/api/v1/admin/restore/route.ts`
  - `src/app/api/v1/groups/[id]/assignments/route.ts` (both GET and POST)
  - `src/app/api/metrics/route.ts`
  - `src/app/api/health/route.ts`
- **Issue:** These routes manually call `getApiUser`, `csrfForbidden`, `consumeApiRateLimit` instead of using the standardized `createApiHandler` wrapper. This creates inconsistency and risks missing CSRF or rate-limit checks.
- **Notes:** SSE route (`events/route.ts`) and file upload routes have legitimate reasons for manual handling (streaming, formData). Health/metrics may be intentional. The backup/restore/migrate and tags routes should be migrated.
- **Fix:** Migrate routes that can use `createApiHandler`. Keep SSE, file-upload, and health/metrics routes as manual exceptions with comments.

### F2: Files GET route uses dual-query pagination instead of COUNT(*) OVER()
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/files/route.ts:162-186`
- **Issue:** Separate `count(*)` query and data query. Same pattern fixed for rankings (RANK-01), chat-logs (CHAT-LOG-01), and admin submissions export in prior cycles. Inconsistent with the project trend toward window-function pagination.
- **Fix:** Use `COUNT(*) OVER()` in the data query.

### F3: Users GET route uses dual-query pagination instead of COUNT(*) OVER()
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/users/route.ts:38-51`
- **Issue:** Same as F2 — separate count and data queries.
- **Fix:** Use `COUNT(*) OVER()` in the data query.

### F4: Groups/[id]/assignments GET route uses dual-query pagination
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/groups/[id]/assignments/route.ts:45-67`
- **Issue:** Same pattern as F2/F3.
- **Fix:** Use `COUNT(*) OVER()` in the data query.

### F5: Files GET route `countResult.count` is `sql<number>` but may be returned as string
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/files/route.ts:188`
- **Issue:** `countResult.count` from `sql<number>\`count(*)\`` can be returned as a string by Drizzle/PG. `apiPaginated` expects a number. The `users/route.ts` correctly wraps with `Number()`. Files route passes it raw.
- **Fix:** Wrap with `Number(countResult.count)` to match the pattern in users route.

### F6: `escapeCsvField` applied to numeric values in group assignment export
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:72`
- **Issue:** `String(score)` converts null-safe score to string, then `.map(escapeCsvField)` re-escapes it. While functionally correct (escapeCsvField on a number string is a no-op), it's semantically misleading — the escape is for CSV injection which only matters for user-provided strings. Numbers are inherently safe.
- **Fix:** Not critical. Consider applying `escapeCsvField` only to string columns for clarity.
