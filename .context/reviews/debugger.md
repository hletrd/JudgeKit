# Debugger — cycle 6 (2026-06-18)

Latent bug hunting in v1.1 changes.

## NEW FINDINGS

### DBG6-1 (Medium) C++ `stod`/`llround` locale sensitivity for double parsing
`src/lib/judge/function-judging/adapters/cpp.ts:47-48`
```cpp
return (long long)llround(stod(s.substr(start, i - start)));
```
`stod` is locale-sensitive for decimal parsing. In a comma-locale, `stod("0,5")`
parses as `0.5` (interpreting comma as decimal separator), but our canonical JSON
format always uses dot. If the locale is "C", `stod("0.5")` works. If the locale
is comma-based, `stod("0.5")` would stop at the dot and parse only `0`.

This is the READ side (parsing args), not the WRITE side (printing returns). The
args are encoded by `serialization.ts` which always uses dot-decimal. So in a
comma-locale, the C++ harness would parse `0.5` as `0` (stopping at the dot),
meaning ALL double arguments would be truncated to their integer part.

This is worse than CR6-1 (which only affects returns). It affects ALL double
arguments for C++ submissions.

Fix: Add `std::setlocale(LC_ALL, "C");` at the start of C++ main, or use
`std::strtod` with an explicit C locale, or parse the number manually.
Confidence: High.

### DBG6-2 (Low) C# `double.Parse` with `CultureInfo.InvariantCulture` is correct but inconsistent with C++
`src/lib/judge/function-judging/adapters/csharp.ts:81-82`
```csharp
public double ReadDouble() {
    return double.Parse(Number(), CultureInfo.InvariantCulture);
}
```
C# correctly uses `CultureInfo.InvariantCulture` for parsing. This is good and
should be the model for C++ as well. The C# write side also uses `ToString("R", CultureInfo.InvariantCulture)`.

No bug here — just noting the inconsistency with C++.

### DBG6-3 (Low) Go `strconv.FormatFloat` with `'g', -1` is locale-independent
`src/lib/judge/function-judging/adapters/go.ts:112`
Go's `strconv` package is explicitly locale-independent. This is correct.

### DBG6-4 (Low) Python `repr(float)` is locale-independent
Python's `repr()` for floats always uses dot-decimal. Correct.

### DBG6-5 (Low) JS/TS `String(number)` is locale-independent
JavaScript's `String()` on numbers always uses dot-decimal. Correct.

## CARRIED FORWARD

- DBG-2 (Medium) JS/TS harness reads only first stdin line — still latent
- DBG-4 (Low) FunctionTestCaseEditor paramCount effect can drop typed args — still latent

## RESOLVED

- DBG-1 (Medium) mapCompileError over-match — FIXED in cycle 5
- DBG-5 (Low) C++ readInt uses llround(stod) — still present but unreachable from authored inputs
