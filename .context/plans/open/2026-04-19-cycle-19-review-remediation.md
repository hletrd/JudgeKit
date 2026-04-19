# Cycle 19 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-19-comprehensive-review.md` and `.context/reviews/_aggregate.md`
**Status:** In Progress

---

## Scheduled for Implementation

### P1: Fix `computeSingleUserLiveRank` to return null for users with no submissions
- **Findings**: M1 (F1)
- **Severity**: MEDIUM
- **Confidence**: High
- **Files to change**:
  - `src/lib/assignments/leaderboard.ts:101-137` (ICPC branch)
  - `src/lib/assignments/leaderboard.ts:142-175` (IOI branch)
- **Implementation**:
  1. For ICPC: After computing the `target` CTE, check if the target user exists in `user_totals`. If the target user has no row in `user_totals`, return `null` instead of computing rank. Modify the SQL to add a `target_exists` check:
     ```sql
     WITH user_score AS (...),
     user_totals AS (...),
     target AS (
       SELECT solved_count, total_penalty FROM user_totals WHERE user_id = @userId
     )
     SELECT CASE
       WHEN t.solved_count IS NULL THEN NULL
       ELSE COALESCE(1 + COUNT(*), 1)
     END AS rank
     FROM user_totals ut, target t
     WHERE ...
     ```
     Actually, the simpler approach: use a LEFT JOIN instead of a cross join, or add a subquery that checks if the user has any submissions. The cleanest fix: change `COALESCE(1 + COUNT(*), 1)` to return NULL when target is empty.
     
     Best approach: restructure the query to use a LEFT JOIN and check if the target row exists:
     ```sql
     SELECT CASE
       WHEN (SELECT COUNT(*) FROM user_totals WHERE user_id = @userId) = 0 THEN NULL
       ELSE COALESCE(1 + COUNT(*), 1)
     END AS rank
     FROM user_totals ut
     WHERE ut.solved_count > (SELECT solved_count FROM user_totals WHERE user_id = @userId)
        OR (ut.solved_count = (SELECT solved_count FROM user_totals WHERE user_id = @userId) 
            AND ut.total_penalty < (SELECT total_penalty FROM user_totals WHERE user_id = @userId))
     ```
     This is verbose with repeated subqueries. Better: use the existing cross-join but handle the empty-target case in JS:
     ```ts
     // In the JS handler after the query:
     if (!result || result.rank === null) return null;
     ```
     The issue is that `COALESCE(1 + COUNT(*), 1)` with an empty target returns 1, not null. So we need the SQL to return null when target is empty.
     
     Simplest correct approach: add a `has_submissions` field to the query result:
     ```sql
     SELECT 
       COALESCE(1 + COUNT(*), 1) AS rank,
       (SELECT COUNT(*) FROM user_totals WHERE user_id = @userId) > 0 AS "hasSubmissions"
     FROM user_totals ut, target t
     WHERE ...
     ```
     Then in JS: `if (!result?.hasSubmissions) return null; return result.rank;`
  2. Apply the same pattern to the IOI branch.
- **Progress**: [ ] Not started

### P2: Fix participant timeline `firstAccepted` to work with IOI scoring
- **Findings**: L2 (F3)
- **Severity**: LOW
- **Confidence**: Medium
- **Files to change**:
  - `src/lib/assignments/participant-timeline.ts:195` — change `firstAccepted` logic
- **Implementation**:
  1. Add a `scoringModel` parameter to `getParticipantTimeline()` or determine it from the assignment.
  2. For IOI scoring, replace `status === "accepted"` with a score-based check: find the first submission where `score >= problemPoints` (the maximum possible points for that problem).
  3. For ICPC scoring, keep `status === "accepted"` as-is.
  4. Fetch the assignment's scoring model and problem points as part of the initial data fetch (already partially available via `assignmentProblemRows`).
  5. Adjust `wrongBeforeAc` to also use the appropriate "AC" definition.
- **Progress**: [ ] Not started

### P3: Document that analytics student progression uses raw scores (no late penalty)
- **Findings**: L1 (F2)
- **Severity**: LOW
- **Confidence**: High
- **Files to change**:
  - `src/lib/assignments/contest-analytics.ts:218-252` — add JSDoc comment
- **Implementation**:
  1. Add a documentation comment above the student progression section explaining that the progression chart uses raw scores without late penalties, while the leaderboard uses adjusted scores. This is the lightest-weight fix; applying late penalties would require joining `exam_sessions` and `assignments.late_penalty` into the progression query, which is a more substantial change.
  2. The comment should note: "For IOI contests with late penalties, the progression total may exceed the leaderboard total. This is intentional — the progression chart shows raw score trajectory, while the leaderboard applies penalty adjustments."
- **Progress**: [ ] Not started

### P4: Optimize LeaderboardTable per-problem lookup from O(m) to O(1)
- **Findings**: L3 (F4)
- **Severity**: LOW
- **Confidence**: High
- **Files to change**:
  - `src/components/contest/leaderboard-table.tsx:432-434`
- **Implementation**:
  1. Inside the `data.entries.map()` callback, pre-build a `Map` for each entry's problems:
     ```ts
     const problemMap = new Map(entry.problems.map(p => [p.problemId, p]));
     ```
  2. Replace `entry.problems.find((pr) => pr.problemId === p.problemId)` with `problemMap.get(p.problemId)`.
  3. This is a simple, safe refactor that reduces the per-cell lookup from O(m) to O(1).
- **Progress**: [ ] Not started

---

## Deferred Items

The following findings are explicitly deferred per the deferred-fix rules. Each records the file+line citation, original severity/confidence, concrete reason for deferral, and exit criterion.

### D19: `code-similarity.ts` uses JS `new Date()` for batch `createdAt` instead of DB `NOW()`
- **Finding**: L4 (F5) | **Severity**: LOW | **Confidence**: LOW
- **Citation**: `src/lib/assignments/code-similarity.ts:397`
- **Reason for deferral**: Already tracked as deferred item A19 (clock skew risk). The time difference between JS `new Date()` and actual DB insert is negligible (milliseconds). Anti-cheat events are not time-critical to millisecond precision. No operational impact.
- **Exit criterion**: Revisit when A19 is addressed, or when the similarity check system is next modified.

---

## Carried Deferred Items (from Prior Cycles)

All deferred items D1-D18 from prior cycle remediation plans remain unchanged. See archived plan files for the full deferred list. The active deferred items are tracked in `.context/reviews/_aggregate.md`.
