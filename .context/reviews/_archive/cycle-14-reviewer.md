# Cycle 14 — Comprehensive Single-Agent Review

**Date:** 2026-05-11
**HEAD reviewed:** `a4ad2d8c`
**Reviewer:** cycle-lead (single-agent comprehensive review)
**Prior aggregate:** `_aggregate-cycle-13.md` (HEAD `bcef0c13`)

## Methodology

Subagent fan-out unavailable — TeamCreate blocked by 41 active members from prior
cycle-15-review team. Performed as single-agent comprehensive review covering all
standard reviewer angles (code quality, security, performance, architecture,
correctness, testing, tracing).

Review scope: all 598 TypeScript source files, all API routes, all database
interaction layers, auth/authz, Docker sandbox, judge worker protocol, frontend
components, and test suites. Focused on changes since cycle 13 (commits
`bcef0c13..a4ad2d8c`) and any previously missed issues.

## Carry-forward findings from cycle 13 (still present at HEAD)

### C13-1 — rawQueryOne generic cast (LOW, High confidence)
- **File:** `src/lib/db/queries.ts:50`
- **Code:** `return result.rows[0] as T | undefined;`
- **Issue:** The generic `T` parameter is a pure developer convenience with zero
  runtime validation. If the SQL query and type drift (e.g., column renamed,
  type changed), the cast silently produces an object with `undefined` fields
  where the type says they exist. Cycle 13 added extensive JSDoc warnings
  (lines 31-42) but the cast remains.
- **Failure scenario:** A developer refactors a table schema and updates the
  Drizzle schema but forgets to update a raw SQL query in a leaderboard or
  scoring function. The query returns `null` for a renamed column, but the
  `as T` cast tells TypeScript the field exists, leading to downstream
  `undefined` propagating into score calculations or ranking displays.
- **Fix:** Make `rawQueryOne` accept an optional Zod schema parameter and
  validate `result.rows[0]` against it before returning. Or return
  `Record<string, unknown>` and force callers to validate.

### C13-2 — rawQueryAll generic cast (LOW, High confidence)
- **File:** `src/lib/db/queries.ts:72`
- **Code:** `return result.rows as T[];`
- **Issue:** Same pattern as C13-1. Every caller (50+ call sites across
  contest-scoring, leaderboard, analytics, judge claim, etc.) implicitly trusts
  that the PostgreSQL row shape matches the TypeScript type parameter.
- **Failure scenario:** Same as C13-1 but affects bulk queries. A drift in the
  `RawLeaderboardRow` type vs the actual SQL could cause the leaderboard to
  display incorrect scores or crash when accessing assumed-present fields.
- **Fix:** Same as C13-1 — optional schema validation or remove the generic
  parameter entirely.

## Resolved since cycle 13 (verified by inspection)

- **C13-3 (cycle-13):** `src/lib/system-settings.ts` fallback path cast — FIXED.
  Commit `a4ad2d8c` replaces the `(rows[0] ?? undefined) as SystemSettingsRecord`
  with explicit field-by-field construction (lines 114-161).

## New findings this cycle

After a comprehensive review of the entire codebase, new findings are minimal.
The prior 13 cycles have burned down all CRITICAL and HIGH findings from the
2026-04-18 comprehensive review. Remaining surface area is largely clean.

### C14-1 — Unused `as` cast in backup integrity manifest (LOW, High confidence)
- **File:** `src/lib/db/export-with-files.ts:155`
- **Code:** `const dbExport = JSON.parse(dbJson) as JudgeKitExport;`
- **Issue:** In `streamBackupWithFiles`, `dbJson` is read from the app's own
  `streamDatabaseExport`, parsed, and cast to `JudgeKitExport`. The parsed
  object is passed to `createBackupIntegrityManifest` which only accesses
  `dbExport.redactionMode` (line 56) with a `?? "legacy-unknown"` fallback.
  The `as` cast is unnecessary because (a) the data source is trusted
  (app-generated export), and (b) the only accessed property has a fallback.
  However, the cast creates a false sense of type safety and masks any future
  export generator bugs.
- **Failure scenario:** A future refactor of `streamDatabaseExport` changes the
  export shape. The `as` cast silently packages malformed data into the ZIP.
  The integrity manifest still generates (because `redactionMode` has a fallback),
  but the backup contains bad data that `validateExport` would reject on restore.
- **Fix:** Remove the `as JudgeKitExport` cast. Change `dbExport` type to
  `unknown` and use optional chaining for the single property access:
  `(dbExport as Record<string, unknown>)?.redactionMode as string | undefined`.
  Or better, use a small runtime guard:
  `typeof (dbExport as Record<string, unknown>)?.redactionMode === "string"`.

### C14-2 — rawQueryOne/rawQueryAll lack runtime validation despite warnings (LOW, Medium confidence)
- **File:** `src/lib/db/queries.ts:43-73`
- **Issue:** The cycle-13 documentation addition (lines 28-42) documents the risk
  but does not enforce it. There are 50+ call sites across the codebase, and
  none of them perform runtime validation of the returned row shape. This is
  a systemic pattern where type safety is assumed rather than verified.
- **Failure scenario:** Over time, as schemas evolve and raw SQL queries
  accumulate, the probability of SQL/type drift increases. The first sign of
  trouble would be a runtime `undefined` access in production, not a build
  error.
- **Fix:** Add an optional `schema: z.ZodType<T>` parameter to both helpers.
  When provided, validate the result against the schema before returning.
  Migrate call sites incrementally. This is architectural debt, not an
  immediate bug.

### C14-3 — lecture-toolbar fullscreen promise chain swallows all errors (LOW, Low confidence)
- **File:** `src/components/lecture/lecture-toolbar.tsx:66-68`
- **Code:**
  ```ts
  document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
  document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
  ```
- **Issue:** Empty `.catch(() => {})` swallows all errors, including genuine
  failures (not just "user denied"). If `requestFullscreen()` fails for a
  non-permission reason (e.g., API not supported, iframe sandbox), the UI
  state `isFullscreen` becomes out of sync with reality.
- **Failure scenario:** User clicks fullscreen button in an iframe context
  where the API is blocked. The button toggles to "exit fullscreen" state
  (because `setIsFullscreen(true)` ran), but the document is not actually
  fullscreen. Clicking again calls `exitFullscreen()` which throws (because
  not in fullscreen), caught by empty catch, leaving the UI permanently stuck.
- **Fix:** Only set state inside the `.then()` callback, and log unexpected
  errors for debugging:
  ```ts
  document.documentElement.requestFullscreen()
    .then(() => setIsFullscreen(true))
    .catch((err) => {
      if (err instanceof TypeError) { /* API not supported */ }
      else { logger.warn({ err }, "fullscreen request failed"); }
    });
  ```

## Areas inspected with no new issues found

- **Auth/authz:** All raw `export async function` API routes have explicit auth
  checks (judge routes use IP allowlist + worker auth, admin routes use
  capability checks + password re-confirmation, auth routes use their own
  token validation).
- **Security:** No new XSS vectors (sanitizeHtml/sanitizeMarkdown properly
  configured), no eval/new Function misuse, no SQL injection via string
  concatenation in user-facing paths.
- **Docker sandbox:** seccomp profile, shell validators, and compiler
  execution paths reviewed — all prior fixes intact.
- **Judge worker protocol:** heartbeat, claim, poll, register, deregister
  routes all have proper auth and atomic DB operations.
- **Database schema:** No new schema issues (all prior FK/index fixes intact).
- **Rate limiting:** Sidecar circuit breaker and DB fallback both operational.
- **Audit/logging:** Audit buffer flush, retention pruning, and legal-hold
  logic all intact.

## Final sweep — commonly missed issues

Checked for:
- Race conditions in shared state: none new (proxy.ts auth cache is
  per-request, Map-based TTL is fine for Edge Runtime).
- Memory leaks: no unbounded growth detected (audit buffer has max size,
  rate limiter map has TTL eviction, anti-cheat storage caps at 200 events).
- Off-by-one errors in pagination: cursor-based pagination in
  submissions route correctly uses `limit + 1` for has-more detection.
- Timezone/DST bugs: all datetime handling uses `DEFAULT_TIME_ZONE` with
  explicit `Date` objects, no string-based arithmetic.
- Missing `await` on async calls: no blocking issues found.
- Unhandled promise rejections: `void fetchData()` pattern is intentional
  (fire-and-forget polling), not a bug.

## Agent failures

Subagent fan-out unavailable — TeamCreate blocked by 41 active members from
prior cycle-15-review team. Performed as single-agent comprehensive review.
