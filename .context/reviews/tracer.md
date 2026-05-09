# Tracer Review — Cycle 15 Review

**Date:** 2026-05-09
**HEAD:** e7d25c46
**Scope:** Causal tracing of data flows, state transitions, and async flows

## Summary

No new suspicious flows identified. All traced flows show consistent state management and proper error handling.

## Traced Flows

### Submission Flow (user → judge → result)
- Entry: `src/app/api/v1/submissions/route.ts` POST
- Queued in DB with `status: "pending"`
- Judge worker claims via `src/app/api/v1/judge/claim/route.ts`
- Worker executes in Docker sandbox
- Results written back via `src/app/api/v1/judge/poll/route.ts`
- Status: All state transitions are atomic within transactions. No inconsistent states found.

### Auth Flow (login → session → validation)
- Entry: `src/app/api/auth/[...nextauth]/route.ts`
- Session created with JWT + cookie
- Proxy validates on every protected request
- Cache TTL capped at 10s with FIFO eviction
- Status: Proper. Token invalidation reflected within cache TTL.

### File Upload Flow
- Entry: `src/app/api/v1/files/route.ts` POST
- Stored in `data/uploads/` with path traversal protection
- DB record links file to user/problem
- Retrieval checks auth via `canAccessFile`
- Status: Proper. DB write precedes disk write. Delete removes DB first, then disk best-effort.

### Anti-Cheat Flow
- Entry: `src/components/exam/anti-cheat-monitor.tsx`
- Events batched in localStorage
- Flushed via `performFlush`
- Failed events retried with exponential backoff
- Status: Proper. Events are deduplicated. Retry logic is bounded by MAX_RETRIES.

## No Suspicious Flows Found

All traced flows showed:
- Proper transaction boundaries
- Consistent error handling
- No race conditions in multi-step operations
- Proper cleanup on failure paths

## Final Sweep

No additional suspicious flows identified.
