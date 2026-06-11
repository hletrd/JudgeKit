# Cycle 19 Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** Multi-angle review (code quality, security, performance, architecture, correctness, data integrity, UI/UX)
**Base commit:** 10fb2ff6

---

## Findings

### F1: `computeSingleUserLiveRank` SQL for ICPC silently returns rank 1 for users with no submissions
- **File**: `src/lib/assignments/leaderboard.ts:131-137`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The ICPC branch of `computeSingleUserLiveRank` uses a `target` CTE that selects from `user_totals`. If the requesting user has no submissions at all, the `target` CTE returns zero rows. The `FROM user_totals ut, target t` cross-join then produces zero rows, and `COALESCE(1 + COUNT(*), 1)` returns 1 — implying the user is ranked #1 even though they have no submissions and shouldn't appear on the leaderboard at all. In contrast, the full leaderboard from `computeContestRanking` would not include users with zero submissions, so their rank would be undefined.

  The IOI branch has the same pattern (lines 161-166) — `target` CTE from `user_scores`, cross-join, same `COALESCE(1 + COUNT(*), 1)`. A user with zero submissions gets `total_score = 0` in `user_scores` only if they appear in the `submissions` table with a non-terminal or null score. If they have no submissions at all, the IOI branch also returns rank 1.

- **Concrete failure scenario**: A student joins a contest but has not submitted anything. The leaderboard is frozen. The student views the leaderboard and sees "Live Rank: #1" badge next to their name, which is misleading and confusing — they haven't solved anything.

- **Fix**: Before computing rank, check if the target user exists in the CTE results. If not, return `null` instead of computing a rank. Alternatively, add a `WHERE` clause to the `user_totals`/`user_scores` CTE that excludes users with zero solved problems (ICPC) or zero total score (IOI), and check if the target user appears in the filtered CTE.

### F2: `computeContestAnalytics` student progression does not apply IOI late penalties
- **File**: `src/lib/assignments/contest-analytics.ts:236`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The student progression calculation in `computeContestAnalytics` computes `adjustedScore` as `Math.round(Math.min(Math.max(Number(sub.score), 0), 100) / 100 * Number(sub.points) * 100) / 100`. This is a simple raw-score-to-points conversion without applying late penalties. In contrast, the main scoring query in `contest-scoring.ts` applies late penalties based on `examMode`, `deadline`, and `latePenalty`. For IOI contests with late penalties, a student's progression graph could show a higher score trajectory than what the leaderboard reports, which is inconsistent.

  The raw SQL query at lines 218-227 does not join `exam_sessions` or include `late_penalty` from `assignments`, so there is no data available to compute the penalty.

- **Concrete failure scenario**: In an IOI contest with a 20% late penalty, a student submits after the deadline and gets raw score 100. The progression graph shows the student reaching 100 points (raw score). The leaderboard shows the student at 80 points (after late penalty). The instructor reviewing analytics sees a discrepancy between the progression graph and the leaderboard.

- **Fix**: Either (a) include the late penalty computation in the student progression SQL query and JS calculation, matching `contest-scoring.ts`, or (b) document that the student progression chart shows raw scores (not adjusted) and is separate from the leaderboard's adjusted scoring.

### F3: `participant-timeline.ts` `firstAccepted` check uses `status === "accepted"` which misses IOI "full score" submissions
- **File**: `src/lib/assignments/participant-timeline.ts:195`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The participant timeline computes `firstAccepted` by finding the first submission with `status === "accepted"`. In ICPC contests, this is correct — "accepted" means full score. However, in IOI contests, submissions are rarely given the "accepted" status because IOI uses partial scoring; the status is typically "scored" rather than "accepted". This means that for IOI contests, `firstAcAt` and `timeToFirstAc` in the participant timeline will almost always be `null`, and the "first_ac" timeline event will never appear, even when a student achieves the maximum possible adjusted score.

  The `wrongBeforeAc` count at line 196-205 will also always be 0 for IOI contests.

- **Concrete failure scenario**: In an IOI contest, a student achieves a perfect score (all points) on a problem. The submission status is "scored", not "accepted". The participant audit timeline shows no "first AC" marker for this problem, and `timeToFirstAc` is null. The instructor sees no indication that the student solved the problem perfectly.

- **Fix**: For IOI contests, consider using `score >= problemPoints` as the "first AC" condition instead of `status === "accepted"`, or at minimum document the discrepancy. This is consistent with the `solved` field in `contest-scoring.ts` which uses `bestScore >= ap.points` for IOI.

### F4: `LeaderboardTable` uses `O(n*m)` lookup for per-problem results — `entries.problems.find()` per cell
- **File**: `src/components/contest/leaderboard-table.tsx:433-434`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: In the leaderboard table rendering, for each entry's problem cell, it calls `entry.problems.find((pr) => pr.problemId === p.problemId)`. This is `O(m)` per cell where `m` is the number of problems. With `n` entries and `m` problems, the total rendering time is `O(n * m^2)` for the problem cells alone. For a contest with 20 problems and 500 participants, that's 500 * 20 * 20 = 200,000 comparisons per render.

  The `IoiCell` component is also re-created on every render (it's a function component defined outside the `map` but called inline with props). This is fine performance-wise since React handles it, but the `find()` pattern could be improved.

- **Concrete failure scenario**: Not a practical problem for typical contest sizes (20 problems, 500 participants). Could become noticeable with very large problem sets (50+) or very large contests (1000+ participants) combined with frequent refreshes (every 30s).

- **Fix**: Pre-build a `Map<string, LeaderboardProblemResult>` per entry (or restructure `problems` as a `Record<string, ...>`) for `O(1)` lookup per cell. This reduces the total to `O(n * m)`.

### F5: `code-similarity.ts` `runAndStoreSimilarityCheck` uses `new Date()` for `createdAt` — all events in one batch share the same JS timestamp, but the actual DB insert may occur milliseconds later
- **File**: `src/lib/assignments/code-similarity.ts:397`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: The function creates `const now = new Date()` before the transaction, then uses it for all anti-cheat event `createdAt` values. This is a minor inconsistency — the DB default would use `NOW()` which is the actual transaction timestamp. Using a JS-side `new Date()` before the transaction means the `createdAt` could be slightly earlier than the actual insert time. This is already tracked as deferred item A19 (clock skew risk) — the specific instance is low risk since these events are not time-critical to millisecond precision.

- **Concrete failure scenario**: Negligible — the time difference is at most a few hundred milliseconds between the JS `new Date()` call and the actual DB insert. No operational impact.

- **Fix**: Remove the `now` variable and let the DB schema default (`.$defaultFn(() => new Date())`) handle the timestamp, or use `DEFAULT NOW()` on the column. This is already covered by the deferred A19 finding.

---

## Verified Safe (No Issue)

### VS1: Cycle 18 fixes are correctly implemented
- **Files**: `cleanup.ts`, `recruiting-invitations.ts`, `change-password.ts`, `leaderboard.ts`, `events/route.ts`, `contest-analytics.ts`
- **Description**: All six fixes from cycle 18 (M1, M2, L1-L4 mapped to F1-F7) have been correctly implemented and committed:
  - M1: `cleanup.ts` now uses canonical `DATA_RETENTION_DAYS` config
  - M2: `cleanup.ts` now respects `DATA_RETENTION_LEGAL_HOLD`
  - L1: `recruiting-invitations.ts` now rehashes bcrypt passwords on re-entry
  - L2: `leaderboard.ts` now uses `computeSingleUserLiveRank` for frozen leaderboard live rank
  - L3: `events/route.ts` now uses `userConnectionCounts` Map for O(1) per-user count
  - L4: `cleanup.ts:cleanupOldEvents()` is properly deprecated with JSDoc
  - L5: `contest-analytics.ts` has scoring semantics documentation on `firstAcMap`
  - L6: `cleanup.ts` is documented as superseded by in-process pruners

### VS2: `sanitizeHtml` with `dangerouslySetInnerHTML` is safe
- **Files**: `src/components/problem-description.tsx:51`, `src/lib/security/sanitize-html.ts`
- **Description**: The `dangerouslySetInnerHTML` usage in the problem description component passes content through `sanitizeHtml()`, which uses DOMPurify with strict tag/attribute allowlists, `ALLOW_DATA_ATTR: false`, and a URI regex that only allows `https:`, `mailto:`, and root-relative paths. This is a proper XSS defense.

### VS3: `safeJsonForScript` in `json-ld.tsx` is safe
- **Files**: `src/components/seo/json-ld.tsx:19`
- **Description**: The `dangerouslySetInnerHTML` usage for JSON-LD structured data passes content through `safeJsonForScript()` which strips `</script` sequences. This prevents script injection via JSON-LD.

### VS4: Password hashing and rehash flow is now complete
- **Files**: `src/lib/security/password-hash.ts`, `src/lib/auth/config.ts`, `src/lib/assignments/recruiting-invitations.ts`, `src/lib/actions/change-password.ts`
- **Description**: The bcrypt-to-argon2 rehash is now handled in the two most important paths: login (auth/config.ts) and recruiting re-entry (recruiting-invitations.ts). The change-password flow correctly skips rehash since the password is about to be replaced with a new argon2id hash. Admin/backup routes don't need rehash since they don't authenticate the user's own password for ongoing sessions.

### VS5: SSE connection tracking with O(1) user count is correctly implemented
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:29,48,55-62`
- **Description**: The `userConnectionCounts` Map is correctly maintained alongside `connectionInfoMap`:
  - `addConnection`: increments the count for the user
  - `removeConnection`: decrements the count, deleting the key when it reaches 0
  - The count is used for the `maxSseConnectionsPerUser` check
  - The stale cleanup timer correctly uses `removeConnection` which maintains the count

### VS6: `computeSingleUserLiveRank` SQL is structurally consistent with `computeContestRanking`
- **File**: `src/lib/assignments/leaderboard.ts:85-176`
- **Description**: The SQL queries in both ICPC and IOI branches mirror the scoring logic from `contest-scoring.ts`, including the late penalty application for both global and windowed exam modes. The key difference is that it counts users with better scores instead of computing the full leaderboard, which is correct for rank computation.

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
