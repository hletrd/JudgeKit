# Verifier Review — Cycle 5

**Reviewer:** verifier
**Date:** 2026-05-12

---

## Verification 1: Cycle 3/4 fixes are correctly applied

**Status:** VERIFIED

| Fix | Location | Status |
|-----|----------|--------|
| C3-AGG-1: Transaction wrapper in participant-timeline.ts | `src/lib/assignments/participant-timeline.ts:94` | Fixed — all 8 queries use `tx` |
| C3-AGG-2: getDbNowUncached outside transaction in exam-sessions.ts | `src/lib/assignments/exam-sessions.ts:51` | Fixed — fetched before transaction |
| C4-AGG-1: getDbNowUncached outside transaction in access-codes.ts | `src/lib/assignments/access-codes.ts:109` | Fixed — fetched before transaction |
| C4-AGG-2: Removed unusable client param from rawQuery helpers | `src/lib/db/queries.ts:48-83` | Fixed — params removed, docs updated |
| C4-AGG-4: Indentation in participant-timeline.ts | `src/lib/assignments/participant-timeline.ts:95-324` | Fixed — body indented |

---

## Verification 2: Judge claim race condition is reproducible

**File:** `src/app/api/v1/judge/claim/route.ts:352-374`
**Status:** CONFIRMED

The code path is:
1. Lines 278-283: Atomic claim via raw SQL CTE
2. Lines 341-350: Problem lookup (outside transaction)
3. Lines 356-363: Reset submission (outside transaction)
4. Lines 367-370: Decrement active_tasks (outside transaction)

Steps 3-4 are non-atomic and vulnerable to concurrent modification. If another worker claims the submission between steps 1 and 3, the reset will clear the newer worker's claim.

**Reproduction:**
1. Submit a solution
2. Worker A claims it (atomic CTE succeeds)
3. Worker B claims it via stale claim (atomic CTE succeeds because judge_claimed_at is stale)
4. Worker A's problem lookup returns null (simulated DB delay)
5. Worker A resets submission to pending — OVERWRITING Worker B's claim
6. Worker A decrements its own active_tasks
7. Result: Worker B has the submission but active_tasks is wrong

---

## Verification 3: All quality gates pass

**Status:** VERIFIED

- `npx eslint .` — passed (no errors)
- `npx next build` — passed
- `npx vitest run` — 317 test files passed, 2401 tests passed

---

## Verification 4: getDbNowUncached in submissions POST is a real pattern violation

**File:** `src/app/api/v1/submissions/route.ts:268`
**Status:** CONFIRMED

`getDbNowUncached()` calls `rawQueryOne()` which uses `pool.query()`, the global pool. Inside `execTransaction`, this query runs outside the transaction context. The JSDoc on `rawQueryOne` explicitly warns:

> "This helper always runs on the global connection pool. It cannot participate in Drizzle transactions."

The impact is mitigated because `dbNow` is only used for the rate-limit window calculation, not for writes. But the pattern violation is real.
