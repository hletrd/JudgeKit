# RPF Cycle 6 — perf-reviewer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8`
**Diff vs cycle-5 base:** 0 lines.

## Methodology

Inventoried perf-relevant hot paths, re-validated paths cited in carry-forward backlog (since refactors may have drifted them), and audited the stale prior cycle-6 PERF findings.

## Stale prior cycle-6 PERF findings audit

- **AGG-2 (anti-cheat polling discards loaded events)** — RESOLVED. The fix preserves `prev.slice(PAGE_SIZE)` and uses functional setOffset to avoid resetting when user has loaded more. Verified at `src/components/contest/anti-cheat-dashboard.tsx:118-160`.
- **PERF-2 (score-timeline-chart SVG could useMemo)** — Not reproduced as actionable; SVG render cost is tiny.
- **PERF-3 (active-timed-assignment-sidebar-panel interval clearing)** — Documented as "harmless no-op" in stale aggregate; not actionable.

## Carry-forward perf items — status at HEAD

### AGG-2 — `Date.now()` in rate-limit hot path (MEDIUM, DEFERRED, PATH UPDATED)

- **Original cited path:** `src/lib/api-rate-limit.ts:56` — **does not exist at HEAD.**
- **Current path:** `src/lib/security/in-memory-rate-limit.ts:22, 24, 56, 75, 100, 149`. The module migrated from `src/lib/` to `src/lib/security/`.
- **Severity:** MEDIUM unchanged. `Date.now()` is invoked at least once per `getRateLimitStatus()` call, which fires per inbound API request. Sub-microsecond per call is benign at current QPS.
- **Action this cycle:** correct the carry-forward path. Implementation deferred to a dedicated rate-limit-time perf cycle.

### PERF-3 — anti-cheat heartbeat gap query (MEDIUM, DEFERRED, PATH UPDATED)

- **Cited path:** `src/lib/anti-cheat/`. **Note:** that directory contains only `review-model.ts` (16 lines, pure event-tier mapping). The gap query is in `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` lines ~182-225.
- **Hot-path detail (validated at HEAD):** route fetches up to 5000 most-recent heartbeats DESC (limit explicitly documented at lines 195-198 to prevent OOM), reverses to chronological order, walks pairs to detect gaps >120s. Worst case O(5000) iteration = ~50µs CPU; bounded.
- **Concrete cost driver:** the per-request DB filter scan on `(assignmentId, userId, eventType='heartbeat')`, ordered DESC by `createdAt`. Index health is the lever.
- **Severity:** MEDIUM unchanged.
- **Action this cycle:** correct the carry-forward path. Implementation deferred to a dedicated anti-cheat perf cycle.

### C2-AGG-5 — polling without visibility awareness (LOW, DEFERRED)

- 4-6 polling components still fire on hidden tabs. Component `src/components/contest/anti-cheat-dashboard.tsx:157` already uses a `useVisibilityPolling` hook (per stale review), suggesting that hook exists and could be retrofitted to other sites.
- Exit criterion: telemetry signal OR 7th instance.
- Status: DEFERRED.

### C2-AGG-6 — practice page filter perf (LOW, DEFERRED)

- `src/app/(public)/practice/page.tsx:417` — array-iteration filter on every keystroke.
- Exit criterion: p99 > 1.5s OR > 5k matching problems.
- Status: DEFERRED.

### ARCH-CARRY-2 — SSE eviction O(n) (LOW, DEFERRED)

- `src/lib/realtime/realtime-coordination.ts` line 10 declares `UNSUPPORTED_BACKENDS = new Set(["redis"])`. Eviction loop runs O(n) over connection map.
- Exit criterion: SSE perf cycle OR > 500 concurrent connections.
- Status: DEFERRED.

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no new perf risks introduced.

## Recommendation

Pick **C5-SR-1** + **C3-AGG-3** for cycle-6 LOW draw-down (perf-neutral, deploy-script-side). Avoid AGG-2 and PERF-3 without dedicated perf cycle and benchmarks.

Confidence: H.
