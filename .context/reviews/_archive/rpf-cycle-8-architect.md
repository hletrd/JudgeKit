# RPF Cycle 8 — Architect

**Date:** 2026-04-29
**HEAD reviewed:** `1c991812`
**Change surface:** 0 commits, 0 files, 0 lines.

## Findings

**0 NEW.** Architecture stable at HEAD.

## Architectural carry-forward status

### ARCH-CARRY-1 — raw API handlers don't use createApiHandler

- HEAD count: 20 raw of 104 total handlers (verified via `grep -L "createApiHandler" src/app/api/**/route.ts`).
- Severity MEDIUM (preserved). Exit criterion: API-handler refactor cycle.
- Status: DEFERRED. Refactor scope: large; risk on auth/observability uniformity if done piecemeal. Continue deferring.

### ARCH-CARRY-2 — SSE eviction O(n) at two distinct sites

- `src/lib/realtime/realtime-coordination.ts` (legacy backplane).
- `src/app/api/v1/submissions/[id]/events/route.ts:48-63` (per-submission channel).
- Same algorithmic pattern; suggests an architectural extraction (`SseClientRegistry` with O(1) eviction via Map + LRU).
- Severity LOW. Exit criterion: SSE perf cycle OR > 500 concurrent connections.
- Status: DEFERRED. Extraction is the right architectural move when triggered.

### Three rate-limit modules (C7-AGG-9)

- `src/lib/security/in-memory-rate-limit.ts`, `api-rate-limit.ts`, `rate-limit.ts`.
- Architectural overlap; redundancy risk (drift, partial fixes).
- Severity LOW. Exit criterion: rate-limit consolidation cycle.
- Status: DEFERRED.

## Architectural sweep — no new concerns

- API surface: no new routes; no new internal-only paths surfacing publicly.
- Auth boundary: no new pages; no protected-data leakage.
- Schema: drizzle-kit `[i] No changes detected` per cycle-7 deploy log; no schema diff.
- DB-time helper: pattern propagated from `judge-claim` to `time` route; consistent. Cycle-7 added a regression test guard.

## Workspace → public migration (TODO #1) status

Closed in cycle 1 RPF (2026-04-29). Verified `(workspace)` route group empty/removed; `(dashboard)` retains only auth-gated/admin routes. No new `(workspace)` regressions at HEAD.

## Recommendations

- Cycle 8 should not undertake an architectural refactor (none of the carry-forwards have hit their exit criteria).
- Recommended cycle-8 picks (C7-DS-1 README doc + C7-DB-2-upper-bound bash cap) are non-architectural; safe.

## Confidence

H on architecture stability; H on carry-forward dispositions.
