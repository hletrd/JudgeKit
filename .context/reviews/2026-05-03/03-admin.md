# Admin / DevOps Review — JudgeKit Production — 2026-05-03

Reviewed by: agent-based code + live probe synthesis.
Evidence sources: live probe (`probe-evidence.md`), full codebase read, deploy script (`deploy-docker.sh`), `docker-compose.production.yml`, runbooks, and docs.

---

## Verdict — runnable in production? at what cost in operator-time?

**Runnable, but fragile.** The system is actively serving 6,394 submissions with one worker, proper auth on all admin routes, a pre-deploy backup, and a reasonable secrets baseline. It is not embarrassing to put in front of a recruiting panel today.

The operator-time cost is **high relative to the risk profile**. There is no active Prometheus scrape (the metrics endpoint is broken in production), no automated daily backup verified to be running, no MFA on the admin account, no alerting pipeline, and one judge worker whose restart means zero judging capacity until it reconnects. A 150-student timed exam is survivable but there is no margin: one worker outage during the exam window is an incident with no auto-failover.

Estimated steady-state operator-time: 2–4 hours/week for a single-platform deployment at current scale. That rises sharply during an exam window or if a security issue materialises.

---

## Top 5 Operator Strengths

1. **Pre-deploy database backup is automatic and mandatory.** `deploy-docker.sh` runs a `pg_dump` custom-format backup to `~/backups/` before touching any container and aborts if the backup fails (unless `SKIP_PREDEPLOY_BACKUP=1` is set). Retention defaults to 30 days. This is the most operationally important safety net in the codebase.

2. **PG volume orphan-scenario detection.** `scripts/pg-volume-safety-check.sh` runs before every deploy and detects the "real cluster in anonymous volume" failure mode that caused a data wipe in April 2026. The recovery runbook is documented and the automated migration path is implemented.

3. **Audit logging is comprehensive and fire-and-forget safe.** Every destructive admin action (backup, restore, docker build, worker deletion, settings change, role change, plugin toggle, API key creation) emits a buffered audit event. The buffer is flushed on graceful shutdown. Failures are logged and re-buffered up to a threshold, then escalated to ERROR level. See `src/lib/audit/events.ts`.

4. **Docker image path injection is properly defended.** The `buildDockerImageLocal` function in `src/lib/docker/client.ts:159-163` anchors the prefix check (`startsWith("docker/Dockerfile.")`) and rejects path traversal in the suffix. Commit 2312d29b fixed an earlier unanchored check. The route handler (`src/app/api/v1/admin/docker/images/build/route.ts`) adds a second layer: image name must match `judge-*` and must be local-only. This is the right defence-in-depth posture.

5. **Backup/restore requires password re-confirmation.** Both `POST /api/v1/admin/backup` and `POST /api/v1/admin/restore` verify the requester's password against the stored hash before proceeding. This limits blast radius if an admin session token is stolen but the attacker does not know the password.

---

## Top 10 Operational Risks

### RISK-1 — `/api/metrics` returns 503 + env-var name leak in production (SEVERITY: HIGH)
**What:** `CRON_SECRET` is not set in production `.env.production`. The metrics route (`src/app/api/metrics/route.ts:33`) returns `{"error":"CRON_SECRET not configured"}` with HTTP 503 to any unauthenticated caller. This leaks the internal env-var name and confirms the monitoring endpoint is misconfigured.
**Why it matters:** Prometheus cannot scrape this endpoint. No automated alerting is possible via the metrics path. The 503 is also a doc/code discrepancy: `docs/monitoring.md` describes this as the Prometheus scrape target.
**Fix:** Add `CRON_SECRET=<openssl rand -hex 32>` to `.env.production` on algo.xylolabs.com. This is a one-line change; the code handles it correctly once the var is set.
**ETA:** 30 minutes.

### RISK-2 — Single judge worker = zero judging capacity on restart (SEVERITY: HIGH)
**What:** Production has exactly 1 worker with 4 parallel slots (`probe-evidence.md`). Worker registration is self-service: a restarted worker re-registers and picks up work. But during the gap between container stop and re-registration, all new submissions queue. During an exam window this is a hard outage.
**Why it matters:** There is no secondary worker, no drain-before-stop mechanism, no alerting when `judgeWorkers.online == 0` while `submissions.pending > 0`.
**Fix (short-term):** Wire the `/api/health` degraded state (`status = degraded` when `pending > 0 && online === 0`) to an alert. Add CRON_SECRET and set up a Prometheus → Alertmanager or equivalent. Document the exam-day "freeze submissions before worker restart" procedure.
**Fix (medium-term):** Deploy a second worker on a different physical host before any high-stakes exam.
**ETA:** Alert wiring: 1 hour. Second worker: 1 day.

### RISK-3 — No automated daily backup confirmed running (SEVERITY: HIGH)
**What:** `deploy-docker.sh` takes a pre-deploy backup. `scripts/backup-db.sh` exists and supports container-exec mode. `scripts/online-judge-backup.service` and `.timer` exist. But there is no evidence that a daily cron or systemd timer is actually installed and running on algo.xylolabs.com. The `probe-evidence.md` does not confirm it. `docs/deployment.md` shows the example cron but marks it as "Example daily cron."
**Why it matters:** The only guaranteed backup is the pre-deploy one. Between two deploys (potentially weeks), a storage failure or accidental `docker compose down -v` has no recent point-in-time recovery. There is also no WAL archiving (no `archive_command` in the compose PG config), so point-in-time recovery is not possible.
**Fix:** SSH to algo and run `crontab -l` and `systemctl status online-judge-backup.timer`. If absent, install the timer from `scripts/install-online-judge-backup-timer.sh` or add the example cron from `docs/deployment.md`.
**ETA:** 1 hour to verify and fix.

### RISK-4 — No MFA on admin account; admin username publicly visible in rankings (SEVERITY: HIGH)
**What:** `docs/admin-security-operations.md` acknowledges "JudgeKit does not currently ship native MFA." The live probe (`probe-evidence.md` B3) shows the `admin` user with "Super Admin" visible in the public rankings table to unauthenticated visitors.
**Why it matters:** An attacker who finds the admin username (now public) can target it with credential stuffing. There is no second factor to stop them. The admin account has `system.settings`, `system.backup`, `system.audit_logs`, and database restore capability — full platform takeover.
**Fix (immediate):** Exclude staff roles (`super_admin`, `admin`, `instructor`) from the public rankings query. This is a SQL filter change, not an architectural change.
**Fix (structural):** Put `/dashboard/admin/*` behind a VPN or IP allowlist at nginx level. This is documented as the recommended interim posture in `docs/admin-security-operations.md`.
**ETA:** Rankings fix: 2 hours. nginx allowlist: 30 minutes once the IP range is known.

### RISK-5 — Restore operation overwrites the live database with no pre-restore snapshot (SEVERITY: HIGH)
**What:** `importDatabase` in `src/lib/db/import.ts:124-211` wraps the entire import in a transaction that DELETEs all rows from all tables in reverse FK order before inserting the backup data. If the restore fails mid-import (FK violation, schema drift, network timeout), the transaction rolls back. But there is no automatic pre-restore `pg_dump` taken before the import starts.
**Why it matters:** A partial failure rolls back cleanly (the transaction), but a successful import from a corrupt or wrong-version backup permanently replaces the production database. The admin UI does not warn the operator to take a manual backup first. The `system.backup` capability grants both backup download AND restore — the same role can do both.
**Fix:** Add a server-side `pg_dump` call (or trigger a pre-restore backup via the deploy script path) before `importDatabase` is called. At minimum, add a prominent UI warning and require a second confirmation that the admin has downloaded a fresh backup within the last N minutes.
**ETA:** UI warning: 2 hours. Server-side pre-restore backup: 1 day.

### RISK-6 — `NODE_ENCRYPTION_KEY` vs `PLUGIN_CONFIG_ENCRYPTION_KEY` naming confusion; plaintext fallback enabled for migration compatibility (SEVERITY: MEDIUM)
**What:** The encryption module (`src/lib/security/encryption.ts`) reads `NODE_ENCRYPTION_KEY`. The deploy script generates and writes `PLUGIN_CONFIG_ENCRYPTION_KEY` to `.env.production`. These are two different env vars. `PLUGIN_CONFIG_ENCRYPTION_KEY` is used by the plugin secrets path; `NODE_ENCRYPTION_KEY` is used by the settings encryption path (hCaptcha secret). If `NODE_ENCRYPTION_KEY` is missing, `encrypt()` throws at runtime the first time hCaptcha settings are saved. The plaintext fallback (`allowPlaintextFallback`) is also still active for migration compatibility (`src/lib/security/encryption.ts:17-20`).
**Fix:** Verify `NODE_ENCRYPTION_KEY` is set in production (distinct from `PLUGIN_CONFIG_ENCRYPTION_KEY`). Check whether both are backfilled by `ensure_env_secret` in `deploy-docker.sh` — currently only `PLUGIN_CONFIG_ENCRYPTION_KEY` is explicitly backfilled (line 432). After all encrypted columns are confirmed to contain `enc:`-prefixed values, remove the plaintext fallback.
**ETA:** Verification: 30 minutes. Fallback removal: 1 sprint cycle.

### RISK-7 — Rate-limiter and code-similarity sidecars have no authentication tokens set in docker-compose (SEVERITY: MEDIUM)
**What:** `docker-compose.production.yml` sets `RATE_LIMITER_AUTH_TOKEN=${RATE_LIMITER_AUTH_TOKEN:-}` and `CODE_SIMILARITY_AUTH_TOKEN=${CODE_SIMILARITY_AUTH_TOKEN:-}` — both default to empty string. An empty token means those sidecar services have no auth at the container network level.
**Why it matters:** Both sidecars are exposed only on the internal Docker network (`judgekit_default`), not on the host. The risk is limited to container-to-container trust. But if any other container on the same bridge (or the app container itself under a compromised session) can reach these ports, there is no secondary auth layer.
**Fix:** Generate and set `RATE_LIMITER_AUTH_TOKEN` and `CODE_SIMILARITY_AUTH_TOKEN` in `.env.production`. Add them to the `ensure_env_secret` backfill list in `deploy-docker.sh`.
**ETA:** 1 hour.

### RISK-8 — Drizzle push strategy masks schema drift; destructive changes silently not applied (SEVERITY: MEDIUM)
**What:** `deploy-docker.sh` uses `drizzle-kit push` (live diff) rather than `drizzle-kit migrate` (journal replay). The push output is captured and scanned for data-loss prompt markers, but drizzle-kit's exact prompt wording can change between versions. If the prompt text changes and the grep pattern doesn't match, a destructive change is silently skipped but the deploy reports success.
**Why it matters:** Schema drift accumulates invisibly. The Step 5b `secret_token` backfill workaround exists precisely because push does not replay journal SQL. Every future destructive migration needs the same hand-crafted inline SQL.
**Fix (medium-term):** Switch to `drizzle-kit migrate` for journal-driven deploys. Keep the prompt-scan grep as a belt-and-suspenders check. This requires keeping `drizzle/pg/meta/` in sync, which adds PR discipline.
**ETA:** 1–2 days to convert and test.

### RISK-9 — Audit log retention is 90 days by default; no immutability guarantee (SEVERITY: MEDIUM)
**What:** `DATA_RETENTION_DAYS.auditEvents = 90` (`src/lib/data-retention.ts:3`). The batched-delete job in `src/lib/data-retention-maintenance.ts` prunes audit events older than 90 days. A `super_admin` with `system.backup` can also restore the database, which truncates and replaces all audit events. There is no write-once / append-only guarantee, no external SIEM sink, and no offsite copy.
**Why it matters:** For a recruiting platform processing hiring decisions, audit log integrity is a compliance expectation. An insider can cover tracks by restoring an older backup. The 90-day default also means any incident that isn't discovered within 3 months has no audit trail.
**Fix:** Extend the default retention (365 days is reasonable for a hiring platform). Add an offsite audit log export (e.g., ship to S3 or a SIEM daily). Consider making the restore path append-only for audit events rather than truncate-replace.
**ETA:** Retention change: 1 hour. SIEM/offsite: 1–2 days.

### RISK-10 — No Sentry / error reporting; structured logs exist but no aggregation pipeline (SEVERITY: LOW-MEDIUM)
**What:** The codebase uses `pino` via `src/lib/logger.ts`. No Sentry DSN, no OpenTelemetry exporter, no log shipping config is present. Errors are written to stdout/stderr and captured by Docker logging. To investigate a production error the operator must SSH and run `docker compose logs`.
**Why it matters:** Silent errors (especially 500s on the playground endpoint observed in probe-evidence.md B2) are invisible until someone notices. The audit buffer failure counter is tracked in-process but only visible via `/api/health` or `/api/metrics` — neither of which has a scrape pipeline in production.
**Fix:** Set `SENTRY_DSN` and add `@sentry/nextjs` (or equivalent). Alternatively, configure Docker log driver to ship to a log aggregator. Neither requires code changes if Sentry is wired via `next.config.ts`.
**ETA:** Sentry integration: 4 hours. Log shipping: depends on infrastructure.

---

## Surface-by-Surface Walkthrough

### `/dashboard/admin/settings`
Route: `src/app/api/v1/admin/settings/route.ts`

GET and PUT both require `system.settings` capability (super_admin + admin only). The PUT handler uses an explicit allowlist for numeric config keys (`allowedConfigKeys`, line 55-66) to prevent arbitrary field injection — correct. The hCaptcha secret is encrypted with `encrypt()` before storage and redacted in API responses. `publicSignupEnabled` toggle is guarded by the same capability; the probe confirms signup returns 404 (disabled in production). `allowedHosts` is serialized as JSON string.

**Gap:** No "dangerous toggle" confirmation for `publicSignupEnabled = true` or `platformMode` changes. These can silently open the platform to self-registration. A UI-level confirmation dialog is recommended but not security-critical (the capability gate is sufficient).

### `/dashboard/admin/workers`
Routes: `src/app/api/v1/admin/workers/route.ts`, `[id]/route.ts`

GET lists all workers (ordered by registration date). DELETE force-removes a worker in a transaction that also resets its in-flight submissions back to `pending` before deleting the worker row. PATCH allows alias editing. All require `system.settings`.

**Gap:** No heartbeat-age alerting at the API level. The health endpoint reports stale workers, but there is no automated alert when a worker goes stale during an exam window (see RISK-2).

### `/dashboard/admin/languages`
Routes: `src/app/api/v1/admin/languages/route.ts`, `docker/images/build/route.ts`

Language POST validates `language` key against `/^[a-z0-9_]+$/` and caps `dockerImage` at 200 chars. The docker build route validates image name via `isAllowedJudgeDockerImage` + `isLocalJudgeDockerImage`, and validates the dockerfile path with anchored prefix + traversal check. The `buildDockerImageLocal` function spawns `docker build` and does NOT expose build stderr to the API response (line 219-220). Build runs on the app server if `JUDGE_WORKER_URL` is not set, or proxies to the worker if it is set.

**Important architectural note:** Per CLAUDE.md, docker images must NOT be built on algo.xylolabs.com (the app server). The deploy script defaults `BUILD_WORKER_IMAGE=false` for app-server deploys. But the `docker build` API route (`POST /api/v1/admin/docker/images/build`) can be invoked by any admin from the UI — it will run `docker build` on whichever host the Next.js process runs on. On algo.xylolabs.com that means the app server. This appears to be a use-case conflict: the CLAUDE.md rule applies to the deploy-time image builds, not the admin UI path. Clarify and document.

### `/dashboard/admin/backup` and `/dashboard/admin/restore`
Routes: `src/app/api/v1/admin/backup/route.ts`, `restore/route.ts`

Both require `system.backup` + password re-confirmation + CSRF validation for cookie-based sessions. Backup streams a REPEATABLE READ snapshot; includes file uploads in ZIP format when `includeFiles=true`. Restore validates structure, rejects sanitized exports, wraps entire import in a transaction. Restore rolls back on any failure.

**Gaps:**
- No pre-restore automatic backup (see RISK-5).
- `ALWAYS_REDACT` map in `export.ts:256-262` omits `judgeWorkers.secretTokenHash` — this means full-fidelity backups include hashed worker secrets, which is acceptable (hashes are not reversible), but operators should know the backup is not completely credential-free.
- The ZIP backup `includes` the `uploads/` directory. Ensure the uploads volume is mounted and accessible from the Next.js container at restore time.

### `/dashboard/admin/audit-logs`
Route: `src/app/api/v1/admin/audit-logs/route.ts`

Requires `system.audit_logs`. Supports filtering by resource type (allowlisted), actor, action prefix, date range, free-text search (LIKE with proper escaping). CSV export capped at 10,000 rows. The `batchedDelete` function in `data-retention-maintenance.ts` uses `ctid`-based pagination — correct and documented as PostgreSQL-specific.

**Gaps:** No immutability, 90-day default retention, no offsite export (see RISK-9). The audit log viewer omits `docker_image` from `VALID_RESOURCE_TYPES` — docker build/pull/remove events are recorded with `resourceType: "docker_image"` but cannot be filtered by that type in the UI.

### `/dashboard/admin/login-logs`
Route: `src/app/api/v1/admin/login-logs/route.ts`

Requires `system.login_logs`. Records `outcome` (success, invalid_credentials, rate_limited, policy_denied), `attemptedIdentifier`, `ipAddress`, `userAgent`. CSV export. 180-day default retention.

**Gap:** The login log viewer shows `attemptedIdentifier` — if an admin types their password into the username field, it will be recorded in plaintext in the login log. This is a standard risk with failed-login logging; acceptable but worth documenting for operators.

### `/dashboard/admin/api-keys`
Route: `src/app/api/v1/admin/api-keys/route.ts`, `[id]/route.ts`

API keys are generated, hashed for lookup, and encrypted with `PLUGIN_CONFIG_ENCRYPTION_KEY` for recovery. Key prefix (first 8 chars) is stored for display. Privilege escalation check: cannot create a key with a higher role than the creator's own role. Expiry is computed server-side using DB time.

**Gap:** The `encryptedKey` column (recovery path) means the raw API key is recoverable by anyone with database access + `PLUGIN_CONFIG_ENCRYPTION_KEY`. This is intentional for key recovery but elevates the sensitivity of the encryption key. If `PLUGIN_CONFIG_ENCRYPTION_KEY` rotates, all encrypted keys become unrecoverable without a migration.

### `/dashboard/admin/roles`
Route: `src/app/api/v1/admin/roles/route.ts`, `[id]/route.ts`

Role creation checks level (`level <= creator's level`). Built-in role names are reserved. Uses an atomic transaction for uniqueness check + insert (TOCTOU-safe). `invalidateRoleCache()` is called after changes.

**Gap:** Role deletion is not gated on "role has no users" check in code visible here — verify `[id]/route.ts` DELETE handles this. A role deletion with active users could leave those users with an invalid role that resolves to no capabilities.

### `/dashboard/admin/plugins`
Routes: `src/app/api/v1/admin/plugins/route.ts`, `[id]/route.ts`

Requires `system.plugins`. Plugin config is validated against the plugin's own `configSchema`. Secrets in config are encrypted via `preparePluginConfigForStorage` before DB write, and redacted in API responses and audit log details. The AI review plugin API key would live encrypted in the DB — correct posture.

**Gap:** `docker-compose.production.yml` exposes no `PLUGIN_CONFIG_ENCRYPTION_KEY` as a named volume or vault-backed secret. It is just an env var from `.env.production`. Rotation requires re-encrypting all plugin configs and API key encrypted values in the DB — there is no rotation helper.

---

## Observability Assessment

### `/api/health` (public + admin-authed)
Works correctly. Unauthenticated callers get `{"status":"ok"}`. Authenticated admins get full snapshot: DB check, audit event health, worker counts, queue depth, uptime, response latency. Source: `src/lib/ops/admin-health.ts`. The health check is rate-limited via `consumeApiRateLimit` (the `v1` version at `src/app/api/v1/health/route.ts`) — but the public path at `/api/health` is NOT rate-limited. Under a load balancer polling at 1 Hz this is fine; at 100 Hz it could add DB load.

### `/api/v1/health` — returns 401
This route (`src/app/api/v1/health/route.ts`) requires DB connectivity check AND session auth (rate limit key comes from headers). It returns 401 for unauthenticated callers. This is a **docs/code mismatch**: `docs/deployment.md` references `curl http://127.0.0.1:3000/api/health` (the unversioned path), which works unauthenticated. The `/api/v1/health` path is a secondary endpoint for load-balancer / uptime-check use that is actually stricter than intended. This is a minor confusing inconsistency, not a security issue.

### `/api/metrics` — 503 in production (BUG)
`CRON_SECRET` is not configured in production. The fix is trivial (see RISK-1). Once fixed, this endpoint emits valid Prometheus plaintext with 12 gauges: health, DB, audit events, worker counts, queue depth, uptime, response latency, failed audit writes. No trace IDs, no histograms, no per-endpoint counters. Useful but minimal.

**What is not observable at all:**
- No per-endpoint latency or error rate metrics.
- No Sentry or OpenTelemetry. Errors only appear in Docker stdout.
- No external uptime monitoring confirmed (no `/.well-known/security.txt`, no Uptime Robot / PagerDuty probe).
- Audit buffer failures visible in-process only; no alert fires if consecutive failures reach the ERROR threshold.
- The `scripts/monitor-health.sh` script exists and could run as a cron check, but there is no evidence it is scheduled on algo.xylolabs.com.

---

## Backup/Restore Assessment

### What is backed up
**Pre-deploy dumps** (`~/backups/judgekit-predeploy-*.dump`): PostgreSQL custom-format via `pg_dump --format=custom --compress=9`. Contains all tables including sessions, audit events, API key hashes, login events. These are on-disk on the app server only — not offsite.

**Admin UI backup** (`POST /api/v1/admin/backup`): Streams a REPEATABLE READ JSON export of all tables (`TABLE_ORDER` in `src/lib/db/export.ts:156-202`) using chunked reads. Optional ZIP variant includes the `uploads/` file store. Excludes encrypted API key values (`ALWAYS_REDACT`), hCaptcha secrets, session tokens, and OAuth tokens. Full-fidelity means password hashes ARE included — treat as highly sensitive.

### What is NOT backed up
- Rate-limit state (`rateLimits` table is NOT in `TABLE_ORDER`). This is intentional (transient state) but means after a restore, all rate-limit windows reset.
- Code-similarity index (lives in the `code-similarity` container's in-memory Rust state — lost on restart regardless).
- Docker images themselves (language images must be rebuilt separately after a host wipe).
- The `judgekit-app-data` volume contents beyond what the admin UI backup covers.
- WAL / point-in-time recovery: there is no `archive_command` in the postgres config. Only snapshot-level recovery is possible.

### Restore safety
The import transaction is atomic and rolls back on failure. Schema drift detection catches column mismatches before inserting. Sanitized exports are rejected. Password re-confirmation is required. The `isSanitizedExport` guard prevents sharing exports from being accidentally restored.

**Critical gap:** No automated pre-restore backup. An admin can restore from a bad file and permanently replace the production database. The only recovery path is a pre-deploy dump (which may be hours old) or a daily backup (if scheduled).

### Encryption
Backups from the admin UI are **not encrypted at rest**. Operators must either use `AGE_RECIPIENT` with `backup-db.sh` (the script has this path at lines 90-95) or handle encryption at the storage layer. Full-fidelity JSON backups contain password hashes; treat as Tier-1 sensitive artifacts.

---

## Worker Fleet Assessment

### Current state
1 worker (`worker-0.algo.xylolabs.com`), 4 parallel slots. The worker runs on a dedicated host separate from the app server (per CLAUDE.md), connected via `COMPILER_RUNNER_URL`. The app server does NOT run a local judge worker in production (per the CLAUDE.md deployment rule and `INCLUDE_WORKER=false` on the app deploy).

### Registration / heartbeat / deregistration
Workers self-register via `POST /api/v1/judge/register` with `JUDGE_AUTH_TOKEN`. Heartbeats update `lastHeartbeatAt`. The `admin-health.ts` query classifies workers as `online`, `stale`, or `offline` based on status column. Force-remove via admin UI resets in-flight submissions back to `pending` and deletes the worker row — safe, transactional (`src/app/api/v1/admin/workers/[id]/route.ts:65-99`).

### SPOF analysis
With 1 worker:
- Worker container restart: new submissions queue; existing in-flight submissions may be re-claimed after `staleClaimTimeoutMs`. Default timeout is configurable via system settings.
- Worker host reboot: same as above but longer gap (boot time + container start + re-registration).
- Worker host failure (disk, kernel panic): queue backs up until manual intervention or a second worker is provisioned.
- No circuit-breaker, no automatic secondary provisioning, no admin alert on `online == 0`.

### Image preset sync
Language configs live in the DB (`languageConfigs` table). The worker does not auto-pull images; images must be present on the worker host. An admin can trigger builds/pulls from the UI, but they route to whichever host `JUDGE_WORKER_URL` points to. If worker-0 has a language image that algo does not (and vice versa), the admin Docker images page will show different results depending on the routing.

---

## Deploy Automation Assessment

### Overall quality
`deploy-docker.sh` is mature (~1100 lines) and well-commented. Key safety features: SSH ControlMaster for connection reuse, exponential-backoff SSH retry, mandatory pre-deploy pg_dump, PG volume orphan detection, schema migration with destructive-change detection, nginx config generation and reload, health check polling after deploy. The `DEPLOY_INSTANCE` prefix enables parallel multi-target deploys to be disambiguated in logs.

### Is the app server safe from accidentally building worker images?
**Mostly yes.** `BUILD_WORKER_IMAGE` defaults to `auto` which resolves to the value of `INCLUDE_WORKER`. For the app server, `INCLUDE_WORKER=false` means `BUILD_WORKER_IMAGE=false`. The script correctly skips the `Dockerfile.judge-worker` build (lines 530-534). However:
- If an operator runs the script with `--build-worker` explicitly, the worker image will be built on algo. This is user error but not prevented by the script.
- The admin UI docker build route (`POST /api/v1/admin/docker/images/build`) can still trigger `docker build` on the app server if `JUDGE_WORKER_URL` is not set or does not point to worker-0. Verify that `COMPILER_RUNNER_URL` in algo's `.env.production` points to `worker-0`, so admin docker builds route to the worker.

### What could go wrong
- **Schema drift silently skipped:** drizzle-kit push may skip a destructive change without the deploy failing (RISK-8).
- **`ensure_env_literal` writes unquoted values:** the `printf '\n%s=%s\n' '${key}' '${value}'` call in `ensure_env_literal` (lines 427-431) does not quote values that contain spaces or special characters. For the current literal values (`true`, a URL) this is safe, but it is a latent risk for future literals.
- **Step 5b sunset criterion:** The `secret_token` backfill block (lines 725-750) has a documented sunset of 2026-10-26. Do not forget to remove it after verifying the column is absent on all targets.
- **`sleep 3` before health verification (line 1063):** a fixed 3-second sleep before the HTTP verification check is fragile on slow hosts. The 60-second health poll loop that precedes it already handles this, so the extra sleep is redundant.
- **Nginx config written to `/tmp` locally then SCP'd:** the nginx heredoc expands `${DOMAIN}` and `${APP_PORT}` from the local shell. If either variable contains a shell-special character (unlikely in practice), the heredoc expansion could be corrupted. Low risk for current values.

---

## Secrets and Rotation

### What exists
- `AUTH_SECRET`: NextAuth session encryption key. Rotation invalidates all active sessions. No helper to do a coordinated rotation.
- `JUDGE_AUTH_TOKEN` / `RUNNER_AUTH_TOKEN`: shared secret for worker auth. Must be rotated on both app and worker simultaneously.
- `POSTGRES_PASSWORD`: DB password. Rotation requires updating `.env.production`, restarting containers, and re-running the compose file. Not scripted.
- `PLUGIN_CONFIG_ENCRYPTION_KEY`: AES-GCM key for plugin secrets and API key encryption. Rotation requires re-encrypting all encrypted DB values — no migration helper exists.
- `NODE_ENCRYPTION_KEY`: AES-GCM key for system settings (hCaptcha secret). Same rotation problem.
- `CRON_SECRET`: missing in production (see RISK-1).

### Rotation story
The operator runbook documents the conceptual rotation checklist (`docs/operator-incident-runbook.md`) but there are no rotation scripts. Rotating `PLUGIN_CONFIG_ENCRYPTION_KEY` requires a one-time re-encryption migration across the `plugins` and `apiKeys` tables — currently undocumented and unimplemented as an automated step.

### `.env.production` security
`deploy-docker.sh` sets `chmod 0600` on `.env.production` both on creation and on subsequent deploys (lines 374, 380). This is correct. The file is excluded from rsync (`--exclude='.env*'`). The remote copy path also enforces 0600 via the `ensure_env_secret` helper (line 411). The file must never be committed to git — confirm `.gitignore` covers `.env.production`.

---

## Scale Ceiling for Stated Workloads

### Recruiting platform (async, low-concurrent)
**Current scale is adequate.** 797 problems, 6,394 lifetime submissions, 1 worker at 4 slots. Async recruiting assessments with staggered deadlines are low-concurrency by nature. The queue limit (`SUBMISSION_GLOBAL_QUEUE_LIMIT=200`) provides backpressure. Risk: if a burst of candidates submit simultaneously, the 200-slot queue fills and further submissions are rejected with 429. Increase `SUBMISSION_GLOBAL_QUEUE_LIMIT` if needed.

### 150-student timed exam (synchronous burst)
**Marginal.** A 150-student class starting simultaneously will produce a submission burst. With 4 worker slots and typical Python/C++ judge times of 2-5 seconds, throughput is ~50-120 submissions/minute. If students submit every 5 minutes on average, steady-state throughput is fine. But if the worker is unavailable (restart, container crash), the exam stops. No margin exists. Required pre-exam steps: verify worker is healthy, freeze the worker restart window during the exam, consider a 2-slot buffer on `SUBMISSION_MAX_PENDING` per user, have a manual recovery runbook printed and accessible.

### Public contest (100-500 users)
**Not adequately sized.** A public contest with 500 concurrent submitters will saturate the single Next.js process (no horizontal scaling, `APP_INSTANCE_COUNT=1`), the single PG instance (no read replicas), and the single judge worker. The app explicitly documents `APP_INSTANCE_COUNT=1` mode with `REALTIME_SINGLE_INSTANCE_ACK=1` as the supported path; adding replicas requires validating the `REALTIME_COORDINATION_BACKEND=postgresql` path. The PG configuration (`shared_buffers=512MB`, `effective_cache_size=2GB`) is tuned for a 6+ GB host; for the current single-box deployment this is reasonable but leaves little headroom.

**Recommended capacity before a public contest:** second worker, PG connection pooler (PgBouncer), verified daily backup, CRON_SECRET set, and an external uptime alert wired to `/api/health`.
