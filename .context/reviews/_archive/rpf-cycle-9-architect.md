# RPF Cycle 9 — Architect

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.

## Architecture inventory (no change vs cycle 8)

- 104 API route handlers, of which 20 are still raw (ARCH-CARRY-1 deferred).
- 3 rate-limit modules (`rate-limit.ts`, `api-rate-limit.ts`, `in-memory-rate-limit.ts`) sharing similar logic but distinct invariants — orientation comments added cycle 8 (C7-AGG-9 doc-only mitigation).
- 2 SSE eviction sites (`realtime-coordination.ts`, `submissions/[id]/events/route.ts`) — ARCH-CARRY-2 deferred.
- `deploy-docker.sh` at 1088 lines (was 1076 cycle 8; +12 from soft cap) — C3-AGG-5 modular extraction trigger at 1500 lines or 3 indep SSH-helpers cycles. **Touch counter at 3 after cycle 8** (cycles 5, 6, 8 touched SSH-helpers area).

## Findings

**0 NEW.**

The cycle-8 diff did not introduce architectural changes:
- The soft cap is a localized condition inside `_initial_ssh_check`; no surface area added.
- The rate-limit JSDoc headers do not change the module API or invariants.
- The README addition is documentation-only.

## Architectural debt re-examination

### C3-AGG-5 (deploy-docker.sh modular extraction)

Touch counter has reached the trigger threshold (3 indep cycles). The orchestrator's directive cautions "be cautious about scope" for MEDIUM-class work and the modular extraction is MEDIUM-equivalent (would touch ~1000 lines + tests). I recommend:
1. **Schedule for next dedicated cycle** rather than fold into cycle 9.
2. **Document the trigger trip in the cycle-9 plan and in `deploy-docker.sh` head comment** so it cannot be silently bypassed.
3. **Block any further deploy-docker.sh modification on completion of the modular extraction**, except for "must-fix" security/correctness changes.

### ARCH-CARRY-1 (20 raw API handlers → `createApiHandler`)

This is the largest scoped item on the backlog (20 files, ~600-1000 lines of refactor). Recommend a dedicated cycle once the LOW backlog drops below ~5 items. Currently LOW backlog ~10-12 items; not yet time.

### ARCH-CARRY-2 (SSE eviction O(n) at 2 sites)

Reactive trigger (>500 concurrent connections) is the correct policy at the current scale. No action.

### Drift risk: ABBR vs canonical 3-module rate-limit naming

After cycle-8 orientation comments, the 3 modules have JSDoc cross-references but no shared interface or shared test parity harness. A future cycle should consider:
- Extract a shared `RateLimitDecision` type and reuse across all 3 modules.
- Build a parametric test that runs the same scenarios against all 3 (with appropriate setup) to guarantee parity.
This is the natural successor to the cycle-8 doc-only mitigation. Recommended timing: when the consolidation cycle (C7-AGG-9 exit criterion) is scheduled.

## Confidence

High on "0 NEW architectural findings." High on the recommendation to schedule the deploy-docker.sh modular extraction for a dedicated next cycle (not cycle 9).

## Recommendation

For cycle 9: pick LOW doc-leaning items (per critic's recommendations). Do NOT schedule MEDIUM/large refactors. Trigger-trip-record the deploy-docker.sh refactor for the next cycle.
