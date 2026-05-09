# Verifier — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** Evidence-based correctness check against stated behavior

## Summary

Two findings verified. Prior fixes confirmed as resolved.

## Findings

### VR-1: Verified — apiFetch default timeout bypassed when caller provides signal [MEDIUM]

- **File:** `src/lib/api/client.ts:88`
- **Confidence:** High
- **Severity:** Medium
- **Claim:** The apiFetch fix in commit 64de91dd adds a default 30s timeout.
- **Reality:** The timeout is only applied when `init?.signal` is undefined. When callers pass their own signal, the timeout is completely bypassed.
- **Evidence:**
  - Line 88: `const signal = init?.signal ?? AbortSignal.timeout(30_000);`
  - `chat-widget.tsx:197`: Creates `new AbortController()` with no timeout
  - `file-upload-dialog.tsx:93`: Creates `new AbortController()` with no timeout
  - `language-config-table.tsx:117`: Creates `new AbortController()` with no timeout
  - Test `client.test.ts:81-88` explicitly asserts that caller-provided signals are passed through verbatim
- **Fix:** Always apply a default timeout, combining with caller signals when present.

### VR-2: Verified — AbortSignal.timeout browser compatibility gap [MEDIUM]

- **File:** `src/lib/api/client.ts:88`
- **Confidence:** High
- **Severity:** Medium
- **Claim:** `AbortSignal.timeout` is used as a default signal.
- **Reality:** This is the ONLY client-side use of `AbortSignal.timeout` in the entire codebase. It is not supported in Safari < 16.4, Chrome < 103, Firefox < 100.
- **Evidence:**
  - grep confirms 14 total uses; 13 are server-side (Node.js supports it)
  - The one client-side use is `api/client.ts:88`
  - MDN confirms Safari support added in 16.4 (March 2023)
- **Fix:** Add a fallback helper that uses `setTimeout` + `AbortController` when `AbortSignal.timeout` is unavailable.

## Prior Fixes Verified

| Finding | Status | Verification Method |
|---|---|---|
| C15 apiFetch timeout | PARTIAL | Timeout added but incomplete (see VR-1) |
| C14 copy-code-button timer | FIXED | Read file, confirmed line 26 clears timer |
| C14 language-config-table abort | FIXED | Read file, confirmed separate refs (lines 87-90) |
| C10 import-transfer stream lock | FIXED | Read file, confirmed finally block releases reader |

## No Other Verified Issues

All auth checks, rate limits, and transaction boundaries were verified by inspection to behave as documented.
