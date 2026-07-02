# Critic Review — JudgeKit Multi-Perspective Critique

Date: 2026-07-03  
Scope: entire repository (`/tmp/judgekit-local`) — `src/`, `judge-worker-rs/`, `rate-limiter-rs/`, `code-similarity-rs/`, `docker/`, `scripts/`, `deploy-docker.sh`, `deploy.sh`, `deploy-test-backends.sh`, `docker-compose*.yml`, `Dockerfile*`, `static-site/`, `docs/`, `tests/`.

## Verdict

REVISE. Cycle 3 remediation resolved many pointed correctness and security bugs, but four CRITICAL systemic risks remain untouched, and several HIGH/MEDIUM design and operational hazards persist. The remaining issues are architectural rather than one-line fixes.

## Summary

I validated every Cycle 2 aggregate finding against the current tree and searched for fresh cross-cutting issues. Cycle 3 fixed the majority of immediate correctness problems: workspace leaks, similarity-check concurrency, CSRF on public auth routes, monotonic rate-limiter clock, request/correlation IDs, nginx body size and XFF chain, security headers, non-root worker user, language contract test, and others.

However, the highest-severity systemic risks are still present: production defaults to `AUTH_TRUST_HOST=true` without stripping `X-Forwarded-Host`, internal service traffic is unencrypted HTTP, the judge API allowlist defaults to allow-all, and raw SQL additive schema patches bypass the Drizzle migration journal. In addition, a fresh discrepancy was found between the generated app nginx (50 MiB catch-all) and the committed standalone template (1 MiB catch-all), and the real-time coordination layer remains a hard PostgreSQL lock bottleneck.

For ACCEPT-WITH-RESERVATIONS, at minimum `AUTH_TRUST_HOST`, judge IP allowlist defaults, and the raw SQL patch must be resolved. For ACCEPT, internal service encryption/mTLS and a scalable real-time coordination backend must also be addressed.

## Validated Cycle 3 fixes (brief)

- `client_max_body_size 50M` is in the generated catch-all `location /` (`deploy-docker.sh:1629`, `1707`).
- XFF chain preserved via `$proxy_add_x_forwarded_for` in generated and committed nginx templates.
- Security headers added to generated, static-site, and committed nginx configs.
- Docker networks segmented (`frontend/backend/judge/db`) in `docker-compose.production.yml`.
- `docker-proxy` no longer has `BUILD=1` or `IMAGES=1` on the app host.
- `Dockerfile.judge-worker` ends with `USER judge`.
- Node compiler workspace cleanup chowns back to the app user (`execute.ts:365-384`).
- Rust `SandboxWorkspace` handles recursive chown-on-drop cleanup.
- `code-similarity-client.ts` propagates caller `AbortSignal` and returns structured error codes.
- `code-similarity.ts` serializes store operations per assignment via `pg_advisory_xact_lock`.
- Similarity-check route only reports `timed_out` for genuine `AbortError`.
- Token revocation compares at millisecond precision (`session-security.ts:36-41`).
- Public auth routes now call `validateCsrf`.
- CSRF origin check honors `allowedHosts` via `getTrustedAuthHosts`.
- `/api/v1/compiler/run` checks `content.submit_solutions` before `gateSandboxEndpoint`.
- `deploy-test-backends.sh` uses a dedicated migration container with `npm install drizzle-kit`.
- `createApiHandler` emits request/correlation ID and error taxonomy.
- Rate-limiter sidecar uses monotonic `Instant`.
- `SecretString` zeroizes on drop.
- Worker `deregister` returns `Err` on non-2xx responses.
- `sshpass -p` removed from deploy scripts.

---

## Findings

### CRITICAL-1: Production defaults to `AUTH_TRUST_HOST=true` and nginx does not strip `X-Forwarded-Host`

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `deploy-docker.sh:750`, `docker-compose.production.yml:115`, `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:317`
- **Problem:** `deploy-docker.sh` generates `.env.production` with `AUTH_TRUST_HOST=true` and enforces the literal value during backfill; `docker-compose.production.yml` defaults it to `true`; `shouldTrustAuthHost()` returns `true` whenever the env var is set to `"true"`. The generated nginx templates overwrite `Host` but deliberately do **not** set or clear `X-Forwarded-Host` because of a comment that it breaks Next.js 16 RSC navigation (`deploy-docker.sh:1598`, `1613`, `1625`, `1638`, `1676`, `1691`, `1703`).
- **Failure scenario:** An attacker sending direct requests to the origin with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate callback URLs, password-reset links, email magic links, or session state bound to an attacker-controlled host. If OAuth providers or magic-link flows are enabled later, this becomes an account-takeover vector. Today it weakens CSRF origin checks that rely on `AUTH_URL`.
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is explicitly set; derive canonical URLs only from `AUTH_URL` and DB `allowedHosts`. In nginx, explicitly overwrite `X-Forwarded-Host` with the canonical host before proxying to the app, and verify that RSC navigation still works under that canonical host.

### CRITICAL-2: Internal service traffic is unencrypted HTTP on a segmented but flat Docker network

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `docker-compose.production.yml:116-118`, `151`, `src/lib/assignments/code-similarity-client.ts:4`, `src/lib/compiler/execute.ts:69`
- **Problem:** Network segmentation exists (`frontend/backend/judge/db`), but all inter-service URLs are plaintext HTTP: `COMPILER_RUNNER_URL=http://judge-worker:3001`, `CODE_SIMILARITY_URL=http://code-similarity:3002`, `RATE_LIMITER_URL=http://rate-limiter:3001`, `JUDGE_BASE_URL=http://app:3000/api/v1`.
- **Failure scenario:** A compromised sidecar or auxiliary container on the `backend` network can passively sniff bearer tokens (`JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`), hidden test cases in claim responses, submission source code, and worker secrets.
- **Suggested fix:** Add mTLS or at least TLS between services using an internal CA and short-lived certificates; or move to Unix sockets where feasible. Encrypt `JUDGE_BASE_URL`, `COMPILER_RUNNER_URL`, `CODE_SIMILARITY_URL`, and `RATE_LIMITER_URL`.

### CRITICAL-3: Judge API IP allowlist defaults to allow-all in production

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/judge/ip-allowlist.ts:17-25`, `209-232`; `deploy-docker.sh:746-770`; `docker-compose.production.yml`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file does not set either variable, and the generated `.env.production` does not populate an allowlist. The code logs a one-time warning, but the open posture ships by default. The file comment explicitly states the unset==allow-all default is deliberately preserved for backward compatibility.
- **Failure scenario:** A leaked `JUDGE_AUTH_TOKEN` (via env backup, CI log, container inspect, or unencrypted backup) lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register. Document the break-the-glass override for legacy deployments.

### CRITICAL-4: Raw SQL additive schema patch bypasses the Drizzle migration journal

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `deploy-docker.sh:1207-1293`; `src/lib/db/migrate.ts:1-7`; `src/lib/judge/auth.ts:75-82`
- **Problem:** Step 5b inlines a `psql` backfill/drop for `judge_workers.secret_token` (`UPDATE ... SET secret_token_hash = encode(sha256(secret_token::bytea), 'hex') ...; ALTER TABLE judge_workers DROP COLUMN IF EXISTS secret_token`). This runs before `drizzle-kit push` and is not captured in the Drizzle journal. The file acknowledges that drizzle-kit ignores SQL files in the journal.
- **Failure scenario:** A disaster-recovery replay from the journal produces a schema still containing `secret_token` or missing the hash cleanup; `src/lib/judge/auth.ts` rejects workers with `secret_token IS NOT NULL AND secret_token_hash IS NULL`, causing all worker registrations to fail after DR. Conversely, a fresh environment stood up from backups and migrations may lack the column cleanup and queries fail at runtime.
- **Suggested fix:** Move the transition into a tracked Drizzle migration, or remove the backfill entirely once all environments are verified clean and add a journal-only migration for the final drop. Add a CI step that replays migrations from an empty database and asserts the schema matches what `deploy-docker.sh` would produce after its raw SQL step.

---

### HIGH-1: Real-time coordination serializes every SSE acquisition and heartbeat through PostgreSQL advisory locks

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/realtime/realtime-coordination.ts:73-78`, `101-140`, `163-199`
- **Problem:** `withPgAdvisoryLock("realtime:sse:acquire", ...)` wraps global/user SSE slot acquisition; per-assignment/user heartbeats also take an advisory lock. The module explicitly warns that multi-instance deployments require `REALTIME_COORDINATION_BACKEND=postgresql`, which serializes every SSE acquisition and heartbeat update through `pg_advisory_xact_lock` and a single table.
- **Failure scenario:** A contest with 1,000 concurrent users opens. Every SSE connection attempt acquires an advisory lock and performs `DELETE + SELECT count(*) + INSERT` in a transaction. Lock contention and table bloat cause connection acquisition latency to spike, degrading the live submission-status experience and potentially timing out heartbeats.
- **Suggested fix:** Replace advisory-lock serialization with Redis-backed coordination or at least a dedicated connection-pool/queue with TTL-indexed cleanup and optimistic locking. If PostgreSQL remains the backend, switch to `INSERT ... ON CONFLICT` with partial indexes and avoid holding advisory locks during cross-service calls.

### HIGH-2: Docker socket proxy still grants broad container lifecycle privileges

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `docker-compose.production.yml:69-90`; `docker-compose.worker.yml:22-43`
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1`. While `BUILD=0` and `IMAGES=0` were removed from the app host, the worker can still create, start, stop, and delete arbitrary containers on the host Docker daemon.
- **Failure scenario:** A compromised worker sends Docker API requests through the proxy to spawn a privileged container with `--pid=host` or host volume mounts, escaping the sandbox and gaining host access.
- **Suggested fix:** Restrict the proxy to a narrowly scoped filter or use a custom authorizer. Alternatively, run the worker with a read-only Docker API client that can only manage containers with a specific label prefix. Log every Docker API operation at the proxy or worker level for audit.

### HIGH-3: `deploy-docker.sh` exceeds modularization threshold and couples unrelated concerns

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `deploy-docker.sh` (~1,100+ lines)
- **Problem:** A single shell script performs SSH setup, remote architecture detection, env generation, Docker builds (app + worker + ~100 languages), BuildKit recovery, DB migration, raw SQL additive patches, nginx generation, container lifecycle, health checks, artifact pruning, and worker-host reconciliation. Any failure late in the script leaves prior mutations applied with no automated rollback.
- **Failure scenario:** A typo in the nginx heredoc causes the deploy to fail after migrations have already run and new app/worker containers have started. The operator must manually determine whether to roll back the DB, restart old containers, or fix the template and re-run. During incident response this ambiguity extends downtime.
- **Suggested fix:** Split the script into modules: `lib/ssh.sh`, `lib/nginx.sh`, `lib/migrate.sh`, `lib/build.sh`, and a thin orchestrator. Add an explicit rollback manifest and `--rollback` flag. Add a `--dry-run` mode that renders configs without mutating the target.

### HIGH-4: Rate-limiting has two sources of truth (sidecar + DB)

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/security/api-rate-limit.ts`; `rate-limiter-rs/src/main.rs`
- **Problem:** API rate limits use the `rate-limiter-rs` sidecar as a fast pre-check, then always hit the DB as the authoritative source. The sidecar is stateful and in-memory; if it restarts, its counters reset, while the DB path continues. The sidecar circuit breaker is process-local, so a multi-instance deployment sees inconsistent sidecar health.
- **Failure scenario:** An attacker exceeds the rate limit. The sidecar says blocked, but a DB race or clock-skew handling difference allows one request through before the DB path also blocks, producing non-deterministic 429s that are hard to explain to users or incident responders.
- **Suggested fix:** Make the DB the single source of truth and use the sidecar only as a cache with bounded TTL and explicit invalidation; or move entirely to Redis-backed rate limiting shared across instances. Document the fallback behavior when the sidecar is unreachable.

### HIGH-5: Role/capability authorization is split across role names and capability strings

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Files / Lines:** `src/lib/security/constants.ts`; `src/lib/capabilities/cache.ts`; `src/lib/db/schema.pg.ts`
- **Problem:** Roles are stored as text in `users.role` with a foreign-key reference to `roles.name`, but capabilities are checked at runtime from the role. There is no database-enforced guarantee that a role's capabilities are consistent with its name, and custom roles can silently lose required capabilities.
- **Failure scenario:** An operator renames the `admin` role in the DB. The `users.role` FK restricts deletion but not capability mapping, so existing admins keep their role name but `resolveCapabilities` may return an empty set, locking them out of admin endpoints. Conversely, a custom role created via the admin UI may lack capabilities required by routes it is expected to use.
- **Suggested fix:** Store capabilities in the DB with a foreign-key relationship and enforce a role-capability mapping constraint; or move authorization to a capability-centric model where role names are display-only. Add a startup integrity check that warns if any role has zero capabilities.

### HIGH-6: Standalone nginx template still uses `client_max_body_size 1m` in catch-all `location /`

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `scripts/online-judge.nginx.conf:60`, `85`, `95`; contrast `deploy-docker.sh:1629`
- **Problem:** While the generated `deploy-docker.sh` nginx now sets 50 MiB in the catch-all `location /`, the committed standalone template `scripts/online-judge.nginx.conf` still sets `client_max_body_size 1m` in the catch-all block (`location /`) and in `/api/v1/judge/`. The aggregate finding was that uploads, restore, and imports larger than 1 MiB would be rejected. The HTTP-only template (`scripts/online-judge.nginx-http.conf`) has 50 MiB already.
- **Failure scenario:** An operator using the committed standalone HTTPS template (manual install, dev/CI, or a host not using `deploy-docker.sh`) will see 413 errors on file uploads, backup restore ZIPs, and JSON imports larger than 1 MiB.
- **Suggested fix:** Align the standalone HTTPS template's catch-all `client_max_body_size` with the generated config (50 MiB) or with the system setting. Remove the stale 1 MiB defaults from `/api/v1/judge/` unless they are intentionally scoped.

### HIGH-7: Admin restore/import responses still leak server-side snapshot path

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/app/api/v1/admin/restore/route.ts:170`, `196`, `207`, `229`, `239`; `src/app/api/v1/admin/migrate/import/route.ts:115-142`
- **Problem:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers and is also included in the durable audit log details sent to the client.
- **Failure scenario:** A compromised admin account, malicious browser extension, or accidentally shared API response reveals the exact host path layout (e.g., `/home/deployer/data/pre-restore-snapshots/...`), which aids lateral movement and targeted file access.
- **Suggested fix:** Return only a snapshot ID or timestamp that operators can correlate with server logs; log the full path server-side. Remove `preRestoreSnapshotPath` from user-facing error and success payloads.

### HIGH-8: `GET /api/v1/files` has no rate limit

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/app/api/v1/files/route.ts:155-208`
- **Problem:** The file-list endpoint is wrapped with `createApiHandler` but omits a `rateLimit` key. It performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search over filenames.
- **Failure scenario:** An authenticated attacker can scrape or brute-force paginated file lists without throttling, driving unnecessary database load and potentially enumerating every uploaded file's metadata.
- **Suggested fix:** Add `rateLimit: "files:list"` (or reuse `files:upload`) to the `GET` handler config.

### HIGH-9: Language configuration remains triplicated with only a partial contract test

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/judge/languages.ts`; `judge-worker-rs/src/types.rs`; `judge-worker-rs/src/languages.rs`; `tests/unit/infra/language-contract.test.ts`
- **Problem:** The same language list and command templates are authored in TypeScript, Rust, and the database. The contract test compares the TypeScript `Language` union, Rust `Language` enum, and `JUDGE_LANGUAGE_CONFIGS` map, but does not verify runtime DB `language_configs` rows against the compiled definitions.
- **Failure scenario:** An admin enables a language that exists in the DB but whose Rust enum variant is missing or spelled differently; the worker deserializes the claim request and the submission hangs/fails with an internal parse error. Conversely, a Rust-only language cannot be selected from the UI because the TS union lacks it.
- **Suggested fix:** Add a runtime sync/validation job that asserts every enabled DB `language_configs` row has a matching TS union member and Rust enum variant, and reject enabling mismatched languages in the admin UI.

### HIGH-10: Function-judging literal values are not validated against target-language ranges

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Risk
- **Files / Lines:** `src/lib/judge/function-judging/types.ts:47-57`
- **Problem:** `functionSpecSchema` validates scalar/array types and identifiers, but never checks that test-case literal values fit within the target language's representable range.
- **Failure scenario:** An author enters a Java `long` larger than `Long.MAX_VALUE` or a `double` that the target harness cannot represent, producing wrong verdicts or harness crashes.
- **Suggested fix:** Add per-type range validation that rejects out-of-range literals at problem authoring time, with target-language-specific limits.

---

### MEDIUM-1: Deployment/infrastructure tests verify string presence, not rendered behavior

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/infra/deploy-security.test.ts`; `tests/unit/infra/judge-report-nginx.test.ts`
- **Problem:** Tests assert that `deploy-docker.sh` contains specific substrings (e.g., `add_header X-Content-Type-Options`). They do not render the generated nginx config or validate proxy behavior.
- **Failure scenario:** `deploy-docker.sh` could contain a header inside an `if false; then ... fi` block and the storage-safety test would still pass. The XFF/body-size findings above are exactly the kind of drift these tests miss because they do not render and validate the generated config.
- **Suggested fix:** Add tests that run `deploy-docker.sh --dry-run` and parse the emitted nginx config with `nginx -t` or a real syntax check. Assert the rendered values, not source substrings.

### MEDIUM-2: Deprecated migrate/import JSON path still accepts password in request body

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/app/api/v1/admin/migrate/import/route.ts:145-185`
- **Problem:** The endpoint still supports a JSON body of `{ password, data }` and validates the admin password from the request body. It logs a deprecation warning and adds `Deprecation`/`Sunset` headers, but the path remains functional until November 2026.
- **Failure scenario:** Any reverse proxy, WAF, or debug middleware that logs request bodies will capture the admin password in plaintext. This is exactly the scenario the multipart path was introduced to avoid.
- **Suggested fix:** Remove the JSON path, or gate it behind an env flag that defaults to off before the stated sunset. Emit a rate-limited `SECURITY_ALERT` log if the legacy path is used.

### MEDIUM-3: Unit of work / transaction boundary discipline is inconsistent

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Files / Lines:** `src/lib/db/index.ts`; multiple route handlers
- **Problem:** `execTransaction` wraps callbacks in a Drizzle transaction, but `rawQueryOne`/`rawQueryAll` use the global pool and do not participate in an open transaction. The codebase uses `transactionContext` (AsyncLocalStorage) only to detect this mistake, not to route queries to the transaction client. Many route handlers perform multiple DB operations without an explicit transaction.
- **Failure scenario:** A submission creation writes the submission row, increments pending count, and logs an audit event in separate calls. If the process crashes between calls, the DB is left inconsistent (submission exists but audit event is missing, or pending count is wrong).
- **Suggested fix:** Route raw queries through the transaction client when inside `execTransaction`, and refactor multi-step handlers to use explicit transactions. Add a lint rule or runtime assertion that detects raw queries outside a transaction context in state-changing routes.

### MEDIUM-4: Docker Compose lacks explicit bridge isolation from host networks

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Files / Lines:** `docker-compose.production.yml:215-222`
- **Problem:** Networks are segmented (`frontend/backend/judge/db`) but the compose file does not set `internal: true` on the `db` or `judge` networks, and the `frontend` network is implicitly attached to the app. If `ports:` are added later or a service is misconfigured with `network_mode: host`, the segmentation is bypassed.
- **Failure scenario:** A future change exposes `db:5432` or `judge-worker:3001` on the host interface by accident, allowing lateral movement from a compromised container.
- **Suggested fix:** Mark the `db` and `judge` networks as `internal: true` so they cannot reach the external network. Document which services must be reachable from outside and pin those to `frontend` only.

### MEDIUM-5: No documented operational rollback runbook for `deploy-docker.sh`

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `deploy-docker.sh`; `docs/ops/`
- **Problem:** The deploy script performs many mutations (image builds, container starts, migrations, nginx reload, worker reconciliation) without a rollback manifest or documented recovery procedure.
- **Failure scenario:** A deploy fails partway through. The operator has no authoritative list of what changed and must reverse-engineer the state before deciding whether to re-run or roll back.
- **Suggested fix:** Add a runbook and/or a `--rollback` flag that uses a manifest file recorded at deploy start. Include rollback steps for DB (pre-deploy backup), containers (previous image tags), and nginx (previous config).

### MEDIUM-6: Judge worker IP allowlist auto-population is missing

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Files / Lines:** `deploy-docker.sh`; `docker-compose.production.yml`
- **Problem:** There is no mechanism that auto-detects worker host IPs and seeds `JUDGE_ALLOWED_IPS` during deploy. The variable is left empty, which silently enables allow-all mode.
- **Failure scenario:** Operators following the default deploy path end up with an open judge API even though the intended architecture has a dedicated worker host.
- **Suggested fix:** During deploy, detect the worker container/service IP range and write it into `.env.production` as `JUDGE_ALLOWED_IPS`. If detection fails, fail closed with `JUDGE_STRICT_IP_ALLOWLIST=1` and require manual configuration.

### MEDIUM-7: Container lifecycle audit logging is absent

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `docker-compose.production.yml:69-90`; `docker-compose.worker.yml:22-43`
- **Problem:** The Docker socket proxy does not log which container operations were performed. Worker logs may log high-level actions, but the proxy itself is silent.
- **Failure scenario:** A compromised worker creates a privileged container. There is no centralized record of the Docker API call, hampering incident response and forensic reconstruction.
- **Suggested fix:** Add an audit logger in front of the Docker socket proxy, or configure the proxy to log requests. Ship those logs to the same centralized log sink used by the app.

### MEDIUM-8: `AUTH_TRUST_HOST=true` comment conflates reverse-proxy use with trusting arbitrary Host headers

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `deploy-docker.sh:874-877`
- **Problem:** The comment states `AUTH_TRUST_HOST` must be `true` "when behind a reverse proxy." This conflates "behind a reverse proxy" with "trust arbitrary Host/X-Forwarded-Host headers."
- **Failure scenario:** Future maintainers read the comment and leave the default in place, perpetuating the host-header trust vulnerability.
- **Suggested fix:** Rewrite the comment to explain that `AUTH_TRUST_HOST` should be `false` when `AUTH_URL` is fixed, and that nginx must canonicalize `X-Forwarded-Host` before proxying.

### MEDIUM-9: Real-time coordination warns but does not fail when multi-instance is undeclared

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Files / Lines:** `src/lib/realtime/realtime-coordination.ts:205-218`
- **Problem:** `warnIfSingleInstanceRealtimeOnly` logs a warning when the backend is process-local and no instance count is declared. In production this is treated as a warning, not a startup failure.
- **Failure scenario:** An operator scales the app to two replicas without setting `REALTIME_COORDINATION_BACKEND=postgresql`. Each instance maintains its own local SSE slot table; users connected to different instances exceed per-user limits silently.
- **Suggested fix:** In production, treat undeclared multi-instance realtime as a fatal startup error unless an explicit opt-out env var is set. Alternatively, default to the PostgreSQL backend in production.

---

## Fresh cross-cutting issues (not in Cycle 2 aggregate)

1. **Standalone HTTPS nginx template body-size regression.** `scripts/online-judge.nginx.conf:95` sets `client_max_body_size 1m` in the catch-all `location /`, contradicting the generated `deploy-docker.sh` value of 50 MiB. This creates a manual-install/dev regression.
2. **`AUTH_TRUST_HOST` documentation is misleading.** The deploy comment frames the setting as required for reverse-proxy use rather than as a dangerous fallback, increasing the risk it remains enabled.
3. **`APP_INSTANCE_COUNT=1` hides the realtime bottleneck.** `docker-compose.production.yml:114` sets the instance count to 1, so the single-instance guard is not triggered and operators may not realize the PostgreSQL advisory-lock path is the only shared backend.

---

## Distinguishing confirmed, likely, and validation-needed

**Confirmed issues** (directly observable in current source/config): CRITICAL-1 through CRITICAL-4, HIGH-1 through HIGH-9, MEDIUM-1 through MEDIUM-3, MEDIUM-5, MEDIUM-7, MEDIUM-8.

**Likely issues / design risks** (consequences follow from confirmed architecture but require load or incident to observe): HIGH-10, MEDIUM-4, MEDIUM-6, MEDIUM-9.

**Risks needing manual validation:**
- Whether `scripts/online-judge.nginx.conf` is still used by `deploy.sh` or any production host.
- Whether the `judge_workers.secret_token` column is verified absent in all production environments so the raw SQL backfill can be removed per its sunset criterion.
- Observed p99 latency of `acquireSharedSseConnectionSlot` under multi-instance load.
- Whether any WAF, reverse proxy, or debug middleware logs request bodies to the deprecated `/api/v1/admin/migrate/import` JSON path.

---

## Commonly missed cross-cutting issues (final sweep)

- **No internal TLS/mTLS design document.** The env wiring and compose networks assume plaintext HTTP forever.
- **No DR schema contract test.** There is no CI step that replays migrations from an empty database and asserts the schema matches what `deploy-docker.sh` would produce after its raw SQL step.
- **No documented rate-limiter sidecar failure mode.** When the sidecar is unreachable, behavior is unspecified beyond "fall through to DB."
- **No migration path from PostgreSQL advisory locks to Redis.** The realtime module lists Redis as unsupported (`UNSUPPORTED_BACKENDS = new Set(["redis"])`).
- **No container-operation audit log.** The Docker socket proxy is a silent high-privilege component.
- **File-upload rate-limit parity is broken.** `POST /api/v1/files` has a rate limit while `GET /api/v1/files` does not, and the GET endpoint is more expensive.

---

## Multi-perspective summary

- **Security engineer:** The three CRITICAL findings (host-header trust, plaintext internal traffic, judge allow-all) form a chained attack surface. A compromised worker or sidecar can sniff tokens, then use them from any IP to register fake workers or inject verdicts. The lack of internal encryption is the largest residual risk.
- **New hire:** The deploy script is intimidating and not modular; understanding which step failed and how to recover requires reading ~1,100 lines of bash. The raw SQL backfill has a sunset criterion but no automated verification that the criterion is met.
- **Ops engineer:** The real-time coordination layer will become a DB bottleneck during large contests. The deploy script has no rollback. The two-source-of-truth rate limiter will produce confusing incident data during partial outages.
- **Stakeholder:** Cycle 3 has materially improved safety and correctness, but the unresolved systemic items still expose the platform to host-header attacks, lateral movement, and scalable-contest failures.

---

## Open questions

1. Is `scripts/online-judge.nginx.conf` still used by `deploy.sh` or any production host?
2. Has the `judge_workers.secret_token` column been verified absent in all production environments so the raw SQL backfill can be removed?
3. What is the observed p99 latency of `acquireSharedSseConnectionSlot` under multi-instance load?
4. Are there plans to move the rate-limiter sidecar state to Redis or the DB entirely?
5. Does the Docker socket proxy log container operations anywhere, or is audit coverage limited to worker application logs?
