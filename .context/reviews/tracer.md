# Tracer — causal flows (cycle 1, 2026-06-16)

Flow: author types args → parseFieldValue → encodeArgs (compact JSON line) → stored as testCase.input → compute-expected assembles reference + runs → stdout becomes expectedOutput → student submit assembled at claim time → worker compares stdout to expectedOutput (exact).

Hypothesis A (string escaping divergence): expectedOutput is produced by the REFERENCE language's writer, student output by the STUDENT language's writer. If two languages escape a string return differently (e.g. C++ emits `é` but Go emits raw UTF-8 `é`), an otherwise-correct student solution gets WRONG_ANSWER cross-language. Evidence: C++ writeStr only escapes `" \\ \n \t \r` and emits other bytes raw (cpp.ts:117-130); Go uses encoding/json which escapes `<,>,&` as \u and emits non-ASCII raw; Java escapes same minimal set as C++. CONFIRMED DIVERGENCE for non-ASCII / HTML-significant chars in string/string[] returns. Severity: Medium (only affects string-returning problems with special chars). Re-open: add a cross-language string-return golden test.

Hypothesis B (int writer): all emit decimal long — consistent.
Hypothesis C (bool/array): consistent compact `[a,b]`, true/false — consistent.
