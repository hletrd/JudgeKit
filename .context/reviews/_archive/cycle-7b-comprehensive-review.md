# Cycle 7b Comprehensive Deep Code Review

**Date:** 2026-04-19
**Base commit:** a224e229
**Reviewer:** Multi-perspective deep review (code quality, security, performance, architecture, test coverage, UI/UX)

---

## F1 — PublicHeader `loggedInUser.role` typed as `string` instead of `UserRole`
- **File:** `src/components/layout/public-header.tsx:40`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Type safety
- **Evidence:** `loggedInUser` prop has `role?: string` — the comparisons on line 50-51 (`role === "instructor"`, `role === "admin"`) work today but lose type-safety. If a new role is added and a developer forgets to update this component, the nav silently omits items.
- **Suggested fix:** Change `role?: string` to `role?: UserRole` and import the type. Add a `getDropdownItems` unit test that verifies expected items per role.

## F2 — Backup/restore routes still use manual auth + CSRF pattern
- **Files:** `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/export/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/migrate/validate/route.ts`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Code consistency / security hygiene
- **Evidence:** These routes manually call `getApiUser` + `csrfForbidden` + `consumeApiRateLimit`. The `createApiHandler` wrapper would centralize all of these. The backup and restore routes have a legitimate reason to stay manual (password re-confirmation, file streaming), but migrate/export and migrate/validate are standard JSON endpoints.
- **Suggested fix:** Migrate `migrate/export`, `migrate/import`, and `migrate/validate` to `createApiHandler`. Keep backup/restore as documented exceptions.

## F3 — `files/[id]/route.ts` uses manual auth pattern for DELETE and PATCH
- **File:** `src/app/api/v1/files/[id]/route.ts`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Code consistency
- **Evidence:** Lines 66, 135 call `getApiUser(request)` directly instead of using `createApiHandler`. The GET handler was migrated in a prior cycle but DELETE and PATCH were not.
- **Suggested fix:** Wrap DELETE and PATCH in `createApiHandler`.

## F4 — `groups/[id]/assignments/route.ts` still uses dual-query pagination
- **File:** `src/app/api/v1/groups/[id]/assignments/route.ts:45-67`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Performance
- **Evidence:** Uses separate `db.select({ count: ... })` + `db.select(...)` pattern. Other routes (submissions, files) were already migrated to `COUNT(*) OVER()`.
- **Suggested fix:** Collapse to single query with `count(*) over()`.

## F5 — SSE submission events route capability check incomplete for custom roles
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:182`
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Category:** Security / authorization
- **Evidence:** The route calls `getApiUser(request)` and checks `user.id === submission.userId` or admin/instructor role, but does not go through `resolveCapabilities`. If a custom role has been granted `submissions.view` but not the built-in instructor level, they would be denied access to the SSE stream even though they can see the static submission detail page.
- **Suggested fix:** Add `resolveCapabilities` check for `submissions.view` or `submissions.view_all` in the SSE authorization logic, consistent with the main submission GET route.

## F6 — `src/lib/assignments/exam-sessions.ts:startExamSession` deadline uses `new Date()` which can be stale
- **File:** `src/lib/assignments/exam-sessions.ts:49-57`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Correctness
- **Evidence:** The `assignment.deadline` check on line 55 uses `new Date()` which can be stale by the time the transaction commits, especially under load. This is a minor fairness concern, not a data integrity bug. The `onConflictDoNothing` + re-fetch pattern is correctly idempotent.
- **Suggested fix:** Document the design decision. If stricter enforcement is needed, add a database-level check constraint.

## F7 — `src/lib/compiler/execute.ts` workspace directory mode 0o770 may not be accessible by uid 65534
- **File:** `src/lib/compiler/execute.ts:635`
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Category:** Correctness / deployment
- **Evidence:** `chmod(workspaceDir, 0o770)` gives rwx to owner and group, but the Docker container runs as `--user 65534:65534`. The workspace dir is created by the Node.js process (likely running as root or a different user in Docker). If the group doesn't include 65534, the sandbox user can't read/write the workspace. The source file chmod on line 643 uses 0o644 which allows "other" read, but not write. In Docker-in-Docker setups where the host process runs as root, this works because 65534 falls into "other". But if the host runs as a non-root user, 65534 may not be in the group, and 0o770 would block access while 0o644 would allow read-only.
- **Suggested fix:** Use `0o777` for the workspace directory and `0o666` for the source file, or more precisely, ensure the Docker user (65534) can access the workspace by setting appropriate ownership via `chown` or using `0o755`/`0o644`. This is a deployment-safety improvement.

## F8 — Export streaming uses `setTimeout(resolve, 10)` busy-wait for backpressure
- **File:** `src/lib/db/export.ts:32-43`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Performance
- **Evidence:** `waitForReadableStreamDemand` polls every 10ms when `desiredSize <= 0`. For large exports with a slow consumer, this creates unnecessary wakeups. However, exports are admin-only and infrequent.
- **Suggested fix:** Consider using a TransformStream with a HighWaterMark or a condition variable pattern. Low priority since exports are rare.

## F9 — SSE re-auth endpoint lacks rate limiting
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:310`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Category:** Security
- **Evidence:** The re-authentication endpoint at line 310 calls `getApiUser(request)` for password re-confirmation but does not consume a rate limit. A malicious user could rapidly re-auth to test passwords.
- **Suggested fix:** Add `consumeApiRateLimit(request, "submission:reauth")` before the password verification.

## F10 — No explicit `Cache-Control` on API responses via `createApiHandler`
- **Files:** All routes using `createApiHandler`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Security / caching
- **Evidence:** API responses don't include `Cache-Control: no-store` headers. If a reverse proxy or CDN is misconfigured, authenticated data could be cached and served to other users. The proxy.ts middleware sets CSP and HSTS but not Cache-Control for API routes.
- **Suggested fix:** Add `Cache-Control: no-store` to the default response headers in `createApiHandler`.

## F11 — Divergent exponential backoff formulas in rate-limit module
- **File:** `src/lib/security/rate-limit.ts:153` vs `src/lib/security/rate-limit.ts:193`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Correctness
- **Evidence:** `consumeRateLimitAttemptMulti` uses `Math.pow(2, Math.min(consecutiveBlocks - 1, 5))` (line 154), while `recordRateLimitFailure` uses `Math.pow(2, Math.min(consecutiveBlocks, 4))` (line 194). The cap is 2^5=32x vs 2^4=16x. These two code paths may produce different block durations for the same number of consecutive blocks.
- **Suggested fix:** Unify the formula. Determine which behavior is intended and use a shared helper function.

## F12 — `src/lib/db/export.ts:ALWAYS_REDACT` only redacts `passwordHash` but not API key `encryptedKey`
- **File:** `src/lib/db/export.ts:249-251`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** Security
- **Evidence:** Full-fidelity backup exports redact `passwordHash` (ALWAYS_REDACT) but include `encryptedKey` in the `apiKeys` table. If the encryption key (`PLUGIN_CONFIG_ENCRYPTION_KEY`) is the same across instances (e.g., same `.env` deployed to multiple servers), an attacker with a backup file could decrypt API keys. The `SANITIZED_COLUMNS` map does redact `encryptedKey` for sanitized exports, but full-fidelity backups retain it.
- **Suggested fix:** Add `encryptedKey` to `ALWAYS_REDACT` for `apiKeys` table. Full-fidelity backups should still protect live credentials. Alternatively, document this as an accepted risk and advise rotating `PLUGIN_CONFIG_ENCRYPTION_KEY` when restoring to a new instance.

## F13 — PublicHeader mobile menu lacks click-outside-to-close behavior
- **File:** `src/components/layout/public-header.tsx:106-150`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Category:** UX / accessibility
- **Evidence:** The mobile menu has an Escape key handler and focus trap, but clicking outside the menu panel does not close it. This is a common UX expectation for dropdown menus.
- **Suggested fix:** Add a click-outside handler (e.g., a backdrop overlay or `pointerdown` event listener on `document`).

## F14 — `src/lib/auth/config.ts:syncTokenWithUser` called with inconsistent field sets
- **File:** `src/lib/auth/config.ts:68-94` (definition), `317-335` (jwt callback call), `387-405` (refresh call)
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Maintainability
- **Evidence:** The `syncTokenWithUser` function accepts `AuthUserRecord` but the three call sites construct the object inline with slightly different field selections. The JWT callback (line 317-335) includes `shareAcceptedSolutions` and `acceptedSolutionsAnonymous` which are missing from the `createSuccessfulLoginResponse` return (line 52-66). This means the first JWT after login won't have `shareAcceptedSolutions`/`acceptedSolutionsAnonymous` set correctly until the next token refresh. Since `syncTokenWithUser` sets `token.shareAcceptedSolutions = user.shareAcceptedSolutions ?? true`, if `user` doesn't have these fields they'll default to `true`/`false` respectively, which may not match the DB value.
- **Suggested fix:** Ensure `createSuccessfulLoginResponse` and `AuthenticatedLoginUser` type include all fields that `syncTokenWithUser` reads. The `AuthUserRecord` type should have these fields.

## F15 — Test coverage gaps for workspace-to-public migration Phase 2 changes
- **Files:** `src/components/layout/public-header.tsx`, `src/app/(dashboard)/layout.tsx`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** Test coverage
- **Evidence:** The Phase 2 changes (authenticated dropdown, mobile menu grouping, "back to public site" link) have minimal test coverage. The PublicHeader dropdown was flagged in cycle 6b AGG-5 as needing route-level tests. The mobile focus trap (F13 above) has no accessibility tests.
- **Suggested fix:** Add component tests for PublicHeader dropdown rendering per role, mobile menu behavior, and the dashboard "back to public site" link.

## F16 — No audit logging for API key creation/deletion
- **Files:** `src/app/api/v1/admin/api-keys/route.ts`, `src/app/api/v1/admin/api-keys/[id]/route.ts`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Category:** Audit / compliance
- **Evidence:** API key creation (POST) and deletion (DELETE) do not call `recordAuditEvent`. Other admin operations (file upload, backup, settings changes) record audit events. API keys are a high-value credential and their lifecycle should be auditable.
- **Suggested fix:** Add `recordAuditEvent` calls to POST and DELETE handlers in the api-keys routes.

## F17 — `src/lib/compiler/execute.ts` local fallback logs full command at INFO level
- **File:** `src/lib/compiler/execute.ts:372`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Category:** Security / logging
- **Evidence:** Line 372 logs `args.join(" ")` which includes the container name and Docker args. The command arguments passed to `sh -c` (which include admin-provided compile/run commands from DB) are also logged. In a compromised-admin scenario, this could leak malicious command details in logs accessible to lower-privilege operators.
- **Suggested fix:** Log at `debug` level instead of `info`.

## F18 — Rate-limit eviction timer lacks `unref()` on interval handle
- **File:** `src/lib/security/rate-limit.ts:45-51`
- **Severity:** LOW
- **Confidence:** HIGH
- **Category:** Reliability
- **Evidence:** The rate-limit eviction timer (`setInterval`) does not call `.unref()` on the timer handle. Unlike the audit flush timer (`src/lib/audit/events.ts:96-98`) which calls `.unref()`, this timer keeps the Node.js event loop alive and can delay process shutdown. The code does have a conditional `unref()` check (line 49-51), but it only applies to `evictionTimer` which is the interval reference, and the check uses `typeof evictionTimer === "object"` which may not correctly detect the Timer handle in all Node.js versions.
- **Suggested fix:** Simplify to always call `evictionTimer.unref()` after `setInterval`, matching the pattern in `events.ts`.

## F19 — `src/lib/db/queries.ts:namedToPositional` parameter regex is more permissive than validation
- **File:** `src/lib/db/queries.ts:74`
- **Severity:** LOW
- **Confidence:** LOW
- **Category:** Defense in depth
- **Evidence:** The regex `/@(\w+)/g` would match `@0name` as parameter name `0name`, but the validation regex `/^[a-zA-Z_]\w*$/` correctly rejects it. No actual vulnerability, but the `\w+` in the first regex is slightly more permissive than necessary.
- **Suggested fix:** Change `/@(\w+)/g` to `/@([a-zA-Z_]\w*)/g` for consistency and early rejection.

## F20 — `src/lib/auth/config.ts` JWT callback does a DB query on every authenticated request
- **File:** `src/lib/auth/config.ts:354-405`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Category:** Performance
- **Evidence:** The `jwt` callback runs on every API request with a session cookie. It does a `db.query.users.findFirst` to refresh the token with the latest user data. This adds a DB query to every authenticated request. The proxy.ts middleware already has a 2-second cache for auth lookups (`authUserCache`), but the JWT callback runs separately and does not use this cache.
- **Suggested fix:** Consider caching the user data lookup in the JWT callback with a short TTL (e.g., 5-10 seconds) to reduce DB load under high traffic. Or skip the refresh if the token was recently created (within 30 seconds).

---

## Verified Prior-Cycle Fixes

| Fix | Status |
|---|---|
| Cycle 6b AGG-1: Files route `countResult.count` | CONFIRMED FIXED — route now uses `count(*) over()` |
| Cycle 6b AGG-2: Proxy matcher missing patterns | NEEDS VERIFICATION — check if `/users/:path*` and `/problem-sets/:path*` were added |
| Cycle 6b AGG-3: Dual-query pagination | PARTIALLY FIXED — files route migrated, groups/assignments still uses dual query (F4) |
| Cycle 6b AGG-4: Routes bypassing createApiHandler | PARTIALLY FIXED — tags route now uses createApiHandler, backup/restore/migrate still manual (F2) |
| Cycle 6b AGG-6: Tags route rate limiting | CONFIRMED FIXED — tags route now uses createApiHandler which includes auth |

## Summary Statistics

- **Total findings:** 20
- **HIGH severity:** 0
- **MEDIUM severity:** 5 (F5, F7, F12, F15, F20)
- **LOW severity:** 15 (F1-F4, F6, F8-F11, F13-F14, F16-F19)
- **Confirmed issues:** 15
- **Likely issues needing validation:** 5 (F5, F7, F9, F13, F16)
