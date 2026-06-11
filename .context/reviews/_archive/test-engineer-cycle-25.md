# Test Engineer — Cycle 25

**Date:** 2026-04-24
**Scope:** Test coverage and quality review

---

## TE-1: [MEDIUM] No tests for `getAssignmentStatusRows` late-penalty scoring consistency

**Confidence:** HIGH
**Citations:** `src/lib/assignments/submissions.ts:481-717`

There are no unit or integration tests that verify the late-penalty scoring in `getAssignmentStatusRows` matches the scoring in the leaderboard (`computeContestRanking`). Given that the inline CASE in `getAssignmentStatusRows` is already known to diverge from `buildIoiLatePenaltyCaseExpr` (missing the windowed branch), adding a consistency test would have caught this bug earlier.

**Concrete failure scenario:** A windowed exam with late penalty is created. The scoring on the status page differs from the leaderboard, but no test catches this because there is no cross-validation test.

**Fix:** Add an integration test that:
1. Seeds an assignment with `examMode: "windowed"`, `latePenalty > 0`, and an exam session with a `personalDeadline`.
2. Creates a submission that is late relative to `personalDeadline` but on time relative to `deadline`.
3. Asserts that the `bestAdjustedScore` in `getAssignmentStatusRows` matches the score in `computeContestRanking`.

---

## TE-2: [LOW] `mapSubmissionPercentageToAssignmentPoints` has no test for windowed-exam branch

**Confidence:** MEDIUM
**Citations:** `src/lib/assignments/scoring.ts:13-28`

The TypeScript-level scoring function has no unit tests for the windowed-exam scenario (personalDeadline). This would become relevant if the function is ever used for windowed-exam scoring.

**Fix:** Add unit tests for `mapSubmissionPercentageToAssignmentPoints` covering the windowed-exam case, or add a deprecation notice if it's not intended for that use case.

---

## Positive Observations

- Source-grep tests (`tests/unit/infra/source-grep-inventory.test.ts`) are an excellent pattern for validating that security fixes remain in place
- Cycle 24 added proper unit tests for `validateZipDecompressedSize`, `password-hash`, `data-retention`, and proxy headers
- Test structure is well-organized with unit, component, integration, and e2e tiers
