# Aggregate Review — Cycle 23

**Date:** 2026-04-24
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, architect, test-engineer, debugger, verifier, tracer, critic
**Total findings:** 17 (deduplicated to 8)

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] SSE Connection Leak on Unhandled Errors — User Lockout Risk

**Sources:** CR-1, TR-1, C-1, D-1 | **Confidence:** HIGH
**Cross-agent signal:** 4 of 9 review perspectives

The SSE route handler at `src/app/api/v1/submissions/[id]/events/route.ts` has an asymmetric cleanup contract. When a connection slot is acquired (lines 246-254 for in-process, lines 236-245 for shared coordination) but a subsequent step throws (e.g., the submission query at line 258, or the ReadableStream constructor), the outer catch at line 467 returns a 500 error WITHOUT releasing the connection slot.

For in-process tracking, this leaks an entry in `connectionInfoMap` and increments `userConnectionCounts`, potentially causing "tooManyConnections" (429) rejections for legitimate subsequent connections. For shared coordination, the `rateLimits` row persists until the timeout expires.

**Concrete failure scenario:** An intermittent DB connection error at line 258 throws. The connection slot is leaked. Over hours of operation, leaked entries accumulate. A user who repeatedly triggers this error can eventually hit `maxSseConnectionsPerUser` (default: 5) and be locked out of SSE connections until the cleanup timer evicts stale entries (up to 30 minutes + 30 seconds).

**Fix:**
1. Add `removeConnection(connId)` (in-process path) or `releaseSharedSseConnectionSlot(sharedConnectionKey)` (shared path) in the outer catch block at line 467.
2. The `useSharedCoordination` flag and `connId`/`sharedConnectionKey` variables must be captured before the try block so they are accessible in the catch.

---

### AGG-2: [MEDIUM] SSE Cleanup Timer Module-Level Side Effect — HMR Double Registration

**Sources:** CR-1 | **Confidence:** MEDIUM
**Cross-agent signal:** 1 of 9 review perspectives

The `setInterval` at line 102 of `src/app/api/v1/submissions/[id]/events/route.ts` runs at module load time. While the code clears the previous timer via `clearInterval(globalThis.__sseCleanupTimer)`, in development with Next.js HMR/turbopack, the module can be re-evaluated concurrently, potentially registering two timers.

**Concrete failure scenario:** Turbopack HMR loads the module twice in parallel. Both evaluations read the same old `globalThis.__sseCleanupTimer`, both clear it, both set new intervals. One interval is orphaned and never cleared.

**Fix:** Use an atomic check-and-set pattern on `globalThis.__sseCleanupTimer`, or defer timer initialization to the first request.

---

### AGG-3: [MEDIUM] Contest Access Tokens Lack Expiry — Tokens Valid Forever

**Sources:** S-1, C-3 | **Confidence:** MEDIUM
**Cross-agent signal:** 2 of 9 review perspectives

`contest_access_tokens` rows have no expiry timestamp. Once created, a token grants access indefinitely, even after the contest ends. The access verification queries (anti-cheat route, stats route) check enrollment OR access token but never verify the token against the contest's deadline.

**Concrete failure scenario:** A student receives a contest access token for a 2-hour exam. The exam ends. The student can still access the anti-cheat event stream and stats endpoint indefinitely.

**Fix:** Either add an `expiresAt` column to `contest_access_tokens`, or check the assignment's deadline in the access verification queries and reject tokens for ended contests.

---

### AGG-4: [MEDIUM] `importDatabase` Column-by-Position Mapping — Schema Drift Silently Corrupts Data

**Sources:** CR-3, T-1 | **Confidence:** MEDIUM
**Cross-agent signal:** 2 of 9 review perspectives

The import function maps `columns[j]` to `row[j]` by position (`src/lib/db/import.ts:163-168`). If the export was produced by a version with a different column order in `TABLE_ORDER` or a different Drizzle schema, data is silently written to the wrong columns. There are no tests for the import function.

**Concrete failure scenario:** An admin exports from JudgeKit v0.1 and imports into v0.2 where a schema migration reordered columns. Data is written to wrong columns without any error.

**Fix:**
1. Add column-name validation before importing: verify that exported column names match the target schema's column names.
2. Add tests for the import function that verify data integrity.

---

### AGG-5: [MEDIUM] Ranking Cache SWR Adds `SELECT NOW()` on Every Cache Check

**Sources:** P-1, C-2 | **Confidence:** MEDIUM
**Cross-agent signal:** 2 of 9 review perspectives

`computeContestRanking` calls `getDbNowMs()` on every invocation including cache hits, adding a DB round-trip per leaderboard request. The cache's staleness tolerance is 15 seconds, so a 1-2 second clock skew from using `Date.now()` for the staleness check would be acceptable while the authoritative DB time is used for the actual ranking computation.

**Concrete failure scenario:** 200 students viewing the leaderboard every 15 seconds during a live contest. Each request triggers `SELECT NOW()`. ~800 unnecessary DB queries per minute.

**Fix:** Use `Date.now()` for the cache staleness check (where 1-2s skew is tolerable) and keep `getDbNowMs()` only for the actual ranking computation and cache write timestamps.

---

### AGG-6: [LOW] ICPC Live-Rank Query Missing Tie-Breakers from Main Leaderboard

**Sources:** V-1 | **Confidence:** MEDIUM
**Cross-agent signal:** 1 of 9 review perspectives

`computeSingleUserLiveRank` in `src/lib/assignments/leaderboard.ts:128-170` sorts by `(solved_count DESC, total_penalty ASC)` but does not include the additional tie-breakers ("earlier last AC" and "userId lexicographic order") that the main leaderboard uses (`contest-scoring.ts:354-361`). This can cause the live rank to differ by 1 from the main leaderboard for tied users.

**Fix:** Add the same tie-breakers to the live-rank query, or document that the live rank is an approximation.

---

### AGG-7: [LOW] Secret Column Redaction Fragmentation — Centralized Registry Needed

**Sources:** A-2, C-4 | **Confidence:** HIGH
**Cross-agent signal:** 2 of 9 review perspectives

Secret column redaction is defined independently in: (1) export.ts `SANITIZED_COLUMNS` / `ALWAYS_REDACT`, (2) the logger's `REDACT_PATHS`, and (3) the admin settings API's inline redaction set. This is a recurring finding (previously identified as DEFER-10 in cycle 21). The `hcaptchaSecret` omission in export was caught in cycle 19.

**Fix:** Create a single `SECRET_COLUMNS` registry that all three config points read from.

---

### AGG-8: [LOW] `buildIoiLatePenaltyCaseExpr` SQL Column Parameters Not Validated

**Sources:** V-2 | **Confidence:** LOW
**Cross-agent signal:** 1 of 9 review perspectives

The function accepts string parameters that are interpolated directly into SQL. Currently safe (all callers pass hardcoded column references) but fragile if a future caller passes user input.

**Fix:** Add a validation regex for column parameters, or document the trust boundary.

---

## Carried Forward from Prior Cycles

All prior DEFER items (DEFER-1 through DEFER-11 from cycle 22 plan) remain unchanged.

## Positive Observations

- All clock-skew-sensitive paths now use `getDbNowMs()` consistently (contest boundaries, anti-cheat, rate limiting, SSE coordination)
- Proxy auth cache now only cleans up expired entries when near capacity (cycle 18b fix verified)
- `sanitizeHtml` and `safeJsonForScript` properly guard all `dangerouslySetInnerHTML` usage
- No `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` suppressions (one intentional `eslint-disable` for react-hooks/static-components)
- No `as any` type casts in server code
- Import/export uses parameterized queries — no SQL injection vectors in `namedToPositional`
- Encryption uses AES-256-GCM with proper auth tag verification
- Password verification uses constant-time comparison

## No Agent Failures

All 9 review perspectives completed successfully.
