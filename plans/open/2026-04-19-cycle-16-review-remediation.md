# Cycle 16 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-16-comprehensive-review.md` and `.context/reviews/_aggregate.md`
**Status:** In Progress

---

## MEDIUM Priority

### M1: Reduce contest replay concurrency from 4 to 2 to prevent DB pool starvation
- **File**: `src/lib/assignments/contest-replay.ts:61`
- **Status**: Pending
- **Plan**:
  1. Change `pLimit(4)` to `pLimit(2)` at line 61
  2. Add a comment explaining the rationale: each snapshot computation runs up to 3 SQL queries, so pLimit(2) = max 6 concurrent queries, which is well within a 20-connection pool even with multiple replays
  3. Verify the replay tests still pass
- **Exit criterion**: `pLimit(2)` used instead of `pLimit(4)`. Comment explains the connection pool sizing rationale.

### M2: Fix `resetRecruitingInvitationAccountPassword` to set `mustChangePassword: true`
- **File**: `src/lib/assignments/recruiting-invitations.ts:237`
- **Status**: Pending
- **Plan**:
  1. Change `mustChangePassword: false` to `mustChangePassword: true` at line 237
  2. Add a code comment explaining why: defense-in-depth in case session invalidation has a gap
  3. Verify that the redeem flow still works (the `redeemRecruitingToken` function handles the `ACCOUNT_PASSWORD_RESET_REQUIRED_KEY` flag, which prompts for a new password regardless of `mustChangePassword`)
  4. Run the recruiting invitation tests
- **Exit criterion**: `mustChangePassword: true` is set in the reset function. The redeem flow still works correctly.

---

## LOW Priority

### L1: Add failure backoff to `computeContestRanking` stale-while-revalidate
- **File**: `src/lib/assignments/contest-scoring.ts:101-113`
- **Status**: Pending
- **Plan**:
  1. Add a `_lastRefreshFailureAt` variable alongside `_refreshingKeys`
  2. In the stale-while-revalidate path, check if a refresh was attempted recently (within 5 seconds) and failed. If so, return stale data without re-triggering.
  3. In the `.catch()` handler, set `_lastRefreshFailureAt = Date.now()` for the specific key
  4. In the `.finally()` handler, clear the failure timestamp on success (via a different mechanism)
  5. Use a `Map<string, number>` to track per-key failure timestamps
- **Exit criterion**: Background refresh is not re-triggered within 5 seconds of a failure.

### L2: Make `isAdmin()` module-private like `isInstructor()`
- **File**: `src/lib/api/auth.ts:97`, `src/lib/api/handler.ts:191`
- **Status**: Pending
- **Plan**:
  1. Remove `export` from `isAdmin()` in `auth.ts`, making it module-private
  2. Add `@internal` JSDoc like was done for `isInstructor()`
  3. Remove `isAdmin` from the re-export in `handler.ts` line 191
  4. Search for any imports of `isAdmin` from `handler.ts` or `auth.ts` in route files and update them to use `isAdminAsync()` instead
  5. Verify no compilation errors and all tests pass
- **Exit criterion**: `isAdmin` is not exported from any module. All callers use `isAdminAsync()`.

### L3: Add per-user rate limit to code snapshot endpoint
- **File**: `src/app/api/v1/code-snapshots/route.ts`
- **Status**: Pending
- **Plan**:
  1. Import `consumeUserApiRateLimit` from `@/lib/security/api-rate-limit`
  2. After the existing `createApiHandler` rate limit, add a per-user check: `const userRateLimitResponse = await consumeUserApiRateLimit(_req, user.id, "code-snapshot:user"); if (userRateLimitResponse) return userRateLimitResponse;`
  3. Or add a second rate limit key in the handler config if the framework supports it
  4. Verify with a manual test that rapid snapshot creation is rate-limited
- **Exit criterion**: Code snapshot endpoint has per-user rate limiting in addition to IP-based limiting.

### L4: Fix anti-cheat heartbeat gap detection to use most recent heartbeats
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195`
- **Status**: Pending
- **Plan**:
  1. Change `.orderBy(antiCheatEvents.createdAt)` to `.orderBy(desc(antiCheatEvents.createdAt))` at line 195
  2. Reverse the resulting array before computing gaps (since gaps need to be computed in chronological order)
  3. Update the gap computation loop to work on the reversed array
  4. Verify the anti-cheat tests still pass
- **Exit criterion**: Heartbeat gap detection uses the most recent 5000 heartbeats instead of the oldest.

### L5: Fix `getInvitationStats` to use atomic single-query aggregation
- **File**: `src/lib/assignments/recruiting-invitations.ts:260-295`
- **Status**: Pending
- **Plan**:
  1. Replace the two-query approach with a single SQL query using conditional aggregation:
     ```sql
     SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
       SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked,
       SUM(CASE WHEN status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW() THEN 1 ELSE 0 END) AS expired
     FROM recruiting_invitations
     WHERE assignment_id = @assignmentId
     ```
  2. Compute `stats.pending -= stats.expired` from the single result (no race condition)
  3. This also fixes the `new Date()` vs `NOW()` inconsistency
- **Exit criterion**: `getInvitationStats` uses a single SQL query with conditional aggregation. No negative pending count possible.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| L6 (sanitizeSubmissionForViewer DB query) | LOW | Same as D16 — only called from one place, no N+1 risk today | Re-open if function is added to list endpoints |
