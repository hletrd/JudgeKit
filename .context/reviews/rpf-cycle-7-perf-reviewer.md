# RPF Cycle 7 — perf-reviewer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

No perf-relevant changes this cycle. Stale prior cycle-7 perf findings (C7-PR-1 SSE eviction, C7-PR-2 rate-limit sort) re-validated at HEAD: both still applicable but already tracked as ARCH-CARRY-2 / AGG-2 in the cycle-6 backlog. No new perf findings.

## Stale prior cycle-7 perf findings — re-validated at HEAD

| Stale ID | File | HEAD perf state |
|---|---|---|
| C7-PR-1 (SSE O(n) eviction) | `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | Loop `while (connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS)` still scans all entries. Concern triggers only at saturation (1000 SSE connections); at typical load (< 100 concurrent) the eviction loop is rarely reached. Maps to ARCH-CARRY-2 in cycle-6 backlog. |
| C7-PR-2 (rate-limit sort) | `src/lib/security/in-memory-rate-limit.ts:41-47` | Still sorts on overflow. O(n log n) at MAX_ENTRIES=10000. Maps to AGG-2 in cycle-6 backlog. |
| C7-PR-3 (anti-cheat heartbeat 5000-row fetch) | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195-207` | Unchanged. Maps to PERF-3 in cycle-6 backlog. |
| C7-PR-4 (shared SSE poll tick batching) | `src/app/api/v1/submissions/[id]/events/route.ts:172-203` | Positive observation; well-designed. No issue. |

## Cycle-6 commits — perf assessment

- `72868cea` (SUDO_PASSWORD decoupling): zero runtime impact — deploy-script only.
- `2791d9a3` (DEPLOY_SSH_RETRY_MAX): zero runtime impact — deploy-script only.

Net: no production-runtime perf delta.

## Re-validation of perf-relevant carry-forwards at HEAD

| ID | File | HEAD perf state |
|---|---|---|
| AGG-2 | `src/lib/security/in-memory-rate-limit.ts:22, 24, 56, 75, 100, 149` | `Date.now()` × 6 sites in hot path; ~600ns/request worst case. Below mitigation threshold. |
| C2-AGG-6 | `src/app/(public)/practice/page.tsx:417` | Path B fetches all matching IDs in memory. Unchanged. |
| C2-AGG-5 | 4-6 polling components | Polling without `document.visibilityState` check. Pre-emptive helper recommended by code-reviewer would reduce hidden-tab CPU/network. |
| ARCH-CARRY-2 | `src/lib/realtime/realtime-coordination.ts` + `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | Two sites, same O(n) eviction pattern. |
| PERF-3 | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` | Heartbeat gap query unchanged. |
| D1, D2 | auth JWT clock-skew + DB-per-request | DB-per-request adds ~3-15ms per authenticated request. |

## NEW perf findings this cycle

**0 NEW.** Empty change surface; runtime perf characteristics unchanged.

## Pre-emptive C2-AGG-5 perf review

If cycle-7 picks the `useVisibilityAwarePolling` hook extraction (per code-reviewer recommendation):

- **Goal:** Pause polling when `document.visibilityState === "hidden"`, resume on `visibilitychange`. Trigger an immediate poll on resume to refresh stale state.
- **Cost saved per hidden tab × duration:** N polls × poll interval × ~1-5KB JSON. For 1h of background-tab time at 5s polling: 720 polls × ~2KB = 1.44 MB saved per user, 720 setState calls avoided.
- **Risk:** Resume-on-visibility-change must do an immediate poll. AbortController integration required to cancel in-flight requests on hide-then-show transitions.

Recommended scope: extract the hook with full unit tests; migrate ONE polling site as proof-of-correctness; leave the other 5 unchanged for future incremental migration. Combined diff ≤ 100 lines.

## Recommendations for cycle-7 PROMPT 2

1. **C2-AGG-5 pre-emptive `useVisibilityAwarePolling` hook** — Extract reusable primitive; migrate one site. Defends against open-ended "wait for 7th instance" trigger.
2. **Documentation: ARCH-CARRY-2 path clarification** — Update aggregate to record BOTH sites of O(n) eviction (`realtime-coordination.ts` AND `events/route.ts:48-63`).
3. **Cycle-6 backlog count update** — Update aggregate's C1-AGG-3 count from "21" to actual measured value at HEAD (25 per code-reviewer's grep).

## Confidence labels

- Re-validation of stale cycle-7 perf findings: **H**.
- Re-validation of cycle-6 backlog: **H**.
- Cycle-7 NEW findings: **H** (= 0).
- Hook extraction perf benefit: **M** (depends on user behavior).
