# Cycle 21 Verifier

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Evidence-based correctness check against stated behavior

---

## F1: `computeSingleUserLiveRank` IOI rank may differ from main leaderboard for tied scores

- **File**: `src/lib/assignments/leaderboard.ts:186-187`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The IOI live rank query counts users with `total_score > t.total_score`. The main leaderboard uses `isScoreTied(a, b)` which considers scores within 0.01 as tied (line 351-353). The SQL `us.total_score > t.total_score` uses strict inequality, so a user whose total_score differs by less than 0.01 from the target user would be counted as "ranked above" in the live rank query but treated as "tied" on the main leaderboard.

  Example: Target user has `total_score = 80.03`. Another user has `total_score = 80.03000000000001` (float drift). In the SQL query, `80.03000000000001 > 80.03` is TRUE, so the other user is counted as ranked above, making the target's live rank 1 higher than their main leaderboard rank. On the main leaderboard, `isScoreTied(80.03, 80.03000000000001)` returns TRUE because `Math.abs(80.03 - 80.03000000000001) < 0.01`, so they share the same rank.

- **Concrete failure scenario**: A student sees "Live Rank: #5" but on the unfrozen leaderboard they are tied at #4 with another student. The discrepancy is caused by floating-point drift in the SQL aggregate vs the JS epsilon comparison.
- **Fix**: In the SQL query, use `ROUND(us.total_score, 2) > ROUND(t.total_score, 2)` instead of `us.total_score > t.total_score` to match the 2-decimal precision used by the main leaderboard's `isScoreTied` function. Since each problem score is already `ROUND(..., 2)`, the sum should be consistent, but the rounding guard would make the tie-detection airtight.

## F2: `exam-sessions.ts` `startExamSession` idempotency relies on `onConflictDoNothing` — race condition window

- **File**: `src/lib/assignments/exam-sessions.ts:60-95`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The function first checks for an existing session (line 60-65), and if none exists, inserts a new session with `onConflictDoNothing` (line 87-94). Then it re-fetches the session (line 97-102). This handles the race condition where two concurrent requests both pass the "no existing session" check — one insert succeeds and the other is silently ignored by `onConflictDoNothing`, then the re-fetch returns the winning row. This is correct.

  However, there's a subtle issue: the `personalDeadline` is computed from `now` (line 78-82). If two concurrent requests arrive slightly apart, the first request computes `personalDeadline = now1 + durationMs` and the second computes `personalDeadline = now2 + durationMs`. The winning insert's deadline depends on which request's insert succeeds. The re-fetch returns the winning row's deadline. This is correct — the first-to-insert wins and the second request gets the first request's deadline.

- **Reclassified**: No bug found. The `onConflictDoNothing` + re-fetch pattern correctly handles concurrent inserts.

## F3: Verified: Cycle 20 fixes are correctly implemented and deployed

- **Files**: `src/lib/assignments/leaderboard.ts`, `src/components/contest/leaderboard-table.tsx`
- **Description**:
  - `computeSingleUserLiveRank` IOI branch: includes `LEFT JOIN exam_sessions` and the windowed late penalty CASE expression. Parameters `examMode` and `latePenalty` are correctly passed. **VERIFIED**.
  - `LeaderboardTable` live rank badge: condition is `data.frozen && (entry.isCurrentUser || (currentUserId && entry.userId === currentUserId)) && entry.liveRank != null`. This correctly falls back to `currentUserId` matching when `isCurrentUser` is not set. **VERIFIED**.
