# RPF Cycle 4 (Loop Cycle 4/100) — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** d4b7a731
**HEAD commit:** d4b7a731
**Scope:** Performance, concurrency, CPU/memory/UI-responsiveness angle across the entire repo.

## Production-code delta since last review

Only `src/lib/judge/sync-language-configs.ts` changed (`SKIP_INSTRUMENTATION_SYNC` short-circuit). Cold-path startup-only code; zero production hot-path effect.

## Re-sweep findings (this cycle)

**Zero new findings.**

Re-walked the performance-sensitive surface:

- Judge claim route (`src/app/api/v1/judge/claim/route.ts`) — still clock-skew-safe via `getDbNowUncached` (fixed cb730300).
- Rate-limit atomic consume (`src/lib/security/rate-limit.ts`) — still deferred on `Date.now()` hot-path (AGG-2, MEDIUM/MEDIUM).
- ICPC leaderboard sort (`src/lib/contests/leaderboard.ts`) — deterministic tie-break in place since 39dcd495.
- SSE events route (`src/app/api/v1/submissions/[id]/events/route.ts`) — O(n) eviction scan bounded by 1000-entry cap (AGG-6, LOW/LOW, deferred).
- Anti-cheat heartbeat gap query — still 5000-row ceiling (PERF-3, MEDIUM/MEDIUM, deferred).
- Chat widget scroll during streaming — rAF throttling already in place (cycle 32 Task E).
- `countdown-timer.tsx` — visibilitychange listener present (lines 132-143); no timer drift on tab focus.
- `active-timed-assignment-sidebar-panel.tsx` — timer now properly cleans up when assignments expire (verified in current HEAD).

## Carry-over deferred items (unchanged)

All prior performance deferrals remain valid (unchanged from cycle 55 aggregate):
- `atomicConsumeRateLimit` `Date.now()` in hot path — MEDIUM/MEDIUM.
- Leaderboard freeze `Date.now()` — LOW/LOW.
- SSE O(n) eviction — LOW/LOW.
- Anti-cheat heartbeat-gap 5000-row query — MEDIUM/MEDIUM.

No new performance finding surfaced.

## Recommendation

No action this cycle. Deferred items remain bound by their original exit criteria.
