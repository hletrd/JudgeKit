# RPF Cycle 10 — Perf Reviewer

**Date:** 2026-04-29
**HEAD:** `6ba729ed`
**Cycle-9 perf-relevant change surface:** zero. All five cycle-9 commits touch markdown, head comments, or plan files. No runtime allocation, sync I/O, or hot-path changes.

## NEW findings (current cycle-10)

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

## Carry-forward (DEFERRED, status unchanged at HEAD)

- **AGG-2 (MEDIUM)** — `Date.now()` repeated calls in rate-limit hot path; lines drifted from {22,24,56,75,100,149} to **{31, 33, 65, 84, 109, 158}** at HEAD. Severity unchanged. Exit criterion: rate-limit-time perf cycle.
- **PERF-3 (MEDIUM)** — anti-cheat heartbeat gap query in `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225`. Severity unchanged. Exit criterion: anti-cheat dashboard p99 > 800ms or > 50 concurrent contests.
- **C2-AGG-5 (LOW)** — visibility-aware polling in 5 components. Severity unchanged. Exit criterion: telemetry signal or 7th instance.
- **C2-AGG-6 (LOW)** — practice page perf at `src/app/(public)/practice/page.tsx:417`. Severity unchanged. Exit criterion: p99 > 1.5s OR > 5k matching problems.
- **ARCH-CARRY-2 (LOW)** — SSE eviction O(n). Severity unchanged. Exit criterion: SSE perf cycle OR > 500 concurrent connections.

## Cycle-10 perf pick recommendation

Backlog draw-down candidate: **AGG-2 Date.now caching** is a well-scoped MEDIUM that could land in one cycle (six call sites in a single file, refactor to a single `now = Date.now()` per request, no behavior change). However, the current cycle-9 strategy of doc-only mitigation has been favored when the underlying risk is dormant (no telemetry pressure). Recommend **continuing to defer AGG-2** in cycle 10 unless a sharper exit criterion is required (e.g., add "OR rate-limit module touched 2 more times" to align with C3-AGG-5 trigger pattern).

## Confidence

H: zero perf regressions in cycle-9 surface.
H: AGG-2 line drift is the only path correction.
M: AGG-2 is the most "ready-to-fix" MEDIUM in backlog but not necessarily ready this cycle.

## Files reviewed

- `git diff 1bcdd485..6ba729ed --stat` (all touched files non-runtime)
- `src/lib/security/in-memory-rate-limit.ts:1-165`
