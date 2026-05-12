# Verifier Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** verifier
**Focus:** Evidence-based correctness check against stated behavior

---

## C2-VER-1 — "problemNotFound" reset logic is correct but incomplete
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:328-341`

**Stated behavior:** "Reset the submission to pending so it doesn't get stuck in a claim-failure loop."
**Verification:** The reset correctly sets `status = 'pending'`, `judgeWorkerId = null`, `judgeClaimToken = null`, `judgeClaimedAt = null`.
**Gap:** The worker's `active_tasks` was incremented in the `worker_bump` CTE but is not decremented. The worker now has a ghost active task.

**Evidence:**
1. The SQL CTE `worker_bump` increments `active_tasks` when a claim succeeds.
2. The problem check happens AFTER the claim CTE completes.
3. No corresponding decrement exists in the `!problem` branch.

**Conclusion:** The submission won't get stuck, but the worker's capacity accounting drifts.

---

## C2-VER-2 — Late penalty calculation matches leaderboard behavior
**Severity:** Info | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts:239-250`

**Stated behavior:** "Apply late penalties using mapSubmissionPercentageToAssignmentPoints for consistency with the leaderboard."
**Verification:** The function uses the same helper (`mapSubmissionPercentageToAssignmentPoints`) with the same parameters (`deadline`, `latePenalty`, `personalDeadline`, `examMode`) as the leaderboard SQL expression.

**Conclusion:** Correct and consistent.

---

## C2-VER-3 — ICPC "first AC" uses binary acceptance criteria
**Severity:** Info | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts:221-225`

**Stated behavior:** "For ICPC: 'accepted' status means full score (binary accept/reject)."
**Verification:** The code checks `submission.status === "accepted"` for ICPC, which is the correct binary criterion. For IOI, it uses `score >= problemPoints`.

**Conclusion:** Correct per the scoring model definitions.

---

## C2-VER-4 — Time-limit multiplier rounds up and clamps to minimum 1ms
**Severity:** Info | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:372-374`

**Stated behavior:** "Round up so the displayed value matches what the judge actually enforces."
**Verification:** `Math.max(1, Math.ceil(baseTimeLimitMs * multiplier))` correctly rounds up and clamps.

**Conclusion:** Correct.

---

## C2-VER-5 — Public submission detail page doesn't match POST handler authorization claims
**Severity:** HIGH | **Confidence:** High
**File:** `src/app/(public)/submissions/[id]/page.tsx`

**Stated behavior:** (from POST handler comment) "Users with submissions.view_all (instructors/admins) can always see compile output regardless of the problem setting."
**Verification:** The GET page does NOT implement this. Instructors viewing student submissions get empty results.

**Conclusion:** Implementation does not match stated behavior.

---

## Commonly Missed Sweep

- The `getDbNowUncached()` call in `judge/claim` correctly uses DB server time for claim timestamps, matching the stale claim detection logic.
- The `to_timestamp(@claimCreatedAt::double precision / 1000)` conversion correctly converts epoch milliseconds to PostgreSQL timestamp.
