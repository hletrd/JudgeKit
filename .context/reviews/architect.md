# Architecture Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** e2043115

## Inventory of Files Reviewed

- `src/lib/assignments/submissions.ts` — Submission validation (clock source analysis)
- `src/lib/assignments/leaderboard.ts` — Leaderboard freeze (clock source analysis)
- `src/lib/assignments/participant-status.ts` — Participant status (accepts `now` param)
- `src/lib/realtime/realtime-coordination.ts` — SSE connection management
- `src/lib/datetime.ts` — Date formatting utilities
- `src/lib/assignments/active-timed-assignments.ts` — Correctly uses `getDbNow()`

## Previously Fixed Items (Verified)

- Submission route rate-limit uses `getDbNowUncached()`: PASS
- Date.now() replaced in assignment PATCH: PASS

## New Findings

### ARCH-1: `validateAssignmentSubmission` uses `Date.now()` — last remaining server-side clock-skew site for access-control decisions [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The codebase has systematically migrated from `Date.now()` to `getDbNowUncached()` for all schedule comparisons that gate access-control decisions. The assignment PATCH route was fixed in cycle 40, the submission rate-limit in cycle 43, and the recruiting invitation routes earlier. The `validateAssignmentSubmission` function is the last remaining server-side code path that uses `Date.now()` to compare against DB-stored timestamps for an access-control decision (whether a user can submit). This is an architectural inconsistency.

The `participant-status.ts` module correctly accepts a `now` parameter with `Date.now()` as default, allowing callers to inject DB time. The `active-timed-assignments.ts` module correctly uses `getDbNow()`. The `submissions.ts` validation should follow the same pattern.

**Fix:** Replace `Date.now()` with `getDbNowUncached()` in `validateAssignmentSubmission`:
```typescript
const now = (await getDbNowUncached()).getTime();
```
The function is already async, so this is a drop-in change.

**Confidence:** Medium

---

### Carry-Over Items

- **Prior ARCH-2:** Stale-while-revalidate cache pattern duplication (LOW/LOW, deferred)
