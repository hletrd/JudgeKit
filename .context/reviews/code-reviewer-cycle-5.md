# Code Review — Cycle 5 (RPF Loop)

**Date:** 2026-05-11
**Reviewer:** code-reviewer (orchestrator direct — Agent tool unavailable)
**Scope:** Judge polling, SSE events, code snapshots, recruiting invitations, restore route, database queries — follow-up to cycle 4 fixes

---

## Summary

3 findings: 1 MEDIUM, 2 LOW. Focused on correctness and dead-code elimination in areas not covered by prior cycles.

---

## MEDIUM

### C5-M1: `buildCodeSnapshotDiff` O(n×m) Memory Can Exhaust Heap on Large Files
- **File:** `src/lib/code-snapshots/diff.ts:28-30`
- **Confidence:** High
- **Description:** The LCS diff algorithm allocates a full `(previousLines.length + 1) × (currentLines.length + 1)` integer matrix. For files with 5,000+ lines (generated test cases, large solutions, boilerplate), this creates ~25M integers (~200MB). At 10K lines it's ~100M integers (~800MB). In production with concurrent diffs or limited heap, this can trigger OOM crashes.
- **Failure scenario:** A user submits a 8,000-line generated solution. The system attempts to diff it against a previous snapshot, allocates ~64M integers (~512MB), and the Node.js process crashes with `FATAL ERROR: Reached heap limit`.
- **Fix:** Replace with space-optimized LCS using only two rows, reducing memory from O(n×m) to O(min(n,m)).
  ```ts
  // Instead of full matrix, keep only previous and current rows
  let prevRow = Array(currentLines.length + 1).fill(0);
  let currRow = Array(currentLines.length + 1).fill(0);
  // ... compute LCS with row swapping ...
  ```

---

## LOW

### C5-L1: `buildCodeSnapshotDiff` and Related Types Are Dead Code
- **File:** `src/lib/code-snapshots/diff.ts`
- **Confidence:** High
- **Description:** `buildCodeSnapshotDiff`, `CodeDiffResult`, and `CodeDiffLine` are exported but never imported by any module in `src/` or `tests/`. This is unmaintained dead code with no tests and no documented intended usage. It creates maintenance burden (e.g., the OOM bug above affects a function nobody uses).
- **Fix:** Remove `src/lib/code-snapshots/diff.ts` and its directory if no other files exist there. If it is kept for a planned feature, add tests and a comment explaining the intended integration point.

### C5-L2: `getDbNowUncached()` Extends Transaction Duration in Judge/Poll
- **File:** `src/app/api/v1/judge/poll/route.ts:82`
- **Confidence:** Medium
- **Description:** `getDbNowUncached()` executes `SELECT NOW()` as a separate database query inside a transaction (`execTransaction`) that already holds row-level locks on `submissions` and `submissionResults`. This extends the transaction duration and increases lock contention under high judge throughput.
- **Fix:** Call `getDbNowUncached()` before entering the transaction, or replace the timestamp with a `sql` expression computed inside the UPDATE statement itself.

---

## Final Sweep

- No remaining `throw new Error(getApiError(...))` patterns found in the codebase.
- `rawQueryOne` and `rawQueryAll` properly parameterize queries via named-to-positional conversion.
- `escapeLikePattern` correctly escapes backslashes before `%` and `_`.
- All `formData.get()` casts in recently modified routes use `instanceof` or `typeof` guards.
- No unused imports or variables in recently changed files.
