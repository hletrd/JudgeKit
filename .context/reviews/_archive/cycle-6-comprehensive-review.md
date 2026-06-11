# Cycle 6 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle comprehensive review (code quality, security, performance, architecture, testing, design)
**Scope:** Full `src/` TypeScript/TSX, API routes, lib modules, security modules, frontend components
**Previous cycles:** Cycles 1-5b plans all COMPLETE

---

## NEW FINDINGS

### F1: SSE route registers duplicate SIGTERM handler alongside audit shutdown handler

**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Reliability / Double-handler

**File / region**
- `src/app/api/v1/submissions/[id]/events/route.ts:83-89`

**Why this is a problem**
The SSE events route registers its own `process.on("SIGTERM")` handler at module evaluation time to clear connection tracking data structures. This is the same pattern that was fixed in cycle 5b for the audit module (SHUTDOWN-01). While the SSE handler only clears in-memory data structures (no async flush), it adds a competing `process.on` listener for SIGTERM. Combined with the `node-shutdown.ts` `process.once("SIGTERM")` handler that calls `process.exit()`, there's a subtle ordering issue: the `process.on` handler from this module fires before the `process.once` handler, but the SSE cleanup is unnecessary since the process is about to exit anyway.

**Concrete failure scenario**
On graceful shutdown, the SSE SIGTERM handler clears `activeConnectionSet` and `connectionInfoMap`, then the `node-shutdown.ts` handler flushes audit and calls `process.exit()`. While not actively harmful (no double-flush), the pattern is inconsistent with the cycle 5b fix and adds unnecessary process-level signal handlers that could cause confusion in future maintenance.

**Fix**
Remove the `process.on("SIGTERM")` handler from the SSE events route. The in-memory data structures will be garbage-collected on process exit regardless. Add a comment noting that cleanup is handled by process termination.

---

### F2: Public user profile page uses raw SQL fragment as column reference in `eq()`

**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** SQL safety / Type safety

**File / region**
- `src/app/(public)/users/[id]/page.tsx:52`

**Why this is a problem**
The code uses `eq(sql\`id\`, id)` instead of `eq(users.id, id)`. While Drizzle parameterizes the value `id` correctly (no SQL injection risk), the raw SQL fragment `sql\`id\`` bypasses Drizzle's column reference system. This means:
1. The query doesn't reference a specific table, which could cause ambiguity in joins.
2. It bypasses TypeScript type checking on the column.
3. The same page at line 25-28 correctly uses `eq(db._.fullSchema.users.id, id)` in `generateMetadata`, creating an inconsistency within the same file.

**Concrete failure scenario**
If a future developer adds a join to this query, the bare `id` column reference becomes ambiguous and PostgreSQL will throw an error at runtime.

**Fix**
Change `where: eq(sql\`id\`, id)` to `where: eq(users.id, id)` (import `users` from schema).

---

### F3: `files/[id]` GET and DELETE handlers use `select()` without column restriction

**Severity:** LOW | **Confidence:** HIGH | **Category:** Data minimization

**Files / regions**
- `src/app/api/v1/files/[id]/route.ts:70-74` (GET handler)
- `src/app/api/v1/files/[id]/route.ts:145-149` (DELETE handler)

**Why this is a problem**
Both handlers use `db.select().from(files).where(...)` which fetches all columns from the `files` table, including `storedName` which is a server-side path identifier. The GET handler needs `storedName` to read the file from disk, so the full select is justified there. However, the DELETE handler also loads all columns when it only needs `id`, `storedName`, `originalName`, and `uploadedBy`. While this is a minor concern (the `files` table doesn't contain sensitive data beyond what's needed), it's inconsistent with the data-minimization pattern established in prior cycles.

**Concrete failure scenario**
If a new column containing sensitive metadata is added to the `files` table in the future, the unqualified `select()` will automatically include it in the response data.

**Fix**
For the DELETE handler, restrict columns: `db.select({ id: files.id, storedName: files.storedName, originalName: files.originalName, uploadedBy: files.uploadedBy }).from(files)...`

---

### F4: `getAllPluginStates()` uses `select().from(plugins)` without WHERE clause, fetching all rows

**Severity:** LOW | **Confidence:** HIGH | **Category:** Performance / Data minimization

**File / region**
- `src/lib/plugins/data.ts:52`

**Why this is a problem**
`getAllPluginStates()` calls `db.select().from(plugins)` with no WHERE clause and no column restriction, loading every column of every plugin row. The `plugins` table stores `config` as a JSON blob that may contain encrypted secrets. While the function later redacts secrets via `normalizePluginConfig`, the full unredacted config is loaded into memory for every row first.

**Concrete failure scenario**
If the number of plugins grows or their configs become large, this loads unnecessary data. More importantly, the `select()` without column restriction includes the `config` column containing encrypted values that are immediately redacted, wasting decryption cycles.

**Fix**
Add column restriction: `db.select({ id: plugins.id, enabled: plugins.enabled, config: plugins.config, updatedAt: plugins.updatedAt }).from(plugins)` — which is already all the columns needed.

---

### F5: `createApiHandler` in SSE events route is imported but GET handler is custom

**Severity:** LOW | **Confidence:** HIGH | **Category:** Architecture / Consistency

**File / region**
- `src/app/api/v1/submissions/[id]/events/route.ts:1` (comment)

**Why this is a problem**
The SSE route is the only v1 API route that doesn't use `createApiHandler` for its GET handler. The comment says "not migrated to createApiHandler due to streaming response." This is understandable since SSE streaming doesn't fit the request/response pattern. However, the route manually implements auth checking, rate limiting, and error handling that `createApiHandler` would normally provide. The manual implementation has already caused one bug (the duplicate SIGTERM handler, F1 above).

**Concrete failure scenario**
Future changes to `createApiHandler` (e.g., adding a new middleware layer) won't automatically apply to this route, creating a maintenance gap.

**Fix**
Low priority. Consider creating a `createSseHandler` variant that shares the auth/CSRF/rate-limit middleware with `createApiHandler` but returns a streaming response. Or document this as a known exception.

---

### F6: Contest export Content-Disposition header does not RFC 5987-encode filenames with non-ASCII characters

**Severity:** LOW | **Confidence:** MEDIUM | **Category:** HTTP compliance / i18n

**Files / regions**
- `src/app/api/v1/contests/[assignmentId]/export/route.ts:136,197`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:107`
- `src/app/api/v1/admin/migrate/export/route.ts:83`
- `src/app/api/v1/admin/backup/route.ts:91,100`

**Why this is a problem**
Several export routes use `Content-Disposition: attachment; filename="..."` with a sanitized filename. The sanitization (`replace(/[^\w\s-]/g, "")`) removes non-ASCII characters, which prevents header injection but also strips Korean characters from assignment titles. Per RFC 5987, browsers support `filename*=UTF-8''...` for non-ASCII filenames. The current approach works (filenames are ASCII-safe) but loses i18n fidelity.

**Concrete failure scenario**
An instructor creates an assignment titled "Midterm Exam" and exports it. The filename becomes `assignment-Midterm-Exam-grades.csv` which is fine. But if the title is in Korean, the characters are stripped, producing a less descriptive filename.

**Fix**
Add `filename*=UTF-8''` encoding alongside the ASCII `filename=` fallback per RFC 5987. Or, since the current stripping works correctly for safety, document this as a known i18n limitation.

---

### F7: Judge claim route returns all test case columns including `inputFile`/`outputFile` data

**Severity:** LOW | **Confidence:** MEDIUM | **Category:** Data exposure

**File / region**
- `src/app/api/v1/judge/claim/route.ts:301-305`

**Why this is a problem**
The judge claim endpoint fetches test cases with `db.select().from(testCases)` without column restriction. The `testCases` table may include columns like `inputData`, `outputData`, or file references that are needed for judging but represent the full problem data. Since this endpoint is authenticated (judge token required), the exposure is limited. However, a column-restricted select would be more defensive and consistent with the codebase's data-minimization pattern.

**Concrete failure scenario**
If a new column is added to `testCases` that isn't needed for judging (e.g., `authorNotes`), it would be automatically included in the response.

**Fix**
Add explicit column selection to the test cases query, listing only the columns the judge worker actually needs.

---

### F8: `db._.fullSchema.users.id` in generateMetadata is an unusual internal API access

**Severity:** LOW | **Confidence:** MEDIUM | **Category:** API misuse / Maintainability

**File / region**
- `src/app/(public)/users/[id]/page.tsx:27`

**Why this is a problem**
The `generateMetadata` function uses `eq(db._.fullSchema.users.id, id)` which accesses Drizzle's internal `db._` API. This is fragile and non-standard. The correct approach (used everywhere else) is to import the `users` schema directly and use `eq(users.id, id)`. The same file's default export at line 52 uses the incorrect `eq(sql\`id\`, id)` instead.

**Concrete failure scenario**
A Drizzle ORM upgrade could change or remove the `db._.fullSchema` internal API, breaking this code silently.

**Fix**
Import `users` from `@/lib/db/schema` and use `eq(users.id, id)` in both `generateMetadata` and the default export.

---

## POSITIVE OBSERVATIONS

1. All prior-cycle findings have been properly remediated. The codebase shows clear improvement.
2. The `escapeLikePattern` utility is now used consistently across all API routes and page components.
3. The shared `ESCAPE '\\'` clause is applied to all LIKE queries.
4. The `safeUserSelect` and `authUserSelect` helpers are used in auth-critical paths.
5. The `createApiHandler` wrapper provides consistent auth, CSRF, rate-limiting, and Zod validation for 81 API routes.
6. The judge claim endpoint uses atomic SQL with `FOR UPDATE SKIP LOCKED` for race-free submission assignment.
7. CSV export uses `escapeCsvField()` that prefixes formula-injection characters with tab.
8. The `namedToPositional` raw query helper properly parameterizes all `@name` references.
9. File upload validates MIME type, size, and ZIP decompressed size (bomb protection).
10. Image processing normalizes uploaded images (prevents image-based attacks).
11. The `registerAuditFlushOnShutdown()` properly uses `process.once` with idempotent registration.
12. BOM is added to CSV exports for Excel UTF-8 compatibility.

---

## SUMMARY TABLE

| ID | Severity | Category | File(s) | Confidence |
|----|----------|----------|---------|------------|
| F1 | MEDIUM | Reliability / Double-handler | events/route.ts:83-89 | HIGH |
| F2 | MEDIUM | SQL safety / Type safety | users/[id]/page.tsx:52 | HIGH |
| F3 | LOW | Data minimization | files/[id]/route.ts:70-74,145-149 | HIGH |
| F4 | LOW | Performance / Data minimization | plugins/data.ts:52 | HIGH |
| F5 | LOW | Architecture / Consistency | events/route.ts:1 | HIGH |
| F6 | LOW | HTTP compliance / i18n | Multiple export routes | MEDIUM |
| F7 | LOW | Data exposure | judge/claim/route.ts:301-305 | MEDIUM |
| F8 | LOW | API misuse / Maintainability | users/[id]/page.tsx:27 | MEDIUM |
