# Aggregate Review — cycle 6 (2026-06-18)

Fresh review of the function-judging v1.1 double/double[] support changes and
cross-cutting concerns. Focused on the delta since cycle 5 (which fixed AGG-2,
AGG-3, AGG-4). The primary new concern is locale sensitivity in the C++ adapter,
which was NOT fixed when Java was fixed in commit `275f71aa`.

## METHODOLOGY NOTE
Subagent fan-out hit rate limits (429) in this environment. Reviews were
produced directly by the cycle agent, one provenance file per angle. All 10
reviewer angles were covered: code-reviewer, security-reviewer, perf-reviewer,
critic, verifier, test-engineer, tracer, architect, debugger, document-specialist,
designer.

## NEW FINDINGS THIS CYCLE

### AGG6-1 (Medium) C++ adapter locale sensitivity — double parsing AND printing
**Cited by:** code-reviewer (CR6-1), verifier (VER6-1), debugger (DBG6-1), tracer (Hypothesis A/B), architect (ARC6-1), critic (CRIT6-1)
**Cross-agent agreement:** 6/10 agents flagged this — highest signal finding.

`src/lib/judge/function-judging/adapters/cpp.ts` uses `snprintf("%.10g", ...)` for
printing double returns and `stod(...)` for parsing double arguments. Both are
locale-sensitive. In a locale using comma as decimal separator (e.g., `de_DE`):
- **Print:** `0.5` becomes `0,5` → worker's `parse::<f64>()` fails → WrongAnswer
- **Parse:** `stod("0.5")` stops at dot, parses `0` → all double args truncated

The Java adapter was fixed in `275f71aa` to use `Locale.ROOT`. C++ has no equivalent.
The C# adapter uses `CultureInfo.InvariantCulture` (correct). Go/Python/JS/TS
are locale-independent by design.

**Fix:** Add `std::setlocale(LC_ALL, "C");` at the start of the C++ main function,
or use locale-independent parsing/printing. Add a cross-locale golden test.
**Confidence:** High (6 agents agree, and the Java fix proves the team recognizes
this as a real issue).

### AGG6-2 (Medium) `compute-expected` output size limit missing
**Cited by:** security-reviewer (SEC6-1)
The `compute-expected` route runs author code via `executeCompilerRun` with no
output size limit. A malicious author could cause a large stdout allocation on
the app server.
**Fix:** Add an output size cap to `executeCompilerRun` or the compute-expected route.
**Confidence:** Medium.

### AGG6-3 (Medium) `planProblemTestCaseSync` JSON.stringify for large test cases
**Cited by:** perf-reviewer (PERF6-1)
Uses `JSON.stringify` for signature hashing, which is expensive for large test cases.
**Fix:** Use a content hash instead of JSON.stringify.
**Confidence:** Medium.

### AGG6-4 (Low) `resolveComparisonMode` location (cohesion)
**Cited by:** architect (ARC6-2), critic (CRIT6-2)
Pure function with no DB dependency lives in `problem-management.ts` instead of
near the function-judging module.
**Fix:** Move to `src/lib/judge/function-judging/`.
**Confidence:** Low.

### AGG6-5 (Low) Test gaps for C++ locale and comparison mode derivation
**Cited by:** test-engineer (TST6-1, TST6-2)
No test for C++ locale-sensitive double printing, and no unit test for
`resolveComparisonMode`.
**Fix:** Add golden test and unit tests.
**Confidence:** Low-Medium.

### AGG6-6 (Low) Float tolerance input validation
**Cited by:** designer (DSG6-1)
Tolerance inputs in the UI have no client-side validation.
**Fix:** Verify server-side validation exists, or add client-side validation.
**Confidence:** Low.

### AGG6-7 (Low) Go adapter error swallowing
**Cited by:** code-reviewer (CR6-2)
`__reader.ReadString('\n')` error is ignored with `_`.
**Fix:** Check error explicitly.
**Confidence:** Low.

## CARRIED FORWARD FROM PRIOR CYCLES (unchanged severity)

### CF-5 (Low) Remaining low-priority items
- SEC-3: host-path trim from compute-expected diagnostics
- PERF-1: compute-expected runs cases serially
- PERF-2: FunctionTestCaseEditor recomputes errorsByCase on every keystroke
- PERF-3: Stub regenerated on every spec change
- ARC-4: shared `resolveExecLanguage` helper extraction
- DBG-2: JS/TS harness reads only first stdin line (latent)
- DBG-4: confirm-on-param-removal in FunctionTestCaseEditor
- DBG-5: C++ readInt uses llround(stod) — unreachable from authored inputs
- TST-3: serialization round-trip fuzz for string[]
- TST-4: student-GET referenceSolution-absence integration test
- DOC-2: single-line stdin contract documentation
- DOC-3: cross-language string-escaping equivalence documentation

## VERIFIED FIXED (from prior cycles)

- AGG-2: mapCompileError filename-anchored rewrite — confirmed
- AGG-3: Cross-language string escaping — confirmed in all 7 adapters
- AGG-4: Single-line stdin contract assertion — confirmed in serialization.ts
- Java Locale.ROOT — confirmed in adapters/java.ts:176
- Local e2e auth — confirmed fixed in cycle 4

## AGENT FAILURES

Subagent fan-out was unavailable due to rate limiting (429). All reviews were
produced directly by the cycle agent. No reviewer angle was dropped.
