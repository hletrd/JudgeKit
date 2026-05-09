# Critic — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** Multi-perspective critique of the whole codebase

## Summary

Two design-level observations identified. The codebase continues to show strong consistency.

## Findings

### CT-1: apiFetch timeout fix is incomplete — creates two problems instead of solving one [MEDIUM]

- **File:** `src/lib/api/client.ts:74-90`
- **Confidence:** High
- **Severity:** Medium
- **Problem:** The C15 fix attempted to add a default timeout to apiFetch but solved only half the problem:
  1. When no signal is provided: timeout is added (good)
  2. When a signal IS provided: timeout is bypassed (bad — same original bug)
  3. The `AbortSignal.timeout` API is used without a fallback for older browsers (bad — new regression)
- **Contradiction:** The wrapper is documented as a safety wrapper but doesn't actually provide safety for its most common caller pattern (passing an AbortController.signal for cancellation).
- **Cross-perspective:** Code-reviewer, verifier, debugger, and test-engineer all independently identified the same issue. High signal.
- **Fix:** Implement a composite timeout strategy:
  - Always create a timeout signal (with browser fallback)
  - When caller provides a signal, combine both signals so either can abort the fetch
  - Update the test that documents the buggy behavior

### CT-2: Inconsistent timeout strategy across fetch wrappers [LOW]

- **Files:** `src/lib/api/client.ts:88`, `src/lib/docker/client.ts:112`, `src/lib/docker/client.ts:144`
- **Confidence:** Medium
- **Severity:** Low
- **Problem:** The same `signal = init?.signal ?? AbortSignal.timeout(N)` pattern appears in both client-side (`apiFetch`) and server-side (`callWorkerJson`, `callWorkerNoContent`) wrappers. The server-side wrappers have the same bug (caller signal bypasses timeout) but the impact is different since they run in Node.js where `AbortSignal.timeout` is always available.
- **Fix:** Apply the composite timeout fix to `docker/client.ts` as well for consistency.

## Prior Fixes Verified

- C14 copy-code-button timer leak: Fixed
- C14 language-config-table shared AbortController: Fixed

## Final Sweep

No contradictions between modules, no inconsistent error handling strategies, no mismatched frontend/backend contracts found beyond the timeout strategy inconsistency noted above.
