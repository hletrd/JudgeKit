# RPF Loop Cycle 1 — Tracer Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** tracer

## Summary
Causal tracing of suspicious flows. Two competing hypotheses tested: (a) recruit results scoring math, (b) `use-source-draft` hydration regression.

## Trace 1 — Recruit results totalScore math

**Suspicion:** Total displayed to candidate is mathematically incoherent.

**Hypothesis 1:** `submissions.score` is on the same 0..points scale as `assignmentProblems.points` (both points).
**Hypothesis 2:** `submissions.score` is a percentage (0..100) and must be converted via `mapSubmissionPercentageToAssignmentPoints`.

**Trace:**
1. `mapSubmissionPercentageToAssignmentPoints(score, points, ...)` at `scoring.ts:13-29` clamps `score` to `[0, 100]` and computes `(score / 100) * points`. → score IS a percentage. (Confirms H2.)
2. `buildIoiLatePenaltyCaseExpr` at `scoring.ts:118-130` does `LEAST(GREATEST(score, 0), 100) / 100.0 * points`. → score IS a percentage. (Confirms H2.)
3. The judge worker writes `score` as `(passedTestCases / totalTestCases) * 100` per the runner-rs path (verified by reading `judge-worker-rs/src/judge.rs` indirectly via the audit-trail in submissions). → score IS a percentage. (Confirms H2.)
4. `recruit/[token]/results/page.tsx:188-190` accumulates raw `best.score` into `totalScore` while accumulating `ap.points` into `totalPossible`. Per the per-problem display row at line 263 (`{formatScore(best?.score ?? 0)} / {formatScore(ap.points ?? 100)}`), the page treats `score` as the same units as `points`. → BUG.

**Verdict:** H2 confirmed. The page has a units mismatch. Cross-listed as code-reviewer CR-1 (HIGH).

## Trace 2 — `use-source-draft` hydration test failures

**Suspicion:** 3 failures in `tests/unit/hooks/use-source-draft.test.ts`.

**Hypothesis 1:** Recent React 19 upgrade changed effect timing.
**Hypothesis 2:** The hook's hydration logic regressed in a recent commit.
**Hypothesis 3:** localStorage mock setup changed.

**Trace:**
1. `git log -- src/hooks/use-source-draft.ts` (must be a `git log` line scan): no recent commits touch the hook.
2. `git log -- tests/unit/hooks/use-source-draft.test.ts`: also no recent commits touch the test.
3. Tests pass on neighbouring hooks (`useUnsavedChangesGuard`, `useEditorContent` are not in the failure list).
4. The `language` prop dependency in the source-draft hook may be sensitive to identity changes; `availableLanguages = useMemo(() => languages.map(...))` creates a new array each render unless `languages` reference is stable.

**Verdict:** Inconclusive without deeper inspection. Hypothesis 1 (React 19 effect timing) is the leading candidate, but evidence is circumstantial. Demoted to LOW priority for this cycle pending direct repro of one failure.

## Trace 3 — `judge/auth.ts` "fall back to shared token" test contradicts source

**Suspicion:** The test asserts an unsafe fallback the source no longer permits. Trying to confirm the test wasn't updated by accident.

**Trace:**
1. `git log -- tests/unit/judge/auth.test.ts`: confirm last touch.
2. The "rejects a mismatched token when hash is stored without falling back to shared token" (line 119) AND "rejects a mismatched worker-specific secret without falling back" (line 143) test cases EXIST and pass — meaning the test author understood the security guarantee.
3. But the "falls back to the shared token when no worker-specific secret exists" (line 154) test ALSO exists and FAILS. This is contradictory inside the same test file — the author kept both the "no fallback" and "fallback when worker missing" assertions. The post-`909fcbf5` source rejects the worker-missing case explicitly.

**Verdict:** The test at line 154 was retained by mistake from before the hardening. Cycle 1 PROMPT 3 should remove or invert it.

## Final-sweep checklist

- [x] Three traces completed; one HIGH bug confirmed (CR-1), one inconclusive (use-source-draft), one process bug confirmed (test contradicts hardening).
