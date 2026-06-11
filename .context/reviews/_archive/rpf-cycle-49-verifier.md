# Cycle 49 — Verifier

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### V-1: ICPC leaderboard sort — non-deterministic tie resolution [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Verification:** Confirmed. The IOI sort (line 359) has `|| a.userId.localeCompare(b.userId)` but the ICPC sort (lines 346-357) does not. The comparator can return 0 when:
- `b.totalScore === a.totalScore` (same solved count)
- `a.totalPenalty === b.totalPenalty` (same penalty)
- `aLastAc === bLastAc` (same last AC timestamp)

When all three conditions hold, JavaScript's sort provides no guarantee about element ordering. This means the leaderboard could show tied users in different order across requests, causing visual flicker and potential data inconsistency in rank assignment.

**Fix:** Add `|| a.userId.localeCompare(b.userId)` as the final tie-breaker.

**Confidence:** High

---

### V-2: All prior verified fixes remain intact

All 20 fixes from cycles 37-48 remain in place and correctly implemented. No regressions detected.

---

## Sweep Notes

No other new findings. All previously deferred items remain correctly documented.
