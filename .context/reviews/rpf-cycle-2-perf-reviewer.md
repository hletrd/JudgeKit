# RPF Cycle 2 (2026-05-01) — Performance Reviewer

**Date:** 2026-05-01
**HEAD reviewed:** `70c02a02`

## Findings

### C2-PR-1: [LOW] Further parallelization in getAssignmentStatusRows

- **File:** `src/lib/assignments/submissions.ts:563-646`
- **Description:** The `overrideRows` query (line 639-646) is independent of `problemAggRows` (line 563-602). Both only need `assignmentId`. Currently they run sequentially. Running them in parallel via `Promise.all` would reduce total latency by the duration of the overrides query.
- **Confidence:** MEDIUM
- **Fix:** `const [problemAggRows, overrideRows] = await Promise.all([rawQueryAll(...), db.select(...)]);`

### C2-PR-2: [INFO] Cycle-1 parallelization verified

- `getAssignmentStatusRows` at line 510 now uses `Promise.all` for the initial 3 queries. Verified correct.

## Carry-forward verification

- AGG-2 (Date.now in rate-limit): still at `src/lib/security/in-memory-rate-limit.ts:31,33,65,84,109,158`
- PERF-3 (anti-cheat heartbeat): still at `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- ARCH-CARRY-2 (SSE): still at `src/lib/realtime/realtime-coordination.ts`
- C2-AGG-6 (practice page): still at `src/app/(public)/practice/page.tsx:417`
