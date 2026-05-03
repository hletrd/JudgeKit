# Operator incident runbook

_Last updated: 2026-04-17_

This runbook covers the non-worker operational incidents that still require explicit operator handling: backup/restore failures, credential leaks, and admin-surface abuse.

## When to use this runbook
- a backup or restore attempt fails or produces suspicious output
- an admin/API/judge credential may have leaked
- an operator needs a fast containment checklist before resuming service

## Immediate containment
1. Stop non-essential admin mutations and exports until scope is understood.
2. Preserve recent audit logs, login logs, deployment logs, and any backup artifacts involved.
3. If a secret may be exposed, rotate it before reopening the affected surface.
4. Prefer a clean replacement or restore path over ad-hoc live patching when data integrity is uncertain.

## Scenario: backup or restore incident
Use this when a backup download, restore import, or post-restore verification looks wrong.

### First response
- confirm whether the artifact was a **portable sanitized export** or a **full-fidelity backup**
- preserve the exact backup file and any integrity-check output
- stop repeat restore attempts until the failing artifact and target state are identified

### Checks
- if the artifact is ZIP-based, verify the embedded checksum manifest matches
- verify whether the restore failed before import, during import, or after service restart
- compare the target deployment's branch/commit, schema state, and environment to the backup's metadata
- if the target database was modified after a failed restore, take a fresh pre-recovery backup before retrying

### Recovery goal
- restore from the last verified full-fidelity backup
- re-run application health checks and spot-check critical user/admin flows
- record the backup filename, restore target, operator, and outcome in the incident record

## Scenario: credential leak
Use this when any of the following may have been exposed:
- `AUTH_SECRET`
- `JUDGE_AUTH_TOKEN` (bootstrap)
- `RUNNER_AUTH_TOKEN`
- `CRON_SECRET`
- `CODE_SIMILARITY_AUTH_TOKEN`
- `RATE_LIMITER_AUTH_TOKEN`
- `PLUGIN_CONFIG_ENCRYPTION_KEY`
- worker `workerSecret`
- database credentials
- exported backup artifacts containing live secrets

### Immediate containment
- rotate the leaked secret at the source of truth
- invalidate dependent sessions/tokens where applicable
- disable or narrow the exposed surface until rotation is confirmed

### Minimum rotation checklist
- `AUTH_SECRET`: rotate only with a coordinated session-invalidation window
- `JUDGE_AUTH_TOKEN` / `RUNNER_AUTH_TOKEN`: rotate app + worker together. Note that workers no longer fall back to `JUDGE_AUTH_TOKEN` for `claim`/`heartbeat`/`deregister`, so rotation only affects the registration path; existing workers keep authenticating via their per-worker `secretTokenHash` until they are explicitly re-registered.
- `CRON_SECRET`: rotate, then verify `/api/metrics` is reachable from the Prometheus scrape job and `/api/internal/cleanup` is reachable from whatever cron / systemd timer drives it. The production startup gate (`src/lib/security/production-config.ts`) will refuse to start the app if the new value is empty in `.env.production`.
- `CODE_SIMILARITY_AUTH_TOKEN` / `RATE_LIMITER_AUTH_TOKEN`: rotate, restart the matching sidecar (`judgekit-code-similarity`, `judgekit-rate-limiter`) plus the app container together. Compose enforces `${VAR:?}` so a missing value blocks `up -d`.
- `PLUGIN_CONFIG_ENCRYPTION_KEY`: rotate only via the documented re-encryption flow (rotating without re-encrypting plugin secrets locks every plugin out).
- worker `workerSecret`: re-register or replace the affected worker
- database credentials: rotate, verify migrations/backup jobs/deploy jobs still authenticate

### Follow-up
- review recent audit/login logs for suspicious use after the suspected exposure time
- identify whether logs, screenshots, exported files, or CI output carried the secret
- document which downstream credentials or sessions required forced invalidation

## Scenario: worker failure
For worker compromise, abnormal judging, or suspicious image/runtime behavior, switch to:
- `docs/judge-worker-incident-runbook.md`

Use this operator runbook alongside the worker-specific runbook when the incident also affects backups, admin flows, or shared credentials.

## Exit criteria
- containment steps completed
- rotated credentials verified where needed
- health checks pass
- affected operators know whether service can resume
- incident notes include timeline, impacted surfaces, and follow-up actions
