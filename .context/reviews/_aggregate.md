# Aggregate Review — Cycle 17 Deep Code Review

**Date:** 2026-04-19
**Source reviews:**
- `cycle-17-comprehensive-review.md` (comprehensive multi-angle review covering code quality, security, performance, architecture, correctness, testing)
- Prior cycles 1-16 reviews (findings already addressed or deferred in prior plan documents)

---

## CRITICAL (Immediate Action Required)

None.

---

## HIGH (Should Fix This Cycle)

None.

---

## MEDIUM (Should Fix Soon)

### M1: `firstAcMap` key lookup uses `endsWith` which can match wrong problem IDs
- **Source**: cycle-17 F1
- **Files**: `src/lib/assignments/contest-analytics.ts:187,251`
- **Description**: The `firstAcMap` is keyed by `"userId:problemId"`. When looking up entries for a specific problem, the code uses `key.endsWith(`:${p.problemId}`)`. This can produce false matches if one problem ID is a suffix of another (e.g., `"p1"` matches `"step1"`). With nanoid IDs the practical risk is negligible, but the logic is semantically wrong.
- **Fix**: Restructure `firstAcMap` as `Map<problemId, Map<userId, number>>` for O(1) per-problem lookups, or use exact key decomposition.

### M2: `getParticipantTimeline` fetches all code snapshots without a limit — potential memory/response spike
- **Source**: cycle-17 F2
- **Files**: `src/lib/assignments/participant-timeline.ts:151-161`
- **Description**: The participant timeline query fetches ALL code snapshots for a user in an assignment with no limit. A student active throughout a long contest could have thousands of snapshots, producing a very large API response.
- **Fix**: Add a `LIMIT` to the code snapshots query (e.g., most recent 200 per problem, or 1000 total). For the timeline view, only the most recent snapshots are typically relevant.

---

## LOW (Best Effort / Track)

### L1: `getParticipantTimeline` fetches all anti-cheat events without a limit — should use aggregation
- **Source**: cycle-17 F3
- **Files**: `src/lib/assignments/participant-timeline.ts:161-168`
- **Description**: The anti-cheat events query fetches all events for a user just to count by type. A `GROUP BY eventType, COUNT(*)` aggregation would be more efficient.
- **Fix**: Replace the full SELECT with an aggregation query.

### L2: Contest analytics cache has no stale-while-revalidate — cache miss causes blocking compute
- **Source**: cycle-17 F4
- **Files**: `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:39-45`
- **Description**: Unlike `computeContestRanking`, the analytics cache has no background refresh mechanism. On cache expiry, the next request blocks until analytics are recomputed. Multiple concurrent requests can trigger duplicate computations.
- **Fix**: Add stale-while-revalidate or a `_refreshingKeys`-like deduplication mechanism.

### L3: `redeemRecruitingToken` uses `new Date()` for expiry check instead of relying solely on SQL `NOW()`
- **Source**: cycle-17 F5
- **Files**: `src/lib/assignments/recruiting-invitations.ts:410`
- **Description**: The JS-side expiry check at line 410 uses `new Date()` while the atomic claim at line 485 uses `NOW()`. Clock skew between app and DB can cause confusing error messages (e.g., `"alreadyRedeemed"` when the token actually expired).
- **Fix**: Remove the JS-side expiry check and rely solely on the SQL WHERE clause. Differentiate the error message for expired vs already-redeemed.

### L4: IOI score tie detection uses floating-point strict equality
- **Source**: cycle-17 F6
- **Files**: `src/lib/assignments/contest-scoring.ts:375`
- **Description**: Tie detection uses `prev.totalScore === curr.totalScore`. While currently safe due to Math.round normalization, this is fragile. Using an epsilon comparison would be more robust.
- **Fix**: Use `Math.abs(prev.totalScore - curr.totalScore) < 0.01` for tie detection.

### L5: `triggerAutoCodeReview` has no concurrency control — burst AI API calls
- **Source**: cycle-17 F7
- **Files**: `src/lib/judge/auto-review.ts:13`
- **Description**: No concurrency limiter for auto-review calls. A burst of accepted submissions triggers parallel AI API calls, potentially hitting provider rate limits or consuming API budget.
- **Fix**: Add `pLimit(1)` or `pLimit(2)` concurrency limiter for auto-review calls.

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
