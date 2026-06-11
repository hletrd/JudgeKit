# Cycle 20 Security Reviewer Findings

**Date:** 2026-04-19
**Reviewer:** OWASP top 10, secrets, unsafe patterns, auth/authz
**Base commit:** 95f06e5b

---

## Findings

### F1: ALS cache never initialized — recruiting access context not cached in API routes (security-adjacent performance issue)

- **File**: `src/lib/recruiting/request-cache.ts:67`, `src/lib/recruiting/access.ts:38,88`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The `withRecruitingContextCache` function is defined but never called. Without initialization, the AsyncLocalStorage store is never active, so `getCachedRecruitingContext` always returns `undefined` and `setCachedRecruitingContext` silently no-ops. This means the ALS cache intended to protect API routes from N+1 DB queries on permission checks is completely non-functional. While primarily a performance issue, excessive DB load from redundant permission queries can create a denial-of-service amplification vector: an attacker who triggers many parallel API requests that each perform N+1 permission checks can overwhelm the database connection pool more easily than if the queries were properly deduplicated.
- **Concrete failure scenario**: An attacker sends 50 concurrent requests to the community threads API, each triggering `canAccessProblem` which hits the DB for recruiting context. With 50 concurrent connections and 2+ queries per check, this generates 100+ simultaneous DB queries. With the ALS cache working, it would be 50 queries (one per request context). The difference matters under load.
- **Suggested fix**: Same as code-reviewer F1 — initialize the ALS store in the API handler middleware.

### F2: `isTrustedServerActionOrigin` dev bypass does not log the actual request origin

- **File**: `src/lib/security/server-actions.ts:26-28`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: When the origin check is bypassed in development mode (missing Origin header or no trusted hosts configured), the warning log does not include the actual request origin. While `originHost` is logged on line 34 for the "no trusted hosts" case, it's `null` in the missing-origin case (line 26-28). Adding the request URL or host header would help developers identify misconfigured requests.
- **Concrete failure scenario**: A developer sees the warning "[server-actions] Origin header missing — bypassing origin check" in logs but cannot tell which request triggered it. Without the request URL, it's harder to diagnose whether a specific component is failing to send the Origin header.
- **Suggested fix**: Include the request URL or host header in the warning log for the missing-origin case. Since `isTrustedServerActionOrigin` is a server action, it can access `headers()` to log the host.

### F3: Admin import route body can exceed memory before rate limit check (carry-forward)

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:39-41`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: In the form-data path, `request.formData()` is called at line 40 before the file size is checked at line 80. While `readUploadedJsonFileWithLimit` enforces the byte limit during streaming, `request.formData()` buffers the entire upload into memory before the file reference is extracted. For a file just under 100MB, this means the entire payload is in memory before any size check.
- **Concrete failure scenario**: An attacker sends a 99MB multipart form upload. The `request.formData()` call buffers the entire payload in memory. Then the size check at line 80 passes (under 100MB limit), and the JSON is parsed. If 10 concurrent uploads happen, ~1GB of memory is consumed.
- **Suggested fix**: This is a known limitation of Next.js's `request.formData()`. The fix would require streaming the file upload with a size limit, which is complex. Defer unless production issues arise.

---

## Verified Safe

### VS1: `needsRehash` handling correctly added to admin import and restore routes
- AGG-2 from cycle 19 is properly fixed. Both routes correctly destructure `needsRehash`, check it, and rehash with error handling.

### VS2: Server action origin bypass now logs warnings
- AGG-4 from cycle 19 is fixed. Warnings are emitted when the origin check is bypassed in dev mode.
