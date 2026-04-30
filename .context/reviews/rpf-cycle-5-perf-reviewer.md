# Perf Reviewer — RPF Cycle 5 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `2626aab6`
**Cycle change surface vs cycle-4 close-out:** EMPTY (0-line diff).

## Inventory

- `src/` tree: unchanged since cycle 3.
- Hot-path code in `src/lib/api-rate-limit.ts`, `src/lib/realtime/`, `src/lib/anti-cheat/`, polling components, `src/app/(public)/practice/page.tsx`: unchanged.

## NEW findings this cycle

**None.** No code changes that could introduce perf regressions.

## Resolution of prior cycle-5 (stale base 4c2769b2) findings

- F1 / AGG-2 (Group export OOM): RESOLVED at HEAD via `MAX_EXPORT_ROWS = 10_000`.
- F2 (Submissions GET dual queries): subsumed by ARCH-CARRY-1; still DEFERRED.
- F3 (Anti-cheat 5000-row reverse-scan gap detection): same as PERF-3 carry-forward. DEFERRED.
- F4 (Multiple routes dual count): same as ARCH-CARRY-1. DEFERRED.
- F5 (SSE inArray with 500 IDs): subsumed by ARCH-CARRY-2. DEFERRED.

## Carry-forward DEFERRED perf items (severity preserved)

- **C3-AGG-3** (LOW) `deploy-docker.sh:165-178` — `_initial_ssh_check` decommissioned-host wait up to 74s.
- **C2-AGG-5** (LOW) Visibility-aware polling pattern duplicated in 4-6 files.
- **C2-AGG-6** (LOW) `src/app/(public)/practice/page.tsx:417` Path B fetches all matching IDs in memory.
- **AGG-2** (MEDIUM) `src/lib/api-rate-limit.ts:56` `Date.now()` call per request in hot path.
- **PERF-3** (MEDIUM) `src/lib/anti-cheat/` heartbeat gap query.
- **ARCH-CARRY-2** (LOW) `src/lib/realtime/` SSE eviction is O(n) over connections per session.

## Confidence

**High.** Empty src-side surface; no perf delta to measure.
