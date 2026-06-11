# Cycle 18 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, testing, data integrity)
**Base commit:** 7c1b65cc

---

## Findings

### F1: Conflicting audit retention env vars — `db/cleanup.ts` uses `AUDIT_RETENTION_DAYS` while `data-retention.ts` uses `AUDIT_EVENT_RETENTION_DAYS`
- **File**: `src/lib/db/cleanup.ts:5`, `src/lib/data-retention.ts:18`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: There are two separate audit retention mechanisms that use different env var names:
  - `src/lib/db/cleanup.ts` reads `AUDIT_RETENTION_DAYS` (default 90) for its `cleanupOldEvents()` function, which is called by the `/api/internal/cleanup` cron endpoint.
  - `src/lib/data-retention.ts` reads `AUDIT_EVENT_RETENTION_DAYS` (default 90) for its `DATA_RETENTION_DAYS.auditEvents` value, which is used by `src/lib/audit/events.ts` for its in-process pruning via `pruneOldAuditEvents()`.
  
  If an operator sets `AUDIT_EVENT_RETENTION_DAYS=180` to extend audit retention, the cron cleanup endpoint still uses the default 90 days and deletes audit events that the in-process pruner would have kept. Conversely, setting `AUDIT_RETENTION_DAYS=180` only affects the cron endpoint, while the in-process pruner (which runs on a 24-hour interval) still uses 90 days. The two cleanup paths can also race: the cron endpoint and the in-process timer both delete from `audit_events` without coordination.

  Additionally, `db/cleanup.ts` only cleans `audit_events` and `login_events`, while `data-retention-maintenance.ts` handles all six categories (chatMessages, antiCheatEvents, recruitingRecords, submissions, loginEvents, plus the audit_events via the separate in-process pruner in `events.ts`). The cron endpoint is therefore incomplete and misleading.

- **Concrete failure scenario**: An operator configures `AUDIT_EVENT_RETENTION_DAYS=365` via the documented `DATA_RETENTION_DAYS` system. The in-process pruner respects this and keeps audit events for 365 days. However, the cron endpoint at `/api/internal/cleanup` reads `AUDIT_RETENTION_DAYS` (which is not set), defaults to 90 days, and deletes all audit events older than 90 days — silently overwriting the operator's intent and potentially destroying compliance-relevant audit data.

- **Fix**: Consolidate `db/cleanup.ts` to use `DATA_RETENTION_DAYS` from `data-retention.ts` instead of its own env var, or deprecate `db/cleanup.ts` entirely since the in-process pruning and `data-retention-maintenance.ts` already cover all the same cleanup. At minimum, rename the env var in `db/cleanup.ts` to `AUDIT_EVENT_RETENTION_DAYS` so it matches the canonical config.

### F2: `needsRehash` flag from `verifyPassword` is ignored in 4 out of 5 call sites — bcrypt-to-argon2 migration stalls for non-login password verifications
- **File**: `src/app/api/v1/admin/backup/route.ts:62`, `src/app/api/v1/admin/restore/route.ts:56`, `src/app/api/v1/admin/migrate/export/route.ts:56`, `src/app/api/v1/admin/migrate/import/route.ts:58,143`, `src/lib/assignments/recruiting-invitations.ts:375`, `src/lib/actions/change-password.ts:46`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: `verifyPassword()` returns `{ valid, needsRehash }` to signal that a bcrypt hash should be upgraded to argon2id. Only `src/lib/auth/config.ts:201-224` (the login flow) checks `needsRehash` and performs the upgrade. All other call sites destructure only `{ valid }` and discard `needsRehash`. This means that for users who only authenticate via non-login paths (e.g., backup password verification, recruiting token redemption), their bcrypt hash is never upgraded. The bcrypt-to-argon2 migration is already noted as deferred item A25, but this specific aspect — missed rehash opportunities — makes the migration slower than necessary.

  The most impactful call site is `recruiting-invitations.ts:375` where candidates verify their password during contest re-entry. This is a common authentication path for recruiting candidates, and their bcrypt hashes persist until they eventually log in through the main flow.

- **Concrete failure scenario**: A recruiting candidate with a bcrypt hash verifies their password to re-enter a contest. The verification succeeds but `needsRehash: true` is discarded. The candidate's password remains stored as bcrypt, which is less resistant to GPU-based brute force than argon2id. If the candidate never logs in through the main login page (always re-enters via the recruiting flow), their hash is never upgraded.

- **Fix**: Add rehash logic to `recruiting-invitations.ts:375` (the most impactful call site) and `change-password.ts:46` (where the user is already providing their current password). The admin/migrate routes are lower priority since they require admin capability. Example:
  ```ts
  const { valid, needsRehash } = await verifyPassword(accountPassword, existingUser.passwordHash);
  if (!valid) { ... }
  if (needsRehash) {
    const newHash = await hashPassword(accountPassword);
    await tx.update(users).set({ passwordHash: newHash }).where(eq(users.id, existingUser.id));
  }
  ```

### F3: `db/cleanup.ts` does not respect `DATA_RETENTION_LEGAL_HOLD` — can delete data under legal hold
- **File**: `src/lib/db/cleanup.ts:9-39`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The `cleanupOldEvents()` function in `db/cleanup.ts` (called by the `/api/internal/cleanup` cron endpoint) deletes audit and login events without checking `DATA_RETENTION_LEGAL_HOLD`. In contrast, the in-process pruner in `audit/events.ts:179-183` and the sensitive data pruner in `data-retention-maintenance.ts:81-84` both check `DATA_RETENTION_LEGAL_HOLD` and skip pruning when it is active.

  If an operator sets `DATA_RETENTION_LEGAL_HOLD=true` to preserve all data for a litigation hold, the cron endpoint will still delete old audit and login events, violating the hold.

- **Concrete failure scenario**: A company receives a litigation hold notice and sets `DATA_RETENTION_LEGAL_HOLD=true`. The in-process pruning and sensitive data pruning are correctly suspended. However, the cron job at `/api/internal/cleanup` continues to run nightly and deletes audit events older than 90 days, potentially destroying evidence relevant to the litigation.

- **Fix**: Add a `DATA_RETENTION_LEGAL_HOLD` check at the top of `cleanupOldEvents()` in `db/cleanup.ts`:
  ```ts
  import { DATA_RETENTION_LEGAL_HOLD } from "@/lib/data-retention";
  
  export async function cleanupOldEvents() {
    if (DATA_RETENTION_LEGAL_HOLD) return { auditDeleted: 0, loginDeleted: 0 };
    ...
  }
  ```

### F4: Leaderboard route computes ranking twice when frozen — second computation is redundant and expensive
- **File**: `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:57-61`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: When the leaderboard is frozen and the viewer is a student, the route computes the leaderboard twice: once frozen (line 57) and once live (line 60). The live computation is needed to show the student their own live rank, but it requires running the full `computeContestRanking` function again (which executes multiple SQL queries). Since the ranking cache in `contest-scoring.ts` is keyed by `assignmentId:cutoffSec`, the live computation (`cutoffSec = undefined`) and the frozen computation (`cutoffSec = freezeSec`) hit different cache keys, so there is no cache sharing. The live computation result is then only used to find one user's rank.

  For large contests, each `computeContestRanking` call can take several seconds. Doing it twice doubles the latency and DB load for every student leaderboard request while the contest is frozen.

- **Concrete failure scenario**: During a 500-participant ICPC contest with frozen leaderboard, 100 students refresh the leaderboard page simultaneously. Each request triggers two full ranking computations (frozen + live). The DB receives 200 sets of ranking queries (each set includes 2-3 SQL queries), causing significant DB load and slow response times.

- **Fix**: Instead of computing the full live leaderboard, query only the requesting user's rank directly. This could be a lightweight SQL query that counts how many users have a better score than the requesting user. Alternatively, add a `computeSingleUserRank(assignmentId, userId)` function that avoids computing the full leaderboard.

### F5: `countUserConnections()` in SSE events route is O(n) over all connections — degrades with many concurrent users
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:37-44`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `countUserConnections()` function iterates over all entries in `connectionInfoMap` to count connections for a specific user. This is O(n) where n is the total number of active connections across all users. When `MAX_GLOBAL_SSE_CONNECTIONS = 500`, this means up to 500 map iterations per connection attempt. While 500 iterations is fast, this function is called on every new SSE connection request, and the iteration approach doesn't scale well if the connection limit is ever raised.

  A `userConnectionCounts` Map<string, number> maintained alongside `connectionInfoMap` would make this O(1). The existing `activeConnectionSet` and `connectionInfoMap` already provide all the information needed; the per-user count is just not indexed.

- **Concrete failure scenario**: Not a practical problem with current limits (500 max connections, fast iteration). However, if the system is scaled to support more concurrent SSE connections (e.g., 10,000), every new connection would iterate over 10,000 entries.

- **Fix**: Add a `userConnectionCountMap = new Map<string, number>()` that is incremented/decremented in `addConnection`/`removeConnection`. Replace `countUserConnections(userId)` with a simple `userConnectionCountMap.get(userId) ?? 0` lookup.

### F6: `cleanupOldEvents()` in `db/cleanup.ts` is redundant with `pruneOldAuditEvents()` in `audit/events.ts` and `pruneLoginEvents()` in `data-retention-maintenance.ts` — duplicate deletion with different configs
- **File**: `src/lib/db/cleanup.ts:9-39`, `src/lib/audit/events.ts:179-200`, `src/lib/data-retention-maintenance.ts:74-78`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: There are three separate mechanisms that delete old audit/login events:
  1. `db/cleanup.ts:cleanupOldEvents()` — called by `/api/internal/cleanup` cron, uses `AUDIT_RETENTION_DAYS`, no legal hold check, no batch delay between audit and login deletion
  2. `audit/events.ts:pruneOldAuditEvents()` — in-process timer, uses `DATA_RETENTION_DAYS.auditEvents`, has legal hold check, 24h interval
  3. `data-retention-maintenance.ts:pruneLoginEvents()` — in-process timer, uses `DATA_RETENTION_DAYS.loginEvents`, has legal hold check, 24h interval

  All three use the same batched DELETE pattern (`ctid IN (SELECT ctid ... LIMIT 5000)`). The cron endpoint is redundant because the in-process pruners already handle both audit events and login events with correct configuration (same retention days from the canonical `DATA_RETENTION_DAYS` config, legal hold respect). Running both the cron and in-process pruners means the same rows are potentially scanned twice per day.

- **Concrete failure scenario**: The cron endpoint and in-process pruner both run within the same 24-hour window. Both scan `audit_events` for rows older than the cutoff. While the second scan finds fewer rows (already deleted), it still consumes a DB connection and performs a sequential scan on a potentially large table.

- **Fix**: Deprecate `db/cleanup.ts:cleanupOldEvents()` and the `/api/internal/cleanup` endpoint, or refactor it to call the canonical pruners from `data-retention-maintenance.ts` and `audit/events.ts`. If the cron endpoint is kept for operational reasons, it should at minimum use the canonical retention config and respect legal holds (as described in F1 and F3).

### F7: Contest analytics `firstAcMap` query uses `ROUND(s.score, 2) = 100` which excludes non-exact-100 scores that are still "accepted"
- **File**: `src/lib/assignments/contest-analytics.ts:171`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The first-AC query at line 171 filters submissions with `ROUND(s.score, 2) = 100`. In IOI scoring with late penalties, a submission's adjusted score can be less than 100 even if the raw score is 100. For example, a 10% late penalty would reduce the adjusted score to 90. The scoring query in `contest-scoring.ts` applies the late penalty: `ROUND(((score / 100.0 * points) * (1.0 - latePenalty / 100.0))::numeric, 2)`. However, the first-AC query in `contest-analytics.ts` checks `ROUND(s.score, 2) = 100` against the raw `s.score` column, not the adjusted score.

  For ICPC scoring, this is correct because ICPC treats any submission with `ROUND(score, 2) = 100` as accepted. But for IOI scoring, the "first AC" concept is less meaningful because partial scores are the norm, and the analytics would miss "first full score" entries where late penalties reduced the effective score.

  In practice, this only affects the solve timeline and solve time calculations in analytics. The main leaderboard in `contest-scoring.ts` correctly uses the adjusted score.

- **Concrete failure scenario**: In an IOI contest with a 10% late penalty, a student submits a solution that scores 100 raw points after the deadline. The adjusted score is 90. The first-AC query excludes this submission from the solve timeline because `ROUND(100, 2) = 100` matches, but in the IOI context this is not a "full score" after penalty adjustment. The analytics shows this problem as "unsolved" in the timeline even though the student achieved the maximum raw score.

- **Fix**: For IOI contests, consider using a different threshold for the "first AC" concept (e.g., the student's first submission that achieved the maximum adjusted score for that problem). Alternatively, add a comment documenting that the `ROUND(s.score, 2) = 100` filter is ICPC-oriented and may not accurately reflect IOI "first solve" timing.

---

## Verified Safe (No Issue)

### VS1: Cycle 17 fixes are correctly implemented
- **Files**: `contest-analytics.ts`, `participant-timeline.ts`, `recruiting-invitations.ts`, `contest-scoring.ts`, `auto-review.ts`, `analytics/route.ts`
- **Description**: All six fixes from cycle 17 (F1-F7 in the review, mapped to M1, M2, L1-L5 in the plan) have been correctly implemented and committed. Verified by reading each file.

### VS2: `sanitizeHtml` is correctly configured with DOMPurify
- **File**: `src/lib/security/sanitize-html.ts`
- **Description**: DOMPurify is configured with a strict allowlist of tags and attributes, `ALLOW_DATA_ATTR: false`, and a URI regex that only allows `https:`, `mailto:`, and root-relative paths. The `afterSanitizeAttributes` hook correctly adds `rel="noopener noreferrer"` and `target="_blank"` to links, and strips external image sources. This is a solid XSS defense.

### VS3: Password hashing uses argon2id with OWASP-recommended parameters
- **File**: `src/lib/security/password-hash.ts`
- **Description**: Argon2id is used with `memoryCost: 19456` (19 MiB, OWASP minimum), `timeCost: 2`, `parallelism: 1`. Bcrypt legacy hashes are transparently rehashed on login. The `verifyPassword` function correctly differentiates between bcrypt and argon2 hashes.

### VS4: Submission creation is properly rate-limited with advisory locks
- **File**: `src/app/api/v1/submissions/route.ts:245-316`
- **Description**: The submission creation endpoint uses `pg_advisory_xact_lock` on the user ID to serialize concurrent submissions, preventing TOCTOU races on rate limit checks. The global queue limit, per-user pending limit, and per-minute rate limit are all checked inside the same transaction.

### VS5: SSE connection tracking is properly bounded
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts`
- **Description**: The in-memory connection tracking has `MAX_GLOBAL_SSE_CONNECTIONS = 500` and `MAX_TRACKED_CONNECTIONS = 1000`. The stale connection cleanup timer runs every 60 seconds and evicts connections older than `sseTimeoutMs + 30s`. The `addConnection` function evicts oldest entries when the tracking map exceeds the cap.

### VS6: Contest access code redemption is atomic with proper TOCTOU prevention
- **File**: `src/lib/assignments/access-codes.ts:92-207`
- **Description**: The `redeemAccessCode` function runs inside a transaction, reads the assignment and checks for existing tokens within the transaction, and handles concurrent redemption via the `23505` unique constraint error. The enrollment upsert uses `onConflictDoNothing` for idempotency.

---

## Previously Deferred Items (Still Active)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| A19 | `new Date()` clock skew risk | LOW | Deferred -- only affects distributed deployments with unsynchronized clocks |
| A7 | Dual encryption key management | MEDIUM | Deferred -- consolidation requires migration |
| A12 | Inconsistent auth/authorization patterns | MEDIUM | Deferred -- existing routes work correctly |
| A2 | Rate limit eviction could delete SSE slots | MEDIUM | Deferred -- unlikely with heartbeat refresh |
| A17 | JWT contains excessive UI preference data | LOW | Deferred -- requires session restructure |
| A25 | Timing-unsafe bcrypt fallback | LOW | Deferred -- bcrypt-to-argon2 migration in progress |
| A26 | Polling-based backpressure wait | LOW | Deferred -- no production reports |
| L2(c13) | Anti-cheat LRU cache single-instance limitation | LOW | Deferred -- already guarded by getUnsupportedRealtimeGuard |
| L5(c13) | Bulk create elevated roles warning | LOW | Deferred -- server validates role assignments |
| D16 | `sanitizeSubmissionForViewer` unexpected DB query | LOW | Deferred -- only called from one place, no N+1 risk |
| D17 | Exam session `new Date()` clock skew | LOW | Deferred -- same as A19 |
| D18 | Contest replay top-10 limit | LOW | Deferred -- likely intentional, requires design input |
| L6(c16) | `sanitizeSubmissionForViewer` N+1 risk for list endpoints | LOW | Deferred -- re-open if added to list endpoints |
