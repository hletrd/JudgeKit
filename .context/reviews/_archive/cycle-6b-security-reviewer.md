# Security Reviewer — Cycle 6b Deep Review

**Date:** 2026-04-19
**Base commit:** 64f02d4d

## Findings

### S1: Admin backup/restore/migrate routes lack `createApiHandler` consistency — CSRF bypass risk for cookie-authenticated callers
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/admin/backup/route.ts`
  - `src/app/api/v1/admin/restore/route.ts`
  - `src/app/api/v1/admin/migrate/export/route.ts`
  - `src/app/api/v1/admin/migrate/import/route.ts`
  - `src/app/api/v1/admin/migrate/validate/route.ts`
- **Issue:** These routes manually implement CSRF checks with the `isApiKeyAuth` pattern. While the current implementation is correct, it duplicates the CSRF logic that `createApiHandler` already provides. The risk is that a future developer adding a new admin route might forget the manual CSRF check. The `createApiHandler` wrapper centralizes this.
- **Fix:** Migrate these routes to `createApiHandler`. The formData-based routes (restore, migrate/import) need special handling for body parsing.

### S2: Tags route has no CSRF check and no rate limiting
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/tags/route.ts`
- **Issue:** Tags route uses `getApiUser` manually with no `csrfForbidden` check and no `consumeApiRateLimit`. While GET routes don't require CSRF by convention, this route also has no rate limiting. An attacker could make rapid requests to enumerate tags.
- **Fix:** Either migrate to `createApiHandler` (adds CSRF check for mutations automatically) or add rate limiting manually.

### S3: Proxy matcher does not cover `/users/:id*` public profile routes
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/proxy.ts:306-324`
- **Issue:** The proxy matcher covers `/`, `/control/:path*`, `/dashboard/:path*`, `/practice/:path*`, etc. but does NOT include `/users/:id*` or `/problem-sets/:id*`. Public user profiles at `/users/[id]` bypass the middleware entirely, so they don't get nonce injection, CSP headers, or locale resolution.
- **Fix:** Add `/users/:path*` and `/problem-sets/:path*` to the matcher config.

### S4: Files GET route returns full `select()` from files table (includes all columns)
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/files/[id]/route.ts:71-75`
- **Issue:** `db.select().from(files).where(eq(files.id, id))` returns ALL columns including potentially sensitive metadata. While this is a single-file lookup (not a list), it still loads columns like `problemId`, `uploadedBy` that are used for access control but don't need to be in the response body.
- **Fix:** Add explicit column selection, keeping only the columns needed for the response + access control check.

### S5: `new Date()` clock skew risk in critical operations
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Files:** Multiple files use `new Date()` for timestamps in database operations (submissions, exam sessions, etc.)
- **Issue:** In distributed deployments with unsynchronized application-server clocks, `new Date()` on the Node.js process may differ from PostgreSQL's `now()`. This could cause subtle ordering issues for exam deadlines or submission timestamps.
- **Fix:** For critical operations (exam deadlines, submission ordering), use PostgreSQL `now()` instead of `new Date()`.
