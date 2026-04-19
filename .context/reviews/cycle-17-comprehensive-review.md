# Cycle 17 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, testing)
**Base commit:** 86b70375

---

## Findings

### F1: `firstAcMap` key lookup uses `endsWith` which can match wrong problem IDs
- **File**: `src/lib/assignments/contest-analytics.ts:187,251`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: The `firstAcMap` is keyed by `"userId:problemId"`. When looking up entries for a specific problem, the code uses `key.endsWith(`:${p.problemId}`)`. This can produce false matches if one problem ID is a suffix of another. For example, if `problemId` values `"abc"` and `"xyzabc"` both exist, then key `"user1:xyzabc"` would match `endsWith(":abc")` and incorrectly attribute first-AC data to problem `"abc"`. With nanoid-generated IDs (21 chars from a 64-char alphabet), the practical collision probability is astronomically low, but the logic is semantically wrong and could produce incorrect analytics in edge cases (e.g., manually-created short IDs, imported problem IDs).
- **Concrete failure scenario**: A system imports problems with IDs `"p1"` and `"step1"`. Key `"user42:step1"` would match `endsWith(":p1")`, incorrectly attributing user42's first AC on problem "step1" to problem "p1" in the solve timeline and solve time calculations.
- **Fix**: Use exact key lookup instead of `endsWith`. Replace the `for (const [key, ts] of firstAcMap)` iteration with direct `firstAcMap.get(`${userId}:${p.problemId}`)` lookups by iterating over entries/users instead. Or restructure `firstAcMap` as `Map<problemId, Map<userId, number>>` for O(1) per-problem lookups.

### F2: `getParticipantTimeline` fetches all code snapshots without a limit — potential memory spike
- **File**: `src/lib/assignments/participant-timeline.ts:151-161`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The participant timeline query fetches ALL code snapshots for a user in an assignment with no limit. Since code snapshots can be created at high frequency (once per keystroke in some editor integrations, with per-user rate limiting now capping at ~60/hour), a student who is active throughout a long contest could have thousands of snapshots. Each snapshot row includes `id`, `problemId`, `language`, `charCount`, and `createdAt`, so the row itself is small. However, the query result set can be large. Combined with the 6 other parallel queries in `Promise.all`, this can consume significant DB connection time and memory. More critically, the snapshot data is then all sent in the API response, which can be very large.
- **Concrete failure scenario**: A student participates in a 3-day contest with code snapshot saving every minute during active coding. Over 3 days, this generates ~4320 snapshots. The timeline API response includes all of these, producing a large JSON payload. If an instructor opens the participant audit page for this student, the response could be several megabytes, causing slow page load.
- **Fix**: Add a `LIMIT` to the code snapshots query (e.g., most recent 200 per problem, or 1000 total). For the timeline view, only the most recent snapshots are typically relevant. Alternatively, paginate the snapshot data or fetch it on-demand via the existing paginated `/api/v1/contests/[assignmentId]/code-snapshots/[userId]` endpoint.

### F3: `getParticipantTimeline` fetches all anti-cheat events without a limit
- **File**: `src/lib/assignments/participant-timeline.ts:161-168`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Similar to F2, the anti-cheat events query fetches all events for a user in an assignment with no limit. For a student in a long contest with heartbeats every 60 seconds, this could be thousands of rows. The query only selects `eventType`, so rows are small, but it still represents an unbounded query.
- **Concrete failure scenario**: Same as F2, but with heartbeats: a 3-day contest generates ~4320 heartbeat events per student. The query returns all of them just to count by type.
- **Fix**: Replace the full SELECT with a `GROUP BY eventType, COUNT(*)` aggregation query. This would be both more efficient and return only the data actually used (the `antiCheatSummary.byType` and `antiCheatSummary.totalEvents` fields).

### F4: Contest analytics cache has no stale-while-revalidate — cache miss causes blocking compute
- **File**: `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:39-45`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The analytics endpoint uses a simple LRU cache with 60-second TTL. On a cache miss, the full `computeContestAnalytics` function runs synchronously, which executes 4-6 SQL queries and does significant in-memory computation. Unlike the `computeContestRanking` cache (which uses stale-while-revalidate), there is no background refresh mechanism. When the cache expires (every 60s), the next request blocks until analytics are recomputed. For large contests, this can take several seconds.
- **Concrete failure scenario**: An instructor refreshes the analytics page right after the 60s TTL expires. The page takes 3-5 seconds to load because the analytics are recomputed from scratch. During this time, the DB connection is held. If multiple instructors refresh simultaneously, multiple concurrent computations run (no deduplication like `_refreshingKeys` in contest-scoring.ts).
- **Fix**: Add a stale-while-revalidate pattern similar to `computeContestRanking`, or use a short blocking TTL + longer stale TTL. Alternatively, add a `_refreshingKeys`-like deduplication mechanism so only one background refresh runs at a time.

### F5: `redeemRecruitingToken` uses `new Date()` for expiry check instead of `NOW()` — inconsistent with atomic claim
- **File**: `src/lib/assignments/recruiting-invitations.ts:410`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: When checking if an invitation has expired before redeeming, line 410 uses `invitation.expiresAt < new Date()` (app time). However, the atomic claim at line 485 uses `NOW()` in the SQL WHERE clause (`expires_at > NOW()`). If the app server's clock is slightly behind the DB server's clock, the JS check could pass (invitation appears unexpired) but the SQL check could fail (DB says it's expired), causing the transaction to throw `"alreadyRedeemed"`. Conversely, if the app clock is ahead, the JS check could reject an invitation that the DB would consider still valid. This is the same class of issue as the deferred A19 (`new Date()` clock skew risk).
- **Concrete failure scenario**: The app server clock is 2 seconds behind the DB server. An invitation expires at T. At T-1s (app time), the JS check passes. But the DB sees T+1s, so `NOW()` > `expiresAt`, and the atomic update returns no rows. The error `"alreadyRedeemed"` is thrown, which is confusing because the invitation was never redeemed — it just expired during the race.
- **Fix**: Remove the JS-side expiry check at line 410 and rely solely on the atomic SQL WHERE clause at line 485 for expiry validation. The SQL check is the authoritative one. If the invitation is expired, the atomic update will return no rows, and the `"alreadyRedeemed"` error should be replaced with a more specific `"tokenExpired"` error in that case.

### F6: `computeContestRanking` IOI score comparison for tie detection uses floating-point equality
- **File**: `src/lib/assignments/contest-scoring.ts:375`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: For IOI scoring, tie detection at line 375 uses `prev.totalScore === curr.totalScore`. While `totalScore` is normalized to 2 decimal places via `Math.round(rawTotal * 100) / 100` at line 333, and each problem's `bestScore` is rounded to 2 decimals in SQL via `ROUND(..., 2)`, the sum of 2-decimal values can still produce floating-point drift (e.g., 30.01 + 50.02 could be 80.03000000000001 before the Math.round correction). The Math.round on line 333 should prevent this, but the tie detection depends on this normalization being perfect. If a future change removes or modifies the normalization, ties could be broken incorrectly.
- **Concrete failure scenario**: Unlikely with current code due to the Math.round normalization, but if someone changes the normalization logic or if a very large number of problems (50+) causes accumulated float drift that exceeds the Math.round precision, two students with the same true score could be ranked differently.
- **Fix**: Use `Math.abs(prev.totalScore - curr.totalScore) < 0.01` for tie detection instead of strict equality. This is more robust against floating-point precision issues and self-documenting about the precision expectation.

### F7: `triggerAutoCodeReview` has no concurrency control — multiple accepted submissions trigger parallel AI calls
- **File**: `src/lib/judge/auto-review.ts:13`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `triggerAutoCodeReview` function is called with `void` (fire-and-forget) from the judge poll endpoint whenever a submission is accepted. There is no concurrency limiter. If multiple submissions are judged simultaneously and all are accepted, multiple parallel AI API calls are made. Each call includes the full source code and problem description in the prompt, consuming API tokens. With a 30-second timeout per call, a burst of accepted submissions could consume significant AI API quota and instance resources.
- **Concrete failure scenario**: A contest ends and 50 submissions are judged in quick succession, all accepted. 50 parallel AI review requests are sent to the AI provider. This could hit the provider's rate limit or consume a large portion of the API budget in seconds.
- **Fix**: Add a `pLimit(1)` or `pLimit(2)` concurrency limiter for auto-review calls, similar to the contest replay limiter. This ensures reviews are processed one or two at a time, preventing burst API usage.

---

## Verified Safe (No Issue)

### VS1: Contest replay `pLimit(2)` concurrency is correctly implemented
- **File**: `src/lib/assignments/contest-replay.ts:64`
- **Description**: The cycle 16 fix correctly reduced concurrency from 4 to 2 and added a clear comment explaining the DB connection pool sizing rationale. The `pLimit(2)` means at most 6 concurrent SQL queries, which is well within a 20-connection pool.

### VS2: `isAdmin` is correctly made module-private
- **File**: `src/lib/api/auth.ts:98`
- **Description**: The `isAdmin` function is now module-private (no `export`), with a `@internal` JSDoc tag. The `handler.ts` re-export has been removed. All callers use `isAdminAsync()`.

### VS3: Anti-cheat heartbeat gap detection correctly uses DESC ordering
- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:197-201`
- **Description**: The cycle 16 fix correctly changed the query to use `desc(antiCheatEvents.createdAt)` and then reverses the array before computing gaps. This ensures the most recent heartbeats are examined for gap detection.

### VS4: `resetRecruitingInvitationAccountPassword` correctly sets `mustChangePassword: true`
- **File**: `src/lib/assignments/recruiting-invitations.ts:241`
- **Description**: The cycle 16 fix correctly sets `mustChangePassword: true` as defense-in-depth. The redeem flow at line 358 correctly sets it back to `false` after the password is changed.

### VS5: `getInvitationStats` uses atomic single-query aggregation
- **File**: `src/lib/assignments/recruiting-invitations.ts:263-285`
- **Description**: The cycle 16 fix correctly replaced the two-query approach with a single SQL query using conditional aggregation. The `Math.max(pending, 0)` guard prevents negative pending counts.

### VS6: Contest scoring stale-while-revalidate failure cooldown
- **File**: `src/lib/assignments/contest-scoring.ts:106-121`
- **Description**: The cycle 16 fix correctly adds a per-key failure cooldown (`REFRESH_FAILURE_COOLDOWN_MS = 5000`) to prevent amplifying DB failures. The `_lastRefreshFailureAt` map is properly cleaned up on success.

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
| L6(c16) | `sanitizeSubmissionForViewer` N+1 risk for list endpoints | LOW | Deferred — re-open if added to list endpoints |
