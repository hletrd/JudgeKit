# RPF Cycle 1 (orchestrator-driven, 2026-04-29) — Performance Reviewer

**Date:** 2026-04-29
**HEAD:** 32621804
**Scope:** Hot paths, render cost, bundle size signals, query parallelism.

## Performance verification

- `Promise.all` parallelism in `src/app/layout.tsx:91-96` (locale, messages, headers, timezone) is correct.
- `src/lib/contests/list.ts` parallelizes `getContestsForUser` and `getPublicContests` (commit `1d17552b`, cycle 2). Verified intact at HEAD.
- `src/app/(public)/practice/problems/[id]/page.tsx` removed redundant `getExamSession` call (commit `d365a50c`). Verified intact.
- Client component count: 142 `"use client"` directives. Server component / action count: 10 `"use server"`. Ratio is healthy for an SSR-first Next.js 16 app with editors, real-time leaderboards, and admin dialogs.

## Findings

### C1-PR-1: [LOW] Polling intervals not visibility-paused

**Evidence:** `setInterval`/`setTimeout` exist in real-time submission status, leaderboard updates, exam timers. No global pause when document is hidden.

**Why minor:** Not regression. Bounded by per-page mount/unmount; tabs in background still consume polling cycles.

**Suggested:** Defer; candidate for SWR/visibility-based pause once usage telemetry shows it matters. Severity **LOW**.

### C1-PR-2: [INFO] No measurable regression vs. cycle 11

Spot-checked key hot-path files (`src/components/code/compiler-client.tsx`, `src/components/contest/leaderboard-table.tsx`, `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/status-board.tsx`, `src/components/lecture/submission-overview.tsx`) for new expensive operations. None found. Memoization patterns intact.

## Net new findings: 1 (LOW; informational/deferred).
