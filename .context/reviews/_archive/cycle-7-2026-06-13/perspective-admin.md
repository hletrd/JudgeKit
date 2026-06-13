# Perspective: Platform Admin — RPF Cycle 7 (2026-06-13)

Seat: a platform admin responsible for settings, user management, capacity,
monitoring, backup/restore, deploy, and incident response. **HEAD 0472b007.**

## AD7-1 — Admin user/audit/login listings shuffle same-timestamp rows across pages (LOW-MEDIUM, High, CONFIRMED — admin face of CR7-1)
`admin/audit-logs`, `admin/login-logs`, and `users` listings order by
`createdAt` only. After a bulk user import (many identical `createdAt`) my
admin user list reorders between page loads, and audit/login CSV exports are
nondeterministic at the cap — bad when I'm pulling logs for an incident
review. Fix: id tiebreak (CR7-1) + the order documented.

## AD7-2 — Stale access tokens accumulate silently across schedule edits (LOW, Medium, CONFIRMED — admin face of SEC7-1)
From the ops seat: every contest deadline edit leaves `contest_access_tokens`
rows with a now-wrong `expires_at`, and pre-cycle-6 rows still carry
`deadline`-based (not effective-close) expiry. There's no maintenance job that
reconciles them. The schedule-edit sync (SEC7-1) also retro-repairs these on
the next edit, which is the cleanest path — no separate migration needed.

## Strong points (verified — several are direct cycle results)
- **Dead-worker detection:** the staleness sweep now runs on a process-level
  unref'd interval (instrumentation.ts:28), not only on a peer heartbeat — a
  crashed SINGLE worker is reaped and `active_tasks` reconciled even with no
  other traffic (7e198b51). admin-health can see the dead fleet.
- **Backup verification:** `verify-db-backup.sh` now does a real restore-test
  when `RESTORE_DATABASE_URL` is provided (abfa90f5) — a truncated-but-valid-
  gzip dump no longer passes silently. Follow-up to wire `RESTORE_DATABASE_URL`
  into CI is noted in that commit.
- **Fail-fast secrets:** `NODE_ENCRYPTION_KEY` is in the production startup
  gate (a5e66736) — the app refuses to boot without it instead of 500-ing
  lazily when a secret is first read.
- **Deploy story:** `deploy-docker.sh` self-heals BuildKit history corruption,
  builds languages sequentially by default, excludes `.env*` from rsync, and
  auto-injects `COMPILER_RUNNER_URL` for app-only targets with a drift warning.
  algo stays app-only per policy.

## Carried / standing
- CI coverage for the restore-test (`RESTORE_DATABASE_URL` in CI's postgres
  service) — follow-up from abfa90f5, not yet wired. Standing ops item.
- DEFER-ENV-GATES: login-gated E2E + browser a11y need a provisioned staging
  server/browser — unchanged precondition.

## Net
Admin-facing correctness is the listing determinism (AD7-1) and the
token-staleness reconciliation (AD7-2, folded into SEC7-1). Monitoring,
backup-verify, secret-gating, and deploy are in good shape after recent ops
fixes.
