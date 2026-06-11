# Performance Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** perf-reviewer
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- SSE events route (`src/app/api/v1/submissions/[id]/events/route.ts`)
- Stats endpoint (`src/app/api/v1/contests/[assignmentId]/stats/route.ts`)
- Chat widget (`src/lib/plugins/chat-widget/chat-widget.tsx`)
- Rate limiter (`src/lib/security/in-memory-rate-limit.ts`)
- Compiler execute (`src/lib/compiler/execute.ts`)
- Data retention (`src/lib/data-retention-maintenance.ts`)
- Audit events (`src/lib/audit/events.ts`)

## Findings

### PERF-1: Chat widget scrollToBottom effect runs on every messages change but only needs to run on message count change [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:107-115`

**Description:** The `useEffect` at line 107 depends on `[messages, scrollToBottom]`. Since `scrollToBottom` is now stable (empty dependency array from cycle 35 fix), this is effectively `[messages]`. However, `messages` is a new array reference on every state update (due to `setMessages(prev => [...prev, ...])`), even when streaming chunks are appended. During streaming, each SSE chunk creates a new messages array, causing the effect to run on every chunk. The effect itself only needs to fire when a new message is added (count change) or when streaming content changes the scroll position.

While the `scrollToBottom` callback uses `requestAnimationFrame` during streaming to batch updates, the effect still fires on every chunk. This is functionally correct but slightly wasteful — the rAF deduplication catches the redundant scroll calls.

**Fix:** Consider using a ref to track message count and only trigger scroll when count changes or during streaming. This is a micro-optimization and may not be worth the added complexity.

**Confidence:** Low

---

### PERF-2: Global timer HMR pattern duplicated across three modules — carry-over [LOW/MEDIUM — carry-over]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/audit/events.ts`, `src/lib/data-retention-maintenance.ts`

**Description:** Three modules use the identical `globalThis.__xxxTimer` HMR-safe timer pattern. This was identified as AGG-8 in cycle 35 and deferred. No change this cycle.

---

## Previously Fixed Items (Verified in Current Code)

- AGG-3 (Stats double scan): Fixed — `solved_problems` now references `user_best` CTE
- AGG-4 (scrollToBottom isStreaming): Fixed — now uses `isStreamingRef.current`
