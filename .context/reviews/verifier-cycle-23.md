# Verifier — Cycle 23

**Date:** 2026-04-24
**Scope:** Evidence-based correctness verification

---

## V-1: [LOW] ICPC `computeSingleUserLiveRank` tie-breaking differs from main leaderboard

**Confidence:** MEDIUM
**Citations:** `src/lib/assignments/leaderboard.ts:128-170` vs `src/lib/assignments/contest-scoring.ts:348-364`

The ICPC live-rank query sorts by `(solved_count DESC, total_penalty ASC)`, which is correct for primary ranking. However, the main leaderboard (`contest-scoring.ts:354-361`) adds two additional tie-breakers: "earlier last AC" and "userId lexicographic order". The live-rank query does not include these tie-breakers. If two users have identical solved_count and total_penalty, the live-rank may report a different rank than the main leaderboard.

**Concrete failure scenario:** Two users both solved 3 problems with 200 minutes penalty. User A's last AC was at minute 150, user B's at minute 180. On the main leaderboard, user A ranks higher. On the live-rank query, they are considered tied and both counted as "ranked above" any user with fewer solved problems, but the count of users above the target may be off by 1 if the tie-breaker would change the ordering.

**Fix:** Add the same tie-breaker logic to the live-rank query, or document that the live rank is an approximation and may differ by 1 in tied scenarios.

---

## V-2: [LOW] `buildIoiLatePenaltyCaseExpr` SQL injection surface is safe but fragile

**Confidence:** LOW
**Citations:** `src/lib/assignments/scoring.ts:54-76`

The function accepts string parameters (`scoreCol`, `pointsCol`, `submittedAtCol`, `personalDeadlineCol`) that are interpolated directly into the SQL CASE expression. Currently, all callers pass hardcoded column references (e.g., `"score"`, `"s.score"`, `"COALESCE(ap.points, 100)"`), which are safe. However, there is no validation that the inputs are valid SQL identifiers, making this a latent injection risk if a future caller passes user input.

**Fix:** Add a validation step that the column parameters match a whitelist pattern (e.g., `/^[a-zA-Z_.()0-9 ]+$/`) or document the trust boundary clearly.

---

## Summary

- Total findings: 2
- LOW: 2 (V-1, V-2)
