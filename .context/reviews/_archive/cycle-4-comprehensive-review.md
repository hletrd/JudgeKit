# Comprehensive Deep Code Review -- Cycle 4 (2026-04-19)

## Scope and inventory

Tracked inventory reviewed in this pass (current HEAD):

- `src/` -- 563+ files (app routes, components, lib, API routes)
- `tests/` -- 407+ files (unit, component, e2e, integration)
- `docker/` -- compose files, Dockerfiles
- `docs/` -- deployment, monitoring, judge-workers
- Rust sidecars: `judge-worker-rs/`, `rate-limiter-rs/`, `code-similarity-rs/`
- Configuration: `.env.example`, eslint, tsconfig, CI workflow

Documentation explicitly reviewed: `README.md`, `AGENTS.md`, `docs/api.md`, `docs/monitoring.md`, `docs/judge-workers.md`, `docs/deployment.md`, `.env.example`, all docker-compose files.

## Verification evidence gathered

- `npx tsc --noEmit` PASS (0 errors)
- `npx eslint src/` PASS (0 errors, 4 warnings)
- `npx vitest run` PASS (277 test files, 1932 tests)

All three quality gates are green. The codebase has been significantly remediated since the April-19 review (which found tsc and vitest failures).

## Findings summary

- **Confirmed issues:** 7
- **Likely issues:** 1
- **Risks needing manual validation:** 1

---

## Confirmed issues

### C1. Admin users page search uses raw LIKE without escaping wildcards -- inconsistent with all other search implementations

**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/admin/users/page.tsx:103-109`

**Why this is a problem**
Every other search in the codebase (audit-logs route, login-logs route, invite route, audit-logs page, login-logs page) uses `escapeLikePattern()` to escape `%` and `_` characters before constructing the LIKE pattern. The admin users page does not. This means:
1. A search for `%` or `_` will match unintended rows (functional bug)
2. The codebase has an inconsistent SQL safety pattern, which makes it easier for future developers to copy the wrong pattern

**Concrete failure scenario**
An admin searches for a student whose name contains an underscore, e.g. "test_user". The raw LIKE pattern `%test_user%` also matches "testXuser" because `_` is a single-character wildcard in SQL. Every other search page escapes this correctly; only the users page does not.

**Suggested fix**
Import and use `escapeLikePattern()` (or inline the same escaping used in the invite route at line 31: `.replace(/[%_]/g, "\\$&")`), and add `escape '\\'` to the SQL template.

---

### C2. Sync `isAdmin()` is still used in assignment routes and submissions library -- does not support custom roles

**Confidence:** High

**Files / regions**
- `src/lib/assignments/submissions.ts:205,227`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:109,181,223`

**Why this is a problem**
The sync `isAdmin()` helper only checks the built-in `ROLE_LEVEL` table. Custom roles with `system.settings` capability are not recognized as admin by this function. The codebase has already been partially migrated to capability-based checks (profile page, health endpoints, user routes), but these two areas still use the legacy sync check.

This was flagged in the April-19 review as C9, but only the health/metrics endpoints were fixed. The assignment/submissions sites remain unfixed.

**Concrete failure scenario**
A custom role with `system.settings` (and therefore full admin privileges) tries to edit assignment problems after submissions exist. The `isAdmin()` check returns false, so they get blocked with "assignmentProblemsLocked" even though they should be able to override.

**Suggested fix**
Replace `isAdmin(user.role)` with `caps.has("system.settings")` (the capability check already used in the admin dashboard and health routes), or use `isAdminAsync()`.

---

### C3. Unused imports causing ESLint warnings -- `forbidden` in problems route, `lt` in audit events, unused `validatedProfileFields` in users route

**Confidence:** High

**Files / regions**
- `src/app/api/v1/problems/route.ts:5` -- `forbidden` imported but never used
- `src/lib/audit/events.ts:4` -- `lt` imported but never used
- `src/app/api/v1/users/[id]/route.ts:297` -- `validatedProfileFields` assigned but never used
- `src/lib/auth/redirect.ts:27` -- unused eslint-disable directive

**Why this is a problem**
ESLint reports these as warnings. While not errors, they indicate dead code and make it harder to notice real issues in the lint output. The `validatedProfileFields` variable in the users route suggests a refactoring was partially completed.

**Concrete failure scenario**
A developer adds a new unused import, sees the same 4 warnings in the lint output, and ignores them -- including the new one that indicates a real bug.

**Suggested fix**
- Remove `forbidden` from the problems route import
- Remove `lt` from the audit events import
- Remove the `validatedProfileFields` assignment or use it
- Remove the stale eslint-disable directive in redirect.ts

---

### C4. `select().from(languageConfigs)` and `select().from(groups)` in several server components fetch all columns -- data over-fetching

**Confidence:** Medium

**Files / regions**
- `src/app/(dashboard)/dashboard/profile/page.tsx:25`
- `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:99`
- `src/app/(public)/practice/problems/[id]/page.tsx:130`
- `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:30`
- `src/app/(dashboard)/dashboard/admin/languages/page.tsx:17`
- `src/lib/capabilities/cache.ts:30`
- `src/lib/plugins/data.ts:31,52`

**Why this is a problem**
These `db.select().from(table)` queries return all columns from the table. Some of these tables include potentially sensitive or large fields (e.g., `languageConfigs` has `compileCommand`, `runCommand`, `dockerImage` which are only needed in specific contexts). In server components, this data is serialized and sent to the client only if explicitly rendered, but the query still pulls unnecessary data from the database.

This is a data-minimization and performance concern rather than a security vulnerability, since the unneeded columns are simply discarded. However, for `languageConfigs` specifically, the `dockerImage` field can be large and is only needed in the judge claim flow.

**Concrete failure scenario**
A server component fetches all language config columns when it only needs `language` and `isEnabled`. If a new column with sensitive data (e.g., API keys for language services) is added to `languageConfigs` in the future, it will be implicitly fetched by all these queries.

**Suggested fix**
Add explicit column selections to these queries where the full row is not needed. At minimum, scope the `languageConfigs` queries used in profile/problem pages to `{ language: true, isEnabled: true }`.

---

### C5. `problems` route GET endpoint uses `db.select().from(problems)` without column restriction, exposing all columns including potentially large `description` field

**Confidence:** Medium

**Files / regions**
- `src/app/api/v1/problems/route.ts:33-37` (the `problems.view_all` path)
- `src/app/api/v1/problems/route.ts:63-67` (the enrollment-based path)

**Why this is a problem**
Both pagination paths in the GET handler select all columns from the `problems` table. For a list endpoint, this includes the full `description` field which can be very large (multi-KB markdown content). The API returns all of this data even when the client only needs summary fields for a list view.

**Concrete failure scenario**
An API client fetches the problem list to display titles and metadata. The response includes the full description for every problem, potentially hundreds of KB of unnecessary data transfer.

**Suggested fix**
Add a column restriction to the list query (e.g., exclude `description`) or add a `?fields=` parameter that lets the client request only the columns it needs.

---

### C6. Error boundary pages use `console.error(error)` -- client-side errors are not reported to server monitoring

**Confidence:** Medium

**Files / regions**
- `src/app/(dashboard)/dashboard/admin/error.tsx:17`
- `src/app/(dashboard)/dashboard/groups/error.tsx:17`
- `src/app/(dashboard)/dashboard/problems/error.tsx:17`
- `src/app/(dashboard)/dashboard/submissions/error.tsx:17`

**Why this is a problem**
These error boundary pages log errors only to the browser console using `console.error()`. Since these are client components, the errors are never sent to the server-side monitoring pipeline (pino logger). In production, this means UI errors are invisible to operators.

**Concrete failure scenario**
A user hits a rendering error on the problems page. The error is logged to their browser console but never reported to the server. The ops team has no visibility into the frequency or details of the error.

**Suggested fix**
Consider adding a lightweight error reporting hook (e.g., `navigator.sendBeacon()` to a `/api/v1/client-errors` endpoint, or integration with the existing audit event pipeline) that sends a structured error report to the server. At minimum, document that client errors are not centrally monitored.

---

### C7. The `as never` type assertion in `problem-submission-form.tsx:164` bypasses TypeScript's type safety

**Confidence:** Low

**Files / regions**
- `src/components/problem/problem-submission-form.tsx:164`

**Why this is a problem**
The code `t(translationKey as never)` casts a string key to `never`, which suppresses TypeScript's type checking for the translation key. This means if the translation key is misspelled or removed from the locale bundle, TypeScript will not catch it.

**Concrete failure scenario**
A developer renames or removes a translation key from the locale bundle. The `as never` cast prevents TypeScript from flagging the broken reference, and the user sees a raw key in the UI instead of a translated string.

**Suggested fix**
Type the `translationKey` variable properly using the union type of valid translation keys, or use a discriminated union / exhaustive match pattern. If the key is genuinely dynamic, add a runtime fallback.

---

## Likely issues

### L1. The `isInstructor()` sync helper has the same custom-role blindness as `isAdmin()`, but is currently unused outside auth.ts

**Confidence:** Medium

**Files / regions**
- `src/lib/api/auth.ts:114-116`

**Why this is likely a problem**
`isInstructor()` only checks `ROLE_LEVEL` and does not support custom roles, just like `isAdmin()`. While it is currently only used internally (by `isInstructorAsync()`), its existence as a public export means new code could call it directly and get incorrect behavior for custom roles.

The `isInstructorAsync()` at least falls back to capability checks. But the sync version has no such fallback.

**Concrete failure scenario**
A future developer imports `isInstructor()` directly instead of `isInstructorAsync()` and uses it to gate a feature. Custom instructor-level roles are incorrectly excluded.

**Suggested fix**
Either:
- Make `isInstructor()` private (not exported) since it is only used as a fast-path in `isInstructorAsync()`, or
- Add a doc comment matching the one on `isAdmin()` warning that it is built-in-only.

---

## Risks needing manual validation

### R1. The `isAdmin()` usage in `src/lib/assignments/submissions.ts` controls assignment time-window bypass -- custom admin roles may be unintentionally blocked from submissions during closed windows

**Confidence:** Medium

**Files / regions**
- `src/lib/assignments/submissions.ts:205,227`

**Why this needs manual validation**
The `isAdmin()` check at line 205 allows admin-level users to submit after the assignment deadline and before the start time. If a custom role has all admin capabilities but is not recognized by the sync `isAdmin()`, they will be incorrectly blocked from submitting during these windows.

This is a correctness issue for deployments that use custom roles. It may be intentional if the deployment only uses built-in roles, but it contradicts the capability model used elsewhere in the codebase.

**Suggested fix if this is not intended**
Replace with capability-based check as described in C2.

---

## Previously reported findings -- status update

| Previous ID | Description | Status |
|-------------|-------------|--------|
| C1 (Apr-19) | Assistant roles can browse global user directory | OPEN -- `users.view` is still in ASSISTANT_CAPABILITIES and the users page gates on `users.view` alone |
| C2 (Apr-19) | Profile className UI-only enforcement | FIXED -- server action now enforces canEditClassName |
| C3 (Apr-19) | Profile role labels missing assistant | FIXED -- roleLabels includes assistant + custom role fallback |
| C4 (Apr-19) | Health endpoint computes snapshot before auth | FIXED -- auth check happens first, public path uses getPublicHealthStatus |
| C5 (Apr-19) | AdminDashboard fetches health data unnecessarily | FIXED -- conditional fetch with `canViewHealth ? getAdminHealthSnapshot() : Promise.resolve(null)` |
| C6 (Apr-19) | Bulk user creation fail-all on role escalation | FIXED -- per-row role validation with failed[] reporting |
| C7 (Apr-19) | Sidecar bearer auth tokens not in compose | FIXED -- tokens now passed in compose files |
| C8 (Apr-19) | RUNNER_AUTH_TOKEN not in worker compose | FIXED -- token now forwarded |
| C9 (Apr-19) | isAdmin() not custom-role-aware | PARTIALLY FIXED -- health/metrics routes fixed, but assignments/submissions routes still use sync isAdmin() |
| C10 (Apr-19) | Missing anti-cheat translation key | FIXED -- language key added to both locale bundles |
| C11 (Apr-19) | tsc --noEmit fails | FIXED -- all type errors resolved |
| C12 (Apr-19) | Bulk user test bypasses wrapper | FIXED -- test now uses real createApiHandler |
| C13 (Apr-19) | Execute test asserts 0o777 | FIXED |
| C14 (Apr-19) | Source-grep inventory baseline stale | FIXED |

---

## Final missed-issues sweep

I did a final sweep specifically for:

- **SQL injection via raw LIKE patterns**: The invite route escapes `%` and `_` with a backslash but uses a simple regex replacement instead of the `escapeLikePattern()` function used by audit/login log routes. The admin users page does not escape at all (C1).
- **Unbounded collections / memory leaks**: The audit buffer has a cap at 2x threshold (line 119 in events.ts). The LRU cache for heartbeat deduplication has `max: 10_000` and `ttl: 120_000`. Both are bounded.
- **Rate limiting coverage**: All mutation endpoints that use `createApiHandler` have rate limits configured. The unwrapped routes (judge/poll, judge/claim) have their own rate limiting logic. Health and time endpoints are unauthenticated/low-risk and don't need rate limits.
- **CSRF protection**: All mutation routes either use `createApiHandler` (which enforces CSRF by default) or have explicit CSRF checks. API-key-authenticated requests correctly skip CSRF.
- **Data minimization in API responses**: The `safeUserSelect` helper is used consistently in user-facing API routes and pages. The `authUserSelect` helper is used for auth queries. The problems GET endpoint could benefit from column restriction (C5).
- **i18n key coverage**: The anti-cheat `language` key has been added. I did not find other missing translation keys in the main components.

### Final sweep result

No additional high-confidence runtime/security issues were found beyond the findings above. The remaining follow-ups are:
1. LIKE escaping consistency (C1)
2. Custom-role-aware admin checks in assignment/submissions (C2)
3. ESLint warning cleanup (C3)
4. Data minimization / column restriction (C4, C5)
5. Client error reporting (C6)
6. Type safety for dynamic translation keys (C7)

## Bottom line

The codebase is in significantly better shape than the previous cycle. All quality gates pass. The highest-priority remaining issue is C1 (LIKE wildcard escaping inconsistency) which is a functional bug, and C2 (sync `isAdmin()` in assignment routes) which is a correctness issue for custom-role deployments. C1 from the April-19 review (assistant roles browsing the user directory) remains open but is a design decision that may be intentional.
