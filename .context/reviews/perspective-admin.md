# Persona: Platform Admin (settings, users, capacity, ops) — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035. Seat: the platform owner-operator across three
production targets (worv, auraedu, algo + worker-0).

## What improved since cycle 1 (verified)
- **Overrides-active banner** (F10) on the settings form: the
  "enabled-for-a-workshop, forgotten-before-an-exam" mistake now has a
  prominent `role="status"` warning, and both override hints state the
  global/immediate consequence.
- **NODE_ENCRYPTION_KEY documented** (F4) in both env examples + deployment
  doc; required-at-startup enforcement (a5e66736) means a missing key fails
  loudly at boot, not at first decrypt.
- **Backup verification got real** (abfa90f5): restore-test against a
  throwaway database, not just a file-exists check.
- **Migration journal drift closed** (F6 bonus): from-scratch rebuild now
  produces the full schema — my DR story no longer depends on push-diff
  history.

## Pain points found this cycle

### AD2-1 — Deploy reliability: BuildKit history corruption (HIGH ops — DEFERRED-OPS-1, now with CONFIRMED remedy)
Cycle-1's auraedu deploy needed manual rescue. Confirmed diagnosis: history-
store corruption (`unknown blob ... in history`), cleared ONLY by
`docker buildx history rm --all` (zero downtime); re-triggered by the
all-languages parallel compose bake (`deploy-docker.sh:651-656`); avoided by
the sequential per-language loop. As the operator I need the script to (a)
not trigger it (serialize/cap the bake), (b) self-heal once when the
signature appears, (c) tell me the signature + remedy in the runbook. This
is scheduled for THIS cycle, before the deploy.

### AD2-2 — Unbounded `code_snapshots` is a silent capacity liability (MEDIUM — SEC2-2)
My DB volume grows monotonically with every assignment run; the pre-deploy
pg_dump grows with it (deploy time + backup storage). Retention window fixes
both. Note: my `judgekit-predeploy-*.dump` retention is 30 d on-host — the
DB table outliving every backup of it is the wrong way around.

### AD2-3 — Review/plan artifact sprawl (LOW)
~36 historical aggregates in `.context/reviews/` root; 184 done plans.
A sweep of pre-June files into `_archive/` keeps the operator-facing surface
legible. Cheap, schedule as housekeeping.

## Re-checked, fine
- Worker staleness: background reap sweep (7e198b51) + heartbeat;
  admin workers dashboard exposes per-worker tasks; deregister requeues.
- Metrics endpoint CRON_SECRET-gated; backfilled idempotently by deploy.
- Data-retention legal hold env (DATA_RETENTION_LEGAL_HOLD) suspends prunes.
- prune_old_docker_artifacts honors every CLAUDE.md guardrail (`-f` not
  `-af` on images; volume prune only with DB up).
- User management: bulk import, role gates, mustChangePassword flows intact.
