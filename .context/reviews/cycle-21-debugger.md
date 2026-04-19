# Cycle 21 Debugger

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Latent bug surface, failure modes, regressions

---

## F1: Anti-cheat `limit`/`offset` NaN causes query to return zero results silently

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: `Number("abc")` is `NaN`. `Math.max(1, NaN)` is `NaN`. Passing `NaN` to Drizzle's `.limit(NaN)` generates SQL `LIMIT NaN` which PostgreSQL rejects with `ERROR: invalid input syntax for type integer: "NaN"`. This causes an unhandled 500 error on the anti-cheat GET endpoint. The `offset` parameter has the same issue.
- **Concrete failure scenario**: A malformed URL or buggy client sends `?limit=abc`. The server returns a 500 error instead of a 400 or graceful default.
- **Fix**: Use `parseInt` with `|| 100` fallback: `const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500))`.

## F2: `contest-scoring.ts` ICPC `wrongBeforeAc` uses window function that may include post-AC submissions in the count

- **File**: `src/lib/assignments/contest-scoring.ts:191-193`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The SQL for `wrongBeforeAc` is `SUM(CASE WHEN (score IS NULL OR score < 100) AND EXTRACT(EPOCH FROM submitted_at)::bigint < COALESCE(EXTRACT(EPOCH FROM first_ac_at)::bigint, 9999999999) THEN 1 ELSE 0 END)`. The `first_ac_at` is computed via a window function `MIN(CASE WHEN ROUND(score, 2) = 100 THEN submitted_at ELSE NULL END) OVER (PARTITION BY s.user_id, s.problem_id)`. This means `first_ac_at` is the earliest AC submission time. The `wrongBeforeAc` sum counts submissions with `score < 100` that were submitted before `first_ac_at`. This is correct for ICPC: only non-AC submissions before the first AC count as wrong attempts.

  However, there's a subtle edge case: for ICPC, a submission with `score IS NULL` (e.g., compile error) that was submitted AFTER the first AC would also be counted because `COALESCE(EXTRACT(EPOCH FROM first_ac_at)::bigint, 9999999999)` would use the first_ac_at timestamp, and the NULL-score submission's timestamp would be compared against it. If the compile error happened AFTER the first AC, the `submitted_at < first_ac_at` check would correctly exclude it. If it happened BEFORE, it would be correctly included. So this is actually correct.

- **Reclassified**: No bug found on deeper analysis. The `submitted_at < first_ac_at` guard correctly filters post-AC submissions.

## F3: `leaderboard.ts` `computeSingleUserLiveRank` ICPC branch does not handle tie-breaking by last AC time

- **File**: `src/lib/assignments/leaderboard.ts:106-146`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The ICPC live rank query breaks ties by `(solved_count, total_penalty)` only. The main leaderboard in `contest-scoring.ts` breaks further ties by "earlier last AC time" (line 363-368). The live rank query does not include this third tiebreaker. For most contests this is negligible (two students with the same solved count and same total penalty is rare), but in the edge case where two students have identical solved count and penalty, their live rank and main leaderboard rank could differ.
- **Concrete failure scenario**: Two students both solve 5 problems with 300 penalty minutes. Student A's last AC was at minute 120; Student B's last AC was at minute 150. On the main leaderboard, Student A ranks above Student B. In the live rank query, they have the same rank (tied), because the third tiebreaker is not applied.
- **Fix**: Add the last AC time tiebreaker to the ICPC live rank query, matching the main leaderboard's sort order. This is a low-priority fix since the scenario is rare.
