# Function-Signature Judging

LeetCode-style problems where the author defines a **function signature** plus
typed input/output examples, and the student implements only the function body.
The platform generates a per-language **starter stub** for the student and an
execution **harness** that is compiled and run by the existing judge — so a
`function` problem reuses the whole sandbox, time/memory limits, anti-cheat,
contest/exam, and result-rendering pipeline with no special handling.

## How it works

A `function` problem is transpiled, at judge time, into an ordinary
stdin/stdout submission. The app assembles `harness_prelude + student_code +
generated_main` and sends it to the (unchanged) judge worker as the source. The
generated `main` reads the test case's arguments from stdin, calls the student's
function, and prints the return value; the worker compares stdout to the
expected output exactly as for any other problem. Test cases are stored in the
normal `test_cases` table: `input` is the canonical JSON argument vector and
`expected_output` is the serialized return.

The student's *original* source is what gets stored and what anti-cheat /
similarity see; only the compiled artifact is wrapped. Compile errors are mapped
back to student-relative line numbers.

## Supported types (v1 / v1.1)

Scalars and 1-D arrays of them:

`int`, `long`, `double`, `bool`, `string`, and `int[]`, `long[]`, `double[]`,
`bool[]`, `string[]`.

Limits and conventions:

- **Integers** (`int`/`long`) must be within the JS safe-integer range
  (±2^53−1); values outside it are rejected at authoring time.
- **`double` / `double[]` returns** use **float comparison** (set automatically
  for those return types) with optional author-configurable absolute/relative
  tolerance (default `1e-9`). Double returns are emitted as **whitespace-separated
  numeric tokens** so cross-language formatting differences (`0.5` vs
  `0.500000000`) compare equal within tolerance. All other return types use exact
  comparison.
- A non-`void` return is required.
- Not yet supported (deferred): 2-D/nested arrays, maps, and `ListNode`/`TreeNode`
  structures.

## Supported languages

Python, C++ (`cpp23`), JavaScript, TypeScript, Java, Go, C# — behind a harness
registry (`src/lib/judge/function-judging/registry.ts`), so adding a language is
a contained, repeatable task (one adapter + golden + smoke coverage). A problem's
author chooses which of these languages students may use (`enabledLanguages`),
enforced at submit time.

## Authoring

In the problem editor, choose problem type **Function**, then:

1. Build the **signature** — function name, ordered typed parameters, return
   type, and the enabled languages.
2. Add **test cases** with typed per-parameter inputs and a typed expected
   return (the editor serializes them to the canonical stored form).
3. Optionally provide a **reference solution** in any enabled language and click
   **Compute expected outputs** to fill every case's expected return by running
   the reference through the judge. The reference solution is author-only and is
   never exposed to students.
4. A live **stub preview** shows what students will see.

## Architecture / source map

- `src/lib/judge/function-judging/types.ts` — `FunctionSpec`, the type system,
  the authorable-type set, and validation.
- `serialization.ts` — canonical encode/decode of args and return values
  (incl. the whitespace-separated double contract).
- `registry.ts` + `adapters/*.ts` — one harness adapter per language
  (stub + assemble).
- `assemble.ts` — assembly entry point used by the judge-claim seam.
- `error-mapping.ts` — student-relative compile-error line remap.
- Authoring API: `problemType`/`functionSpec`/`referenceSolution` persistence +
  `POST /api/v1/problems/:id/compute-expected`.
- Authoring UI: `src/components/problem/function-*.tsx`.

## Testing

Two layers:

- **Unit / golden** (`tests/unit/judge/function-judging/`) — fast checks that the
  generated source matches committed golden fixtures, plus serialization and
  validation tests. Runs in `npm run test:unit`.
- **Compile + run smoke** (`tests/harness/`, `npm run test:harness`) —
  **toolchain-gated**: for every language whose toolchain is present, it actually
  compiles and runs the assembled harness against canonical stdin and asserts the
  output matches the canonical serializer (byte-identical for non-double,
  float-tolerant for double). This is the authoritative cross-language
  correctness check; it skips (never fails) a language whose toolchain is absent,
  and is wired best-effort into CI. It exists because golden-vs-source tests
  alone cannot catch runtime bugs (e.g. a harness that doesn't compile, or
  locale/encoding output corruption).
