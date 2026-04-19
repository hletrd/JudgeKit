# Aggregate Review — Cycle 18 Deep Code Review

**Date:** 2026-04-19
**Source reviews:**
- `cycle-18-comprehensive-review.md` (comprehensive multi-angle review covering code quality, security, performance, architecture, correctness, data integrity)
- `cycle-17-comprehensive-review.md` (previous cycle — all findings addressed or deferred)
- Prior cycles 1-16 reviews (findings already addressed or deferred in prior plan documents)

---

## CRITICAL (Immediate Action Required)

None.

---

## HIGH (Should Fix This Cycle)

None.

---

## MEDIUM (Should Fix Soon)

### M1: Conflicting audit retention env vars — `db/cleanup.ts` uses `AUDIT_RETENTION_DAYS` while `data-retention.ts` uses `AUDIT_EVENT_RETENTION_DAYS`
- **Source**: cycle-18 F1
- **Files**: `src/lib/db/cleanup.ts:5`, `src/lib/data-retention.ts:18`
- **Confidence**: HIGH
- **Description**: Two separate audit retention mechanisms use different env var names. The cron endpoint at `/api/internal/cleanup` reads `AUDIT_RETENTION_DAYS` (in `db/cleanup.ts`), while the in-process pruner uses `AUDIT_EVENT_RETENTION_DAYS` (in `data-retention.ts`). An operator setting one var has no effect on the other path, leading to inconsistent retention behavior.
- **Fix**: Consolidate `db/cleanup.ts` to use `DATA_RETENTION_DAYS` from `data-retention.ts`, or deprecate it entirely.

### M2: `db/cleanup.ts` does not respect `DATA_RETENTION_LEGAL_HOLD` — can delete data under legal hold
- **Source**: cycle-18 F3
- **Files**: `src/lib/db/cleanup.ts:9-39`
- **Confidence**: HIGH
- **Description**: The `cleanupOldEvents()` function (called by the cron endpoint) deletes audit and login events without checking `DATA_RETENTION_LEGAL_HOLD`. The in-process pruners in `audit/events.ts` and `data-retention-maintenance.ts` correctly check this flag. A litigation hold can be silently violated by the cron endpoint.
- **Fix**: Add `DATA_RETENTION_LEGAL_HOLD` check at the top of `cleanupOldEvents()`.

---

## LOW (Best Effort / Track)

### L1: `needsRehash` flag from `verifyPassword` is ignored in most call sites — bcrypt-to-argon2 migration stalls for non-login paths
- **Source**: cycle-18 F2
- **Files**: `src/lib/assignments/recruiting-invitations.ts:375`, `src/lib/actions/change-password.ts:46`, and 4 admin routes
- **Confidence**: HIGH
- **Description**: Only the login flow in `auth/config.ts` checks `needsRehash`. The recruiting re-entry flow and change-password flow discard the flag, meaning bcrypt hashes persist for users who authenticate through these paths.
- **Fix**: Add rehash logic to `recruiting-invitations.ts` and `change-password.ts`.

### L2: Leaderboard route computes ranking twice when frozen — redundant expensive computation
- **Source**: cycle-18 F4
- **Files**: `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:57-61`
- **Confidence**: HIGH
- **Description**: When the leaderboard is frozen and the viewer is a student, the route computes the leaderboard twice (frozen + live) to show the student their live rank. The second computation runs the full ranking function but only uses one user's result.
- **Fix**: Query only the requesting user's rank directly instead of computing the full live leaderboard.

### L3: `countUserConnections()` in SSE events route is O(n) — should be O(1) with a per-user index
- **Source**: cycle-18 F5
- **Files**: `src/app/api/v1/submissions/[id]/events/route.ts:37-44`
- **Confidence**: MEDIUM
- **Description**: The function iterates over all connections to count per-user connections. A `userConnectionCountMap` would make this O(1). Not a practical problem with current limits (500 max connections) but doesn't scale.
- **Fix**: Add a `userConnectionCountMap = new Map<string, number>()` maintained alongside the existing maps.

### L4: `db/cleanup.ts` is redundant with in-process pruners — duplicate deletion with different configs
- **Source**: cycle-18 F6
- **Files**: `src/lib/db/cleanup.ts:9-39`, `src/lib/audit/events.ts:179-200`, `src/lib/data-retention-maintenance.ts:74-78`
- **Confidence**: HIGH
- **Description**: Three separate mechanisms delete old audit/login events with different configurations. The cron endpoint is redundant because the in-process pruners already handle both with correct config and legal hold checks.
- **Fix**: Deprecate `db/cleanup.ts:cleanupOldEvents()` or refactor it to use canonical pruners.

### L5: Contest analytics `firstAcMap` query uses `ROUND(s.score, 2) = 100` — may not reflect IOI scoring with late penalties
- **Source**: cycle-18 F7
- **Files**: `src/lib/assignments/contest-analytics.ts:171`
- **Confidence**: MEDIUM
- **Description**: For IOI scoring with late penalties, a submission with raw score 100 can have an adjusted score < 100 after penalty. The first-AC query checks the raw score, so it may include or exclude entries inconsistently with the adjusted scoring model. The main leaderboard is not affected.
- **Fix**: Document that the first-AC filter is ICPC-oriented, or adjust for IOI scoring context.

### L6: `sanitizeSubmissionForViewer` DB query risk for list endpoints (carried forward)
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
