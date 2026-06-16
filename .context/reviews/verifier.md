# Verifier — evidence-based correctness (cycle 1, 2026-06-16)

Claim vs code checks for function-judging.

### VER-1 (OK) "reference solution never reaches students"
Evidence: route.ts:70 omit; submission read path does not select referenceSolution for students. PASS.

### VER-2 (OK) "preludeLineCount never stored"
Evidence: assemble.ts recomputes via `getAdapter(language).assemble(spec,"")`; grep shows no DB column for prelude offset. PASS.

### VER-3 (PARTIAL) "doubles deferred but mapping code intact"
Evidence: AUTHORABLE_FUNCTION_TYPES filters double/double[] (types.ts:20); adapters still map double. BUT C++/Java double printers are locale-unsafe (CR-2) — when v1.1 re-enables, cross-locale judges will diverge. Re-open criterion: before enabling double in AUTHORABLE_FUNCTION_TYPES.

### VER-4 (OK) "function name/params validated before harness interpolation"
Evidence: functionSpecSchema regex IDENTIFIER on functionName + each param.name (types.ts:48-53). Harness templates interpolate these verbatim; regex prevents injection. PASS.

### VER-5 (UNVERIFIED-LIVE) Responsive rendering of authoring + submit UI at 375/768/1280
Requires live browser run (designer.md). Pending server build.
