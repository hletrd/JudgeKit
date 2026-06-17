# Performance Review — cycle 6 (2026-06-18)

Review of performance implications from v1.1 changes.

## NEW FINDINGS

### PERF6-1 (Medium) `planProblemTestCaseSync` uses JSON.stringify for signature hashing
`src/lib/problem-management.ts:126-127`
```typescript
const signature = JSON.stringify([
  existing.input,
  existing.expectedOutput,
  Boolean(existing.isVisible),
]);
```
For problems with large test cases (e.g., 10MB input/expected), `JSON.stringify`
is called twice per test case (once for existing, once for next). This creates
large temporary strings and could be slow for problems with many large cases.

The function is only called during problem update, which is an admin operation,
so this is not a hot path. But for large problem sets, this could cause the update
to timeout.

Fix: Use a content hash (e.g., SHA-256) instead of JSON.stringify for signature
comparison. Or at least, avoid stringifying large values by hashing them directly.
Confidence: Medium (admin-only, but could cause timeouts on large problems).

### PERF6-2 (Low) `compare_float_output` in Rust allocates two `String::from_utf8_lossy`
`judge-worker-rs/src/comparator.rs:122-123`
```rust
let exp_str = String::from_utf8_lossy(expected);
let act_str = String::from_utf8_lossy(actual);
```
For large outputs, this allocates two Cow strings. The float comparison is only
used for double returns, which are typically small (single tokens or a few space-
separated tokens). But if a malicious/problematic output is large, this allocates.

Fix: Since float comparison tokenizes on whitespace, we could work directly on
byte slices without UTF-8 conversion, using `split(|c| c.is_ascii_whitespace())`.
Confidence: Low.

## CARRIED FORWARD

- PERF-1 (Low) compute-expected runs cases serially
- PERF-2 (Low) FunctionTestCaseEditor recomputes errorsByCase on every keystroke
- PERF-3 (Low) Stub regenerated via getAdapter().generateStub on every spec change
