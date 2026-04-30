# RPF Cycle 4 — perf-reviewer perspective (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91` (no `src/` changes since cycle 3 HEAD `66146861`)

## Findings

### C4-PR-1: [LOW, High confidence] SSH retry exponential backoff caps at 16s — potential flaky-host wait time (carry-forward)

**File/lines:** `deploy-docker.sh:165-178` (`_initial_ssh_check`)

The backoff sequence is 2 → 4 → 8 → 16 s with `delay=$(( delay * 2 ))`. If the host is up but flaky, the operator waits `2 + 4 + 8 + 15s ConnectTimeout × 4 = 74s` worst case. Cycle-3 already filed C3-AGG-3 for this with the env-var-tunable retry count fix. No new finding; carry-forward.

### C4-PR-2: [INFO, High confidence] No new perf findings on `src/`

Cycle-3 made zero `src/` changes. The `src/` perf items (PERF-3 anti-cheat heartbeat gap query; D1/D2 JWT clock-skew + DB-per-request; AGG-2 rate-limit `Date.now`; ARCH-CARRY-2 SSE eviction; C2-AGG-6 practice page IDs in memory; C2-AGG-5 visibility polling pattern duplication) are all already in the deferred backlog with concrete exit criteria. No new `src/` activity since means none of those exit criteria can have tripped this cycle.

**Recommendation:** Keep monitoring. None of the deferred `src/` perf items have a freshly-met exit criterion.

## Confidence

High that there are no new perf findings this cycle.
