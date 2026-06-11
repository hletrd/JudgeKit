# Architect Review — Cycle 5 (2026-05-29)

## Worker lifecycle state machine (judge_workers.status)
States observed: `online` (register, heartbeat), `stale` (sweep), `offline`
(deregister). Transitions:
- register → `online`, `active_tasks=0` (new row each call).
- heartbeat → `online` (self), and sweeps siblings `online → stale`.
- deregister → `offline`, `active_tasks=0`, releases submissions.
- admin DELETE → row removed, releases `queued`/`judging` submissions.

### ARCH-C5-1 (= N1) — the state machine has no `stale → offline` reaper edge
The `online → stale` edge is the only automatic degradation; there is no automatic
`stale → offline` transition and no automatic `active_tasks` reset off the graceful
paths. A crashed worker is therefore a permanent `stale` row carrying a stale
`active_tasks`. This is an architectural gap (missing terminal-cleanup edge), not
just a bug. Because `admin-health.ts:89` treats any `stale > 0` as `degraded`, the
absence of the reaper edge couples worker-crash transients into a sticky degraded
health signal. Recommend either (a) extend the heartbeat sweep to also zero
`active_tasks` once a row is stale past the stale-claim timeout, or (b) add an
explicit reaper (admin action or piggybacked sweep) that moves long-stale rows to
`offline`. Low-risk; aligns the state machine with the graceful-path invariant
"active_tasks reflects real in-flight work only for live workers."

### ARCH-C5-2 — register always INSERTs (no upsert by hostname)
`register/route.ts:49` unconditionally INSERTs. A worker that restarts gets a new
id and leaves its previous row behind. This is the design (stateless workers,
per-restart identity) and is internally consistent with N1's mitigation, but it
means orphaned-row accumulation is by-design and MUST be paired with a reaper
(ARCH-C5-1) to stay bounded. Documented here as the coupling that makes N1 matter.

## Rate-limit identity overload (= N2)
`consumeUserApiRateLimit(request, userId, endpoint)` is being used as a generic
"scope" limiter in `claim/route.ts`. The function name encodes a narrower contract
(per-authenticated-user) than its actual use. Minor layering smell; rename or
overload-document. Low.

## No new coupling/layering regressions
contest-scoring, verdict, api-rate-limit, and the judge routes keep their existing
boundaries. No new findings beyond N1/N2 (and N3 informational, folded into F3).
