# Critic

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Multi-perspective critique of the whole change surface

---

## F1: Tags API NaN bug is the third instance of the same pattern — suggests a systemic fix is needed

- **File**: `src/app/api/v1/tags/route.ts:17`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The anti-cheat endpoint had the same `Number()` NaN bug (fixed in cycle 21). Now the tags endpoint has it too. This is the third instance of this pattern across the codebase. The `admin/login-logs` and `admin/audit-logs` routes use `Number(searchParams.get(...)) || defaultValue` which is safe (the `||` catches NaN), but the tags route uses `Math.min(Number(...), 100)` which is not safe. A systemic solution would prevent future occurrences.
- **Concrete failure scenario**: Another endpoint is added with the same `Number()` pattern. The bug is not caught in review.
- **Fix**: Create a shared helper function `parsePositiveInt(value: string | null, defaultValue: number, maxValue?: number)` that handles NaN, negative values, and clamping. Use it in all API routes that parse integer query parameters.

## F2: `sanitizeSubmissionForViewer` hidden DB query has been flagged in multiple cycles without structural fix

- **File**: `src/lib/submissions/visibility.ts:74`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: This finding has been flagged as D16 in a prior cycle and again in cycle 21. The function makes a hidden DB query per invocation, which is a maintainability trap. The fix is straightforward (accept optional parameters), but it has been deferred repeatedly. The risk of an N+1 regression is real and increases as more developers work on the codebase.
- **Concrete failure scenario**: A new developer adds a bulk endpoint calling `sanitizeSubmissionForViewer` in a loop, introducing an N+1 regression that goes unnoticed until production.
- **Fix**: Implement the parameter-based fix this cycle. It's a small, low-risk change that eliminates a recurring maintainability concern.

## F3: Proxy `x-forwarded-host` deletion should be documented as a constraint on auth route configuration

- **File**: `src/proxy.ts:148`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Same finding as security-reviewer F1. The proxy unconditionally deletes `x-forwarded-host`, which is safe only because auth routes are excluded from the proxy matcher. This constraint should be documented as a code comment and/or as a project rule in AGENTS.md.
- **Concrete failure scenario**: A developer adds auth routes to the proxy matcher without realizing the `x-forwarded-host` deletion will break auth callbacks.
- **Fix**: Add a code comment at line 148 and consider adding a rule to AGENTS.md.

## F4: Chat widget tool-calling loop has no error handling — a single tool failure kills the entire request

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:425-428`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Same finding as code-reviewer F2. The `executeTool` calls in the agent loop have no try/catch. A single tool failure (e.g., DB timeout in `get_submission_history`) crashes the entire chat request with a 500 error. The user gets no response at all.
- **Concrete failure scenario**: The DB is under load during a contest. A student asks the AI for help. The `get_submission_history` tool times out. The entire chat request fails with a 500 error.
- **Fix**: Wrap `executeTool` in try/catch and return an error string as the tool result, allowing the agent loop to continue with available information.
