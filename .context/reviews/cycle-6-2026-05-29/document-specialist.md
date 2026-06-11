# Cycle 6 — Document-specialist review (doc/code mismatches)

**HEAD:** d1217b5a · Baseline green.

## Findings

### DOC-C6-1 — sweep comment will be stale after N6-C6 — **LOW (preventive)**
`heartbeat/route.ts:91-101` documents only the `active_tasks` reconciliation ("The graceful deregister / admin-DELETE paths already zero active_tasks; this closes the crash path."). After adding the `stale -> offline` reaper, this comment must be updated to state that the sweep also drives the terminal `offline` transition for crashed workers (and that this clears the permanent admin-health `degraded`). Likewise `worker-staleness.ts` header should document the third lifecycle threshold/transition. Update comments WITH the code change, not after.

### DOC-C5-2 (carried) — register advertises hardcoded `staleClaimTimeoutMs=300000` — **LOW, HIGH (non-impacting)**
`register/route.ts:22,75` vs admin-configurable `getConfiguredSettings().staleClaimTimeoutMs`. Verified the Rust worker (`types.rs`, `api.rs`) only deserializes and never consumes it. Dead field. **Remains correctly deferred.**

### AGENTS.md / CLAUDE.md alignment — OK
Reviewed CLAUDE.md (deploy flags, config.ts preservation, Korean letter-spacing) and the cycle-5 plan. N6-C6 touches only judge backend (heartbeat sweep + pure helper + tests) — no Korean typography, no `config.ts`, no deploy-flag implications. Compliant.

## Final sweep
No README/API-doc references to a `stale->offline` reaper exist yet (consistent — the feature doesn't exist yet). No other doc/code drift found in the reviewed surface.
