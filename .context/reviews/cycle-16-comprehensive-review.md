# Cycle 16 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, testing)
**Base commit:** 433f3221

---

## Findings

### F1: Contest replay pLimit(4) concurrency can starve the DB connection pool under load
- **File**: `src/lib/assignments/contest-replay.ts:61-80`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The cycle 15 fix added `pLimit(4)` to parallelize snapshot computation. Each `computeContestRanking` call executes up to 3 SQL queries (meta, scoring, assignment problems). With 4 concurrent snapshots, that is up to 12 simultaneous SQL queries. Since `computeContestRanking` uses a stale-while-revalidate cache, these queries are only executed on cache misses. However, on a cold cache (first request after restart or cache expiry), an instructor opening the replay for a large contest triggers 4 concurrent snapshot computations, each holding DB connections for the full query duration. If multiple instructors do this simultaneously for different contests, the DB connection pool (typically 10-20 connections) can be exhausted, causing other requests to time out waiting for connections.
- **Concrete failure scenario**: Three instructors open replay pages for different contests within seconds of a server restart. Each replay triggers 4 concurrent snapshot computations (12 queries each). With 3 instructors, that is up to 36 concurrent DB queries from replay alone, far exceeding a typical 20-connection pool. Other API requests start timing out.
- **Fix**: Either reduce the concurrency to 2, or add a comment documenting the expected connection pool sizing. Better: use a single batched query approach for all snapshots (fetch all submissions once, compute rankings in memory) as a longer-term improvement.

### F2: `computeContestRanking` stale-while-revalidate background refresh is fire-and-forget with no error boundary
- **File**: `src/lib/assignments/contest-scoring.ts:101-113`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The stale-while-revalidate pattern at lines 101-113 triggers a background refresh via `_computeContestRankingInner`. If this background promise rejects (e.g., DB connection error), the `.catch()` handler logs the error and the `_refreshingKeys.delete()` runs in `.finally()`. However, the error is only logged, and the stale data continues to be served. On the next request within the TTL window, the cache is still stale, but `_refreshingKeys` no longer has the key, so another refresh attempt is triggered. This creates a retry loop: every request during the stale window triggers a new DB query that also fails. If the DB is temporarily down, this amplifies the failure rate instead of backing off.
- **Concrete failure scenario**: The DB is temporarily unavailable for 30 seconds. Every request to `computeContestRanking` during that window triggers a new failed DB query. With 100 requests/second on the leaderboard API, this generates 3000 failed DB connection attempts during the outage, worsening the DB's recovery.
- **Fix**: Add an exponential backoff or a "recently failed" timestamp that prevents re-triggering the background refresh for a short cooldown period (e.g., 5 seconds) after a failure.

### F3: `resetRecruitingInvitationAccountPassword` sets `mustChangePassword: false` instead of `true`
- **File**: `src/lib/assignments/recruiting-invitations.ts:233-252`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: When an admin resets a recruiting invitation account password, the function invalidates the current password (sets it to a random hash) and sets `mustChangePassword: false`. The intention is that the next time the candidate redeems the token, they will be prompted to set a new password (via the `ACCOUNT_PASSWORD_RESET_REQUIRED_KEY` metadata flag). However, since `mustChangePassword` is `false`, the candidate can still log in with their old session token (if it hasn't been invalidated yet) without setting a new password. The `tokenInvalidatedAt` is set, which should invalidate existing sessions, but the `mustChangePassword: false` means that if the session invalidation has a race condition or is bypassed (e.g., a session created after the reset but before the candidate redeems), the candidate would not be prompted to change their password.
- **Concrete failure scenario**: An admin resets a recruiting candidate's password. The `tokenInvalidatedAt` is set, but due to a clock skew or JWT cache, the candidate's existing session is still valid for a brief window. During that window, the candidate makes a request. Since `mustChangePassword` is `false`, they are not redirected to the password change page. The intended security measure (forcing a password change on next login) is bypassed.
- **Fix**: Set `mustChangePassword: true` instead of `false` in the `resetRecruitingInvitationAccountPassword` function. This ensures that even if the session invalidation has a gap, the candidate will be forced to change their password on the next interaction.

### F4: `getInvitationStats` counts "expired" invitations that are actually still valid
- **File**: `src/lib/assignments/recruiting-invitations.ts:260-295`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: `getInvitationStats` counts "expired" invitations by checking `expiresAt < now` for invitations with status "pending". However, the count of "expired" is subtracted from "pending" at line 292 (`stats.pending -= stats.expired`). This means the `pending` count in the stats can become negative if there is a race condition or if invitations are transitioned to "redeemed" between the two queries (the status-based count and the expiry-based count). Additionally, the expiry check uses `new Date()` (app time) instead of `NOW()` (DB time), which is inconsistent with the `redeemRecruitingToken` function that uses `NOW()` in the SQL WHERE clause.
- **Concrete failure scenario**: Between the two queries in `getInvitationStats`, a pending invitation is redeemed. The first query counts it as "pending", but by the time the second query runs, it is "redeemed" and no longer counted as "expired". The `stats.pending -= stats.expired` subtraction still removes the "expired" count that was computed with the invitation still in the "pending" state, potentially making `stats.pending` go negative.
- **Fix**: Use a single SQL query with conditional aggregation (SUM(CASE WHEN ...)) to atomically compute all status counts. Also, use `NOW()` for the expiry comparison instead of `new Date()`.

### F5: `isAdmin()` sync function is still exported and used as a re-export from handler.ts
- **File**: `src/lib/api/auth.ts:97`, `src/lib/api/handler.ts:191`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The sync `isAdmin()` function is still exported from `auth.ts` and re-exported from `handler.ts`. While it's only used internally as a fast-path inside `isAdminAsync()`, it is available for import by any route. This is the same class of issue as `isInstructor()` (which was fixed in cycle 15 by making it module-private). If a developer imports `isAdmin` directly from `handler.ts` and uses it for an auth check, custom admin-level roles will be silently denied.
- **Concrete failure scenario**: Same as the `isInstructor()` finding from cycle 15 (F2). A developer adds `if (!isAdmin(user.role)) return forbidden()` in a new route. A custom role "department_admin" with admin-equivalent capabilities but not in `ROLE_LEVEL` returns `false`, blocking the user.
- **Fix**: Remove the export of `isAdmin` from both `auth.ts` and `handler.ts`. Keep it as a module-private function used only inside `isAdminAsync()`. Update any remaining importers.

### F6: Code snapshot POST has no per-user rate limit — potential abuse vector
- **File**: `src/app/api/v1/code-snapshots/route.ts:20-68`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The code snapshot POST endpoint has a generic rate limit (`"code-snapshot"`) which is IP-based. Since the source code can be up to 256KB per request, a malicious or buggy client could flood the `code_snapshots` table with large rows. There is no per-user rate limit (unlike the submission route which uses `consumeUserApiRateLimit`), and no limit on the total number of snapshots per user per assignment.
- **Concrete failure scenario**: A student's browser has a bug that sends code snapshots on every keystroke. During a 2-hour contest, the student generates thousands of snapshot records (each up to 256KB), consuming significant DB storage and potentially degrading query performance on the `code_snapshots` table.
- **Fix**: Add a per-user rate limit for code snapshots (e.g., max 60 per hour per user per problem). Consider also adding a cleanup policy for old snapshots.

### F7: Anti-cheat GET query uses `createdAt` ordering without an index-friendly filter for heartbeat gap detection
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:187-196`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The heartbeat gap detection query selects heartbeats ordered by `createdAt` with a LIMIT of 5000. However, it does not filter by a time range. For a contest that has been running for days with many students, the `anti_cheat_events` table can have millions of rows. The query `SELECT createdAt FROM anti_cheat_events WHERE assignmentId = ? AND userId = ? AND eventType = 'heartbeat' ORDER BY createdAt LIMIT 5000` will use the index to find the first 5000 heartbeats for this user, which are the oldest ones. If the contest has been running for a long time, the gap detection only examines the earliest heartbeats and misses recent gaps.
- **Concrete failure scenario**: A contest runs for 3 days with 500 students. Each student generates ~4320 heartbeat events (1 per minute). The query fetches the first 5000 heartbeats for a student, which covers only the first 83 hours (out of 72 hours total). Since the limit is exactly the number of heartbeats generated, it works. But if the contest runs longer than 83 hours, or if heartbeats are more frequent, the LIMIT 5000 would miss the most recent heartbeats, and gaps in the later part of the contest would not be detected.
- **Fix**: Change the ordering to `desc(antiCheatEvents.createdAt)` and reverse the array, or use `ORDER BY created_at DESC LIMIT 5000` to get the most recent heartbeats for gap detection. Alternatively, add a date range filter.

### F8: `sanitizeSubmissionForViewer` DB query is not batched — called per-submission in list endpoints
- **File**: `src/lib/submissions/visibility.ts:73-84`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: This was identified in cycle 15 (F3/L2) as a "principle of least surprise" issue. However, the practical impact is worse than noted: while the function is currently only called from `GET /api/v1/submissions/[id]`, if a future developer adds it to a list endpoint, it would create an N+1 query pattern (one DB query per submission for the assignment visibility settings). The assignment visibility settings are the same for all submissions in the same assignment, so they should be cached or passed in.
- **Concrete failure scenario**: A developer adds `sanitizeSubmissionForViewer` to the submission list endpoint. For a page of 50 submissions, this generates 50 additional DB queries (one per submission), even though all 50 submissions are for the same assignment and the visibility settings are identical.
- **Fix**: Already noted in cycle 15 deferred items (D16). Re-iterating here with the concrete N+1 risk for list endpoints. The fix is to accept the assignment visibility settings as an optional parameter and skip the DB query when provided.

---

## Verified Safe (No Issue)

### VS1: Contest invite POST — redundant SELECT removal is correct
- **File**: `src/app/api/v1/contests/[assignmentId]/invite/route.ts:96-120`
- **Description**: The cycle 15 fix removed the redundant SELECT checks before the INSERT+onConflictDoNothing. This is correct: `onConflictDoNothing` handles the race condition. The transaction still ensures atomicity of the token + enrollment pair. No issue found.

### VS2: `validateRoleChangeAsync` error differentiation is correct
- **File**: `src/lib/users/core.ts:89-95`
- **Description**: The cycle 15 fix correctly differentiates between super-admin escalation (specific error) and other role escalation (generic error). The `isSuperAdminRole` async check properly uses the capability cache for custom roles. No issue found.

### VS3: `isInstructor` made module-private
- **File**: `src/lib/api/auth.ts:116`
- **Description**: The cycle 15 fix correctly made `isInstructor` module-private (removed the `export` keyword). It is still used as a fast-path inside `isInstructorAsync`. The `handler.ts` re-export was also updated. No issue found.

### VS4: `ensureActorCanManageTarget` specific error message
- **File**: `src/app/api/v1/users/[id]/route.ts:119-120`
- **Description**: The cycle 15 fix correctly replaced the generic "unauthorized" error with the specific "cannotManageSameLevelUser" error. The behavior is correct (same-level management is still blocked, just with a better error message). No issue found.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred — only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred — consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred — existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred — unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred — requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred — bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred — no production reports |
| L2(c13) | Anti-cheat LRU cache single-instance limitation | LOW | Deferred — already guarded by getUnsupportedRealtimeGuard |
| L5(c13) | Bulk create elevated roles warning | LOW | Deferred — server validates role assignments |
| D16 | `sanitizeSubmissionForViewer` unexpected DB query | LOW | Deferred — only called from one place, no N+1 risk |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred — same as A19 |
| D18 | Contest replay top-10 limit | LOW | Deferred — likely intentional, requires design input |
