# Function-Signature Judging — Design Spec

Date: 2026-06-14
Status: approved design (pending user spec review → writing-plans)
Roadmap item: ② of `2026-06-14-wow-features-roadmap.md` (the architectural keystone)

## 1. Goal & scope

Add a new problem type — **function-signature judging** (LeetCode-style) — where
the author defines a function signature and typed I/O examples, the platform
generates a per-language starter stub and an execution harness, and the student
implements only the function body. This is distinct from today's `auto`
(stdin/stdout whole-program) and `manual` (instructor-graded) problem types.

### v1 decisions (locked during brainstorming)
- **Model:** function-signature only (author-supplied unit-test mode is a later
  sub-project, not in this spec).
- **Types:** scalars `int`, `long`, `double`, `bool`, `string`, plus **1-D
  arrays** of those (`int[]`, `string[]`, …). No 2-D/nested/map/ListNode/TreeNode
  in v1.
- **Languages:** Python, C++, Java, JavaScript, Go, C#, TypeScript (7), behind a
  pluggable harness registry so an 8th is a contained, repeatable addition.
- **Expected outputs:** author may type expected returns manually, OR supply one
  reference solution and click "Compute expected outputs" to have the platform
  fill them by running the reference through the judge.

### Explicitly deferred (flagged, not forgotten)
- `void` / in-place-mutation functions (e.g. `sortColors`) → v1.1. v1 requires a
  non-`void` return type.
- "Any valid order / multiple correct answers" comparison → folds into roadmap
  item ⑥ (special judge). v1 is exact, order-sensitive.
- 2-D arrays, nested lists, maps, ListNode/TreeNode → per the type-scope choice.

### Success criteria
1. An author can create a function problem (signature + typed cases + optional
   reference solution) entirely in the existing problem-create/edit UI.
2. A student sees a correct per-language starter stub and, on submit, gets the
   same per-test pass/fail verdicts as any other problem.
3. Function problems work everywhere normal problems do — practice, problem
   sets, contests, exams, recruiting — with no special-casing in those layers.
4. No changes are required to the Rust judge worker or the output comparator.

## 2. Core principle — compile DOWN to the existing stdin/stdout pipeline

The whole design rests on one decision (approved): a function submission is
*transpiled* at judge time into an ordinary stdin/stdout submission.

- The worker `Submission` is `{ source_code, language, test_cases:[{input,
  expectedOutput}] }` and the comparator does normalized line comparison
  (`judge-worker-rs/src/comparator.rs` `compare_output`: split on `\n`, `trimEnd`
  each line, trim outer blank lines). Verified.
- Therefore: the app sends **assembled** source (`harness_prelude + student_code
  + generated_main`) as `source_code`, with test cases whose `input` is the
  serialized argument vector (delivered on stdin) and whose `expectedOutput` is
  the serialized return. The generated `main` reads stdin, deserializes the
  args, calls the student's function, and prints the serialized return.
- **Consequences:** zero judge-worker changes; the comparator, sandbox,
  time/memory limits, anti-cheat, contest/exam/recruiting plumbing, and rankings
  all work unchanged because, downstream of assembly, it is just a submission.

## 3. Data model (additive, backward-compatible)

`problems` table (Drizzle, `src/lib/db/schema.pg.ts`):
- `problemType` gains the value `"function"` (no schema change — already a free
  text column defaulting to `auto`).
- **New** `functionSpec jsonb` (nullable):
  ```jsonc
  {
    "functionName": "twoSum",
    "params": [ { "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" } ],
    "returnType": "int[]",
    "enabledLanguages": ["python","cpp","java","javascript","go","csharp","typescript"]
  }
  ```
- **New** `referenceSolution jsonb` (nullable): `{ "language": "python", "source": "..." }`.
  Author-only; never serialized into any student-facing payload.
- `test_cases` table is **reused unchanged**. For function problems:
  - `input` = canonical one-line JSON array of arguments, in `params` order,
    e.g. `[[2,7,11,15],9]`.
  - `expectedOutput` = canonical one-line JSON of the return, e.g. `[0,1]`.
  - `isVisible` / `sortOrder` keep their meaning.

Migration: add two nullable `jsonb` columns to `problems`; existing rows
untouched; drizzle-kit migration generated and journaled (CI drift guard).

### Type system (v1)
Allowed `type` strings: `int`, `long`, `double`, `bool`, `string`, and their
1-D array forms `int[]`, `long[]`, `double[]`, `bool[]`, `string[]`. A single
`FunctionType` union + validator (`src/lib/validators/`) is the source of truth,
shared by the authoring UI, the serializer, and every harness adapter.

### Canonical serialization
- One canonical JSON encoding used by BOTH the test-case storage and the harness
  output, so equality is line-exact. Integers as JSON integers; `double` printed
  with a fixed, round-trip-safe format; `bool` as `true`/`false`; `string`
  JSON-quoted; arrays as JSON arrays with no inner whitespace.
- Numeric tolerance (for `double` / `double[]` returns) reuses the existing
  `comparison_mode = float` + `floatAbsoluteError` / `floatRelativeError`. To
  stay compatible with the float comparator, double-returning problems emit
  space-separated numbers rather than JSON brackets; the exact print format per
  return type is finalized against `comparator.rs` during planning. (For v1 the
  safe default is `exact` comparison with the canonical JSON form.)

## 4. Harness registry — `src/lib/judge/function-harness/`

A registry mapping `language → FunctionHarnessAdapter`. Each adapter:

```ts
interface FunctionHarnessAdapter {
  language: string;
  // native type declaration for a FunctionType (params + return)
  typeDecl(t: FunctionType): string;
  // student-facing starter stub (signature + empty body / class wrapper)
  generateStub(spec: FunctionSpec): string;
  // full compile unit: prelude + studentCode + generated main
  assemble(spec: FunctionSpec, studentCode: string): { source: string; preludeLineCount: number };
}
```

- `generateStub` integrates with the editor's existing starter-template path
  (`src/lib/judge/code-templates.ts`) — for function problems the stub comes
  from the adapter, not `DEFAULT_TEMPLATES`.
- `assemble` returns `preludeLineCount` so compile-error line numbers can be
  mapped back to student-relative lines.
- A `supportsFunctionJudging(language)` helper gates the student language picker
  and the author's `enabledLanguages` choices to the registered adapters.
- Per-adapter responsibilities: map each `FunctionType` to native types; read the
  JSON arg vector from stdin; deserialize to native values; call
  `spec.functionName(...)` (Java/C#: a `Solution` class method per convention);
  serialize the return in the canonical format; print to stdout.

Adding a language later = implement one adapter + golden/integration tests.

## 5. Judge integration

- A single seam in the submission→worker dispatch path: if the problem is
  `problemType === "function"`, replace the outgoing `source_code` with
  `adapter.assemble(spec, studentSource).source`; otherwise unchanged. The
  **persisted** submission keeps the student's original source (what they wrote
  and what anti-cheat/similarity sees).
- **Compile-error mapping:** when the worker reports compile output for a
  function submission, subtract `preludeLineCount` from reported line numbers so
  messages are student-relative; still gated by `showCompileOutput`.
- **Reference-solution "Compute expected outputs":** an authoring-time action
  that, for each case, assembles `(spec, referenceSolution.source)` and runs it
  through the judge against that case's `input`, writing the produced stdout into
  the case's `expectedOutput`. Reuses the same assembly + judge path.
- **Language gating at submit:** the submit API/UI offers only
  `spec.enabledLanguages ∩ registry-supported`.

## 6. Authoring & student UX

### Author (`src/app/(public)/problems/create` + `.../[id]/edit`)
- Problem-type selector gains "Function".
- **Signature builder:** function name; ordered parameter rows (name + type
  dropdown from the v1 type set); return-type dropdown (non-`void` in v1);
  enabled-languages multiselect (defaults to all 7).
- **Test-case editor (function variant):** per-parameter typed inputs instead of
  one stdin textarea; an expected-return field; visible/hidden toggle as today.
  Values are validated against the declared types and serialized to the
  `test_cases` row format.
- **Reference solution (optional):** language picker + code editor + "Compute
  expected outputs" button (fills every case's expected return via the judge).
- **Live stub preview:** shows the generated student stub for a chosen language.

### Student (`src/app/(public)/problems/[id]` submit + practice/contest paths)
- Editor preloads the adapter-generated stub for the selected language (empty →
  stub), instead of the generic template.
- Language dropdown limited to enabled+supported languages.
- Verdicts/results render exactly as today (visible cases may show args/expected/
  got; hidden cases show pass/fail), honoring `showDetailedResults` /
  `showRuntimeErrors`.

## 7. Validation, edge cases, failure modes

- **Author-side validation:** every test case's arg values + expected return must
  type-check against the signature; the signature must have ≥1 param and a
  supported non-`void` return; `functionName` must be a valid identifier.
- **Student wrong signature / undefined function:** surfaces as a mapped compile
  error (compiled languages) or a clear runtime message (interpreted) — the
  harness references `functionName`, so a mismatch fails loudly at author-chosen
  visibility.
- **Trusted inputs:** arg JSON in `test_cases.input` is author-controlled; parse
  failures are an authoring bug caught at author time, not student-facing.
- **Limits / large arrays:** identical to today (worker enforces time/memory).
- **Determinism:** the harness consumes all of stdin and prints only the return,
  so student `print` debugging that writes extra stdout will (correctly) fail the
  comparison — documented behavior; consider a future "stdout ignored except
  final line" mode (not v1).

## 8. Testing strategy

- **Per-adapter golden tests:** assemble a canonical `twoSum` (and one scalar
  return, one string-array return) and assert the generated source matches a
  committed golden file — fast, deterministic, no compiler needed.
- **Integration (compile+run) tests:** for at least the core languages, actually
  run assembled correct + wrong solutions through the judge path and assert
  Accepted / Wrong-Answer verdicts.
- **Serialization round-trip tests:** native value ↔ canonical JSON for every
  v1 type.
- **Compile-error line-mapping tests:** assert `preludeLineCount` subtraction
  yields student-relative lines for a deliberately broken submission.
- **E2E:** author a function problem (with reference-solution auto-compute),
  submit a correct and an incorrect solution, assert verdicts and per-test rows.
- All existing gates stay green (tsc, eslint, lint:bash, vitest, build); function
  problems must not regress `auto`/`manual` paths.

## 9. Rollout

- Purely additive: new `problemType` value + two nullable columns + new lib
  module + additive UI. No worker/comparator changes.
- Ships without a feature flag; authoring is already gated by the
  `problems.create` capability. (A system-setting toggle can be added later if
  desired but is not required for v1.)
- Migration journaled; CI migration-drift guard must pass.

## 10. Out of scope (this spec)
Author-supplied unit-test mode; void/in-place returns; nested/map/ListNode/
TreeNode types; unordered/multi-answer comparison; AI generation of function
problems (roadmap ⑤); stress-testing (roadmap ⑥). These are separate sub-projects.
