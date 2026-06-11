# Cycle 11 Debugger Report

**Reviewer:** debugger
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Latent bug surface, failure modes, regressions

## Findings

### CR11-DB1 — [MEDIUM] SSE `onPollResult` callback can fire after `close()` is called — potential controller.enqueue on closed stream

- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:315-424`
- **Evidence:** The `onPollResult` callback checks `if (closed) return` at the top (line 316). But between the check and the `controller.enqueue` call, the `close()` function could be called by: (1) the timeout timer (line 302-307), (2) the request abort handler (line 300), or (3) the cleanup timer (line 81-94, via `removeConnection`). The `close()` function sets `closed = true` and calls `controller.close()`. If `controller.enqueue` runs after `controller.close()`, it would throw a `TypeError: Cannot enqueue chunks after closing`. The `try/catch` blocks (lines 348-365 and 391-410) handle this, but the error event enqueue (line 360/404) could also fail if the stream is already closed.
- **Failure scenario:** User navigates away from the page (abort signal fires) at the same moment a terminal result is being enqueued. The abort handler calls `close()`, which closes the controller. The `controller.enqueue` in the terminal-result path throws. The error handler tries to enqueue an error event, which also throws. The error is caught by the `catch` block and logged. The user does not see the error. This is correct behavior but the error log is noisy.
- **Suggested fix:** Add `if (closed) return` before each `controller.enqueue` call, not just at the top of the callback. This is a minor robustness improvement.

### CR11-DB2 — [MEDIUM] `authorize()` passes an incomplete inline object to `createSuccessfulLoginResponse` — same pattern that caused acceptedSolutionsAnonymous bug

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR1, architect CR11-AR3
- **File:** `src/lib/auth/config.ts:317-336`
- **Evidence:** The `authorize()` function constructs an inline `AuthUserRecord` object (lines 318-336) and passes it to `createSuccessfulLoginResponse`. The `createSuccessfulLoginResponse` function calls `mapUserToAuthFields(user)` where `user` is the inline object. If any field is missing from the inline object, `mapUserToAuthFields` uses the `??` default instead of the actual DB value. The `acceptedSolutionsAnonymous` bug was caused by exactly this pattern. While the specific fields are now present, the pattern itself is fragile — any future field addition to `AuthUserRecord` could be missed in the inline object.
- **Failure scenario:** Developer adds `preferredEditorLayout` to `AuthUserRecord` and `mapUserToAuthFields` but forgets the inline object in `authorize()`. The DB value is silently replaced by the `??` default on login.
- **Suggested fix:** Pass the DB `user` object directly to `createSuccessfulLoginResponse` instead of constructing an inline object. The DB query in `authorize()` already fetches all columns (no `columns` filter), so `user` already has all fields.

### CR11-DB3 — [LOW] SSE cleanup timer runs even when there are no connections — unnecessary CPU wake

- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:82-90`
- **Evidence:** The periodic cleanup timer (setInterval, line 82) runs every 60 seconds regardless of whether there are any connections. When `connectionInfoMap.size === 0`, the loop body does nothing but the timer still fires and wakes the event loop.
- **Suggested fix:** Add an early return when `connectionInfoMap.size === 0` in the cleanup callback.
