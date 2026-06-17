# Code Review — cycle 6 (2026-06-18)

Fresh review of the function-judging v1.1 double/double[] support changes and
cross-cutting concerns since cycle 5.

## NEW FINDINGS

### CR6-1 (Medium) C++ double printer uses `%.10g` without locale pinning
`src/lib/judge/function-judging/adapters/cpp.ts:115`
```typescript
inline void writeVal(string &o, double v) { char buf[64]; snprintf(buf, sizeof(buf), "%.10g", v); o += buf; }
```
The C++ `snprintf` with `%.10g` is locale-sensitive. In a locale using comma as
decimal separator (e.g., `de_DE`), `0.5` prints as `0,5`. The worker's float
comparator tokenizes on whitespace and parses tokens with `parse::<f64>()` which
expects dot-decimal. A C++ solution in a comma-locale would produce tokens that
fail to parse as f64, causing all double-return submissions to be judged
WrongAnswer.

The Java adapter was fixed in commit `275f71aa` to use `Locale.ROOT`. The C++
adapter has no equivalent fix. The C++ harness runs in a Docker container where
the locale is typically POSIX/C, but this is an environmental assumption, not a
guarantee.

Fix: Set the C locale explicitly in the C++ harness main (e.g., `setlocale(LC_ALL, "C");`)
or use a locale-independent formatting approach. Add a cross-locale golden test.
Confidence: Medium (environment-dependent, but the Java fix proves the team
recognizes this as a real issue).

### CR6-2 (Low) Go adapter `ReadString('\n')` includes the newline in the parsed JSON
`src/lib/judge/function-judging/adapters/go.ts:87`
```go
__line, _ := __reader.ReadString('\n')
```
`ReadString` includes the delimiter in the returned string. The JSON decoder
should handle this (trailing whitespace after the closing `]` is technically
invalid JSON but Go's decoder may tolerate it). However, if the args line ends
exactly at EOF with no trailing newline, `ReadString` returns the line without
error but the error return is non-nil (io.EOF). The code ignores the error with `_`.

If the last line has no newline and is exactly the args JSON, this works. But if
there's any issue with stdin, the error is silently dropped. More importantly,
if the newline IS included in `__line`, `json.Unmarshal` on `json.RawMessage(__line)`
may fail because the trailing `\n` is not valid JSON whitespace inside a RawMessage
(unlike `json.Decoder` which strips whitespace).

Actually, `json.RawMessage` is just `[]byte`, and `json.Unmarshal` strips leading
and trailing whitespace. So this is likely fine. But the error swallowing is a
latent issue.

Fix: Check the error from `ReadString` — `io.EOF` is fine, but other errors
should be handled. Trim the trailing newline before decoding to be explicit.
Confidence: Low.

### CR6-3 (Low) `decodeFieldValue` for `double[]` uses `/\s+/` split which collapses multiple spaces
`src/lib/judge/function-judging/value-fields.ts:209`
```typescript
return trimmed.split(/\s+/).map((token) => { ... });
```
The regex `/\s+/` splits on ANY whitespace sequence, including tabs and newlines.
For the space-separated double[] contract, this is fine since the canonical form
uses single spaces. But if a user manually edits the expected output field to
contain multiple spaces or tabs, the split collapses them. This is a UI-layer
issue only (affects what the editor displays, not what gets stored), since the
canonical `encodeValue` always produces single spaces.

However, if a problem was migrated or manually edited in the DB, the stored value
might have multiple spaces. `decodeFieldValue` would collapse them, and when the
author re-saves, the single-space form would be stored. This is probably correct
behavior (normalization), but worth noting.

Confidence: Low.

### CR6-4 (Low) `function-test-case-editor.tsx` `useEffect` dependency array suppresses legitimate lint warning
`src/app/(public)/problems/create/create-problem-form.tsx` and similar editors:
The `expectedOutputsVersion` effect at line 110 has `// eslint-disable-next-line react-hooks/exhaustive-deps`
because `testCases` is in the dependency array but the effect is meant to only
fire when `expectedOutputsVersion` changes. This is a known pattern but the
suppression is a code smell — the effect should use a ref or the state structure
should be redesigned to avoid the suppression.

Confidence: Low.

## CARRIED FORWARD (unchanged from cycle 5)

### CF-5 (Low) Remaining low-priority items from cycle 5
- SEC-3: host-path trim from compute-expected diagnostics
- PERF-1: compute-expected runs cases serially
- ARC-4: shared `resolveExecLanguage` helper extraction
- DBG-4: confirm-on-param-removal in FunctionTestCaseEditor
- TST-3: serialization round-trip fuzz for string[] with commas/quotes/newlines
- TST-4: student-GET referenceSolution-absence integration test

## DEFERRED (unchanged)

None new. The D1 locale-sensitive double issue is now CR6-1 (active finding, not
deferred) because double is now authorable.

## VERIFIED FIXED (from cycle 5)

- AGG-2: mapCompileError filename-anchored rewrite — confirmed fixed in `error-mapping.ts:38-41`
- AGG-3: Cross-language string escaping — confirmed fixed in all 7 adapters
- AGG-4: Single-line stdin contract assertion — confirmed in `serialization.ts:66-70`
- Java Locale.ROOT fix — confirmed in `adapters/java.ts:176`
