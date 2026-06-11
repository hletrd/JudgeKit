# Cycle 6 — Tracer review (causal flow, competing hypotheses)

**HEAD:** d1217b5a · Baseline green.

## Trace: "Admin dashboard shows degraded but cluster is fine"

Hypotheses:
- H1: audit-event write failures (`auditEvents.status === 'degraded'`).
- H2: `pending > 0 && online === 0` (no online workers but queued work).
- H3: `stale > 0` — a worker row stuck in `stale`.

Trace through `admin-health.ts:88-91`: any of H1/H2/H3 sets `degraded`. H3 is the silent one: a `stale` row with NO live problem. Following the lifecycle:
1. Worker crashes (`kill -9`) → no deregister sent.
2. Surviving worker heartbeats → sweep marks crashed row `stale` (`heartbeat/route.ts:82-89`).
3. After 300 s → sweep zeroes its `active_tasks` (cycle-5 N1, `heartbeat/route.ts:104-115`).
4. **DEAD END:** nothing ever moves the row off `stale`. `grep` confirms `offline` is set only by graceful deregister / admin DELETE (deletes row).
5. `admin-health` reads `stale=1 > 0` → `degraded`, **forever**.

→ H3 confirmed as the root cause of "permanently degraded". This is N6-C6. The causal fix is to add the missing `stale -> offline` edge in the sweep (the only autonomous actor), gated on the same stale-claim-timeout cutoff already used in step 3.

## Competing hypothesis ruled out
Could a transiently-slow live worker be wrongly reaped to `offline`? No — the reap cutoff = `computeActiveTasksResetCutoff` (>= 90 s floor, default 300 s). A live worker heartbeats every 30 s and flips back to `online` long before the reap cutoff; the reap only touches rows still `status='stale'` AND silent past the full timeout. Same safety argument as N1's no-clobber guarantee. Reaped workers that come back simply re-register or their next heartbeat flips them `online` (the heartbeat UPDATE at line 67-73 sets `status='online'` unconditionally).

## F3/F4/N3
No new causal evidence; deferrals stand.
