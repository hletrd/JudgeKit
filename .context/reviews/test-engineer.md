# Test Engineer

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Test coverage gaps, flaky tests, TDD opportunities

---

## F1: Tags API `limit` NaN handling has no test coverage

- **File**: `src/app/api/v1/tags/route.ts:17`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The tags API `limit` parameter is parsed with `Number()` which can produce `NaN` for non-numeric inputs (see code-reviewer F1). There is no test covering this edge case. The anti-cheat endpoint had the same bug and was fixed in cycle 21, but the tags endpoint was not updated at the same time.
- **Concrete failure scenario**: A request with `?limit=abc` passes `NaN` to `.limit()`. No test catches this before it reaches production.
- **Fix**: Add a unit test for the tags API that verifies non-numeric `limit` values fall back to the default. Then fix the code to use `parseInt` with fallback.

## F2: Chat widget tool-calling loop error handling has no test coverage

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:425-428`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: The tool-calling loop in the chat widget does not have error handling for individual tool execution failures (see code-reviewer F2). There is no test for what happens when `executeTool` throws an error during the agent loop.
- **Concrete failure scenario**: A tool execution fails due to a DB error. The entire chat request returns a 500 error. No test verifies this behavior or the expected error response.
- **Fix**: Add a test that mocks a tool execution failure and verifies the chat endpoint handles it gracefully.

## F3: `sanitizeSubmissionForViewer` N+1 risk has no documentation or test guard

- **File**: `src/lib/submissions/visibility.ts:74`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The hidden DB query in `sanitizeSubmissionForViewer` (see code-reviewer F3, perf-reviewer F2) is not documented in the function's JSDoc and has no test that verifies the DB query count. A test that counts DB queries would catch future N+1 regressions.
- **Concrete failure scenario**: A developer adds a bulk endpoint that calls `sanitizeSubmissionForViewer` in a loop. No test catches the N+1 pattern.
- **Fix**: Add JSDoc documenting the DB query and consider adding a test that verifies the function makes at most one DB query per invocation.

## F4: No test for proxy `x-forwarded-host` deletion behavior

- **File**: `src/proxy.ts:148`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The proxy deletes the `x-forwarded-host` header to work around an RSC streaming bug (see security-reviewer F1). There is no test verifying that this deletion does not affect auth callbacks or other routes that depend on this header.
- **Concrete failure scenario**: A change to the proxy matcher accidentally includes auth routes. The `x-forwarded-host` deletion breaks auth callbacks. No test catches this regression.
- **Fix**: Add a test that verifies the proxy does not delete `x-forwarded-host` from auth route requests (or that auth routes are excluded from the proxy matcher).

## Previously Verified Safe (Prior Cycles)

- `computeSingleUserLiveRank` tests — scheduled in cycle 21 plan (M3)
- `getParticipantTimeline` tests — scheduled in cycle 21 plan (M4)
- Anti-cheat `limit`/`offset` NaN handling — fixed and tested in cycle 21
