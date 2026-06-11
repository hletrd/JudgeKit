# Cycle 7 Deep Code Review — JudgeKit

**Date:** 2026-04-19
**Reviewer:** Comprehensive multi-angle review (code quality, security, performance, architecture, testing, design)
**Scope:** Full repository — `src/`, `tests/`, configuration files

---

## F1: Admin languages page loads all columns from languageConfigs without restriction
- **File**: `src/app/(dashboard)/dashboard/admin/languages/page.tsx:17`
- **Severity**: Medium | **Confidence**: High
- **Description**: `db.select().from(languageConfigs)` loads all columns including `dockerImage`, `compileCommand`, `runCommand` and potentially other columns unnecessary for the admin listing page. The `dockerImage` is only needed for the `getDockerImageRuntimeInfo()` call, but the full compile/run commands are not used in the page render.
- **Fix**: Add column selection to only fetch the columns actually rendered in `LanguageConfigTable`.

## F2: Content-Disposition headers don't RFC 5987-encode non-ASCII filenames
- **File**: `src/app/api/v1/files/[id]/route.ts:102`, `src/app/api/v1/contests/[assignmentId]/export/route.ts:136,197`, `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:107`
- **Severity**: Medium | **Confidence**: High
- **Description**: Export routes use `encodeURIComponent()` or `sanitizeFilename()` for the filename in `Content-Disposition` headers, but don't provide RFC 5987 `filename*` encoding. Korean characters in assignment titles are either stripped (by `sanitizeFilename` replacing non-ASCII with `_`) or double-encoded by `encodeURIComponent` without the `filename*=UTF-8''` syntax. Browsers that don't support RFC 5987 fall back to the ASCII `filename` parameter (which is empty/stripped), resulting in generic download names like `_export.csv` or `-grades.csv`.
- **Fix**: Use `filename*=UTF-8''${encodeURIComponent(originalTitle)}` alongside an ASCII `filename` fallback. Example: `Content-Disposition: attachment; filename="export.csv"; filename*=UTF-8''%ED%95%9C%EA%B5%AD%EC%96%B4-export.csv`

## F3: `getPluginState()` still uses `db.select().from(plugins)` without column restriction
- **File**: `src/lib/plugins/data.ts:31`
- **Severity**: Low | **Confidence**: High
- **Description**: The single-plugin lookup `getPluginState()` does `db.select().from(plugins).where(eq(plugins.id, pluginId))` without specifying columns. While `getAllPluginStates()` was fixed in cycle 6 to select specific columns, the single-plugin query still fetches all columns. The `config` column is the only one needed beyond what `getAllPluginStates` selects, and it IS needed here, so the over-fetch is minimal (just the `id` column being redundantly selected).
- **Fix**: Add explicit column selection matching `getAllPluginStates` pattern for consistency.

## F4: Rate limit eviction timer could delete SSE connection tracking slots
- **File**: `src/lib/security/rate-limit.ts:28-35` (eviction), `src/lib/realtime/realtime-coordination.ts:92-97` (SSE slot storage)
- **Severity**: Medium | **Confidence**: Medium
- **Description**: The rate-limit eviction timer (`evictStaleEntries`) deletes rows from `rateLimits` where `lastAttempt < cutoff`. SSE connection tracking slots are stored in the same `rateLimits` table with keys like `realtime:sse:user:...` and `blockedUntil` set to the SSE timeout + 30s. While heartbeat events refresh `lastAttempt` via `shouldRecordSharedHeartbeat`, the eviction uses `lastAttempt` not `blockedUntil` as the cutoff. If a client connects but the heartbeat hasn't fired yet (within the first 60s), the eviction could delete the SSE connection slot, causing the connection cap to be inaccurate. This is mitigated by the fact that SSE connections refresh the `lastAttempt` on creation, but there's a window between connection establishment and the first heartbeat where eviction based on `lastAttempt` could incorrectly remove active slots.
- **Fix**: Either exclude `realtime:sse:*` keys from eviction, or use `blockedUntil` (not `lastAttempt`) as the eviction criterion for SSE keys, or add a `category`/`type` column to `rateLimits` to partition the eviction logic.

## F5: SSE events route not using `createApiHandler` creates maintenance gap
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:1`
- **Severity**: Low | **Confidence**: High
- **Description**: The SSE route manually implements auth check (`getApiUser`), CSRF check (not applicable for GET), and rate limiting (`consumeApiRateLimit`) instead of using the shared `createApiHandler` wrapper. The route has a valid reason for manual implementation (streaming response), but the auth/rate-limit logic is duplicated. Any future changes to the auth middleware (e.g., adding a new header check) won't propagate to this route.
- **Fix**: Consider extracting a `createSseHandler` that wraps the common auth/rate-limit middleware but returns a streaming response, or add a comment block documenting the divergence and the reason.

## F6: Duplicate `sanitizeFilename` / `safeTitle` implementations across export routes
- **File**: `src/app/api/v1/contests/[assignmentId]/export/route.ts:10-12`, `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:100-101`
- **Severity**: Low | **Confidence**: High
- **Description**: Two different filename sanitization functions are used across export routes: `sanitizeFilename()` (replaces non-alphanumerics with `_`, caps at 100 chars) and inline `safeTitle` (removes non-word chars, trims whitespace, replaces spaces with `-`). They produce different outputs for the same input. For example, "Midterm Exam 1" becomes `Midterm_Exam_1` via `sanitizeFilename` but `Midterm-Exam-1` via `safeTitle`.
- **Fix**: Extract a single shared `sanitizeExportFilename()` utility and use it consistently across all export routes.

## F7: `new Date()` clock skew risk in distributed deployments
- **File**: Multiple — `src/app/api/v1/submissions/route.ts:312`, `src/app/api/v1/judge/poll/route.ts:75,142`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:61,104,122`, `src/app/api/v1/recruiting/validate/route.ts:39,51`
- **Severity**: Medium | **Confidence**: Medium
- **Description**: Many API routes use `new Date()` (Node.js process time) for critical timestamp comparisons like exam deadlines, submission timestamps, and recruiting invitation expiry. In a multi-instance deployment, clock skew between instances could cause a deadline check to pass on one instance but fail on another. The judge claim route already uses PostgreSQL `NOW()` for its CTE, but the application-level checks do not.
- **Fix**: For critical time comparisons (exam deadlines, assignment deadlines), consider fetching `SELECT NOW()` from the database or using the PostgreSQL-side timestamp in the query WHERE clause instead of comparing in application code.

## F8: Anti-cheat heartbeat gap detection uses `new Date()` on `createdAt` timestamps
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:197-208`
- **Severity**: Low | **Confidence**: High
- **Description**: The heartbeat gap detection converts `createdAt` (a PostgreSQL `timestamptz`) to a JavaScript `Date` via `new Date(heartbeats[i - 1].createdAt!)`. The non-null assertion (`!`) could throw if `createdAt` is null (shouldn't happen with schema defaults, but defensive code would handle it).
- **Fix**: Add null check: `if (!heartbeats[i-1].createdAt || !heartbeats[i].createdAt) continue;`

## F9: `api-rate-limit.ts` `atomicConsumeRateLimit` fetches all columns from `rateLimits`
- **File**: `src/lib/security/api-rate-limit.ts:59-64`
- **Severity**: Low | **Confidence**: High
- **Description**: `tx.select().from(rateLimits).where(eq(rateLimits.key, key))` loads all columns when it only needs `attempts`, `windowStartedAt`, `blockedUntil`, and `lastAttempt` (or fewer depending on the logic path). The `consecutiveBlocks` column is never used in this function. This runs inside a `SELECT FOR UPDATE` transaction, so the extra I/O is minimal but unnecessary.
- **Fix**: Add column selection: `tx.select({ attempts: rateLimits.attempts, windowStartedAt: rateLimits.windowStartedAt, blockedUntil: rateLimits.blockedUntil })`.

## F10: `console.error` in error boundary pages instead of structured logging
- **File**: `src/app/(dashboard)/dashboard/groups/error.tsx:17`, `src/app/(dashboard)/dashboard/problems/error.tsx:17`, `src/app/(dashboard)/dashboard/submissions/error.tsx:17`, `src/app/(dashboard)/dashboard/admin/error.tsx:17`
- **Severity**: Low | **Confidence**: High
- **Description**: Error boundary pages use `console.error(error)` instead of the app's `logger.error()`. This is because they're client components and `logger` is server-only. The errors still get sent to the browser console, but are not captured by the server-side pino logging infrastructure.
- **Fix**: This is a known design limitation of client-side error boundaries. Consider adding a client-side error reporting hook that sends errors to a server endpoint for structured logging.

## F11: `as never` type assertion in problem-submission-form.tsx bypasses TypeScript
- **File**: `src/components/problem/problem-submission-form.tsx:164`
- **Severity**: Low | **Confidence**: High
- **Description**: `t(translationKey as never)` uses `as never` to bypass TypeScript's type checking on the i18n translation key. This is a code smell that hides potential typos or missing keys.
- **Fix**: Cast to the actual union type of valid translation keys, or use a type-safe i18n wrapper.

## F12: Rate-limit eviction timer lacks `unref()` — can delay process exit
- **File**: `src/lib/security/rate-limit.ts:45`
- **Severity**: Low | **Confidence**: High
- **Description**: The rate-limit eviction timer (`setInterval`) does not call `.unref()` on the timer handle. Unlike the audit flush timer (`src/lib/audit/events.ts:96-98`) which calls `.unref()`, this timer keeps the Node.js event loop alive and can delay process shutdown. In a graceful shutdown scenario, the process would hang until the next eviction tick fires.
- **Fix**: Add `.unref()` after creating the interval, matching the pattern in `events.ts`.

## F13: `cleanup.ts` duplicates audit/login pruning logic from `events.ts` and `data-retention-maintenance.ts`
- **File**: `src/lib/db/cleanup.ts`
- **Severity**: Low | **Confidence**: Medium
- **Description**: `cleanupOldEvents()` in `cleanup.ts` performs the same batched DELETE on `auditEvents` and `loginEvents` that is also handled by `pruneOldAuditEvents()` in `events.ts` and `pruneLoginEvents()` in `data-retention-maintenance.ts`. The retention logic is duplicated with slightly different defaults (`cleanup.ts` reads `AUDIT_RETENTION_DAYS` env var directly vs `data-retention.ts` using `DATA_RETENTION_DAYS`).
- **Fix**: Remove `cleanup.ts` and ensure all retention pruning goes through the single code path in `data-retention-maintenance.ts`.

## F14: `getPluginState()` has no error handling for missing plugin ID
- **File**: `src/lib/plugins/data.ts:31`
- **Severity**: Low | **Confidence**: High
- **Description**: When `getPluginState()` is called with a `pluginId` that doesn't match any definition, it returns `null` (line 28). But when the plugin ID does match a definition but the DB query returns no row, the code proceeds with `row?.config ?? { ...definition.defaultConfig }`. This is correct behavior, but there's no logging for the case where a defined plugin has no DB row — this could indicate a missing migration or configuration issue.
- **Fix**: Add a debug-level log when a plugin definition exists but has no DB row.

## F15: Compiler runner auth token warning fires in non-production even when URL is set
- **File**: `src/lib/compiler/execute.ts:64-66`
- **Severity**: Low | **Confidence**: High
- **Description**: When `COMPILER_RUNNER_URL` is not set and `NODE_ENV !== "production"`, a warning is logged: `"RUNNER_AUTH_TOKEN is not set — compiler runner auth disabled"`. This fires even in development where the runner URL is typically not configured, creating noise in logs. The conditional at line 64 should only warn when the URL IS configured but the token is missing.
- **Fix**: Change the condition to only warn when `COMPILER_RUNNER_URL` is set but `RUNNER_AUTH_TOKEN` is not, or adjust the log level to `debug`.

## F16: No Content-Security-Policy header on HTML pages
- **File**: `src/app/layout.tsx` (and all page responses)
- **Severity**: Medium | **Confidence**: Medium
- **Description**: The application serves HTML pages without a `Content-Security-Policy` header. While the file serving route correctly sets `Content-Security-Policy: default-src 'none'` on file downloads, the main HTML pages have no CSP. This leaves the application more vulnerable to XSS attacks if any HTML injection is possible (e.g., via markdown rendering, though `sanitizeHtml` and `sanitizeMarkdown` provide mitigations).
- **Fix**: Add a CSP header via `next.config.ts` headers configuration or middleware, at minimum restricting `script-src` to `'self'` and `object-src` to `'none'`.

## F17: `submissions/route.ts` POST fetches the inserted submission in a separate query outside the transaction
- **File**: `src/app/api/v1/submissions/route.ts:325-338`
- **Severity**: Low | **Confidence**: Medium
- **Description**: After inserting a submission inside a transaction (line 303-313), the code commits the transaction, then fetches the inserted row with a separate `db.select()` query (line 325-338). This creates a window where another request could modify the row between the insert and the select. Using `.returning()` on the insert (similar to the users route at line 127) would make this atomic and more efficient.
- **Fix**: Use `.returning()` on the insert statement inside the transaction and return the result directly.

## F18: JWT token stores excessive UI preference data
- **File**: `src/lib/auth/config.ts:68-93`
- **Severity**: Medium | **Confidence**: High
- **Description**: The JWT token carries 16+ fields including UI preferences (`preferredLanguage`, `preferredTheme`, `editorTheme`, `editorFontSize`, `editorFontFamily`, `lectureMode`, `lectureFontScale`, `lectureColorScheme`, `shareAcceptedSolutions`, `acceptedSolutionsAnonymous`). These bloat the JWT (which is sent with every request via cookie) and are not security-relevant. They're also refreshed on every JWT callback (line 387-405), meaning a DB query runs on every authenticated request to sync these values.
- **Fix**: Move UI preferences to a separate lightweight cache or client-side storage. Only include identity and authorization data in the JWT.

## F19: `sanitizeFilename` in contest export strips Korean characters entirely
- **File**: `src/app/api/v1/contests/[assignmentId]/export/route.ts:10-12`
- **Severity**: Medium | **Confidence**: High
- **Description**: `sanitizeFilename()` replaces all non-ASCII characters with `_`. For Korean contest titles like "중간고사", this produces `____export.csv`. Combined with F2 (missing RFC 5987 encoding), users get completely uninformative filenames.
- **Fix**: Use RFC 5987 `filename*` encoding for the original title and keep the ASCII-safe `filename` as fallback.

## F20: `getRateLimitKey` uses IP as fallback for unauthenticated requests — potential for shared-IP blocking
- **File**: `src/lib/security/rate-limit.ts:20-22`
- **Severity**: Low | **Confidence**: Medium
- **Description**: `getRateLimitKey()` uses `extractClientIp(headers) ?? "unknown"` as part of the rate limit key. In environments where many users share a single IP (e.g., school networks, VPNs, behind a reverse proxy), legitimate users could be rate-limited due to other users' activity. The `"unknown"` fallback also means all requests without an IP share the same rate limit bucket.
- **Fix**: Consider adding a `X-Forwarded-For` parsing strategy that extracts the client IP from the trusted proxy chain, and ensure the `"unknown"` fallback has a separate, more generous rate limit.

---

## Summary Statistics
- Total findings: 20
- Critical: 0
- High: 0
- Medium: 6 (F2, F4, F7, F16, F18, F19)
- Low: 14 (F1, F3, F5, F6, F8, F9, F10, F11, F12, F13, F14, F15, F17, F20)
