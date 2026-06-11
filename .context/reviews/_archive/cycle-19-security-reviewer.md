# Cycle 19 Security Reviewer Findings

**Date:** 2026-04-19
**Reviewer:** OWASP top 10, secrets, unsafe patterns, auth/authz
**Base commit:** 301afe7f

---

## Findings

### F1: Admin migrate import route still discards `needsRehash` — bcrypt hashes persist for API-heavy admins

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:58,143`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: This is a partial carry-forward from cycle 18 (AGG-3). The backup and export routes now correctly handle `needsRehash`, but the import route (both form-data path at line 58 and JSON path at line 143) still destructure only `{ valid }` from `verifyPassword()`. While the import route is less frequently used, it presents the same missed rehash opportunity, and the inconsistency across routes makes it likely that a developer will assume all admin routes handle rehashing when they don't.
- **Concrete failure scenario**: An admin who only uses the API (e.g., automated CI/CD pipeline that imports test data) verifies their password via the import route. The `needsRehash` flag is discarded. If the admin never logs in through the main login page, their bcrypt hash is never upgraded.
- **Suggested fix**: Add `needsRehash` handling to both paths in the import route, matching the pattern used in backup and export routes.

### F2: `canAccessProblem` permission check is called per-submission in API routes without batching — potential for authorization bypass via timing

- **File**: `src/lib/auth/permissions.ts:107-145`, called from `src/app/api/v1/submissions/[id]/route.ts:42`, `src/app/api/v1/submissions/[id]/comments/route.ts:28,63`, `src/app/api/v1/submissions/[id]/rejudge/route.ts:30`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: Each submission endpoint calls `canAccessSubmission` which in turn may call `canViewAssignmentSubmissions` and `getRecruitingAccessContext`. For list endpoints, this creates a per-item permission check pattern. While there's no direct authorization bypass, the per-item query pattern means the response time reveals which items require more DB queries (items accessible via recruiting context vs. group enrollment). This is a very weak signal.
- **Concrete failure scenario**: Not practically exploitable. The timing difference is sub-millisecond and swamped by network jitter.
- **Suggested fix**: For list endpoints, batch the permission check using `getAccessibleProblemIds` or a similar set-based approach rather than checking per-item.

### F3: `isTrustedServerActionOrigin` falls back to `NODE_ENV !== "production"` when Origin is missing — allows untrusted origins in development

- **File**: `src/lib/security/server-actions.ts:26-27,29-30`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: When the `Origin` header is missing (which browsers always send for same-origin POST), the function returns `true` in development mode. This is a reasonable development convenience, but the comment doesn't explain the security implications. If a developer accidentally sets `NODE_ENV=development` in a staging or test environment, all server action origin checks are bypassed.
- **Concrete failure scenario**: A staging server is deployed with `NODE_ENV=development` for verbose logging. An attacker crafts a CSRF page that triggers server actions. Since `NODE_ENV=development`, the origin check passes regardless of the actual origin.
- **Suggested fix**: Add a warning log when the origin check is bypassed in development mode. Consider using a separate flag (e.g., `SKIP_ORIGIN_CHECK`) instead of relying on `NODE_ENV`.

---

## Verified Safe

### VS1: All server actions properly check `isTrustedServerActionOrigin`
- **Files**: All files in `src/lib/actions/*.ts`
- Every server action function checks `isTrustedServerActionOrigin()` before proceeding. No bypass gaps found.

### VS2: Password hashing is properly implemented with argon2id
- All password verification paths use `verifyPassword()` which correctly differentiates bcrypt and argon2 hashes. The main login flow and admin backup/export routes perform transparent rehashing.

### VS3: DOMPurify sanitization is properly configured
- `sanitizeHtml` uses strict allowlists, `ALLOW_DATA_ATTR: false`, and proper URI restrictions. The `sanitizeMarkdown` function correctly only strips control characters while preserving markdown formatting.

### VS4: SQL injection is prevented throughout
- All raw queries use parameterized placeholders (`@paramName`). No string interpolation of user input into SQL.

### VS5: CSRF protection is properly applied to all admin routes
- All admin routes check CSRF unless using API key auth. The `csrfForbidden` check is correctly placed before the capability check.

### VS6: Recruiting token redemption is properly atomic
- Uses SQL-level `NOW()` for expiry validation and atomic `UPDATE ... WHERE` for claim. No TOCTOU races.

### VS7: Rate limiting is properly applied to internal cleanup endpoint
- The endpoint now has both `CRON_SECRET` verification and rate limiting as defense-in-depth.
