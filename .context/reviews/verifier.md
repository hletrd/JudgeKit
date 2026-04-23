# Verifier Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** f8ba7334

## Evidence-Based Correctness Check

### Verified Fixes (All Pass)

1. **`realtime-coordination.ts` uses `getDbNowUncached()`** — Line 94: `const nowMs = (await getDbNowUncached()).getTime();` Line 157: `const nowMs = (await getDbNowUncached()).getTime();`. Both `acquireSharedSseConnectionSlot` and `shouldRecordSharedHeartbeat` now use DB time. Comments at lines 91-93 and 155-156 explain the rationale. PASS.

2. **Contests page uses null guards** — Line 109: `statusMatchesFilter(statusMap.get(c.id) ?? "closed", filter)` Line 178: `const status = statusMap.get(contest.id) ?? "closed";`. PASS — no non-null assertions remain.

3. **IOI leaderboard deterministic tie-breaking** — Line 359: `entries.sort((a, b) => b.totalScore - a.totalScore || a.userId.localeCompare(b.userId));`. PASS.

4. **Candidate dashboard null guards** — Line 594: `(assignmentProblemProgressMap.get(assignment.assignmentId) ?? [])`. PASS.

## New Findings

### V-1: `checkServerActionRateLimit` uses `Date.now()` in DB transaction — verified present [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** Line 215: `const now = Date.now();` used at lines 232, 234, 252 for window comparison and DB writes. This is the same pattern class that was fixed in `realtime-coordination.ts` and `validateAssignmentSubmission`.

**Fix:** Use `getDbNowUncached()` at the start of the transaction.

**Confidence:** Medium
