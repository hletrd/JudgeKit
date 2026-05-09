# Verifier Review — Cycle 15 Review

**Date:** 2026-05-09
**HEAD:** e7d25c46
**Scope:** Evidence-based correctness check against stated behavior

## Summary

One finding verified. Prior fixes confirmed as resolved.

## Findings

### VR-1: Verified — apiFetch does not enforce documented safety patterns

- **File:** `src/lib/api/client.ts:74-89`
- **Confidence:** High
- **Severity:** Medium
- **Claim:** The file's own documentation (lines 25-54) states "Never silently swallow errors", "Always check response.ok before calling response.json()", and warns about calling `.json()` twice.
- **Reality:** The `apiFetch` wrapper enforces NONE of these patterns. It only adds headers. The `apiFetchJson` helper (lines 121-139) does implement safe parsing, but it is a separate function that many callers don't use.
- **Gap:** Dozens of components call `apiFetch` directly and manually implement (or skip) the safety checks documented in the same file.
- **Fix:** Either enforce a default timeout in `apiFetch`, or add a lint rule requiring either `apiFetchJson` or explicit signal/timeout when using `apiFetch`.

## Prior Fixes Verified

| Finding | Status | Verification Method |
|---|---|---|
| C14 copy-code-button timer | FIXED | Read file, confirmed line 26 clears timer |
| C14 language-config-table abort | FIXED | Read file, confirmed separate refs (lines 87-90) |
| C10 import-transfer stream lock | FIXED | Read file, confirmed finally block releases reader |

## No Other Verified Issues

All auth checks, rate limits, and transaction boundaries were verified by inspection to behave as documented.
