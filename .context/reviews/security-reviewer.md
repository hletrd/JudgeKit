# Security Review — Cycle 1 (New Session)

**Reviewer:** security-reviewer
**Date:** 2026-04-28
**Scope:** Full repository security posture, auth, data access, API routes

---

## Findings

### SEC-1: [MEDIUM] DB import error messages leak PostgreSQL internals to API responses

**File:** `src/lib/db/import.ts:134,198,214`
**Confidence:** HIGH

When table truncation or batch insert fails, `err.message` (PostgreSQL internal errors including table names, constraint names, column types) is included in error strings that propagate through `importDatabase` result to the API response at `route.ts:108` (`details: result.errors`).

**Failure scenario:** An admin triggers a database import with a schema-mismatched file. The API response includes PostgreSQL error text like `violates foreign key constraint "fk_submissions_problem_id" on table "submissions"`, revealing the internal schema to anyone with admin access. While admin-only, this is defense-in-depth — the error details could be logged by browser extensions, CDN logging, or admin tools.

**Fix:** Sanitize error messages before including in `result.errors`. Use generic messages for API responses; log detailed errors server-side only.

---

### SEC-2: [MEDIUM] `error.message` control-flow discrimination leaks control-path information

**Files:** Multiple API route files
**Confidence:** MEDIUM

When `error.message` strings like `"emailAlreadyInvited"`, `"assignmentDeleteBlocked"`, etc. are returned as API error responses (e.g., `return apiError(error.message, 409)` at `route.ts:196`), the error messages are internal code identifiers being surfaced to the client. While these are not directly exploitable, they reveal internal application structure and state transitions.

**Fix:** Use error code enums that are explicitly designed for API responses, separate from internal error messages.

---

### SEC-3: [LOW] Import route JSON body path is deprecated but still functional — no rate limit distinction

**File:** `src/app/api/v1/admin/migrate/import/route.ts:120-199`
**Confidence:** LOW

The JSON body import path is marked deprecated with a `logger.warn` and `Deprecation`/`Sunset` headers, but it remains fully functional with the same rate limit as the multipart path. Since this path includes the password in the JSON body (which may be logged by middleware or reverse proxies), a malicious or misconfigured admin client could continue using this path indefinitely.

**Fix:** Consider adding a stricter rate limit or request count cap for the deprecated JSON body path, or disable it entirely after the sunset date.

---

### SEC-4: [INFO] Auth configuration is solid

**File:** `src/lib/auth/config.ts`

Verified:
- Dummy password hash for timing-safe comparison on non-existent users (prevents user enumeration)
- Rate limiting on both IP and username for login attempts
- Argon2id for password hashing with automatic rehashing
- Token invalidation check on every JWT refresh
- Auth secret minimum length validation (32 chars)
- Judge auth token minimum length validation (32 chars)
- Secure cookie detection based on AUTH_URL scheme
- CSRF protection with API key exemption

No new security issues found in the auth flow.

---

### SEC-5: [INFO] Anti-cheat monitor no longer captures text content

**File:** `src/components/exam/anti-cheat-monitor.tsx:207-228`

Verified that the `describeElement` function intentionally omits text content capture (lines 219-220 comment). This resolves the previous concern about copyrighted exam problem text being stored in audit logs.

---

## Previously Deferred Items Re-verified

- DEFER-22: `.json()` before `response.ok` — Still present in client code. No change.
- DEFER-27: Missing AbortController on polling fetches — Contest detail page does not use polling; no new instances found.
- DEFER-28: `as { error?: string }` pattern — Still present in client code. No change.
- DEFER-29: Admin routes bypass `createApiHandler` — Still present. No change.
- DEFER-30: Recruiting validate token brute-force — No change.
