# Cycle 10 Debugger Report

**Reviewer:** debugger
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Latent bug surface, failure modes, regressions

## Findings

### CR10-DB1 — [MEDIUM] `clearAuthToken` fallback to `token.iat` could cause token revocation bypass

- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer CR10-SR1
- **File:** `src/lib/auth/session-security.ts:37-60`, `src/lib/auth/config.ts:399-403`
- **Evidence:** When `clearAuthToken` deletes `authenticatedAt` from the token, `getTokenAuthenticatedAtSeconds` falls back to `token.iat` (line 17-20 of session-security.ts). The `iat` (issued-at) is set by NextAuth when the JWT is first created and does not change across refreshes. If a user's JWT was created AFTER `tokenInvalidatedAt` was set (i.e., the user re-authenticated after the invalidation), then `iat > tokenInvalidatedAt`, and `isTokenInvalidated(authenticatedAt, tokenInvalidatedAt)` would return `false`. This means the `jwt` callback would NOT clear the token, allowing the session to survive what should be a revocation event.
- **Failure scenario:** 
  1. Admin forces password reset for user X at T=10. `tokenInvalidatedAt` is set.
  2. User X's next request clears the token (correct, `authenticatedAt < tokenInvalidatedAt`).
  3. User X re-authenticates at T=20. New JWT has `authenticatedAt=20` and `iat=20`.
  4. Admin forces another password reset at T=30. `tokenInvalidatedAt` is updated.
  5. User X's next request: `jwt` callback sees `authenticatedAt=20 < tokenInvalidatedAt=30`, clears the token. `clearAuthToken` deletes `authenticatedAt`.
  6. On the SAME request, after `clearAuthToken`, if any code path calls `getTokenAuthenticatedAtSeconds`, it falls back to `iat=20`. Since `20 < 30`, `isTokenInvalidated` returns `true`. This is correct.
  7. BUT: If the `clearAuthToken` return path is intercepted by NextAuth's session logic (which may call `jwt` again in the same request), the second `jwt` call would see `authenticatedAt` deleted, fall back to `iat=20`, and correctly detect the invalidation. So the bypass scenario requires an unusual NextAuth internal flow.
  
  The risk is LOW in practice because NextAuth processes the cleared token by ending the session. But the fallback to `iat` is semantically wrong — a cleared token should not have a valid `authenticatedAt`.
- **Suggested fix:** Set `authenticatedAt` to `0` instead of deleting it. This ensures `isTokenInvalidated` always returns `true` for a cleared token, regardless of the `iat` value.

### CR10-DB2 — [MEDIUM] SSE `onPollResult` callback can fire after `close()` is called — potential controller.enqueue on closed stream

- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:315-424`
- **Evidence:** The `onPollResult` callback checks `if (closed) return` at the top (line 316). But between the check and the `controller.enqueue` call, the `close()` function could be called by:
  1. The timeout timer (line 302-307)
  2. The request abort handler (line 300)
  3. The cleanup timer (line 81-94, via `removeConnection` which doesn't close the stream but could)
  
  The `close()` function sets `closed = true` and calls `controller.close()`. If `controller.enqueue` runs after `controller.close()`, it would throw a `TypeError: Cannot enqueue chunks after closing`. The `try/catch` on line 415-422 handles this, but only for the non-re-auth path. The re-auth path's enqueue (line 354) is inside a try/catch (line 348-365), which catches the error and sends an error event — but `close()` was already called, so the error event would also fail to enqueue.
- **Failure scenario:** User navigates away from the page (abort signal fires) at the same moment a terminal result is being enqueued. The abort handler calls `close()`, which closes the controller. The `controller.enqueue` in the terminal-result path throws. The error handler tries to enqueue an error event, which also throws. The error is caught by the `catch` block in the async IIFE, which logs it. The user does not see the error. This is correct behavior — the user already navigated away. But the error log is noisy.
- **Suggested fix:** Add `if (closed) return` before each `controller.enqueue` call, not just at the top of the callback. This is a minor robustness improvement.

### CR10-DB3 — [LOW] `recordRateLimitFailure` backoff exponent inconsistency with `consumeRateLimitAttemptMulti`

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR10-CR4
- **File:** `src/lib/security/rate-limit.ts:204, 166`
- **Evidence:** `consumeRateLimitAttemptMulti` uses `consecutiveBlocks - 1` as the exponent (line 166). `recordRateLimitFailure` uses `consecutiveBlocks` as the exponent (line 204), then increments `consecutiveBlocks` afterward (line 207). The effective exponent is the same in both cases, but the code reads differently — a maintenance hazard.
- **Suggested fix:** Normalize both functions to use the same pattern: increment `consecutiveBlocks` first, then calculate the block duration with the incremented value.

## Previously Found Issues (Verified Fixed Since Cycle 9)

- CR9-DB1: SSE eviction by insertion — FIXED (commit 832f9902)
- CR9-DB2: JWT re-query race — NOT A BUG (correct behavior, should be documented)
