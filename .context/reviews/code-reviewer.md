# Code Reviewer

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Code quality, logic, SOLID, maintainability

---

## F1: Tags API `limit` NaN — `Number("abc")` produces NaN, passed directly to `.limit()`

- **File**: `src/app/api/v1/tags/route.ts:17`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100)`. If the query param is a non-numeric string like "abc", `Number("abc")` returns `NaN`, and `Math.min(NaN, 100)` returns `NaN`. The `limit` is then `NaN`, which Drizzle's `.limit(NaN)` may interpret as 0 or cause unexpected behavior. This is the same class of bug as the anti-cheat endpoint NaN issue fixed in cycle 21 (commit 88391c26).
- **Concrete failure scenario**: A request with `?limit=abc` results in `NaN` being passed to `.limit()`. Depending on the Drizzle/PG driver, this could cause a query error or return zero results.
- **Fix**: Use `parseInt` with a fallback: `const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100)`.

## F2: Chat widget tool-calling loop silently drops tool-call errors

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:425-428`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The tool-calling agent loop iterates over `response.toolCalls ?? []` and calls `executeTool` for each, but there's no try/catch around `executeTool`. If a tool throws (e.g., DB query failure in `get_submission_history`), the entire request fails with a 500 error and the user gets no partial response. The loop should handle individual tool failures gracefully by returning an error message as the tool result.
- **Concrete failure scenario**: A student asks the AI assistant for help. The `get_submission_history` tool fails due to a transient DB error. The entire chat request returns a 500 error instead of the AI explaining what it can without the submission history.
- **Fix**: Wrap each `executeTool` call in try/catch and return an error string as the tool result so the agent loop can continue.

## F3: `sanitizeSubmissionForViewer` makes a hidden DB query — N+1 risk in bulk contexts

- **File**: `src/lib/submissions/visibility.ts:74`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `sanitizeSubmissionForViewer` queries the `assignments` table for every submission it sanitizes. Currently only called from single-submission endpoints (SSE route, individual submission view), so the N+1 risk is theoretical. However, the function signature does not communicate this hidden DB query, making it easy for a future developer to introduce an N+1 bug. This was previously flagged as D16 from a prior cycle and deferred, but the function signature remains a maintainability trap.
- **Concrete failure scenario**: A future developer adds a bulk submissions endpoint that calls `sanitizeSubmissionForViewer` in a loop for 100 submissions. This triggers 100 extra DB queries to the `assignments` table.
- **Fix**: Accept the assignment's `showResultsToCandidate` and `hideScoresFromCandidates` as optional parameters to avoid the DB query when the caller already has the data. Add JSDoc documenting the hidden DB query.

## F4: `realtime-coordination.ts` multiplexes SSE connection tracking and rate limiting on the same `rateLimits` table

- **File**: `src/lib/realtime/realtime-coordination.ts`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `rateLimits` table is used both for API rate limiting (short TTL, high-frequency) and SSE connection slot tracking (long TTL, low-frequency). The `acquireSharedSseConnectionSlot` function uses `pg_advisory_xact_lock` for coordination, which is correct, but the shared table creates a risk of table bloat from long-lived SSE entries if connections are not properly cleaned up. The `blockedUntil` field semantics differ between rate-limit entries (block-until) and SSE entries (connection-expiry).
- **Concrete failure scenario**: A spike in SSE connections creates thousands of rows in `rateLimits` with long `blockedUntil` values. If the cleanup job only targets short-TTL rate-limit entries, the SSE entries may not be cleaned up efficiently, causing table bloat.
- **Fix**: This is an architectural concern, not an immediate bug. Document the dual-purpose usage clearly in the table schema and ensure the cleanup job handles both entry types.

## F5: Proxy matcher does not cover `/languages` public route — missing CSP headers

- **File**: `src/proxy.ts:301-319`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The proxy matcher includes `/practice/:path*` and `/rankings` but does not include `/languages` (the public languages page at `src/app/(public)/languages/page.tsx`). This means the `/languages` page does not receive the CSP headers, HSTS, or other security headers set by `createSecuredNextResponse`. Other top-level public routes like `/submissions` and `/users/:id` may also be missing.
- **Concrete failure scenario**: The `/languages` public page loads without CSP headers or the proxy's security hardening, making it slightly less protected than other pages.
- **Fix**: Add `/languages` to the proxy matcher if it's a public page that should have CSP headers. Verify whether `/submissions` and `/users/:id` public pages need the same treatment.

## Previously Verified Safe (Prior Cycles)

- `computeSingleUserLiveRank` windowed exam mode late penalty — correctly implemented
- Anti-cheat `limit`/`offset` NaN handling — fixed in cycle 21 (commit 88391c26)
- `adjustedScore` renamed to `rawScaledScore` — fixed in cycle 21 (commit ab8fe63b)
- Shared IOI scoring SQL fragment — extracted in cycle 21 (commits 301bbc56, 71b2c3c1)
