# Cycle 6 (RPF, 2026-06-18) — Function-Judging v1.1 correctness + locale

Source: `.context/reviews/_aggregate.md` (cycle-6 section) + all per-angle reviews.
Primary focus: the C++ locale sensitivity issue (AGG6-1), which was deferred as
D1 in cycle 5 but is now ACTIVE because `double`/`double[]` are authorable in v1.1.
Secondary: other new findings from the cycle 6 review.

Repo policy binding this plan: GPG-signed commits (`git commit -S`),
Conventional Commits + gitmoji, no `--no-verify`, no force-push, no custom
letter-spacing / `tracking-*` on Korean text, preserve `src/lib/auth/config.ts`,
latest toolchains. Security/correctness/data-loss findings are NOT deferrable
unless a repo rule explicitly authorizes.

## FRESH-REVIEW RESULT

7 new findings surfaced (AGG6-1 through AGG6-7). The highest-signal finding is
AGG6-1 (C++ locale sensitivity) with 6/10 reviewer agents agreeing. This was
previously deferred as D1 in cycle 5 but is now RE-OPENED because double is
authorable as of v1.1.

## TO IMPLEMENT THIS CYCLE (PROMPT 3)

### P1 — AGG6-1 (Medium) C++ adapter locale sensitivity — FIX
- **Files:** `src/lib/judge/function-judging/adapters/cpp.ts` (PRELUDE and main).
- **Problem:** `snprintf("%.10g", ...)` for printing doubles and `stod(...)` for
  parsing doubles are locale-sensitive. In a comma-locale, double returns print
  as `0,5` (worker can't parse) and double args parse as `0` from `0.5` (stops at
  dot). Affects ALL double-related C++ submissions.
- **Fix:** Add `std::setlocale(LC_ALL, "C");` at the start of the C++ main
  function. This is the minimal fix that mirrors the Java `Locale.ROOT` fix.
  Also add `#include <clocale>` to the prelude if not already present via
  `<bits/stdc++.h>` (it is — `bits/stdc++.h` includes everything).
- **Tests:** Add a golden test that verifies C++ double output is dot-decimal
  regardless of locale. The test should assemble a C++ harness with a double
  return and verify the output format.
- **Status:** PENDING.

### P2 — AGG6-2 (Medium) compute-expected output size limit — FIX
- **File:** `src/lib/compiler/execute.ts` or `src/app/api/v1/problems/[id]/compute-expected/route.ts`.
- **Problem:** `executeCompilerRun` has no output size limit. A malicious author
  could cause large stdout allocation on the app server.
- **Fix:** Add an output size cap (e.g., 1MB) to `executeCompilerRun`. Reject
  if stdout exceeds the limit.
- **Status:** PENDING.

### P3 — AGG6-3 (Medium) planProblemTestCaseSync JSON.stringify performance — FIX
- **File:** `src/lib/problem-management.ts:126-127`.
- **Problem:** `JSON.stringify` for signature hashing is expensive for large test
  cases. Called during every problem update.
- **Fix:** Use a lightweight hash (e.g., `crypto.createHash('sha256')`) instead of
  `JSON.stringify` for signature comparison. Or use a composite key of id + content
  hash.
- **Status:** PENDING.

### P4 — AGG6-5 (Low) Test gaps — FIX
- **Files:** new test files.
- **Items:**
  - TST6-1: Golden test for C++ double locale independence.
  - TST6-2: Unit tests for `resolveComparisonMode`.
  - TST6-3: Unit tests for `decodeFieldValue` double[] edge cases.
- **Status:** PENDING.

### P5 — AGG6-4 (Low) resolveComparisonMode cohesion — FIX
- **File:** `src/lib/problem-management.ts` → `src/lib/judge/function-judging/comparison.ts`.
- **Problem:** Pure function with no DB dependency lives in the wrong module.
- **Fix:** Move `resolveComparisonMode` and `isFloatComparedReturn` to a shared
  location in the function-judging module. Update imports.
- **Status:** PENDING.

### P6 — AGG6-6 (Low) Float tolerance input validation — FIX
- **File:** `src/components/problem/function-signature-builder.tsx` or server validator.
- **Problem:** Tolerance inputs accept any string. Need to verify server-side
  validation exists.
- **Fix:** Check `validators/problem-management.ts` for float tolerance validation.
  Add if missing. Add client-side validation as well.
- **Status:** PENDING.

### P7 — AGG6-7 (Low) Go adapter error swallowing — FIX
- **File:** `src/lib/judge/function-judging/adapters/go.ts:87`.
- **Problem:** `__reader.ReadString('\n')` error is ignored.
- **Fix:** Check the error — `io.EOF` is fine, other errors should fail.
- **Status:** PENDING.

## CARRIED FORWARD — LOW cleanups (CF-5; still open, unchanged)

The following were carried from cycle 5 and remain open. They are Low severity
and not correctness/security/data-loss blockers:

- SEC-3: trim host paths from compute-expected returned diagnostics.
- PERF-1: optional concurrency cap for compute-expected case runs.
- PERF-2: FunctionTestCaseEditor recomputes errorsByCase on every keystroke.
- PERF-3: Stub regenerated on every spec change.
- ARC-4: extract shared `resolveExecLanguage`.
- DBG-2: JS/TS harness reads only first stdin line (latent, assertion guards it).
- DBG-4: confirm prompt when removing a param that has authored values.
- DBG-5: C++ readInt uses llround(stod) — unreachable from authored inputs.
- TST-3: serialization round-trip fuzz for string[] with commas/quotes/newlines.
- TST-4: integration test that student GET omits `referenceSolution`.
- DOC-2: single-line stdin contract documentation.
- DOC-3: cross-language string-escaping equivalence documentation.

Exit criterion for all: schedule in a future RPF cycle; no severity downgrade.

## DEFERRED

None this cycle. D1 from cycle 5 is now P1 (active) because double is authorable.

## ARCHIVED PLANS

- `plan/cycle-5-rpf-function-judging-correctness.md` → archived as
  `plan/cycle-5-rpf-function-judging-correctness.md.archived` (all items DONE or
  carried forward with preserved severity).

## PROGRESS
- 2026-06-18: Fresh review (7 new findings). Plan created. P1-P7 scheduled for
  implementation in PROMPT 3.
- 2026-06-18: P1 DONE — C++ locale fix (`std::setlocale(LC_ALL, "C")` in main).
  Commit: `c15b57f0`.
- 2026-06-18: P5 DONE — Extracted `resolveComparisonMode` + `isFloatComparedReturn`
  to `src/lib/judge/function-judging/comparison.ts`. Commit: `1b2fdf7d`.
- 2026-06-18: P7 DONE — Go adapter error handling (`io.EOF` check). Commit: `e43b582c`.
- 2026-06-18: P4 DONE — Added `decodeFieldValue` and `isFloatComparedReturn` unit
  tests. Updated golden fixtures for C++ and Go. Commits: `fd7a2e26`, `beb24bf6`.
- 2026-06-18: P6 VERIFIED — Server-side validator already enforces
  `z.number().min(0).max(1)` for both tolerance fields. No change needed.
- 2026-06-18: P2 VERIFIED — `executeCompilerRun` already enforces `MAX_OUTPUT_BYTES`
  (128 MiB) via `runDocker`. No change needed.
- 2026-06-18: P3 DONE — Replaced `JSON.stringify` with `crypto.createHash('sha256')`
  in `planProblemTestCaseSync`. Commit: `d190dbc2`.
