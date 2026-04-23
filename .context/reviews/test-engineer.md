# Test Engineer Review — RPF Cycle 44

**Date:** 2026-04-23
**Reviewer:** test-engineer
**Base commit:** e2043115

## Inventory of Files Reviewed

- `src/lib/assignments/submissions.ts` — Submission validation (testability)
- `src/lib/assignments/participant-status.ts` — Participant status (good testability pattern)
- `src/lib/assignments/contest-scoring.ts` — Contest ranking
- `src/lib/assignments/contest-analytics.ts` — Contest analytics

## New Findings

### TE-1: `validateAssignmentSubmission` uses `Date.now()` making deadline enforcement untestable under simulated clock skew [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/submissions.ts:208,220,268`

**Description:** The function uses `Date.now()` directly, making it impossible to write deterministic tests that verify deadline enforcement behavior under simulated clock skew. If the code used `getDbNowUncached()`, tests could mock the DB time function. The `participant-status.ts` module is a good example of the testable pattern — it accepts an injectable `now` parameter defaulting to `Date.now()`.

**Fix:** Use `getDbNowUncached()` so the time source is mockable in tests.

**Confidence:** Medium

---

### TE-2: Non-null assertions on Map.get() after has() guards — three locations [LOW/LOW]

**Files:**
- `src/lib/assignments/contest-scoring.ts:243`
- `src/lib/assignments/submissions.ts:365`
- `src/lib/assignments/contest-analytics.ts:259`

**Description:** These locations use the `!.get()` pattern after a `has()` guard. While safe due to the guard, the pattern was recently removed from the anti-cheat route (cycle 41). Inconsistent patterns make it harder to write comprehensive lint rules for non-null assertions.

**Fix:** Use explicit null-guard pattern for consistency.

**Confidence:** Low
