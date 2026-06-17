# Function-Judging v1.1 — `double` / `double[]` return support

Date: 2026-06-17
Status: plan (design determined by constraints; builds on the shipped v1 + the smoke layer)
Predecessor: `docs/superpowers/specs/2026-06-14-function-judging-design.md` (v1, double deferred)

## Why double was deferred (and the fix)
v1 excluded `double`/`double[]` because exact, byte-identical comparison of floats
across 7 languages is fragile (Java `%.10g`→`0.500000000`, Go shortest→`0.5`,
`-0` vs `0`, etc.). The Rust worker's `compare_float_output` (verified at
`judge-worker-rs/src/comparator.rs:113`) solves this: it splits BOTH expected and
actual on whitespace, requires equal token counts, and compares each token as
`f64` within abs-or-rel tolerance (default `1e-9`). So float judging is correct
IFF (a) the problem uses `comparison_mode = float`, and (b) the return is printed
as whitespace-separated numeric tokens (NOT JSON `[a,b]`, which is one
unparseable token). This plan wires exactly that.

## Design decisions (locked)
1. **Re-enable** `double` + `double[]` in `AUTHORABLE_FUNCTION_TYPES`
   (`src/lib/judge/function-judging/types.ts:20`) and update the validator message.
2. **Comparison coupling (server-side):** when a function problem's `returnType`
   is `double` or `double[]`, the problem is forced to `comparisonMode = "float"`
   at create/update (in the problem mutation path), using the existing
   `floatAbsoluteError` / `floatRelativeError` columns (default to the comparator's
   `1e-9` when unset). Params being double does NOT force float — only the RETURN
   (which is what gets compared). Non-double returns keep `exact`.
3. **Return serialization is type-dependent:**
   - `int`/`long`/`bool`/`string` + their arrays → unchanged canonical JSON
     (exact comparison).
   - `double` scalar return → a single numeric token (e.g. `0.5`).
   - `double[]` return → **space-separated** numeric tokens (e.g. `0.5 0.25 -3`),
     never `[...]`/commas.
   This applies to BOTH `serialization.ts encodeValue` (the stored
   `expectedOutput`) AND every adapter's RETURN print path. Because comparison is
   float-tolerant, the exact textual form per language need NOT byte-match — only
   the token COUNT and each token's parsed `f64` value (within tolerance) must
   agree. (This is strictly easier than the string case.)
4. **Stdin args unchanged:** `encodeArgs` stays JSON; `double`/`double[]` PARAMS
   are read as JSON numbers by each harness exactly as today. Only the RETURN
   print format changes for double.
5. **NaN/Inf:** out of scope; reject author-supplied non-finite double values at
   the authoring boundary (the value validator) with a clear error.

## Tasks

### Task 1 — Re-enable double + float-mode coupling (server-side)
- `types.ts`: remove the `double`/`double[]` exclusion from
  `AUTHORABLE_FUNCTION_TYPES`; update the validator refine message.
- Problem mutation (`src/lib/problem-management.ts` + the create/update routes):
  when `problemType==="function"` and `functionSpec.returnType` ∈
  {`double`,`double[]`}, set `comparisonMode="float"` (preserve author-set
  `floatAbsoluteError`/`floatRelativeError`, else leave null → comparator default).
- `value-fields.ts`: accept double scalar/array authoring values; reject
  non-finite (`NaN`/`Inf`) with a clear error.
- Tests: spec with double return is accepted; a created double-return problem has
  `comparisonMode==="float"`; non-finite double value rejected.

### Task 2 — Type-dependent double return serialization
- `serialization.ts encodeValue`: for `double` → single token; for `double[]` →
  space-separated tokens. Keep int/string/bool/arrays as JSON. Add a clear doc
  comment on the float/space-separated contract.
- Tests: `encodeValue(0.5,"double")`, `encodeValue([0.5,0.25],"double[]")` →
  `"0.5"`, `"0.5 0.25"` (no brackets/commas).

### Task 3 — Adapter RETURN print path for double (all 7)
- Each adapter (`adapters/*.ts`): when `returnType` is `double` → print one
  numeric token; `double[]` → print space-separated numeric tokens; else existing
  JSON. Reuse each language's existing double formatter (already present from v1,
  e.g. C++ `%.10g`, Go shortest, etc.). Regenerate any affected goldens.
- The stub generator already maps double types (kept from v1) — verify the stub
  signature renders for double.

### Task 4 — Extend the compile+run smoke layer with double cases
- `tests/harness/adapters-smoke.test.ts`: add `double` and `double[]` return
  cases across all 7 languages, asserting FLOAT-tolerance equality (parse the
  program's stdout tokens + the `encodeValue` tokens as `f64`, compare within
  `1e-9` abs-or-rel, and assert equal token counts) — NOT byte-identity. Cover:
  a plain double, a negative, a small value (`1e-7`), an integral-valued double
  (`7.0`), and a `double[]`. Toolchain-gated as the existing layer. This is the
  authoritative cross-language correctness check (it would have caught the v1
  Java/C# bugs).

### Task 5 — Authoring UI: double selectable + tolerance
- Signature builder + return-type select (`function-signature-builder.tsx`):
  `double`/`double[]` now appear (they come from `AUTHORABLE_FUNCTION_TYPES`
  automatically). When the return type involves double, show a small note that
  float comparison is used and expose optional abs/rel tolerance inputs (bound to
  `floatAbsoluteError`/`floatRelativeError`); default placeholder `1e-9`.
- Typed test-case editor: double return → numeric expected-value input(s);
  serialize via `encodeValue` (space-separated for arrays). i18n en/ko for any
  new strings (no custom letter-spacing/tracking on Korean).

### Task 6 — Docs
- `docs/api.md` + the function-judging section: `double`/`double[]` now
  supported; float comparison with configurable tolerance; the space-separated
  numeric-output contract; smoke-layer coverage.

## Verification / rollout
- Gates: `tsc`, `eslint`, `lint:bash`, `test:unit`, `build`, `test:harness`
  (the double cases must pass on every locally-available toolchain), plus the
  responsive e2e regression guard stays green.
- Additive + backward-compatible (no migration; `comparison_mode`/`float*` columns
  already exist). Deploy app-only to all 3 after green.
