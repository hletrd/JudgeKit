# Debugger (latent bug surface) — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c (main). Focus: failure modes in the freshest
concurrency-bearing code (claim CTE chain, staleness sweep, draft autosave).

## Findings

### D1 — Cross-worker stale reclaim can deadlock two live workers (LOW, confidence Medium)
`src/lib/judge/claim-query.ts:30-101`. Lock order inside one claim statement:
(1) `worker_slot` takes `FOR UPDATE` on the CLAIMING worker's own
`judge_workers` row; (2) `prev_worker_release` later updates the PREVIOUS
owner's `judge_workers` row. If two live workers A and C concurrently reclaim
each other's stale submissions (both must have >5-min-stale claims while still
polling — e.g. both hung on pathological compiles, then resumed), A holds
lock(A) wanting lock(C) while C holds lock(C) wanting lock(A) → Postgres
aborts one transaction with a deadlock error; that worker's claim poll fails
once and retries on its next cycle. Self-recovering, rare (requires the
single-digit-second window on both sides), but it will surface as scary
`deadlock detected` ERRORs in DB logs during incidents.
**Mitigation if it ever fires:** release-before-slot lock ordering or advisory
lock; not worth restructuring the hot path preemptively.
**Exit criterion to act:** any `deadlock detected` involving `judge_workers`
in production logs.

### D2 — Self-reclaim active_tasks leak (MEDIUM) — same as code-reviewer CR1
Documented there; from the failure-mode angle the observable symptom is a
single-worker fleet gradually "losing" concurrency slots after long-compile
incidents: `active_tasks` floor creeps up by 1 per self-reclaim and only a
worker restart (re-register = new row) or full silence (sweep reap) clears it.
This is the same *class* as the just-fixed H4 — the fix covered the
distinct-worker case but not the self case.

### D3 — Worker registration clock skew can insta-stale a fresh worker (LOW, confidence Medium)
`src/lib/db/schema.pg.ts:438-440` — `lastHeartbeatAt` default is
`$defaultFn(() => new Date())` = **app-server clock**, while the sweep compares
against **DB-server time** (`getDbNowUncached`). If the app clock lags the DB
clock by > 90 s (NTP failure), every newly registered worker is immediately
`online → stale` until its first real heartbeat (which writes DB-time…
actually heartbeat writes `now` from DB time, healing it ≤ 30 s later).
Transient mislabel only; the reap threshold (≥ 300 s) is not plausibly crossed
by realistic skew. Note for the ops runbook rather than a code fix; a DB-side
`DEFAULT now()` would eliminate the class.

### D4 — Draft autosave: pre-hydration edit may never persist (LOW, confidence High)
`src/hooks/use-server-source-draft.ts:86-108`. The autosave effect is gated on
`hydratedRef.current`, a ref — when hydration completes nothing re-runs the
effect, so a change made *during* hydration is only saved if the user types
again afterwards. Worst case is "server copy missing one keystroke burst";
localStorage still has it. Within the module's documented "best-effort"
contract; no action needed beyond awareness.

## Regression check on this cycle's fixes
- IOI run-all flag: old workers ignore the field (serde default false) —
  backward compatible; deploy notes confirm worker-0 image rebuilt (a5442080).
- `prev_worker_release` cannot fire on fresh pending claims
  (previous_worker_id NULL) — verified the WHERE clause.
- Sweep reap of a worker that is actually alive-but-hung: heartbeat
  unconditionally restores `online` — reversible by design.
- `GREATEST(active_tasks − 1, 0)` + DB CHECK `active_tasks >= 0`
  (schema.pg.ts:448) — release can never violate the constraint.

## Final sweep
Hunted for: unhandled-rejection paths in new fire-and-forget code (draft PUT
`.catch()` present; sweep `.catch()` present; durable audit never throws),
double-start of interval timers (idempotent guards present), TOCTOU between
`startExamSession` pre-checks and tx (existing idempotent-insert +
onConflictDoNothing covers it). No further findings.
