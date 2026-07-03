# Strategic Architecture Review — JudgeKit (/tmp/judgekit-local)

**Scope:** Next.js 16 app/API, Rust judge worker and sidecars, Docker-sandboxed execution, PostgreSQL, deployment toolchain.  
**Date:** 2026-07-03  
**Confidence labels:** High / Medium / Low  

---

## Summary

JudgeKit's architecture has been substantially hardened through the recent remediation cycles: Docker networks are segmented, the worker container runs as a non-root user, the Docker socket proxy no longer permits image deletion, the DB raw-query helpers participate in active transactions, CSRF origin checks integrate the DB `allowedHosts` list, token revocation uses millisecond precision, and the Rust sidecars (`rate-limiter-rs`, `code-similarity-rs`) now fail closed when their auth tokens are missing.  These fixes close several acute risks.

However, the design still carries structural debt that will limit scale and operational safety:

- **PostgreSQL remains the coordination bus** for real-time SSE slots, heartbeats, and code-similarity serialization.  Advisory locks and a single shared table are not a sustainable horizontal-scaling pattern.
- **Language configuration is still triplicated** across TypeScript, Rust, and the database, with only a one-way sync script and no contract test.
- **The deployment pipeline is still a single ~1,800-line shell script** that mixes build, migration, raw SQL patching, nginx generation, health checks, and cleanup with no per-phase rollback.
- **Configuration resolution is scattered** across environment variables, a single-row `system_settings` table, and hardcoded defaults, with a 15-second in-memory cache that can serve stale values after invalidation.
- **Internal service traffic is still unencrypted HTTP** on Docker bridge networks; bearer tokens, hidden test cases, and source code cross the wire in plaintext between app, worker, rate-limiter, and code-similarity.
- **Two deliberate back-compat defaults** remain architecturally risky: `AUTH_TRUST_HOST=true` in production and a judge API IP allowlist that defaults to allow-all.
- **The app server can still be coaxed into local Docker work.**  `src/lib/docker/client.ts` and `src/lib/compiler/execute.ts` both contain local-fallback paths that violate the documented algo/app vs worker role split.
- **The web server process owns too much operational state.**  Startup validation, background maintenance timers, and worker staleness sweeps all run inside Next.js `instrumentation.ts`.
- **File uploads are tied to local filesystem storage** with no abstraction, quota, or replication story for horizontal scale.

The highest-priority architectural fixes are: replace PostgreSQL advisory-lock coordination with a purpose-built state store, establish a single source of truth for language configuration with a contract test, decompose the deploy script into phase modules with rollback, add TLS/mTLS or at least strict network segmentation between internal services, and close the local-Docker-admin fallback on the app server.

---

## Inventory of Files Examined

| Layer | Path(s) | Notes |
|---|---|---|
| Aggregate baseline | `.context/reviews/_aggregate.md` | Prior multi-agent findings used as the validation baseline. |
| Production topology | `docker-compose.production.yml`, `docker-compose.worker.yml` | App, worker, db, docker-proxy, code-similarity, rate-limiter, networks. |
| App build | `Dockerfile`, `next.config.ts` | Standalone output, security headers. |
| Worker build | `Dockerfile.judge-worker` | Non-root `USER judge` final stage. |
| Deployment | `deploy-docker.sh`, `deploy.sh`, `static-site/nginx.conf` | Monolithic deploy script, deprecated legacy script, committed static nginx template. |
| API handler / auth | `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/auth/config.ts`, `src/lib/security/env.ts`, `src/lib/security/csrf.ts`, `src/lib/auth/session-security.ts`, `src/lib/auth/permissions.ts` | Common route wrapper, user resolution, NextAuth config, env validation, CSRF, token revocation, permission checks. |
| DB / ORM | `src/lib/db/index.ts`, `src/lib/db/queries.ts`, `src/lib/db/schema.pg.ts`, `src/lib/db-time.ts` | Drizzle pool, AsyncLocalStorage transaction context, raw query helpers, schema. |
| Judge orchestration | `src/lib/judge/languages.ts`, `src/lib/judge/ip-allowlist.ts`, `src/lib/judge/auth.ts`, `src/lib/judge/worker-staleness-sweep.ts` | Language config, worker IP allowlist, worker token auth, stale-worker reap scheduler. |
| Compiler / execution | `src/lib/compiler/execute.ts`, `src/lib/docker/client.ts` | Local Docker fallback, shell-command validation, worker Docker API client. |
| Code similarity | `src/lib/assignments/code-similarity.ts`, `src/lib/assignments/code-similarity-client.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `code-similarity-rs/src/main.rs`, `code-similarity-rs/src/similarity.rs` | O(n²) TS fallback, Rust sidecar client, route handler, Rust implementation. |
| Rate limiting | `src/lib/security/rate-limit.ts`, `src/lib/security/rate-limiter-client.ts`, `rate-limiter-rs/src/main.rs` | DB authoritative path, Rust sidecar fast path. |
| Real-time | `src/lib/realtime/realtime-coordination.ts` | SSE slot acquisition and heartbeat dedup via advisory locks. |
| Rust worker | `judge-worker-rs/src/main.rs`, `judge-worker-rs/src/api.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/languages.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/workspace.rs` | Worker lifecycle, registration/deregistration, sandbox execution, runner API, workspace cleanup. |
| File storage | `src/lib/files/storage.ts` | Local-filesystem upload backend. |
| Instrumentation / startup | `src/instrumentation.ts`, `src/lib/system-settings-config.ts` | Next.js registration, background jobs, single-row DB settings with env overrides and in-memory cache. |

Dependency direction check: `src/lib/**` does not import from `src/app/**`; the graph remains top-down.

---

## Findings

### 1. PostgreSQL advisory locks are used for real-time coordination and similarity-check serialization

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/realtime/realtime-coordination.ts:73-78` (`withPgAdvisoryLock`)
  - `src/lib/realtime/realtime-coordination.ts:80-140` (`acquireSharedSseConnectionSlot`)
  - `src/lib/realtime/realtime-coordination.ts:146-203` (`shouldRecordSharedHeartbeat`)
  - `src/lib/assignments/code-similarity.ts:424-438` (`withPgAdvisoryLock` for similarity-check delete+insert)
- **Problem:** SSE connection slots, heartbeat deduplication, and similarity-check runs are serialized through `pg_advisory_xact_lock` and a single shared table (`realtimeCoordination`).  Every SSE acquisition runs `DELETE` expired rows, `SELECT count(*)` global + per-user counts, and `INSERT` a new row inside one transaction holding an advisory lock.  Heartbeat dedup uses a per-key advisory lock.  This makes PostgreSQL the real-time coordination bus.
- **Failure scenario:** A large contest opens and 1,000 users connect simultaneously.  Each connection contends for the same `realtime:sse:acquire` advisory lock and performs aggregate counts on the shared table.  Lock wait times grow, connection acquisition latency spikes, and the live submission-status experience degrades even though the judge throughput is healthy.
- **Fix:** Move SSE/heartbeat coordination and similarity-check serialization to a purpose-built state store (Redis, NATS, or a dedicated coordination service).  Keep PostgreSQL as the durable source of truth for submissions and results, but not as the lock manager for high-frequency, short-lived coordination state.

### 2. Language configuration is triplicated with no generated contract

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/judge/languages.ts` — TypeScript `JUDGE_LANGUAGE_CONFIGS` and `Language`-like keys
  - `src/types/index.ts` — TypeScript `Language` union (referenced in summary)
  - `judge-worker-rs/src/types.rs` — Rust `Language` enum
  - `judge-worker-rs/src/languages.rs` — Rust `LanguageConfig` static data
  - `scripts/sync-language-configs.ts` — one-way DB sync at startup
  - `src/lib/db/schema.pg.ts` — `languageConfigs` table
- **Problem:** The language list, file extensions, Docker images, and command templates are authored separately in TypeScript, Rust, and the database schema/sync script.  Adding or renaming a language requires manually keeping three conventions aligned.  The worker reads DB overrides at runtime, but if the Rust enum or TypeScript union drifts, deserialization or UI selection fails.  There is no generated contract or CI test that proves the three sources agree.
- **Failure scenario:** An operator adds `zig` to the DB `languageConfigs` table and the TypeScript union, but forgets to add the `Zig` variant to `judge-worker-rs/src/types.rs`.  The app successfully schedules a `zig` submission; the worker deserializes the claim and fails to parse the language, reporting an internal compile error instead of judging the submission.
- **Fix:** Generate the TypeScript `Language` union and Rust `Language` enum from a single YAML/JSON manifest checked into the repo.  Add a CI contract test that asserts every manifest entry has a TS type, Rust enum variant, Dockerfile, DB sync entry, and identical default commands after sync.  Treat the manifest as the single source of truth.

### 3. `deploy-docker.sh` is a single monolithic script with no per-phase rollback

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:** `deploy-docker.sh:1-1800+` (entire file)
- **Problem:** One shell script performs SSH setup, architecture detection, env generation, Docker image builds (app, worker, ~100 language images), BuildKit recovery, DB migration via `drizzle-kit push`, raw SQL additive patches, nginx generation from inline heredocs, container lifecycle, health checks, artifact pruning, and worker-host reconciliation.  A failure late in the script leaves earlier mutations partially applied with no automated rollback path.  The script is also difficult to unit-test, review, and reuse.
- **Failure scenario:** A typo in the generated nginx heredoc causes the deploy to fail after migrations have already run and new app/worker containers have started.  The operator must manually decide whether to roll back the DB, restart the previous containers, or patch nginx and re-run.  During an incident this ambiguity extends downtime.
- **Fix:** Decompose `deploy-docker.sh` into phase scripts under `scripts/deploy/` (e.g., `01-build.sh`, `02-migrate.sh`, `03-up.sh`, `04-healthcheck.sh`, `05-prune.sh`) and make the main script a thin sequencer that captures per-phase state and supports `--rollback`.  Move nginx templates into static template files rendered by a small templater rather than inline heredocs.

### 4. Internal service traffic is unencrypted HTTP on shared Docker bridge networks

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `docker-compose.production.yml:115-118` (`COMPILER_RUNNER_URL=http://judge-worker:3001`, `RATE_LIMITER_URL=http://rate-limiter:3001`, `CODE_SIMILARITY_URL=http://code-similarity:3002`)
  - `docker-compose.production.yml:151` (`JUDGE_BASE_URL=http://app:3000/api/v1`)
  - `judge-worker-rs/src/config.rs` (accepts plain HTTP internal URLs)
- **Problem:** App, worker, rate-limiter, and code-similarity communicate over plain HTTP on Docker bridge networks.  A compromised sidecar or auxiliary container on any of these networks can sniff bearer tokens (`JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`), hidden test cases in claim responses, submission source code, and similarity-check payloads.
- **Failure scenario:** A vulnerability in the code-similarity sidecar allows an attacker to run arbitrary code inside that container.  Because the sidecar shares the `backend` network with the app and rate-limiter, the attacker can passively observe `RUNNER_AUTH_TOKEN` traffic and then issue Docker management commands to the worker runner API.
- **Fix:** Add TLS or mTLS at every internal service boundary.  At minimum, terminate TLS at each service using an internal reverse proxy or service mesh, and place worker/admin traffic on a dedicated network not shared by sidecars.  Rotate the static bearer tokens to short-lived credentials once mTLS is in place.

### 5. `AUTH_TRUST_HOST` defaults to `true` in production

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/security/env.ts:260-266` (`shouldTrustAuthHost`)
  - `docker-compose.production.yml:115` (`AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-true}`)
- **Problem:** In production, `shouldTrustAuthHost()` returns `true` unless `AUTH_TRUST_HOST` is explicitly set to something other than `"true"`.  NextAuth's `trustHost` flag disables host/origin validation for callback URLs, CSRF tokens, and session cookies.  This is documented as a deliberate backward-compatibility choice, but it weakens the authentication boundary in the default production configuration.
- **Failure scenario:** An operator deploys with the default `.env.production` generated by `deploy-docker.sh`.  `AUTH_TRUST_HOST` is not explicitly set, so it defaults to `true`.  An attacker who can send a request with a spoofed `Host` or `X-Forwarded-Host` header can trick the app into issuing session cookies for an attacker-controlled origin and exfiltrate auth callbacks.
- **Fix:** Change the production default to `false` and require operators to explicitly opt in to host trust.  Ensure `AUTH_URL` is always set in production and is the sole source of truth for the public origin.  Update `deploy-docker.sh` to emit `AUTH_TRUST_HOST=false` in generated `.env.production` unless the operator explicitly overrides it.

### 6. Judge API IP allowlist defaults to allow-all unless explicitly configured

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/judge/ip-allowlist.ts:16-242`
  - `src/lib/judge/ip-allowlist.ts:213-233` (`isJudgeIpAllowed` back-compat path)
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed` returns `true` for every client IP.  The code comments explain this is a deliberate backward-compatibility choice, but it means a leaked `JUDGE_AUTH_TOKEN` has no network-layer backstop.
- **Failure scenario:** A developer accidentally commits a `.env.production` snippet containing `JUDGE_AUTH_TOKEN` to a public gist.  An attacker who finds the token can submit fabricated judge results from any IP address because the allowlist is open by default.
- **Fix:** Flip the default to fail-closed in production.  Require either `JUDGE_ALLOWED_IPS` or an explicit `JUDGE_ALLOW_ANY_JUDGE_IP=1` opt-in.  Keep the current behavior only in development, and make `deploy-docker.sh` require `JUDGE_ALLOWED_IPS` during production setup.

### 7. Raw SQL additive patches bypass the Drizzle migration journal

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:** `deploy-docker.sh` (raw `psql` additive patches around migration phase)
- **Problem:** The deploy script applies additive schema changes via raw `psql` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) after `drizzle-kit push`.  Because the column already exists, `drizzle-kit push` does not generate a journal entry.  A disaster-recovery replay from the Drizzle journal therefore produces a schema missing those columns.
- **Failure scenario:** A new environment is stood up from backups and migrations.  Columns that were added only through raw `psql` pre-patches are absent; queries fail at runtime with "column does not exist".
- **Fix:** Eliminate raw `psql` pre-patches.  Add all schema changes through `drizzle-kit generate` so the journal remains the single source of truth.  If a zero-downtime additive change must happen outside `push`, wrap it in a committed journal migration.

### 8. `system_settings` cache can return stale values during background reload

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:** `src/lib/system-settings-config.ts:84-205`
- **Problem:** `getConfiguredSettings()` returns a 15-second in-memory cache.  When the TTL expires, it triggers an asynchronous DB reload and returns the previous cached value (or defaults if none).  For up to one TTL window after `invalidateSettingsCache()` is called, callers still see old values.  Settings-dependent code such as rate limits, queue limits, sandbox timeouts, and SSE limits therefore operates on stale thresholds.
- **Failure scenario:** An admin lowers `apiRateLimitMax` from 1,000 to 30 during an abuse incident and clicks Save.  `invalidateSettingsCache()` is called, but the next several hundred requests still see 1,000 because `getConfiguredSettings()` returned the old object while the DB reload was in flight.
- **Fix:** Make `getConfiguredSettings()` await the reload on the first cache miss after invalidation, or use an atomic swap that updates `cached` only after the new DB value resolves.  Alternatively, expose an explicit version counter in the `system_settings` row and reject stale reads.

### 9. Configuration resolution is scattered across env, DB, and hardcoded defaults

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/system-settings-config.ts:67-82` (`ENV_OVERRIDES` covers only a subset of settings)
  - `src/lib/system-settings-config.ts:40-64` (hardcoded defaults)
  - `src/lib/db/schema.pg.ts` (`system_settings` single-row table)
- **Problem:** Operational settings live in three places with overlapping authority.  Only some settings have env overrides; others require a DB write.  There is no generated documentation or runtime endpoint that shows the active source for each value.  New settings are frequently added without corresponding env overrides, making emergency config changes require database access.
- **Failure scenario:** During an incident an operator sets `SUBMISSION_GLOBAL_QUEUE_LIMIT=10` in `.env.production` and restarts, but the setting is not in `ENV_OVERRIDES`, so the DB value of 100 remains active.  The operator believes the limit is 10.
- **Fix:** Define a single schema for all tunable settings that declares default, env-var name, DB column, and validation rule.  Generate documentation and a runtime `/api/v1/admin/effective-config` endpoint from that schema.  Ensure every production-relevant knob has an env override.

### 10. Docker socket proxy still grants broad container lifecycle privileges

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:** `docker-compose.production.yml:64-95`
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `CONTAINERS=1 POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1`, while `BUILD=0` and `IMAGES=0` are correctly disabled.  The worker can still create, start, stop, and delete arbitrary containers on the host Docker daemon.  This is a large blast radius for a component whose only job is to run sandboxed judge containers.
- **Failure scenario:** A compromised worker sends Docker API requests through the proxy to spawn a privileged container with `--pid=host` or host bind mounts, escaping the sandbox and gaining host access.
- **Fix:** Run Docker rootless and add AppArmor/SELinux profiles to the worker.  Drop all capabilities from the worker container.  Consider splitting image management into a separate admin service that does not run submission containers.  If the proxy must remain, restrict it to container operations only for judge-* images using a more granular proxy or an authorizing proxy.

### 11. Middleware performs DB lookups in the Edge Runtime

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:** `src/proxy.ts` (`_proxy` performs JWT decode + active user DB lookup)
- **Problem:** The Next.js Edge Runtime is optimized for short, stateless, CPU-bound work.  The proxy middleware does a JWT decode and then a PostgreSQL query on many requests.  This couples every request to the DB, complicates cold-start behavior, and makes middleware behavior dependent on the same Drizzle/Node stack used by API routes.
- **Failure scenario:** A brief DB blip causes every page load and API request to fail at the middleware layer with 500, even for public pages, because the active-user lookup cannot complete.  The in-memory FIFO cache only softens this for already-cached users.
- **Fix:** Move non-critical auth refresh out of middleware.  Use middleware only for lightweight checks (JWT presence, cookie security, CSP nonce, locale).  Do the active-user DB lookup lazily in layouts/server components or API handlers, where failures can be handled per-route.

### 12. No API versioning strategy beyond the `/api/v1` path prefix

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:** `src/app/api/v1/**`, `src/lib/api/handler.ts`
- **Problem:** All routes are under `/api/v1/`, but there is no versioning machinery: no version header support, no deprecation markers, no backwards-compatibility tests, and no staged rollout mechanism.  As the UI and external consumers evolve, breaking changes will require global coordination.
- **Failure scenario:** A new front-end feature needs a different shape for `/api/v1/submissions`.  Because there is no v2, the change must be made in-place.  Mobile clients or third-party integrations that depended on the old shape break silently.
- **Fix:** Adopt a version negotiation scheme (URL path `/api/v2/...` or `Accept: application/vnd.judgekit.v2+json`).  Write compatibility tests for at least one previous version.  Document deprecation and sunset policy.

### 13. Rate-limiting has two sources of truth (sidecar + DB)

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/security/rate-limit.ts` — DB authoritative path
  - `src/lib/security/rate-limiter-client.ts` — sidecar client with circuit breaker; returns `null` on unreachable so callers fall back to DB
  - `rate-limiter-rs/src/main.rs` — in-memory DashMap sidecar
- **Problem:** Login/auth rate limits use the `rate-limiter-rs` sidecar as a fast pre-check, then fall back to the DB path when the sidecar is unreachable.  The sidecar is stateful and in-memory; if it restarts, its counters reset, while the DB path continues.  The two stores can disagree during partial outages, and the circuit breaker is process-local, so multi-instance deployments see inconsistent sidecar health.
- **Failure scenario:** An attacker exceeds the rate limit.  The sidecar says blocked, but a DB race or clock-skew handling difference allows one request through before the DB path also blocks.  The result is non-deterministic 429s that are hard to explain to users.
- **Fix:** Either make PostgreSQL the sole source of truth and remove the sidecar, or make the sidecar authoritative with a shared backing store (Redis) and explicit DB persistence only for audit.  Do not run both as decision makers.

### 14. Function-judging serialization boundary between TypeScript and Rust is implicit

- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Regions:**
  - `src/lib/judge/function-judging/` — TypeScript harness generation and serialization
  - `judge-worker-rs/src/languages.rs` — Rust command and adapter assumptions
- **Problem:** Function-signature problems are judged by assembling `prelude + studentCode + generatedMain` in TypeScript and sending the result to the Rust worker as an ordinary `auto` submission.  The serialization format expected by the generated harness must match what the TypeScript `serialization.ts` emits.  The Rust worker has no knowledge of function judging; if the harness format drifts, verdicts become silently wrong.
- **Failure scenario:** A change to `serialization.ts` adds a trailing newline.  The generated harness expects no trailing newline and parses the last token incorrectly, producing wrong-answer verdicts on valid submissions.
- **Fix:** Define a versioned function-judging protocol (e.g., `functionSpecVersion`) and have the Rust worker validate/reject unknown versions.  Add golden-file tests that compile and run every adapter harness and assert byte-identical output against `serialization.ts`.

### 15. Role/capability authorization is split across role names and capability strings

- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Regions:**
  - `src/lib/db/schema.pg.ts:20-63` (`users.role` references `roles.name`)
  - `src/lib/capabilities/` — capability registry
  - `src/lib/api/handler.ts:73-109` — auth config accepts roles and capabilities
- **Problem:** Authorization uses both role names (`admin`, `instructor`, etc.) and capability strings.  Roles are stored as text in `users.role` with a foreign-key reference to `roles.name`, but capabilities are checked at runtime from the role.  There is no database-enforced guarantee that a role's capabilities are consistent with its name, and custom roles can silently lose required capabilities.
- **Failure scenario:** An operator renames the `admin` role in the DB.  The `users.role` FK restricts deletion but not capability mapping, so existing admins keep their role name but `resolveCapabilities` may return an empty set, locking them out of admin endpoints.
- **Fix:** Persist capability assignments in the database with foreign-key integrity, or at minimum add a startup consistency check that warns/fails when built-in roles are missing required capabilities.  Treat role names as stable identifiers and document them as such.

### 16. Distributed request ID is not propagated to all internal services

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/api/handler.ts:116-121` (request ID generated and added to response)
  - `src/lib/docker/client.ts:167-204` (worker Docker API calls do not set `X-Request-Id`)
  - `src/lib/assignments/code-similarity-client.ts:51-113` (sidecar calls; no request/correlation ID header)
  - `src/lib/security/rate-limiter-client.ts` (sidecar calls; no request/correlation ID header)
- **Problem:** `createApiHandler` generates a `requestId` and returns it in the response, but outgoing calls to the worker Docker API, rate-limiter sidecar, and code-similarity sidecar do not appear to propagate this ID.  Cross-service logs therefore cannot be correlated for a single user request.
- **Failure scenario:** A submission result is slow.  Operators must correlate timestamps across app, worker, rate-limiter, and code-similarity logs manually because no shared ID links the app claim, worker execution, and result report.
- **Fix:** Store the request ID in AsyncLocalStorage at the edge and pass it in outgoing HTTP calls as `X-Request-Id` / `traceparent`.  Include it in all structured logs on both the TypeScript and Rust sides.

### 17. Settings-dependent values captured at module load time

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:** `src/lib/auth/config.ts:317-321`
- **Problem:** `authConfig.session.maxAge` is evaluated once at module load using `getSessionMaxAgeSeconds()`, which reads the system setting at that moment.  The comment acknowledges that changes to `sessionMaxAgeSeconds` require a server restart.  This is a common pattern elsewhere for env-driven constants.
- **Failure scenario:** An admin changes the session timeout in the UI.  Because `authConfig` is frozen at import, existing and new sessions continue to use the old TTL until the process restarts, violating user expectations and compliance requirements.
- **Fix:** Where settings are expected to be dynamic, resolve them per-request or per-token-issuance rather than at module load.  For NextAuth, set `maxAge` to the longest supported TTL and implement shorter effective expirations in the JWT `exp` claim based on current settings.

### 18. Test and production Docker networks differ in topology

- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Regions:** `docker-compose.yml` (dev), `docker-compose.production.yml`
- **Problem:** Local development builds language images via a separate `docker-compose.yml` that does not model the production network segmentation, sidecars, or proxy.  Network-isolation and sidecar behavior are therefore only exercised during deploys.
- **Failure scenario:** A bug in the rate-limiter sidecar integration only manifests in production because local dev never starts it.  CI also does not run the full production compose topology.
- **Fix:** Provide a `docker-compose.override.yml` or a dedicated `docker-compose.local-prod.yml` that mirrors production topology (app, worker, db, sidecars, docker-proxy) for local integration testing.

### 19. Static-site nginx is decoupled from app security headers

- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Regions:** `static-site/nginx.conf`, `next.config.ts`, `src/proxy.ts`
- **Problem:** The static site has its own nginx config.  While the recent hardening added security headers, it is maintained separately from the generated app nginx and Next.js headers.  Any future drift in CSP, HSTS, or X-Content-Type-Options creates a bypass path.
- **Failure scenario:** An attacker uploads a polyglot HTML/PNG file to a static-site-hosted asset.  The static site serves it without consistent CSP or X-Content-Type-Options, allowing the browser to render it as HTML and execute script in the site's origin.
- **Fix:** Unify security headers in a shared nginx include file used by both app and static-site configs.  Keep a single source of truth for the baseline header set.

### 20. Worker prewarming fires uncontrolled `docker run` commands at startup

- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Regions:** `judge-worker-rs/src/main.rs` (prewarm task)
- **Problem:** On registration, the worker spawns one `docker run --rm <image> true` per prewarm image with a timeout.  These are fire-and-forget tasks with no concurrency limit, error surfacing, or backpressure.  On a worker host with many languages, startup can generate a burst of Docker operations.
- **Failure scenario:** A worker restarts during a contest.  Prewarming many language images concurrently saturates the Docker daemon, delaying the first real submission claims.
- **Fix:** Cap prewarm concurrency (e.g., semaphore of 3), expose prewarm status via the health endpoint, and log aggregate success/failure metrics.  Consider moving prewarming to a background maintenance window rather than startup.

### 21. Schema enum columns lack database CHECK constraints

- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Regions:** `src/lib/db/schema.pg.ts` (`users.role`, `problems.problemType`, `problems.visibility`, `assignments.scoringModel`, etc.)
- **Problem:** Several `text()` columns encode enums without DB `CHECK` constraints.  The `assignments.exam_mode` table does add a check constraint, showing the pattern exists but is not applied consistently.  This allows invalid values to be inserted by migrations, raw SQL, or future bugs.
- **Failure scenario:** A migration or raw query inserts `problems.problemType = 'function_v2'`.  The application code does not recognize the value and falls through to default behavior, producing wrong-answer verdicts or UI errors.
- **Fix:** Add Drizzle `check` constraints for all enum-like text columns, or migrate to native PostgreSQL enums.  Generate the check list from the same source of truth used by the application types.

### 22. Build-phase DB connection uses a dummy connection string

- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Regions:** `src/lib/db/index.ts` (build-phase dummy connection string)
- **Problem:** During `NEXT_PHASE === "phase-production-build"`, `drizzle()` is initialized with a dummy connection string.  The comment says this is only for type-checking, but the module still constructs a real `Pool`-backed drizzle instance at import time.  If Drizzle ever changes to validate or connect eagerly, builds could fail or leak connections.
- **Failure scenario:** A Drizzle minor upgrade starts resolving the connection string during construction; production builds fail because `localhost:5432` is unreachable in the builder container.
- **Fix:** Build a stub drizzle instance that does not parse a connection string at all, or guard the import so that build-time code paths never instantiate a database client.

### 23. Docker admin client can fall back to local Docker on the app server

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/docker/client.ts:13-21` (`JUDGE_WORKER_URL` alias and `RUNNER_AUTH_TOKEN`)
  - `src/lib/docker/client.ts:49-50` (`ALLOW_LOCAL_DOCKER_ADMIN`)
  - `src/lib/docker/client.ts:97-148` (`getDockerManagementCapabilities`)
  - `src/lib/docker/client.ts:407-438`, `:504-545` (image list/build paths)
- **Problem:** The Docker management client chooses among "worker", "local", and "unavailable" modes based solely on environment variables at module load.  In production, setting `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN=1` enables local Docker CLI admin even though the project topology says the app server (`algo.xylolabs.com`) must never build or manage images.  The `JUDGE_WORKER_URL` alias for `COMPILER_RUNNER_URL` also blurs the runner/admin boundary.
- **Failure scenario:** An operator temporarily enables `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN=1` on `algo.xylolabs.com` to debug an image and forgets to unset it.  A missing `COMPILER_RUNNER_URL` later causes the admin UI to silently switch to local Docker mode and build images on the app server, violating the role split and exposing the host Docker socket to the app container.
- **Fix:** Remove the local-admin capability in production regardless of `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN`.  Restrict that flag to `NODE_ENV !== "production"`.  Rename or remove the `JUDGE_WORKER_URL` alias so admins cannot accidentally point image management at the submission API endpoint.

### 24. File uploads use local filesystem storage with no backend abstraction

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:** `src/lib/files/storage.ts:1-51`
- **Problem:** Uploaded files are stored in a local directory derived from `DATABASE_PATH` or the current working directory.  There is no storage abstraction, no content-addressability, no quota enforcement, no virus scanning hook, no encryption-at-rest, and no replication.  In production the app container must bind-mount a host directory, making file locality a hard constraint on horizontal scaling.
- **Failure scenario:** The app is scaled to two replicas behind a load balancer.  A user uploads a file to replica A and later requests it from replica B; the request fails because the file exists only on replica A's local disk.
- **Fix:** Introduce a `StorageBackend` interface with an S3-compatible implementation for production and a local-filesystem implementation for dev/tests.  Add size/quota checks and optional scan hooks.  Migrate production deployments to object storage so app servers remain stateless.

### 25. Next.js instrumentation bundles startup validation and background jobs into the web process

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:** `src/instrumentation.ts:1-47`
- **Problem:** `register()` runs environment validation, DB settings loading, language-config sync, and starts five background timers (rate-limit eviction, audit pruning, sensitive-data pruning, worker staleness sweep, audit flush-on-shutdown) inside the Next.js web server process.  A failure in any startup import or the first DB call can prevent the app from serving requests, and background work competes with request handling for CPU, memory, and event-loop time.
- **Failure scenario:** `syncLanguageConfigsOnStartup` fails because the DB is briefly unreachable during a rolling restart.  The web pods crash-loop and the site is down until the DB recovers, even though ordinary page/API requests do not require a language-config sync to succeed.
- **Fix:** Separate startup into "must succeed to serve" (env/secret validation) and "best effort" (settings refresh, language sync, background maintenance).  Run maintenance timers in a dedicated worker process or as external cron jobs.  Expose a `/health/ready` endpoint that reports which subsystems are healthy.

### 26. Worker API client falls back to the shared auth token when per-worker secret is missing

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:**
  - `judge-worker-rs/src/api.rs:45-62` (`auth_header_for_worker`)
  - `judge-worker-rs/src/api.rs:101-132` (heartbeat)
  - `judge-worker-rs/src/api.rs:163-197` (poll)
  - `judge-worker-rs/src/api.rs:230-263` (report_result)
- **Problem:** Worker-scoped endpoints (heartbeat, poll, report) are supposed to use a per-worker secret issued at registration, but the client silently falls back to the shared `JUDGE_AUTH_TOKEN` whenever the per-worker secret is absent.  A single log line is emitted once per process.  This collapses the privilege boundary between workers: compromise of one worker's state is equivalent to compromise of the shared judge token.
- **Failure scenario:** An attacker gains read access to one worker container's environment.  The per-worker secret is missing because the worker was misconfigured, so the attacker uses the shared token to poll submissions and report fake results for any worker ID.
- **Fix:** Require the per-worker secret for all worker-scoped requests after registration.  Return 401 on heartbeat/poll/report if the shared token is used.  Store worker secrets as salted hashes in the DB so a DB read does not reveal the plaintext secret.

### 27. Compiler execution layer allows local Docker fallback even in production

- **Severity:** High  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/compiler/execute.ts:104-105` (`SHOULD_ALLOW_LOCAL_FALLBACK`)
  - `src/lib/compiler/execute.ts:808-819` (fallback branch)
  - `src/lib/compiler/execute.ts:652-736` (runner delegation)
  - `src/lib/compiler/execute.ts:28-29` (`MAX_SOURCE_CODE_BYTES`)
  - `src/lib/compiler/execute.ts:962` (`DOCKER_RUN_OVERHEAD_BUDGET_MS`)
- **Problem:** When `COMPILER_RUNNER_URL` is unset or `ENABLE_LOCAL_FALLBACK` is enabled, the TypeScript compiler path falls back to running Docker containers locally.  The project topology explicitly states that `algo.xylolabs.com` must never run judge/worker images.  The fallback is gated only by environment variables, not by the deployment role, so a misconfigured production app server can execute untrusted code locally.
- **Failure scenario:** A production deploy omits `COMPILER_RUNNER_URL` because of a typo in the env file.  The first submission triggers `execute.ts` to spawn a local Docker compiler container on the app server.  A sandbox escape or resource exhaustion event now affects the app server instead of the isolated worker host.
- **Fix:** Disable the local Docker fallback entirely when `NODE_ENV === "production"`.  If the runner is unreachable, return a `configError` and queue/retry the submission rather than executing locally.  Make `deploy-docker.sh` reject production app configs that do not set `COMPILER_RUNNER_URL` and `RUNNER_AUTH_TOKEN`.

### 28. API auth resolver eagerly loads the full active-user record for every request

- **Severity:** Medium  
- **Confidence:** High  
- **Files / Regions:**
  - `src/lib/api/auth.ts:28-59` (`getActiveAuthUserById`)
  - `src/lib/api/auth.ts:61-89` (`getApiUser`)
  - `src/lib/api/handler.ts:73-109` (handler calls `getApiUser` unconditionally)
- **Problem:** `createApiHandler` resolves the full active user from the database for every authenticated request, even when the route only needs to know that a valid token exists.  There is no per-route opt-out for lightweight endpoints.  This adds a DB round-trip to every API call and couples every handler to the availability of the `users` table.
- **Failure scenario:** A public telemetry endpoint that merely checks whether the caller is logged in still performs a `SELECT` on `users` with role/active checks.  During a DB overload incident, the telemetry endpoint fails alongside critical submission paths, broadening the blast radius.
- **Fix:** Decompose auth into a lightweight "token is valid" check and an optional "enrich with user record" step.  Let handlers declare their auth needs (e.g., `needsUser: false`, `needsRole`, `needsCapabilities`) so the wrapper can skip the DB lookup when it is not needed.

---

## Validated / Upgraded Findings from Cycle 2 Aggregate

| Prior Finding | Status | Evidence |
|---|---|---|
| Nginx `client_max_body_size` missing | **Fixed** | `deploy-docker.sh` adds `client_max_body_size 50M` to location blocks. |
| X-Forwarded-For chain not preserved | **Fixed** | `deploy-docker.sh` and `static-site/nginx.conf` preserve the chain. |
| Docker networks flat / single bridge | **Fixed** | `docker-compose.production.yml:215-223` defines `frontend`, `backend`, `judge`, `db` networks. |
| Docker socket proxy over-privileged | **Improved** | `BUILD=0`, `IMAGES=0` in `docker-compose.production.yml:89-90`; still allows container create/start/stop/delete. |
| Judge worker container runs as root | **Fixed** | `Dockerfile.judge-worker` uses non-root `USER judge`. |
| `sshpass` env-var usage | **Fixed** | Deployment no longer exposes secrets on command line. |
| Token revocation used second precision | **Fixed** | `src/lib/auth/session-security.ts:36-41` compares at millisecond precision. |
| Worker deregister ignored non-2xx | **Fixed** | `judge-worker-rs/src/api.rs` returns `Err(format!("Deregister failed: {status} {text}"))`. |
| Rate-limiter used wall-clock for blocks | **Fixed** | `rate-limiter-rs/src/main.rs:28-49` uses monotonic `Instant` for window/block/eviction. |
| Raw queries ignored active transaction | **Fixed** | `src/lib/db/queries.ts:55-68` routes through `transactionContext.getStore()`. |
| CSRF allowedHosts not integrated | **Fixed** | `src/lib/security/csrf.ts:7-30` and `src/lib/security/env.ts:213-241` use `getTrustedAuthHosts()`. |
| Similarity check not serialized | **Improved** | `src/lib/assignments/code-similarity.ts:424-438` uses `pg_advisory_xact_lock`; still a DB-lock anti-pattern. |
| Sidecar auth failed open on missing env | **Fixed** | `code-similarity-rs/src/main.rs:206-220` and `rate-limiter-rs/src/main.rs:448-471` now refuse to start without a token or explicit `ALLOW_UNAUTHENTICATED=1`. |

---

## Risks Needing Manual Validation

1. **Sidecar header propagation.** Verify whether `src/lib/assignments/code-similarity-client.ts` and `src/lib/security/rate-limiter-client.ts` forward a request/correlation ID to their respective sidecars.
2. **Edge Runtime DB load.** Measure cold-start latency and DB query count for `src/proxy.ts` under production traffic to confirm the middleware lookup is a bottleneck.
3. **Production network segmentation effectiveness.** Confirm that `code-similarity` and `rate-limiter` cannot reach `docker-proxy:2375` from their respective networks.
4. **Real-time coordination contention.** Load-test `acquireSharedSseConnectionSlot` with >500 concurrent connections to quantify advisory-lock wait time.
5. **Language config drift.** Run a one-time comparison of `src/lib/judge/languages.ts`, `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/languages.rs`, and the DB `languageConfigs` defaults to detect any existing mismatches.
6. **Local-fallback surface.** Audit all production deployments for `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN`, `ENABLE_LOCAL_FALLBACK`, or missing `COMPILER_RUNNER_URL`/`RUNNER_AUTH_TOKEN`.

---

## Final Sweep — Commonly Missed Architectural Issues

- **Wrong-way dependencies:** None found from `src/lib/**` into `src/app/**`.
- **God objects:** `src/lib/compiler/execute.ts` still mixes local fallback, Docker execution, shell validation, and cleanup; it is a refactor candidate.  `src/lib/security/env.ts` is large but cohesive.
- **Missing abstraction boundaries:** Language config triplication, settings cache, local filesystem storage, and Docker admin mode selection are the most prominent.
- **Observability gaps:** Distributed request ID exists inside `createApiHandler` but is not propagated to sidecars or the Rust worker.  No structured trace context (`traceparent`) was observed.
- **Migration discipline:** Raw SQL additive patches in `deploy-docker.sh` remain the single biggest threat to journal reproducibility.
- **Scalability ceilings:** PostgreSQL advisory locks for real-time coordination and similarity checks are the primary horizontal-scaling ceiling.  Local filesystem uploads are the second.
- **Positive architectural choices:** Rust sidecars fail closed on missing auth tokens; `AbortSignal.any` in `code-similarity-client.ts:57-58` properly composes caller and sidecar timeouts; `SandboxWorkspace` RAII cleanup reduces workspace leaks.

---

## Recommendations Priority

### Immediate (high architectural risk)

1. Replace PostgreSQL advisory-lock coordination with Redis/NATS for SSE slots, heartbeats, and similarity-check serialization.
2. Establish a single source of truth for language configuration with a generated contract and CI test.
3. Decompose `deploy-docker.sh` into phase scripts with captured state and `--rollback` support.
4. Add TLS/mTLS or strict network segmentation for internal service traffic; rotate static bearer tokens.
5. Disable local Docker fallback in production for both `src/lib/compiler/execute.ts` and `src/lib/docker/client.ts`.

### Short term (scalability / operability)

6. Flip `AUTH_TRUST_HOST` and judge IP allowlist defaults to fail-closed in production.
7. Fix the settings cache to reload synchronously on invalidation or use an atomic swap.
8. Propagate request IDs / trace context across all internal service calls.
9. Move DB lookups out of the Edge Runtime middleware and make API handler user enrichment opt-in.
10. Introduce a storage backend abstraction and move production uploads to object storage.
11. Separate background maintenance tasks from the web server process.

### Medium term (maintainability)

12. Add API versioning machinery and backwards-compatibility tests.
13. Unify configuration schema with env overrides for all production knobs.
14. Refactor `src/lib/compiler/execute.ts` into smaller, testable modules.
15. Add database CHECK constraints for all enum-like text columns.
16. Require per-worker secrets and reject shared-token use for worker-scoped endpoints.
