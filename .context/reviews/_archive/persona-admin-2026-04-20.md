# JudgeKit Sysadmin Review

**Reviewer**: System Administrator  
**Date**: 2026-04-20  
**Perspective**: Operating JudgeKit for a university with hundreds of concurrent users during exams and contests  
**Scope**: Deployment, worker management, user management, monitoring, backup/recovery, security, resource management, logging/audit, scalability, operational pain points

---

## 1. Deployment

### What works

The deployment story has clearly been refined through real incidents. `deploy-docker.sh` is the primary path and it shows battle scars in the best way:

- **Remote builds** (`deploy-docker.sh` line 385): Images build on the target host, not locally. This eliminates the cross-architecture silent corruption that `deploy.sh` (the legacy path) suffered from. The architecture detection at line 200 (`uname -m`) and platform flag propagation is solid.
- **Pre-deploy pg_dump** (lines 449-470): Every deploy captures a backup first. If the backup fails, the deploy aborts unless `SKIP_PREDEPLOY_BACKUP=1` is set. This is exactly right. The 30-day retention cleanup is a nice touch.
- **PG volume safety check** (lines 482-510): The `scripts/pg-volume-safety-check.sh` script exists specifically because of the April 2026 data wipe incident. It detects the anonymous-vs-named-volume mismatch and offers both manual and `--auto-migrate` recovery paths. This is incident-driven hardening done properly.
- **Env backfill** (lines 242-305): `ensure_env_secret()` and `ensure_env_literal()` automatically backfill missing secrets on the remote `.env.production`. This prevents the class of failure where a new env var is added to the app but the remote config predates it.
- **The legacy `deploy.sh` is properly deprecated** with a 5-second warning banner and `LEGACY_DEPLOY_ACK` override.

### What worries me

- **No zero-downtime deploys.** Lines 523-524: `docker compose down --remove-orphans` followed by `docker compose up -d`. There is a window where the app returns 502/503 to users. During an exam with 200 students, this means telling the professor "everyone stop for 2 minutes while I redeploy." That is not acceptable during finals week.
- **Migration runs via a temporary container** (lines 553-565): `docker run --rm -v ${REMOTE_DIR}:/app node:24-alpine sh -c 'npm install ... && npx drizzle-kit push'`. This mounts the entire source tree into a container and runs `npm install` on the server every time. On a slow VM, this adds minutes to the deploy. There is no migration rollback if `drizzle-kit push` fails partway.
- **The `deploy.sh` legacy path still exists and still works.** Despite the deprecation banner, a new operator could accidentally use it. It builds locally and `docker save | gzip | ssh` transfers images. On a mixed-arch team (M-series Mac, x86 server), this silently produces broken images. The deprecation banner is not strong enough -- it should refuse to run unless a specific environment variable forces it.
- **No health-check gate before exposing traffic.** The deploy starts containers, then waits up to 60 seconds for the app to report healthy (line 616). But nginx is already routing traffic to port 3100 from the moment the container starts. There is no circuit breaker or "drain connections then switch" pattern.
- **`docker compose down --remove-orphans`** (line 524) is aggressive. `--remove-orphans` will kill any container not defined in the current compose file, including operator-launched debugging containers. A tired admin at 2 AM could lose a debugging session.

### Verdict: 6/10

The deployment script is clearly production-hardened from real incidents, but the fundamental architecture (stop-then-start, no blue-green, no health gate) means every deploy is a scheduled outage.

---

## 2. Worker Management

### What works

The worker lifecycle is well-designed:

- **Registration** (`src/app/api/v1/judge/register/route.ts`): Workers register with hostname, concurrency, CPU model, architecture. A `workerSecret` is generated server-side and returned once. Only the SHA-256 hash is stored in the DB (`secretTokenHash`). This is proper secret handling.
- **Heartbeat** (`src/app/api/v1/judge/heartbeat/route.ts`): 30-second interval with a 3x stale multiplier (90 seconds). Stale workers are swept during heartbeat processing (lines 72-82), which is efficient -- no separate cron needed.
- **Deregistration** (`src/app/api/v1/judge/deregister/route.ts`): On graceful shutdown, the worker deregisters and all its claimed submissions are released back to `pending` status (lines 62-96). This prevents submissions from being stuck in `queued`/`judging` limbo.
- **The Rust worker** (`judge-worker-rs/src/main.rs`) has proper graceful shutdown: SIGTERM/SIGINT handling (lines 366-374), awaiting in-flight tasks (lines 490-502), deregistration on exit (lines 505-511). The semaphore-based concurrency control (line 216) and exponential backoff on empty polls (lines 382-389) show production maturity.
- **Worker scaling** is supported via `docker-compose.worker.yml`. This is a standalone compose file for dedicated worker machines with their own docker-proxy. `JUDGE_CONCURRENCY` is configurable. This is the right architecture for horizontal scaling.
- **Docker socket proxy** (`tecnativa/docker-socket-proxy`) with `BUILD=0`, `POST=0`, `DELETE=0` in production (docker-compose.production.yml lines 69-73) is a good security boundary -- the worker can list and inspect containers but not build or delete them.
- **Dead letter volume** (`judgekit-dead-letter`) for submissions that fail during processing.

### What worries me

- **No automatic failover for stale workers.** If a worker crashes without deregistering (OOM kill, kernel panic, power loss), its submissions stay in `queued`/`judging` until the stale claim timeout fires. The timeout is `staleClaimTimeoutMs` which defaults to 300,000ms (5 minutes). During an exam, 5 minutes of stuck submissions is a long time. There is no proactive reaping daemon -- reclamation only happens when another worker calls `claim` and picks up the stale submission via the `OR (s.status IN ('queued', 'judging') AND s.judge_claimed_at < ...)` clause.
- **Worker capacity is not visible in real time.** The `judge_workers` table has `active_tasks` and `concurrency`, but there is no dashboard or alert when a worker is at capacity. The health endpoint reports `online`/`stale`/`offline` counts but not "worker X is at 95% capacity."
- **No worker auto-scaling.** If the submission queue backs up, there is no mechanism to spin up additional workers. An operator must manually provision a new machine, copy `docker-compose.worker.yml`, set env vars, and `docker compose up`. During an exam surge, this manual process is too slow.
- **Heartbeat failure logging is too quiet.** In `main.rs` lines 313-324, the first two heartbeat failures log at `debug` level. Only after 3 consecutive failures does it log at `warn`. If RUST_LOG is not set to `debug` (and it should not be in production), you will not see heartbeat issues until the worker is already stale.

### Verdict: 7/10

The core lifecycle is solid and the Rust worker is well-engineered. But the lack of automatic failover, capacity visibility, and auto-scaling means you need to babysit workers during high-load events.

---

## 3. User Management

### What works

- **Bulk user creation** (`src/app/api/v1/users/bulk/route.ts`): The API accepts an array of users, validates uniqueness, hashes passwords in parallel (with `pLimit(4)`), and uses PostgreSQL savepoints so one failure does not abort the entire batch. The response includes both `created` and `failed` arrays. This is exactly what you need for enrolling 200 students at the start of a semester.
- **Role-based capabilities** (`roles` table with `capabilities` JSON array). Capabilities like `system.settings`, `users.create`, `system.backup`, `system.audit_logs`, `system.chat_logs` are fine-grained. The `isBuiltin` flag prevents accidental deletion of system roles.
- **API keys** (`api_keys` table): Hash-based authentication with `keyHash` and `keyPrefix` for lookup, `encryptedKey` for display. Role-assignable. Expiration support. This is proper API key management.
- **Password re-confirmation** for sensitive operations (backup, restore). Transparent bcrypt-to-argon2id rehashing on every re-confirmation.
- **Must-change-password** flag (`mustChangePassword`) for bulk-created users.

### What worries me

- **No CSV import for bulk users.** The bulk API requires JSON. For a university sysadmin who receives a class roster as a CSV from the registrar, there is no built-in way to convert it. You would need to write a script to generate the JSON payload.
- **No user import from external identity providers.** There is no LDAP, SAML, or OAuth2 SCIM integration. For a university, this means manually creating accounts or writing a custom integration script. The `accounts` table has `provider`/`providerAccountId` columns, but there is no admin UI for configuring external identity providers.
- **`mustChangePassword` enforcement is client-side only.** If a bulk-created user with `mustChangePassword: true` calls the API directly (bypassing the UI), nothing forces them to change their password. There is no server-side check that blocks API calls until the password is changed.
- **No account lockout after repeated failed logins.** Rate limiting blocks the IP, but it does not lock the account. An attacker with rotating IPs can attempt unlimited password guesses against a single account, limited only by the per-IP rate limit window.

### Verdict: 6/10

Bulk creation works. API keys are solid. But the lack of university-friendly integrations (CSV import, LDAP/SAML) and the weak must-change-password enforcement are real gaps.

---

## 4. Monitoring

### What works

- **Prometheus metrics endpoint** (`src/app/api/metrics/route.ts`): Exposes `judgekit_health_status`, `judgekit_health_check` (database, audit_events), `judgekit_judge_workers` (online/stale/offline), `judgekit_submission_queue_pending`, `judgekit_submission_queue_limit`, `judgekit_uptime_seconds`, `judgekit_audit_failed_writes`. All in Prometheus exposition format (`text/plain; version=0.0.4`). This is directly scrapeable.
- **Authentication for metrics**: Requires either admin capabilities or `CRON_SECRET` Bearer token. This prevents unauthenticated metric scraping while allowing automated collection.
- **Health endpoint** (`src/app/api/v1/health/route.ts`): Returns DB connectivity status, uptime, response time. Returns 503 when degraded. Suitable for load balancer health checks.
- **Admin health snapshot** (`src/lib/ops/admin-health.ts`): Combines DB check, worker status, queue depth, and audit event health into a single query. The `stale > 0 || (pending > 0 && online === 0)` degradation logic (line 87) is sensible -- it flags the two scenarios that actually matter.
- **Nginx-level rate limiting** in the deploy script (lines 643-800): `limit_req_zone` for login and judge API endpoints with burst allowances.

### What worries me

- **No request latency metrics.** The metrics endpoint exposes health probe latency, but there are no histogram-style metrics for API response times, submission processing times, or page load times. You cannot build a P99 latency dashboard from these metrics alone.
- **No per-endpoint error rate metrics.** You get `judgekit_health_status` (0 or 1) but not "how many 500s did /api/v1/submissions return in the last 5 minutes?"
- **No worker-level metrics.** You get `judgekit_judge_workers{status=online}` count, but not per-worker active tasks, queue depth, or processing latency. If worker A is healthy but slow and worker B is fast, you cannot tell from the metrics.
- **The Rust worker does not expose Prometheus metrics.** The runner HTTP server at `:3001` has a `/health` endpoint that returns a bare 200 OK with no body. No metrics, no Go-style `/debug/pprof`, nothing scrapeable.
- **No structured log aggregation support.** The app uses `pino`-style logging via `src/lib/logger.ts`, but there is no documented pipeline for shipping logs to Loki, Elasticsearch, or any centralized system. During an incident, you are running `docker compose logs -f` and grepping.

### Verdict: 5/10

The Prometheus endpoint exists and exposes the basics. But the metrics are too coarse for incident diagnosis. You can tell the system is unhealthy but not why.

---

## 5. Backup & Recovery

### What works

- **Application-level backup** (`src/app/api/v1/admin/backup/route.ts`): Password-protected, streamed JSON export or ZIP archive (with uploaded files). Rate-limited. Audit-logged. This is the primary backup path.
- **Application-level restore** (`src/app/api/v1/admin/restore/route.ts`): Validates the export, rejects sanitized (portable) exports, supports both JSON and ZIP formats. Password re-confirmation required. Uses `importDatabase()` which handles table-by-table import.
- **Pre-deploy pg_dump** in `deploy-docker.sh` (lines 449-470): Custom-format dump with `--compress=9`. Stored in `~/backups/` on the remote host with 30-day retention.
- **Standalone backup script** (`scripts/backup-db.sh`): Supports both host-exec (requires local `pg_dump`) and container-exec (runs `pg_dump` inside the Docker container) modes. Optional `age` encryption. 30-day retention with safety check (never deletes the last backup).
- **Migration tooling** (`src/app/api/v1/admin/migrate/export/route.ts`, `import/route.ts`, `validate/route.ts`): Full database migration between instances with validation.
- **PG volume safety check** (`scripts/pg-volume-safety-check.sh`): Detects the specific anonymous-volume orphan scenario that caused the April 2026 data wipe. Offers `--auto-migrate` with pre-migration snapshots.

### What worries me

- **No automated scheduled backups.** The backup script exists, but there is no cron setup, no systemd timer, nothing in the deploy that configures automatic daily backups. The pre-deploy backup only runs when you deploy. If you go 3 months without deploying (common in a stable semester), you have 3-month-old backups. The deploy script output does not even suggest setting up a cron job.
- **No point-in-time recovery (PITR).** PostgreSQL WAL archiving is not configured in `docker-compose.production.yml`. If a user accidentally drops a problem set at 2 PM and you notice at 4 PM, your only recovery option is to restore the last pg_dump, losing all submissions from 2-4 PM.
- **The application-level backup is not atomic.** `streamDatabaseExport()` reads tables sequentially. If a submission is created while the backup is running, it might be in the `submissions` export but not in the `submission_results` export, or vice versa. For a university system that needs to prove grade integrity, non-atomic backups are a concern.
- **Restore replaces everything.** `importDatabase()` is a full-database replacement, not a merge. If you restore a backup from yesterday, you lose all today's data. There is no granular restore ("restore just problem X" or "restore user Y's submissions").
- **No backup integrity verification.** The backup script verifies that the file is valid gzip (`gzip -t`), but it does not verify that the SQL dump can actually be restored. A truncated pg_dump will pass `gzip -t` but fail on restore.

### Verdict: 5/10

The tooling exists and the incident-driven hardening is real, but the lack of automated scheduled backups, PITR, and granular restore is a significant operational gap for a system that handles exam grades.

---

## 6. Security Configuration

### What works

- **Rate limiting is multi-layered**: (1) nginx `limit_req_zone` at the reverse proxy level, (2) a Rust sidecar (`rate-limiter-rs`) for fast in-memory checks, (3) PostgreSQL-backed persistent rate limits with `SELECT FOR UPDATE` atomicity. The two-tier strategy (sidecar fast path + DB source of truth) in `src/lib/security/api-rate-limit.ts` is well-designed.
- **Login rate limiting** (`src/lib/security/rate-limit.ts`): Exponential backoff on repeated failures (2^consecutiveBlocks, capped at 2^5 = 32x). Per-IP and per-username keys. Stale entry eviction every 60 seconds. This is solid brute-force protection.
- **Judge IP allowlist** (`src/lib/judge/ip-allowlist.ts`): `JUDGE_ALLOWED_IPS` env var supports both exact IPs and CIDR ranges. When not configured, all IPs are allowed (backward compatible). When configured, unknown IPs are denied.
- **Per-worker authentication**: Workers receive a `workerSecret` at registration. Only the SHA-256 hash is stored. `isJudgeAuthorizedForWorker()` validates the Bearer token against the hash with constant-time comparison.
- **CSRF protection** (`src/lib/security/csrf.ts`): Requires `X-Requested-With: XMLHttpRequest` header plus origin validation. Skipped for API key auth (which uses Bearer tokens, not cookies).
- **Seccomp profiles**: The Rust worker uses a custom seccomp profile (`/etc/judge/seccomp-profile.json`) for sandboxed execution. Docker containers run with `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--network=none`, `--user 65534:65534`, and read-only rootfs for run phase.

### What worries me

- **`JUDGE_ALLOWED_IPS` defaults to "allow all".** If the operator does not set this env var, any IP can hit the judge API endpoints. The claim/poll/register/heartbeat/deregister routes are all authenticated via Bearer token, but defense in depth says you should also restrict by IP. The default should be "deny all, explicitly allow" for production, not "allow all."
- **Rate limit keys include IP addresses.** In `src/lib/security/rate-limit.ts` line 31: `extractClientIp(headers)`. If the app is behind a load balancer and `X-Forwarded-For` is spoofable (no trusted proxy configuration), rate limiting is trivially bypassable by rotating the `X-Forwarded-For` header. I do not see any `X-Forwarded-For` trust configuration.
- **The `secretToken` column still exists in `judge_workers`.** Although it is deprecated and new workers use `secretTokenHash`, the plaintext column is still in the schema (`src/lib/db/schema.pg.ts` line 418). Any legacy worker that registered before the hash rollout has its secret stored in plaintext. The code rejects auth for workers without a hash (`workerSecretNotMigrated`), but the plaintext values are still in the DB.
- **No CORS configuration visible.** I do not see explicit CORS headers being set. If the API is meant to be accessed from different origins (e.g., a custom frontend), there needs to be a documented CORS policy.
- **Shell command validation** in the Rust runner (`judge-worker-rs/src/runner.rs` lines 116-167) blocks dangerous metacharacters but explicitly allows `&&` and `;` because admin compile commands chain steps. The trust boundary is "the admin role that can mutate `language_configs`." This is acceptable but documented -- if an admin account is compromised, the attacker can craft compile commands that chain malicious steps.

### Verdict: 7/10

The security layer is thoughtful, especially the multi-tier rate limiting and sandbox hardening. The main gaps are the default-open IP allowlist, potential X-Forwarded-For spoofing, and the residual plaintext `secretToken` column.

---

## 7. Resource Management

### What works

- **102 language Dockerfiles** (counted in `docker/` directory). The `deploy-docker.sh` script has language presets: `core` (3 langs, ~1.2 GB), `popular` (6 langs, ~4 GB), `extended` (16 langs, ~12 GB), `all` (102 langs, ~30 GB). This gives operators control over disk usage.
- **Docker image management API** (`src/app/api/v1/admin/docker/images/route.ts`): List images with stale detection (compares Dockerfile mtime to image creation time), pull from registry, remove, and prune stale images. All protected by `system.settings` capability.
- **Docker image build API** (`src/app/api/v1/admin/docker/images/build/route.ts`): Build images from the admin UI. Only `judge-*` images are allowed. Audit-logged.
- **Prune API** (`src/app/api/v1/admin/docker/images/prune/route.ts`): Removes images whose Dockerfile has been modified since the image was built. This keeps disk usage under control.
- **Docker socket proxy** restricts the worker to `CONTAINERS=1`, `IMAGES=1`, `BUILD=0`, `POST=0`, `DELETE=0` in production. The worker can list containers/images but not build or delete.

### What worries me

- **102 language images at ~30 GB total.** If you need all 102 languages (the `all` preset), that is 30 GB of Docker images on the worker machine. Plus the base OS, the app image, the worker image, the code-similarity image, and the rate-limiter image. On a 40 GB VM, you are at 80% disk usage before any submissions come in. The `deploy-docker.sh` output says "all" is ~30 GB, but it does not warn about total disk requirements.
- **No disk space monitoring or alerting.** The admin health endpoint does not check disk usage. The Docker images API returns disk usage (`getDiskUsage()`), but it is not exposed as a Prometheus metric. There is no alert when disk usage exceeds 80%. If `/judge-workspaces` fills up (each submission creates temp files), the worker will fail silently.
- **No image registry.** All images are built locally on the worker machine. There is no option to push to a private registry and pull on demand. If you have 3 worker machines, you build all images 3 times. If you add a 4th worker, you build everything again.
- **Stale image detection is mtime-based** (`src/app/api/v1/admin/docker/images/route.ts` lines 13-40). It compares Dockerfile mtime to image creation time. If someone `touch`es a Dockerfile without changing it, the image is marked stale. If someone modifies a Dockerfile and then restores it to the original content, the image is still marked stale. Content-based hashing would be more reliable.
- **No image garbage collection cron.** The prune API exists but must be called manually. There is no automated cleanup of dangling images, stopped containers, or unused networks. The deploy script runs `docker image prune -f` (line 431), but only during deploys. Between deploys, orphaned containers accumulate (the Rust worker cleans them every 300 seconds per `main.rs` line 379, but only orphaned judge containers, not dangling images).

### Verdict: 5/10

The language preset system and admin image management API are good. But the disk space story is fragile -- 30 GB of images with no monitoring, no registry, and no automated cleanup.

---

## 8. Logging & Audit

### What works

- **Audit events** (`src/lib/audit/events.ts`): Batched writes (5-second flush interval, 50-event threshold). Graceful shutdown flushes the buffer. Includes actor, action, resource type, IP, user agent, request path. The `DATA_RETENTION_LEGAL_HOLD` env var suspends all pruning for litigation holds. This is a production-quality audit system.
- **Login events** (`login_events` table): Tracks outcome (success, invalid_credentials, rate_limited, policy_denied), attempted identifier, IP, user agent. Indexed for efficient querying.
- **Audit log API** (`src/app/api/v1/admin/audit-logs/route.ts`): Paginated, filterable by resource type, actor, action, date range. CSV export with BOM for Excel. 10,000 row export limit to prevent memory exhaustion.
- **Login log API** (`src/app/api/v1/admin/login-logs/route.ts`): Same pagination and CSV export. Searchable by username, IP, outcome.
- **Chat log access** (`src/app/api/v1/admin/chat-logs/route.ts`): Break-glass model. Every session transcript view is audit-logged with `accessType: "break-glass-transcript"`. The code comment explicitly calls this out: "Operators should review these events periodically."
- **Audit event health monitoring** (`getAuditEventHealthSnapshot()`): Tracks failed writes and last failure time. Exposed via `/api/metrics`.

### What worries me

- **Audit buffer can lose events on crash.** `events.ts` lines 119-120: if the buffer exceeds `FLUSH_SIZE_THRESHOLD * 2` (100 events), new events are silently dropped. If the DB is down for an extended period, audit events are lost after the buffer fills. There is no persistent queue or dead-letter mechanism for audit events.
- **No log shipping configuration.** The app logs to stdout (Docker collects it), but there is no documented integration with centralized logging (Loki, Elasticsearch, CloudWatch). During an incident with 5 containers running, you are running `docker compose logs -f | grep` across multiple services.
- **The `summary` field in audit events is free-text** (`normalizeText(summary, MAX_TEXT_LENGTH)`). There is no structured event taxonomy. Two different code paths might log "User created" vs "Created user" vs "user.create" for the same action. This makes it hard to build reliable dashboards or alerts on audit events.
- **No real-time alerting on security events.** There is no webhook, email, or Slack integration for events like "5 consecutive failed logins from IP X" or "admin account created." You have to notice these by manually reviewing the audit log.

### Verdict: 6/10

The audit system is thorough in what it captures but weak in what it does with the data. Batched writes, retention policies, and break-glass logging are solid. But the lack of structured event taxonomy, log shipping, and real-time alerting means you discover incidents by reviewing logs after the fact, not by being notified.

---

## 9. Scalability

### What works

- **Connection pooling** (`src/lib/db/index.ts` lines 38-44): `pg.Pool` with configurable `max` (default 20), `idleTimeoutMillis` (30s), `connectionTimeoutMillis` (10s). These are reasonable defaults for a single-instance deployment.
- **Advisory locks for submission serialization** (`src/app/api/v1/submissions/route.ts` line 251): `pg_advisory_xact_lock` on user ID prevents concurrent submission races. This is correct and efficient.
- **`FOR UPDATE SKIP LOCKED`** in the claim query (`src/app/api/v1/judge/claim/route.ts` lines 148, 198): This is the correct pattern for concurrent workers claiming submissions. Multiple workers can poll simultaneously without blocking each other.
- **Worker capacity gating** in the claim SQL (lines 126-184): The CTE checks `active_tasks < concurrency` before claiming, atomically incrementing `active_tasks` in the same statement. This prevents over-subscription.
- **Global queue limit** (`SUBMISSION_GLOBAL_QUEUE_LIMIT`, default 200 in `system_settings` but 100 in the env file): When the pending queue exceeds this limit, new submissions are rejected with 503. This is a circuit breaker that prevents the queue from growing unboundedly.
- **Single-instance deployment model** (`APP_INSTANCE_COUNT=1`): The realtime coordination module (`src/lib/realtime/realtime-coordination.ts`) explicitly warns against multi-instance deployment without shared coordination. This is honest -- it is not pretending to be horizontally scalable at the app tier.

### What worries me

- **Single app instance is a hard constraint.** The Next.js app runs as a single container. If the CPU is pegged at 100% during a 500-user exam, you cannot add more app containers behind a load balancer because SSE/realtime connections are process-local (not shared via Redis or similar). The code explicitly says this: "keep the web app single-instance."
- **`pg.Pool` max of 20 may be insufficient.** Each SSE connection holds a DB poll. If 200 users have active SSE connections for submission updates, the pool is exhausted. The `maxSseConnectionsPerUser` setting exists in `system_settings` but the default is not visible in the schema. Even with 1 SSE connection per user, 200 users = 200 polling connections, which exceeds the default pool size of 20.
- **The global queue limit of 200 is low for 500+ concurrent users.** If 500 students submit simultaneously at the start of an exam, and each problem has 5 test cases, the queue could easily exceed 200 submissions. The system would reject submissions with 503 "judgeQueueFull," and students would see errors. The limit is configurable, but the default is dangerously low.
- **Submission creation does a full table scan for global queue count.** `src/app/api/v1/submissions/route.ts` lines 276-283: `SELECT COUNT(*) FROM submissions WHERE status IN ('pending', 'queued')`. On a table with millions of submissions, this is slow. The `submissions_status_idx` index helps, but `COUNT(*)` with `IN` is still a sequential scan of the matching rows. Under high write concurrency, this becomes a bottleneck.
- **No read replicas.** All queries hit the primary PostgreSQL instance. During an exam, the leaderboard API, submission listing, and health checks all compete for the same DB connections as write operations.

### Verdict: 4/10

This is the most concerning area. The single-instance constraint, default pool size, and low queue limits mean the system will struggle under 500+ concurrent users. The claim/queue architecture is well-designed for correctness, but the capacity numbers need tuning for production exam loads.

---

## 10. Pain Points -- What Keeps Me Up at Night

1. **Every deploy is an outage.** There is no blue-green, no canary, no rolling update. If a professor reports a bug during an exam, the fix requires a full redeploy, which means 1-3 minutes of downtime for everyone. I have to coordinate deploys between exam sessions, which limits how fast I can ship fixes.

2. **The 30 GB Docker image problem.** If a course needs an esoteric language, I have to build its image on the worker machine. Building `judge-chapel` or `judge-mercury` from source takes 15-30 minutes each. If the build fails, I do not find out until the student submits and gets an error. There is no "image pre-flight check" that verifies all enabled language images exist before allowing submissions.

3. **No automated backups.** I have the backup script and the pre-deploy backup, but if I do not deploy for 3 months (stable semester), my backups are 3 months old. I need to set up a cron job manually, and the deploy script does not remind me. For a system that stores exam grades, this is a compliance risk.

4. **Worker capacity is invisible.** During an exam with 200 submissions in the queue, I cannot see which workers are busy and which have capacity. I have to SSH into the machine, run `docker compose logs -f`, and count the "Processing submission" log lines. There is no dashboard, no Grafana panel, no real-time capacity view.

5. **The SSE scaling problem.** The app is single-instance, and SSE connections are process-local. If 300 students are watching their submission results via SSE during a contest, the app container's event loop is busy polling the database. There is no backpressure mechanism. The system will slow down before it fails, and there is no metric that tells me "you are at 80% SSE capacity."

6. **Recovery from a stuck submission queue.** If the worker crashes and submissions are stuck in `judging` status, the stale claim timeout is 5 minutes. But there is no admin API to manually release stuck submissions. I have to write a SQL query: `UPDATE submissions SET status = 'pending', judge_claim_token = NULL, judge_claimed_at = NULL WHERE status IN ('queued', 'judging') AND judge_claimed_at < NOW() - INTERVAL '5 minutes'`. This should be a button in the admin UI.

7. **The X-Forwarded-For trust boundary.** If I put a CDN or WAF in front of the app, the rate limiting keys will be based on the `X-Forwarded-For` header, which can be spoofed. I need to configure the app to trust only the proxy's IP for `X-Forwarded-For`, but I do not see this configuration anywhere.

---

## Summary Table

| Area | Rating | Key Strength | Key Weakness |
|------|--------|--------------|--------------|
| Deployment | 6/10 | Incident-hardened script, pre-deploy backups | No zero-downtime, stop-then-start |
| Worker Management | 7/10 | Proper lifecycle, Rust worker, horizontal scaling | No auto-failover, quiet heartbeat failures |
| User Management | 6/10 | Bulk creation, API keys, RBAC | No CSV import, no LDAP/SAML, weak must-change-pw |
| Monitoring | 5/10 | Prometheus endpoint, health snapshots | No latency metrics, no worker metrics, no log shipping |
| Backup & Recovery | 5/10 | Multiple backup paths, incident-driven safety | No automated schedule, no PITR, no granular restore |
| Security | 7/10 | Multi-tier rate limiting, sandbox hardening | Default-open IP allowlist, plaintext secretToken column |
| Resource Management | 5/10 | Language presets, admin image API | 30 GB images, no disk monitoring, no registry |
| Logging & Audit | 6/10 | Batched audit events, break-glass model | Buffer overflow drops events, no structured taxonomy |
| Scalability | 4/10 | Correct claim SQL, advisory locks | Single-instance only, low pool/queue defaults |
| **Overall** | **5.6/10** | | |

---

## Top 3 Recommendations

1. **Add automated daily backups with PITR.** Configure PostgreSQL WAL archiving in `docker-compose.production.yml`. Add a cron setup to the deploy script output. This is the single highest-impact change for operational safety.

2. **Tune the default capacity for production exam loads.** Increase `DATABASE_POOL_MAX` to at least 50, `SUBMISSION_GLOBAL_QUEUE_LIMIT` to at least 500, and document the `APP_INSTANCE_COUNT=1` constraint with its implications. Add a "capacity planning" section to the deployment docs.

3. **Add per-worker metrics and a queue depth dashboard.** Expose `judge_worker_active_tasks` and `judge_worker_available_slots` as Prometheus gauges. Add a `judgekit_submissions_by_status` gauge (pending, queued, judging, accepted, rejected). These two metrics would eliminate the "blind during an exam" problem.
