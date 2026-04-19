# Aggregate Review — Cycle 16 Deep Code Review

**Date:** 2026-04-19
**Source reviews:**
- `cycle-16-comprehensive-review.md` (comprehensive multi-angle review covering code quality, security, performance, architecture, correctness, testing)
- Prior cycles 1-15 reviews (findings already addressed or deferred in prior plan documents)

---

## CRITICAL (Immediate Action Required)

None.

---

## HIGH (Should Fix This Cycle)

None.

---

## MEDIUM (Should Fix Soon)

### M1: Contest replay pLimit(4) concurrency can starve DB connection pool under load
- **Source**: cycle-16 F1
- **Files**: `src/lib/assignments/contest-replay.ts:61-80`
- **Description**: With 4 concurrent snapshot computations, each executing up to 3 SQL queries, a cold-cache replay can hold 12 DB connections simultaneously. Multiple instructors opening replays simultaneously can exhaust the connection pool.
- **Fix**: Reduce concurrency to 2 and add documentation about expected pool sizing. Longer-term: batch all snapshots in a single query.

### M2: `resetRecruitingInvitationAccountPassword` sets `mustChangePassword: false` instead of `true`
- **Source**: cycle-16 F3
- **Files**: `src/lib/assignments/recruiting-invitations.ts:233-252`
- **Description**: When an admin resets a recruiting candidate's password, `mustChangePassword` is set to `false`. The intended security flow relies on the `ACCOUNT_PASSWORD_RESET_REQUIRED_KEY` metadata flag and session invalidation via `tokenInvalidatedAt`, but if session invalidation has a race condition or gap, the candidate is not prompted to change their password. Setting `mustChangePassword: true` provides a defense-in-depth guarantee.
- **Fix**: Change `mustChangePassword: false` to `mustChangePassword: true` at line 237.

---

## LOW (Best Effort / Track)

### L1: `computeContestRanking` stale-while-revalidate has no failure backoff
- **Source**: cycle-16 F2
- **Files**: `src/lib/assignments/contest-scoring.ts:101-113`
- **Description**: Background refresh failures are only logged, with no cooldown. If the DB is temporarily down, every request during the stale window triggers a new failed DB query, amplifying the failure rate.
- **Fix**: Add a "recently failed" timestamp that prevents re-triggering the background refresh for a short cooldown period (e.g., 5 seconds) after a failure.

### L2: `isAdmin()` sync function still exported and available for misuse
- **Source**: cycle-16 F5 (same class as cycle-15 F2/L1 for `isInstructor`)
- **Files**: `src/lib/api/auth.ts:97`, `src/lib/api/handler.ts:191`
- **Description**: The sync `isAdmin()` is still exported and re-exported from `handler.ts`. Like `isInstructor()` (which was fixed in cycle 15), if a developer imports `isAdmin` directly, custom admin-level roles will be silently denied.
- **Fix**: Remove the export of `isAdmin` from both `auth.ts` and `handler.ts`. Keep it as a module-private function used only inside `isAdminAsync()`.

### L3: Code snapshot POST has no per-user rate limit
- **Source**: cycle-16 F6
- **Files**: `src/app/api/v1/code-snapshots/route.ts:20-68`
- **Description**: The code snapshot endpoint only has IP-based rate limiting. A buggy client could flood the `code_snapshots` table with large rows (up to 256KB each).
- **Fix**: Add a per-user rate limit (e.g., max 60 per hour per user per problem). Consider a cleanup policy for old snapshots.

### L4: Anti-cheat heartbeat gap detection fetches oldest heartbeats, may miss recent gaps
- **Source**: cycle-16 F7
- **Files**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:187-196`
- **Description**: The heartbeat gap query uses `ORDER BY created_at ASC LIMIT 5000`, which fetches the oldest heartbeats. For very long contests, this may miss recent gaps.
- **Fix**: Change to `ORDER BY created_at DESC LIMIT 5000` and reverse the array, or add a date range filter.

### L5: `getInvitationStats` can produce negative pending count and uses inconsistent time source
- **Source**: cycle-16 F4
- **Files**: `src/lib/assignments/recruiting-invitations.ts:260-295`
- **Description**: The stats computation uses two separate queries without transactional consistency. The `stats.pending -= stats.expired` subtraction can produce a negative count if invitations transition between queries. Also uses `new Date()` instead of `NOW()`.
- **Fix**: Use a single SQL query with conditional aggregation (SUM(CASE WHEN ...)) to atomically compute all status counts. Use `NOW()` for expiry comparison.

### L6: `sanitizeSubmissionForViewer` DB query risk for list endpoints (re-iteration of D16)
- **Source**: cycle-16 F8, cycle-15 F3/L2/D16
- **Files**: `src/lib/submissions/visibility.ts:73-84`
- **Description**: The function makes a DB query for assignment visibility settings. If added to a list endpoint in the future, it would create N+1 queries.
- **Fix**: Accept assignment visibility settings as an optional parameter and skip the DB query when provided.

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
