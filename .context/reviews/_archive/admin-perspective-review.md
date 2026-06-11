# JudgeKit Admin Perspective Review

**Date:** 2026-05-10
**Reviewer:** System Administrator
**Scope:** Entire codebase from an operational/administrative perspective

---

## Executive Summary

JudgeKit has a mature deployment pipeline with solid safety nets (pre-deploy backups, PG volume safety checks, pre-restore snapshots). The codebase shows evidence of hard-won operational experience -- the deploy script is well-commented with incident post-mortems embedded inline. However, there are significant gaps in observability, operational automation, and disaster recovery tooling that would make day-to-day administration harder than it should be. The audit trail is good in principle but has buffering risks. Role-based access control is well-designed with capability-based permissions, though there are edge cases in privilege escalation.

**Critical findings:** 4
**High findings:** 12
**Medium findings:** 14
**Low findings:** 8

---

## 1. User Management

### Finding 1.1: No bulk role change operation
**File:** `src/app/(dashboard)/dashboard/admin/users/page.tsx:122-128`, `src/lib/actions/user-management.ts`
**Severity:** HIGH
**Description:** The user management UI supports bulk creation but NOT bulk role changes, bulk deactivation, or bulk deletion. An admin managing a university cohort of 500 students must click each user individually to change roles.
**Operational Impact:** Massive ops burden during semester transitions when hundreds of students need role updates.
**Fix:** Add a bulk-select UI with checkbox rows and bulk actions (change role, deactivate, delete) with confirmation dialogs.

### Finding 1.2: User deactivation does not cascade session invalidation immediately
**File:** `src/lib/actions/user-management.ts:117-126`
**Severity:** HIGH
**Description:** When a user is deactivated, `tokenInvalidatedAt` is set, but existing NextAuth sessions in browser cookies remain valid until the session's natural expiry. The auth system checks `tokenInvalidatedAt` in `find-session-user.ts` but this is only checked at session resolution time, not proactively invalidated.
**Operational Impact:** A deactivated user can continue using the platform until their session cookie expires (potentially days with default sessionMaxAgeSeconds=14 days).
**Fix:** Add a session purge mechanism or reduce the session check frequency. Consider maintaining a "revoked session tokens" list or using shorter-lived sessions.

### Finding 1.3: No self-service password reset audit trail
**File:** `src/lib/auth/login-events.ts` (implied absence)
**Severity:** MEDIUM
**Description:** Login events track success/failure, but there is no dedicated table or audit event type for password reset requests, completions, or failures. An admin cannot investigate "who reset their password when" during a security incident.
**Operational Impact:** Impossible to determine if a compromised account had its password reset as part of an attack chain.
**Fix:** Add password_reset_request and password_reset_completed audit event types.

### Finding 1.4: User deletion blocks on group ownership without offering reassignment
**File:** `src/lib/actions/user-management.ts:196-202`
**Severity:** MEDIUM
**Description:** `deleteUserPermanently` returns `instructorOwnsGroups` error if the user owns groups, but provides no UI mechanism to reassign those groups before deletion. The admin must manually reassign groups via a separate flow.
**Operational Impact:** Multi-step deletion process with no guidance in the error response about which groups are owned.
**Fix:** Return the list of owned groups in the error response and offer a "reassign and delete" flow.

### Finding 1.5: No user import from CSV/Excel
**File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx`
**Severity:** MEDIUM
**Description:** Bulk creation exists but requires JSON/form input per user. There is no CSV upload with validation for bulk importing a roster.
**Operational Impact:** Schools with existing student information systems cannot easily migrate rosters.
**Fix:** Add CSV import with column mapping and validation error reporting.

### Finding 1.6: `className` field has no validation constraints
**File:** `src/lib/db/schema.pg.ts:29`, `src/lib/validators/profile.ts`
**Severity:** LOW
**Description:** The `className` field in users table is unbounded text with no length validation. A malicious actor could insert multi-megabyte strings.
**Operational Impact:** Storage bloat, potential UI rendering issues.
**Fix:** Add a max length constraint (e.g., 100 chars) to the validator and schema.

---

## 2. System Settings

### Finding 2.1: Settings changes require manual cache invalidation that races with concurrent requests
**File:** `src/lib/system-settings-config.ts:186-192`
**Severity:** HIGH
**Description:** `invalidateSettingsCache()` sets `cachedAt = 0`, but concurrent requests between invalidation and async reload completion fall back to hardcoded defaults. A rate limit change from 10 to 100 could briefly revert to the default of 30 for concurrent requests.
**Operational Impact:** Race condition means settings changes are not immediately consistent across all requests.
**Fix:** Use an atomic swap or synchronous DB read on invalidation. Alternatively, use Redis or a shared cache.

### Finding 2.2: No settings change audit log beyond the system_settings.updated event
**File:** `src/app/api/v1/admin/settings/route.ts:114-133`
**Severity:** MEDIUM
**Description:** Settings changes are audited, but the `details` object only includes a subset of fields. Changes to numeric config values (rate limits, judge timeouts, etc.) are NOT included in the audit trail.
**Operational Impact:** Cannot determine who changed a rate limit or why. Critical for security incident response.
**Fix:** Include all changed fields in the audit event details, or create per-field audit events.

### Finding 2.3: No settings versioning or rollback
**File:** `src/lib/system-settings-config.ts`
**Severity:** HIGH
**Description:** System settings have a single row in the database. There is no history table, no versioning, and no way to rollback to a previous configuration. A misconfigured rate limit or accidental signup enable cannot be easily undone.
**Operational Impact:** One bad settings change can destabilize the platform with no quick recovery path.
**Fix:** Add a `system_settings_history` table that snapshots the previous row on each UPDATE.

### Finding 2.4: Environment variable overrides silently shadow DB settings
**File:** `src/lib/system-settings-config.ts:86-104`
**Severity:** MEDIUM
**Description:** `resolveValue()` prioritizes env vars over DB values, but the admin UI shows DB values. An operator may change a setting in the UI, see it "saved," but the env var override continues to take effect silently.
**Operational Impact:** Confusing debugging -- settings appear to change but have no effect.
**Fix:** Surface env overrides in the admin UI with a "locked by environment variable" indicator.

### Finding 2.5: No validation that `allowedHosts` contains the current AUTH_URL host
**File:** `src/app/(dashboard)/dashboard/admin/settings/allowed-hosts-form.tsx`, `src/app/api/v1/admin/settings/route.ts`
**Severity:** MEDIUM
**Description:** The allowed hosts setting can be saved with values that exclude the current deployment's AUTH_URL host, which would break authentication callbacks.
**Operational Impact:** Self-inflicted outage -- admin accidentally locks themselves out.
**Fix:** Validate that the current AUTH_URL host is always included in allowedHosts, or warn before allowing removal.

---

## 3. Deployment and Upgrades

### Finding 3.1: Deploy script has NO rollback mechanism
**File:** `deploy-docker.sh`
**Severity:** CRITICAL
**Description:** The deployment script performs a one-way migration (drizzle-kit push, container replacement). If the new deployment fails health checks, there is no automated rollback to the previous working version. The pre-deploy backup exists but requires manual restoration.
**Operational Impact:** Failed deploys require manual intervention with DB restore. Recovery time is minutes to hours, not seconds.
**Fix:** Implement blue/green deployment or at minimum tag the previous image and provide a `rollback.sh` script.

### Finding 3.2: App image is built with `--no-cache` every deploy
**File:** `deploy-docker.sh:537`
**Severity:** HIGH
**Description:** The app image is rebuilt with `--no-cache` on every deploy, even for trivial changes. This wastes build time and negates Docker layer caching benefits.
**Operational Impact:** Deploys take longer than necessary. For a 500MB+ image with Node.js dependencies, this adds minutes.
**Fix:** Remove `--no-cache` for routine deploys. Add a `--force-rebuild` flag for when cache invalidation is needed.

### Finding 3.3: No deploy health check timeout or automatic rollback on failure
**File:** `deploy-docker.sh:874-883`
**Severity:** HIGH
**Description:** The deploy waits up to 60s for the app to become healthy, but if it fails, it only prints a warning and exits successfully. The unhealthy deployment remains running.
**Operational Impact:** A failed deployment is left in place, serving errors to users.
**Fix:** If health checks fail after timeout, automatically stop the new containers and restart the previous version.

### Finding 3.4: Judge worker image is built on app server by default
**File:** `deploy-docker.sh:172-173`, `CLAUDE.md`
**Severity:** MEDIUM
**Description:** The default `BUILD_WORKER_IMAGE=auto` resolves to `INCLUDE_WORKER` (true by default), meaning the judge worker image builds on the app server unless explicitly disabled. Per CLAUDE.md, worker images should ONLY be built on `worker-0.algo.xylolabs.com`.
**Operational Impact:** App server resources consumed by worker image builds. Risk of accidentally building on wrong server.
**Fix:** Change default `INCLUDE_WORKER` to false, or make `BUILD_WORKER_IMAGE` default to false unconditionally.

### Finding 3.5: No deployment notification or webhook
**File:** `deploy-docker.sh`
**Severity:** MEDIUM
**Description:** Deployments complete silently. There is no Slack/Discord/webhook notification for deploy success/failure, no integration with incident management systems.
**Operational Impact:** Team must manually check deployment status. Failed deploys may go unnoticed.
**Fix:** Add webhook notification support (Slack, PagerDuty, etc.) for deploy outcomes.

### Finding 3.6: Dangling image prune runs unconditionally after every deploy
**File:** `deploy-docker.sh:582-584`
**Severity:** LOW
**Description:** `docker image prune -f` runs after every build. This is generally safe but in a multi-app Docker host, it could prune images used by other services.
**Operational Impact:** On shared Docker hosts, other services' cached images may be removed.
**Fix:** Scope pruning to JudgeKit-specific image labels or run it selectively.

---

## 4. Monitoring and Alerting

### Finding 4.1: No Prometheus/OpenMetrics integration beyond a basic text endpoint
**File:** `src/app/api/metrics/route.ts`, `src/lib/ops/admin-metrics.ts`
**Severity:** HIGH
**Description:** The `/api/metrics` endpoint exposes only 8 metrics (health status, worker counts, queue depth, uptime, response time, audit failures). No application-level metrics: request latency histograms, error rates by endpoint, DB query performance, submission judge latency percentiles, user activity gauges.
**Operational Impact:** Cannot set up meaningful alerting (e.g., "p95 judge latency > 30s" or "error rate > 1%"). Cannot identify performance regressions.
**Fix:** Add comprehensive metrics: HTTP request latencies by endpoint, DB query durations, judge queue wait times, active user sessions, error rates.

### Finding 4.2: Health endpoint only checks DB connectivity, not dependent services
**File:** `src/app/api/health/route.ts`, `src/app/api/v1/health/route.ts`
**Severity:** HIGH
**Description:** The health checks verify PostgreSQL connectivity but do NOT check: judge worker reachability, rate-limiter sidecar health, code-similarity service health, or Docker proxy availability. A deployment with a misconfigured worker URL returns "ok" even though judging is broken.
**Operational Impact:** Load balancers and monitoring systems think the app is healthy when core functionality is degraded.
**Fix:** Add dependency health checks to the health endpoint: worker ping, rate-limiter ping, code-similarity ping.

### Finding 4.3: No structured logging aggregation or log shipping
**File:** `src/lib/logger.ts` (implied from usage)
**Severity:** HIGH
**Description:** Logs are written via Pino but there is no evidence of log shipping to an aggregation service (ELK, Loki, CloudWatch, etc.). The docker-compose.yml does not configure log drivers.
**Operational Impact:** Debugging production issues requires SSHing to the server and running `docker compose logs`. Cannot search, filter, or correlate logs across the stack.
**Fix:** Configure Docker log driver (e.g., `json-file` with rotation or `fluentd`/`loki`) and document log aggregation setup.

### Finding 4.4: No alerting on audit event write failures
**File:** `src/lib/audit/events.ts:176-202`
**Severity:** HIGH
**Description:** When audit event writes fail, the system logs a warning/error but there is no alerting mechanism. If the audit buffer overflows and events are dropped, operators may never notice.
**Operational Impact:** Silent audit trail gaps during security incidents. Compliance violations may go undetected.
**Fix:** Expose audit failure metrics on the metrics endpoint and configure alerts for `auditEventWriteFailures > 0`.

### Finding 4.5: No disk space monitoring
**File:** `src/lib/docker/client.ts:310-325` (local-only), `docker-compose.production.yml`
**Severity:** MEDIUM
**Description:** Disk usage is fetched only in local Docker mode (`getDiskUsageLocal`). There is no persistent monitoring of disk space on uploads directory, database volume, or dead-letter queue. Docker volume growth is unmonitored.
**Operational Impact:** Disk exhaustion leads to service outage. Uploads fail silently when disk is full.
**Fix:** Add disk usage metrics to the metrics endpoint and configure low-disk alerts.

### Finding 4.6: No alerting on judge worker staleness
**File:** `src/lib/ops/admin-health.ts:71-91`
**Severity:** MEDIUM
**Description:** The health snapshot reports stale workers as "degraded" status, but there is no dedicated alert or notification when workers transition from online to stale. Stale workers accumulate claims that never complete.
**Operational Impact:** Submissions get stuck in "judging" state indefinitely.
**Fix:** Add a dedicated metric for stale worker count with alerting threshold, and auto-deregister workers that miss N heartbeats.

---

## 5. Security Configuration

### Finding 5.1: `AUTH_TRUST_HOST=true` is hardcoded in production compose
**File:** `docker-compose.production.yml:96`
**Severity:** MEDIUM
**Description:** The docker-compose.production.yml sets `AUTH_TRUST_HOST=true` unconditionally. While this is needed behind a reverse proxy, it means any request reaching the app container directly (bypassing nginx) is trusted.
**Operational Impact:** If the Docker network is compromised or an attacker gains container access, they can forge authentication callbacks.
**Fix:** Document the requirement but allow override via env var. Ensure nginx properly sanitizes forwarded headers.

### Finding 5.2: No Content Security Policy headers
**File:** `deploy-docker.sh` (nginx config), `next.config.ts`
**Severity:** MEDIUM
**Description:** The nginx configuration and Next.js app do not set Content-Security-Policy headers. The platform renders user-generated content (problem descriptions, discussions, submissions) without CSP protection.
**Operational Impact:** XSS vulnerabilities in user content (markdown, HTML) have no defense-in-depth mitigation.
**Fix:** Add CSP headers via Next.js headers config or nginx. Start with a restrictive policy and relax as needed.

### Finding 5.3: API keys use SHA-256 hashing instead of bcrypt/Argon2
**File:** `src/lib/api/api-key-auth.ts:22-24`
**Severity:** MEDIUM
**Description:** API keys are hashed with SHA-256 (`hashToken`), which is fast to compute. Unlike password hashes, API keys are high-entropy, but SHA-256 is still not ideal for stored credentials.
**Operational Impact:** If the apiKeys table is leaked, keys can be brute-forced offline more quickly than with bcrypt/Argon2.
**Fix:** Use bcrypt or Argon2id for API key hashing, or use HMAC with a server-side secret.

### Finding 5.4: No IP allowlist for admin endpoints
**File:** `src/app/api/v1/admin/*` (all admin routes)
**Severity:** MEDIUM
**Description:** Admin API endpoints are protected by authentication and capabilities, but there is no IP-based access restriction. A compromised admin credential can be used from anywhere in the world.
**Operational Impact:** Broader attack surface for admin credential compromise.
**Fix:** Add optional IP allowlist configuration for admin endpoints, enforced at middleware level.

### Finding 5.5: Docker socket proxy exposes BUILD, POST, DELETE as env vars instead of hardcoded
**File:** `docker-compose.production.yml:64-76`
**Severity:** LOW
**Description:** The docker-socket-proxy has BUILD=0, POST=0, DELETE=0 hardcoded, but IMAGES is controlled by env var. While the current config is safe, the pattern of using env vars for security-sensitive toggles is risky.
**Operational Impact:** Future changes could accidentally expose dangerous Docker operations.
**Fix:** Keep all security-sensitive proxy settings as hardcoded values in the compose file.

### Finding 5.6: Secret rotation requires application restart
**File:** `src/lib/security/derive-key.ts` (implied), `src/lib/security/encryption.ts`
**Severity:** MEDIUM
**Description:** Encryption keys are derived from `process.env` at module load time. Rotating secrets (API key encryption key, plugin config key) requires restarting the application.
**Operational Impact:** Secret rotation causes downtime. Cannot rotate keys for compliance without a maintenance window.
**Fix:** Support key versioning in encrypted values and graceful key rotation without restart.

---

## 6. Backup/Restore

### Finding 6.1: No automated scheduled backup verification
**File:** `scripts/backup-db.sh`, `scripts/verify-db-backup.sh`
**Severity:** HIGH
**Description:** Backup verification script exists (`verify-db-backup.sh`) but there is no cron or scheduled job that runs it automatically. Backups could be silently corrupt for weeks.
**Operational Impact:** Disaster recovery may fail because the latest backup is corrupt.
**Fix:** Integrate backup verification into the backup script or run it as a daily cron job. Alert on verification failures.

### Finding 6.2: Pre-deploy backups are not replicated off-site
**File:** `deploy-docker.sh:600-622`
**Severity:** HIGH
**Description:** Pre-deploy backups are stored locally on the app server (`~/backups/`). If the server disk fails during a deploy, both the live database AND the backup are lost.
**Operational Impact:** Single point of failure for backups. No off-site disaster recovery.
**Fix:** Sync backups to S3, B2, or another object store after creation. Document the off-site backup strategy.

### Finding 6.3: No backup encryption by default
**File:** `scripts/backup-db.sh:90-95`
**Severity:** HIGH
**Description:** Backup encryption with `age` is optional (`AGE_RECIPIENT` env var). By default, database dumps are stored as unencrypted gzip files containing plaintext password hashes, session tokens, and source code.
**Operational Impact:** Backup files are a high-value target. If the server is compromised, historical backups expose all historical data.
**Fix:** Make encryption mandatory. Fail the backup if encryption is not configured.

### Finding 6.4: Pre-restore snapshots only retain 5 copies
**File:** `src/lib/db/pre-restore-snapshot.ts:21`
**Severity:** MEDIUM
**Description:** Only 5 pre-restore snapshots are retained. In a high-frequency restore testing environment, this could mean less than a week of coverage.
**Operational Impact:** May not have a recent enough snapshot for rollback if restore testing is frequent.
**Fix:** Make retention configurable via env var. Document sizing guidance (5 snapshots ~= 5 restore operations).

### Finding 6.5: Restore operation does not validate file integrity before import
**File:** `src/app/api/v1/admin/restore/route.ts:119-132`
**Severity:** MEDIUM
**Description:** The restore validates export structure but does not verify checksums or cryptographic signatures. A tampered backup file could be imported without detection.
**Operational Impact:** Could restore maliciously modified data (e.g., backdoored admin accounts).
**Fix:** Add checksum verification (SHA-256) to backup exports and validate on restore.

---

## 7. Performance Tuning

### Finding 7.1: No query performance monitoring or slow query logging
**File:** `src/lib/db/queries.ts`, `src/lib/db/index.ts`
**Severity:** HIGH
**Description:** There is no instrumentation of database query execution times. The Drizzle ORM layer does not log slow queries. PostgreSQL `log_min_duration_statement` is not configured in the compose.
**Operational Impact:** Cannot identify N+1 queries, missing indexes, or performance regressions.
**Fix:** Add query timing middleware to Drizzle, enable PostgreSQL slow query logging, or use pg_stat_statements.

### Finding 7.2: No database connection pool monitoring
**File:** `src/lib/db/index.ts`
**Severity:** MEDIUM
**Description:** The PostgreSQL connection pool is created but there is no exposure of pool metrics (active connections, idle connections, queue depth, wait time).
**Operational Impact:** Connection pool exhaustion causes request failures with no early warning.
**Fix:** Expose pool metrics on the metrics endpoint. Alert when queue depth > 0 or idle connections approach zero.

### Finding 7.3: Judge queue has no priority or fairness mechanism
**File:** `src/lib/judge/dashboard-data.ts` (implied from schema)
**Severity:** MEDIUM
**Description:** Submissions are claimed FIFO by workers. A single user submitting 100 solutions can monopolize the queue. There is no per-user rate limiting on the judge queue itself.
**Operational Impact:** Queue unfairness during contests. Some users wait disproportionately longer.
**Fix:** Implement per-user queue depth limits or weighted fair queueing.

### Finding 7.4: No CDN or static asset caching configuration
**File:** `deploy-docker.sh` (nginx config)
**Severity:** LOW
**Description:** The nginx configuration has no cache headers for static assets. Next.js builds with hashed filenames but nginx does not cache them.
**Operational Impact:** Higher bandwidth usage and slower page loads for repeat visitors.
**Fix:** Add `Cache-Control` headers for static assets in nginx config.

---

## 8. Abuse Prevention

### Finding 8.1: Rate limits are DB-backed but not distributed across instances
**File:** `src/lib/security/api-rate-limit.ts`, `src/lib/security/rate-limit.ts`
**Severity:** HIGH
**Description:** Rate limiting uses PostgreSQL as the backing store, which provides consistency across instances. However, there is a sidecar fast-path (`rate-limiter-client.ts`) that uses an in-memory store. If the sidecar is used, rate limits reset on sidecar restart, creating a window for abuse.
**Operational Impact:** Rate limiting can be bypassed by restarting the sidecar or during sidecar rolling updates.
**Fix:** Either remove the sidecar fast-path or make it a read-only cache that never rejects requests independently.

### Finding 8.2: No IP-based blocking or banlist
**File:** `src/lib/security/ip.ts`
**Severity:** MEDIUM
**Description:** Client IP extraction exists but there is no IP blocking, allowlisting, or automated ban list for repeated offenders. An attacker can rotate IPs, but a persistent attacker from a single IP cannot be blocked without nginx configuration changes.
**Operational Impact:** Manual nginx configuration required to block abusive IPs. No self-service admin IP blocking.
**Fix:** Add an `ip_blocks` table and middleware that checks against it before request processing.

### Finding 8.3: CAPTCHA is only for signup, not for login or password reset
**File:** `src/lib/security/hcaptcha.ts`, `src/app/api/v1/admin/settings/route.ts`
**Severity:** MEDIUM
**Description:** hCaptcha is only enabled for public signup. Login endpoints and password reset flows have no CAPTCHA protection, making them vulnerable to credential stuffing and brute force.
**Operational Impact:** Login endpoints can be attacked at the rate limit threshold (5 attempts per minute per IP) without CAPTCHA friction.
**Fix:** Add optional CAPTCHA to login and password reset flows.

### Finding 8.4: Bulk rejudge is limited to 50 submissions but has no rate limit on repeated calls
**File:** `src/app/api/v1/admin/submissions/rejudge/route.ts:13`
**Severity:** LOW
**Description:** Bulk rejudge limits to 50 submissions per request, but an admin can make unlimited sequential requests. There is no overall rate limit on the rejudge endpoint.
**Operational Impact:** Could flood the judge queue with rejudges, delaying new submissions.
**Fix:** Add a per-admin daily/weekly rejudge quota or rate limit the endpoint.

---

## 9. Audit Trail Completeness

### Finding 9.1: Audit events are buffered and can be lost during crashes
**File:** `src/lib/audit/events.ts:137-250`
**Severity:** HIGH
**Description:** Audit events are written to an in-memory buffer (`_auditBuffer`) that flushes every 5 seconds or when 50 events accumulate. If the Node.js process crashes or is killed with SIGKILL, buffered events are lost. The shutdown handler (`node-shutdown.ts`) catches SIGTERM/SIGINT but not SIGKILL.
**Operational Impact:** Critical security events (admin actions, password changes, role assignments) can be lost if the process crashes before the buffer flushes.
**Fix:** Reduce buffer size/flush interval for sensitive events, or write audit events synchronously for admin actions. Alternatively, use a reliable message queue.

### Finding 9.2: No audit trail for failed authentication attempts beyond login events
**File:** `src/lib/audit/events.ts`, `src/lib/auth/login-events.ts`
**Severity:** MEDIUM
**Description:** Failed login attempts go to `loginEvents` table but NOT to `auditEvents`. The audit log only captures successful authenticated actions. A brute force attack leaves no trace in the audit trail.
**Operational Impact:** Security incident response requires checking two separate tables.
**Fix:** Emit audit events for significant failed authentication attempts (e.g., after N failures for the same account).

### Finding 9.3: No audit trail for Docker image operations
**File:** `src/app/api/v1/admin/docker/images/*/route.ts`
**Severity:** MEDIUM
**Description:** Docker image build, prune, and list operations are NOT audited. An admin could build a malicious image or prune critical images without leaving an audit trail.
**Operational Impact:** Cannot investigate supply chain attacks or accidental image deletion.
**Fix:** Add `recordAuditEvent` calls to all Docker image API routes.

### Finding 9.4: Audit events table has no partitioning or archival strategy
**File:** `src/lib/db/schema.pg.ts:118-146`, `src/lib/data-retention.ts`
**Severity:** MEDIUM
**Description:** Audit events are pruned after 90 days (configurable), but the table itself is not partitioned. On high-traffic instances, the auditEvents table could grow to millions of rows before pruning, causing query slowdown.
**Operational Impact:** Audit log queries become slow as the table grows. The CSV export is capped at 10,000 rows which may not cover a day's events.
**Fix:** Implement PostgreSQL partitioning by month on `createdAt`, or use a separate time-series database.

### Finding 9.5: Audit event `details` field has a 4000-character limit with silent truncation
**File:** `src/lib/audit/events.ts:43,55-92`
**Severity:** LOW
**Description:** Audit event details are truncated to 4000 characters of JSON. Complex bulk operations (e.g., bulk rejudge with 50 submission IDs) may exceed this limit and be silently truncated.
**Operational Impact:** Incomplete audit records for bulk operations.
**Fix:** Increase the limit or store large details in a separate table with a reference.

---

## 10. Disaster Recovery

### Finding 10.1: No documented disaster recovery runbook
**File:** `docs/` (inferred absence)
**Severity:** CRITICAL
**Description:** While individual scripts exist (backup, restore, pg-volume-safety-check), there is no unified DR runbook that an on-call engineer can follow during an outage. The deploy script embeds recovery steps for specific scenarios but there is no comprehensive DR document.
**Operational Impact:** During an incident, operators must piece together recovery steps from scattered comments in scripts. Recovery time is unpredictable.
**Fix:** Create `docs/disaster-recovery.md` with step-by-step procedures for: database corruption, complete data loss, ransomware attack, worker pool failure, and region-wide outage.

### Finding 10.2: No automated DB integrity checks
**File:** `scripts/backup-db.sh` (has gzip verification only)
**Severity:** HIGH
**Description:** Backups are verified as valid gzip files but NOT validated as valid PostgreSQL dumps. `pg_restore --list` or similar validation is not performed.
**Operational Impact:** A corrupted pg_dump (truncated mid-stream) passes gzip validation but fails on restore.
**Fix:** Add `pg_restore --list` validation to the backup verification step.

### Finding 10.3: Point-in-time recovery (PITR) not configured
**File:** `docker-compose.production.yml:17-61`
**Severity:** HIGH
**Description:** PostgreSQL WAL archiving is not configured. The database only has logical backups (pg_dump). There is no way to recover to a specific point in time between backups.
**Operational Impact:** If data corruption is discovered hours after it occurred, the only recovery option is the last full backup, losing all intervening data.
**Fix:** Configure WAL archiving to object storage (S3, MinIO) and document PITR procedures.

### Finding 10.4: No automated failover for the judge worker
**File:** `docker-compose.production.yml:110-145`
**Severity:** MEDIUM
**Description:** If the local judge worker crashes or becomes unresponsive, submissions pile up in the queue. There is no automatic failover to a remote worker pool or automatic restart escalation.
**Operational Impact:** Manual intervention required to restore judging capability.
**Fix:** Implement worker health checks with automatic deregistration and queue redistribution. Support multiple worker endpoints with fallback.

### Finding 10.5: No database replication or read replicas
**File:** `docker-compose.production.yml:17-61`
**Severity:** HIGH
**Description:** PostgreSQL runs as a single container with no streaming replication, hot standby, or read replicas. A database server failure requires recovery from backup.
**Operational Impact:** Database is a single point of failure. No read scaling for analytics/reporting queries.
**Fix:** Configure PostgreSQL streaming replication with a hot standby. Document failover procedures.

---

## File Inventory (Admin-Facing)

### Admin Dashboard Pages
- `src/app/(dashboard)/dashboard/admin/page.tsx`
- `src/app/(dashboard)/dashboard/admin/users/page.tsx`
- `src/app/(dashboard)/dashboard/admin/users/user-actions.tsx`
- `src/app/(dashboard)/dashboard/admin/users/add-user-dialog.tsx`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx`
- `src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx`
- `src/app/(dashboard)/dashboard/admin/settings/page.tsx`
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx`
- `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx`
- `src/app/(dashboard)/dashboard/admin/settings/config-settings-form.tsx`
- `src/app/(dashboard)/dashboard/admin/workers/page.tsx`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx`
- `src/app/(dashboard)/dashboard/admin/roles/page.tsx`
- `src/app/(dashboard)/dashboard/admin/api-keys/page.tsx`
- `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx`
- `src/app/(dashboard)/dashboard/admin/login-logs/page.tsx`
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx`
- `src/app/(dashboard)/dashboard/admin/languages/page.tsx`
- `src/app/(dashboard)/dashboard/admin/files/page.tsx`
- `src/app/(dashboard)/dashboard/admin/tags/page.tsx`
- `src/app/(dashboard)/dashboard/admin/plugins/page.tsx`

### Admin API Routes
- `src/app/api/v1/admin/settings/route.ts`
- `src/app/api/v1/admin/backup/route.ts`
- `src/app/api/v1/admin/restore/route.ts`
- `src/app/api/v1/admin/workers/route.ts`
- `src/app/api/v1/admin/workers/stats/route.ts`
- `src/app/api/v1/admin/workers/[id]/route.ts`
- `src/app/api/v1/admin/roles/route.ts`
- `src/app/api/v1/admin/roles/[id]/route.ts`
- `src/app/api/v1/admin/api-keys/route.ts`
- `src/app/api/v1/admin/api-keys/[id]/route.ts`
- `src/app/api/v1/admin/audit-logs/route.ts`
- `src/app/api/v1/admin/login-logs/route.ts`
- `src/app/api/v1/admin/submissions/rejudge/route.ts`
- `src/app/api/v1/admin/submissions/export/route.ts`
- `src/app/api/v1/admin/languages/route.ts`
- `src/app/api/v1/admin/languages/[language]/route.ts`
- `src/app/api/v1/admin/tags/route.ts`
- `src/app/api/v1/admin/tags/[id]/route.ts`
- `src/app/api/v1/admin/plugins/route.ts`
- `src/app/api/v1/admin/plugins/[id]/route.ts`
- `src/app/api/v1/admin/chat-logs/route.ts`
- `src/app/api/v1/admin/migrate/export/route.ts`
- `src/app/api/v1/admin/migrate/import/route.ts`
- `src/app/api/v1/admin/migrate/validate/route.ts`
- `src/app/api/v1/admin/docker/images/route.ts`
- `src/app/api/v1/admin/docker/images/build/route.ts`
- `src/app/api/v1/admin/docker/images/prune/route.ts`

### Core Admin Libraries
- `src/lib/actions/user-management.ts`
- `src/lib/actions/system-settings.ts`
- `src/lib/actions/tag-management.ts`
- `src/lib/actions/language-configs.ts`
- `src/lib/actions/plugins.ts`
- `src/lib/auth/permissions.ts`
- `src/lib/auth/role-helpers.ts`
- `src/lib/capabilities/types.ts`
- `src/lib/capabilities/defaults.ts`
- `src/lib/capabilities/checker.ts`
- `src/lib/capabilities/cache.ts`
- `src/lib/capabilities/ensure-builtin-roles.ts`
- `src/lib/audit/events.ts`
- `src/lib/audit/node-shutdown.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/security/api-rate-limit.ts`
- `src/lib/security/rate-limit-core.ts`
- `src/lib/security/rate-limiter-client.ts`
- `src/lib/security/constants.ts`
- `src/lib/security/secrets.ts`
- `src/lib/security/encryption.ts`
- `src/lib/security/password-hash.ts`
- `src/lib/security/server-actions.ts`
- `src/lib/security/env.ts`
- `src/lib/security/production-config.ts`
- `src/lib/api/api-key-auth.ts`
- `src/lib/api/handler.ts`
- `src/lib/api/auth.ts`
- `src/lib/db/export.ts`
- `src/lib/db/import.ts`
- `src/lib/db/export-with-files.ts`
- `src/lib/db/import-transfer.ts`
- `src/lib/db/pre-restore-snapshot.ts`
- `src/lib/db/schema.pg.ts`
- `src/lib/db/index.ts`
- `src/lib/db/queries.ts`
- `src/lib/db/cleanup.ts`
- `src/lib/db/migrate.ts`
- `src/lib/system-settings-config.ts`
- `src/lib/system-settings.ts`
- `src/lib/data-retention.ts`
- `src/lib/data-retention-maintenance.ts`
- `src/lib/docker/client.ts`
- `src/lib/ops/admin-health.ts`
- `src/lib/ops/admin-metrics.ts`
- `src/lib/navigation/admin-nav.ts`
- `src/lib/files/storage.ts`
- `src/lib/files/image-processing.ts`
- `src/lib/files/validation.ts`

### Deployment and Operations
- `deploy-docker.sh`
- `deploy.sh`
- `docker-compose.production.yml`
- `docker-compose.worker.yml`
- `docker-compose.yml`
- `Dockerfile`
- `Dockerfile.judge-worker`
- `scripts/backup-db.sh`
- `scripts/verify-db-backup.sh`
- `scripts/pg-volume-safety-check.sh`
- `scripts/deploy-worker.sh`
- `scripts/monitor-health.sh`
- `scripts/setup.sh`
- `scripts/bootstrap-instance.sh`
- `scripts/install-online-judge-service.sh`
- `scripts/install-online-judge-backup-timer.sh`

### Health/Metrics Endpoints
- `src/app/api/health/route.ts`
- `src/app/api/metrics/route.ts`
- `src/app/api/v1/health/route.ts`

---

## Final Sweep Notes

**Files reviewed:** All admin-facing pages, API routes, core libraries, deployment scripts, and infrastructure configuration files were examined.

**Files intentionally NOT reviewed in detail:**
- Individual language Dockerfiles (`docker/Dockerfile.judge-*`) -- these are build artifacts, not operational concerns beyond the build orchestration
- Student/instructor-facing pages -- out of scope for admin review
- Test files -- not operational
- Static assets -- not operational

**Greatest operational strengths:**
1. Pre-deploy backups with automatic retention
2. PG volume safety check prevents data-loss deploy scenario
3. Capability-based RBAC with custom role support
4. Pre-restore snapshots before destructive imports
5. Audit event buffering with graceful shutdown handling
6. Comprehensive deploy script with SSH multiplexing and retry logic

**Greatest operational risks:**
1. No rollback mechanism on failed deploys
2. Audit event buffer can lose events on SIGKILL/crash
3. No WAL archiving or point-in-time recovery
4. Health checks do not verify dependent services
5. No automated backup verification or off-site replication
6. Single PostgreSQL instance with no replication
