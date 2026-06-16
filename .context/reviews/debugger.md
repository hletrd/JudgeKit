# Debugger — Function-Judging latent bug surface (cycle 1, 2026-06-16)

### DBG-1 (Medium) mapCompileError corrupts non-line `:N:` tokens — see CR-1.

### DBG-2 (Medium) JS/TS harness reads only the first stdin line
`adapters/javascript.ts:12`, `typescript.ts:37`: `JSON.parse(__input.split("\\n")[0])`. Correct ONLY because `encodeArgs` emits compact single-line JSON and string elements escape `\n`. If a future serializer ever pretty-prints args (multi-line), JS/TS silently parse a truncated prefix → runtime JSON error. Python/Go/Java/C#/C++ read one line too (`readline`/`getline`/`ReadLine`), same coupling. Confidence: High that current behavior is correct; Medium risk of future regression. Mitigation: assert single-line invariant in encodeArgs or read all of stdin in harnesses.

### DBG-3 (Low) Empty-array friendly-form parse: `"[]"` vs bare empty
`value-fields.ts:140`: empty trimmed text → `[]` (ok). `"[]"` → parseJsonArray → `[]` (ok). Consistent.

### DBG-4 (Low) FunctionTestCaseEditor paramCount effect can drop typed args on shrink
`function-test-case-editor.tsx:96-105`: when params shrink, `Array.from({length: paramCount})` truncates typed args; on re-growing the params the previously-typed values are gone. Expected (signature changed) but author may lose data silently. Confidence: High. Consider a confirm when removing a param that has authored values.

### DBG-5 (Low) C++ readInt uses llround(stod(...)) — overflow for long near 2^63
`adapters/cpp.ts:47`: parses via `stod` (double) then `llround`. Values above 2^53 lose precision — but authoring rejects > 2^53 (value-fields.ts), so unreachable from authored inputs; compute-expected reference outputs could still exceed it. Confidence: Medium. Document the 2^53 ceiling for returns too.
