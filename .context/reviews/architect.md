# Architect Review

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Architectural/design risks, coupling, layering

---

## F1: Chat widget tool-calling loop mixes HTTP streaming with synchronous tool execution

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:386-430`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: The tool-calling agent loop is implemented as a synchronous for-loop within the API handler. Each iteration calls `provider.chatWithTools` (HTTP request to AI provider) and `executeTool` (potentially a DB query). The loop runs up to `MAX_TOOL_ITERATIONS = 5` times. During the loop, the HTTP connection is held open, consuming a server resource. If the AI provider is slow (e.g., 10s per iteration), the connection is held for up to 50 seconds. This is acceptable for single-user chat but could become a resource concern if many users use the chat simultaneously.
- **Concrete failure scenario**: 50 users simultaneously ask the AI for help with tool calling. Each request takes 30 seconds across multiple tool iterations. The server holds 50 HTTP connections open, consuming significant memory and event loop resources.
- **Fix**: Consider implementing the tool-calling loop as an async generator or using Server-Sent Events to stream intermediate results to the client. This would reduce resource consumption and improve perceived latency.

## F2: `rateLimits` table is multiplexed for both API rate limiting and SSE connection tracking

- **File**: `src/lib/realtime/realtime-coordination.ts`, `src/lib/security/api-rate-limit.ts`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Same finding as code-reviewer F4 but from an architectural angle. The `rateLimits` table serves dual purposes: API rate limiting (short-lived, high-frequency) and SSE connection slot tracking (long-lived, low-frequency). This coupling means that schema changes to support one use case affect the other, and cleanup operations must handle both entry types. The `blockedUntil` semantics differ between the two use cases.
- **Concrete failure scenario**: A developer adds an index or constraint to optimize rate-limit lookups. The index also affects SSE connection tracking queries, potentially degrading performance or causing unexpected query plans.
- **Fix**: Consider separating SSE connection tracking into a dedicated table (e.g., `sse_connections`) with appropriate columns for connection management. This would improve schema clarity and allow independent optimization.

## F3: SSE route remains the only API route not using `createApiHandler`

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Same finding as cycle 21 architect F3. The SSE route is not migrated to `createApiHandler` due to streaming response requirements. This creates an inconsistency where auth checks, rate limiting, and error handling are manually implemented. The comment at line 1 documents this decision, which is adequate.
- **Concrete failure scenario**: A new security middleware is added to `createApiHandler`. The SSE route bypasses it. Since SSE is GET-only, this is low risk.
- **Fix**: Either extend `createApiHandler` to support streaming responses, or keep the current approach with the existing documentation.

## Previously Verified Safe (Prior Cycles)

- Shared IOI scoring SQL fragment — extracted in cycle 21
- Leaderboard API `userId` clearing — documented in cycle 21
