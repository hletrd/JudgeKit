# Cycle 18 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-18-comprehensive-review.md` and `.context/reviews/_aggregate.md`
**Status:** In Progress

---

## MEDIUM Priority

### M1: Fix conflicting audit retention env vars in `db/cleanup.ts`
- **File**: `src/lib/db/cleanup.ts:5`, `src/lib/data-retention.ts:18`
- **Status**: TODO
- **Plan**:
  1. In `db/cleanup.ts`, replace the local `RETENTION_DAYS` constant with imports from `data-retention.ts`: use `DATA_RETENTION_DAYS.auditEvents` for audit events and `DATA_RETENTION_DAYS.loginEvents` for login events
  2. This ensures both the cron endpoint and the in-process pruners use the same canonical config
  3. Remove the `AUDIT_RETENTION_DAYS` env var reference — it is now superseded by `AUDIT_EVENT_RETENTION_DAYS` via the canonical config
  4. Verify the cleanup cron endpoint still works correctly
- **Exit criterion**: `db/cleanup.ts` uses `DATA_RETENTION_DAYS` from `data-retention.ts`. No reference to `AUDIT_RETENTION_DAYS` env var remains. Both cleanup paths use the same retention configuration.

### M2: Add `DATA_RETENTION_LEGAL_HOLD` check to `db/cleanup.ts`
- **File**: `src/lib/db/cleanup.ts:9-39`
- **Status**: TODO
- **Plan**:
  1. Import `DATA_RETENTION_LEGAL_HOLD` from `@/lib/data-retention`
  2. Add a check at the top of `cleanupOldEvents()`: if `DATA_RETENTION_LEGAL_HOLD` is true, return `{ auditDeleted: 0, loginDeleted: 0 }` immediately
  3. This matches the behavior of the in-process pruners in `audit/events.ts` and `data-retention-maintenance.ts`
  4. Add a log message when legal hold is active and cleanup is skipped (matching the pattern in `data-retention-maintenance.ts`)
- **Exit criterion**: `cleanupOldEvents()` skips all deletion when `DATA_RETENTION_LEGAL_HOLD` is true. Behavior matches the in-process pruners.

---

## LOW Priority

### L1: Add `needsRehash` handling to recruiting invitation and change-password flows
- **Files**: `src/lib/assignments/recruiting-invitations.ts:375`, `src/lib/actions/change-password.ts:46`
- **Status**: TODO
- **Plan**:
  1. In `recruiting-invitations.ts`, after the `verifyPassword` call at line 375, check `needsRehash` and if true, rehash the password with `hashPassword` and update the user row within the same transaction
  2. In `change-password.ts`, after the `verifyPassword` call at line 46, check `needsRehash`. However, since the user is about to set a new password anyway, the rehash is not needed here — the new password will be hashed with argon2id. Add a comment explaining why `needsRehash` is intentionally ignored in this path.
  3. The admin routes (backup, restore, migrate) are lower priority since they require admin capability and are infrequent
- **Exit criterion**: Recruiting invitation password verification rehashes bcrypt hashes to argon2id. Change-password path documents why rehash is not needed.

### L2: Optimize frozen leaderboard to avoid redundant full ranking computation
- **File**: `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:57-61`
- **Status**: TODO
- **Plan**:
  1. Add a `computeSingleUserLiveRank(assignmentId, userId)` function in `leaderboard.ts` that computes only the requesting user's live rank without computing the full leaderboard
  2. The function can do this by: (a) computing the user's live total score and penalty, (b) counting how many other users have a better live score
  3. Replace the `computeLeaderboard(assignmentId, true)` call at line 60 with the new function
  4. This avoids running the full scoring query (multiple SQL queries) just to find one user's rank
- **Exit criterion**: Frozen leaderboard requests for students no longer compute the full live leaderboard. Only the requesting user's rank is computed.

### L3: Add per-user connection count index to SSE events route
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:37-44`
- **Status**: TODO
- **Plan**:
  1. Add `const userConnectionCounts = new Map<string, number>()` at module level
  2. In `addConnection()`, increment `userConnectionCounts.get(userId)` (or set to 1 if not present)
  3. In `removeConnection()`, decrement `userConnectionCounts.get(connId)` and delete the key when it reaches 0
  4. Replace `countUserConnections(userId)` with `userConnectionCounts.get(userId) ?? 0`
  5. Remove the old `countUserConnections` function
  6. Update the stale connection cleanup in the interval to also clean up `userConnectionCounts` entries that have reached 0
- **Exit criterion**: Per-user connection count is O(1) lookup instead of O(n) iteration.

### L4: Document or deprecate redundant `db/cleanup.ts` cron endpoint
- **File**: `src/lib/db/cleanup.ts`, `src/app/api/internal/cleanup/route.ts`
- **Status**: TODO
- **Plan**:
  1. After M1 and M2 are implemented (making `db/cleanup.ts` use the canonical config and respect legal holds), add a deprecation comment to `cleanupOldEvents()` noting that the in-process pruners in `audit/events.ts` and `data-retention-maintenance.ts` provide the same functionality
  2. Add a JSDoc `@deprecated` tag to `cleanupOldEvents()` with a migration note
  3. Do NOT remove the endpoint yet — it may be referenced by external cron jobs. Just mark it for future removal.
- **Exit criterion**: `cleanupOldEvents()` is marked as `@deprecated` with a note pointing to the in-process pruners.

### L5: Document first-AC query scoring semantics in contest analytics
- **File**: `src/lib/assignments/contest-analytics.ts:171`
- **Status**: TODO
- **Plan**:
  1. Add a comment above the first-AC query (line 168-174) documenting that `ROUND(s.score, 2) = 100` checks the raw score, not the adjusted score after late penalties
  2. Note that for IOI scoring with late penalties, a raw score of 100 may have an adjusted score < 100, and the first-AC timeline may not accurately reflect IOI "first full adjusted score" timing
  3. The fix for IOI is non-trivial (requires knowing the late penalty at query time) and the current behavior is consistent with the ICPC-oriented "first accepted" concept
- **Exit criterion**: A code comment documents the scoring semantics and IOI caveat.

---

## Deferred Items

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| L6 (sanitizeSubmissionForViewer N+1 for list endpoints) | LOW | Same as D16/L6(c16) — only called from one place, no N+1 risk today | Re-open if function is added to list endpoints |
