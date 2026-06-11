# Verifier — Cycle 5 (2026-05-29)

Evidence-based correctness check.

## VER-C5-1 (= N1) — confirmed by code tracing
Grep for every `active_tasks` write site (verified):
- `claim/route.ts:229` `+ 1` (CTE worker_bump)
- `claim/route.ts:380` `- 1` (claim-failure rollback, guarded by token re-check)
- `poll/route.ts:172` `GREATEST(active_tasks - 1, 0)` (final verdict)
- `deregister/route.ts:65` `= 0`
- `admin/workers/[id]` DELETE (row removed)
The heartbeat sweep (`heartbeat/route.ts:82-89`) sets ONLY `status: "stale"`.
Therefore: NO path resets `active_tasks` for a worker that goes stale without
deregistering. CONFIRMED net-new mechanism.

Also confirmed via `main.rs:233-246` + `register/route.ts:49`: the Rust worker
registers on every boot and the route always INSERTs, so a restart does not reuse
the stale row → the leak lands on an abandoned row, bounding the availability
impact (no self-lockout). This is why severity is Low-Medium, not High.

## VER-C5-2 — health degradation coupling confirmed
`admin-health.ts:89`: `status === "degraded" || stale > 0 || (pending > 0 && online
=== 0)`. A single orphaned stale row keeps `stale > 0` → degraded, with no
automatic recovery. CONFIRMED.

## Score computation (F3) re-verification
`verdict.ts:45-46`: `passed = results.filter(accepted).length; score =
round(passed*10000/results.length)/100`. A worker reporting a partial result set
(fewer items than the problem's test-case count) inflates the denominator-relative
score. CONFIRMED mechanism, but only reachable by an authenticated trusted worker
(claimToken + per-worker secret). Matches the cycle-4 F3 deferral. No change.

## Negative results (things claimed-suspect that are actually fine)
- ICPC `firstAcAt` uses `MIN(...)` (contest-scoring.ts:214,237) → earliest AC,
  CORRECT (not the latest). The last-AC tie-break correctly uses `Math.max`.
- Rate-limit IP/auth scope keys are distinct (no collision) — N2 is naming-only.

Net-new confirmed: VER-C5-1 (= N1), VER-C5-2 (= N1 coupling). F3/F4 unchanged.
