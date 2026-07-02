# Architectural Review — JudgeKit (/tmp/judgekit-local)

**Scope:** Full repository — Next.js 16 app/API, Rust judge worker, Docker-sandboxed execution, PostgreSQL, deployment toolchain.  
**Date:** 2026-07-02  
**Confidence labels:** High / Medium / Low  

---

## Summary

JudgeKit is a monorepo online judge whose architecture is functional and largely well-layered, but it carries several structural risks that will compound as scale and operational complexity grow:

- **Language configuration is triplicated** across TypeScript, Rust, and the database, with no single source of truth or contract test to detect drift.
- **The deployment pipeline is a single 1,700-line shell script** mixing build, migration, SQL patching, nginx generation, health checks, and cleanup, with no per-phase rollback.
- **Configuration resolution is scattered** across environment variables, a single-row `system_settings` table, and hardcoded defaults, with a short-lived in-memory cache that can return stale values during reload.
- **The real-time/SSE layer** is either single-instance or coordinates through PostgreSQL advisory locks, which is not a sustainable horizontal-scaling pattern.
- **Microservice boundaries are weak:** internal traffic between app, worker, rate-limiter, and code-similarity is unencrypted HTTP on a flat Docker bridge; the worker container runs as root and the Docker socket proxy grants broad container lifecycle privileges.
- **API boundary discipline is mixed:** a common handler wrapper provides auth/CSRF/rate-limit/validation, but error handling swallows exceptions into a generic 500, and there is no strategy for API versioning beyond the `/api/v1` path prefix.

The codebase shows evidence of iterative hardening (good), but several of those hardening measures are layered on top of an underlying design that still assumes a single app server and trusted internal network. The highest-priority architectural fixes are: extract the deploy script into phase modules, establish a single source of truth for language config with a contract test, replace the settings cache with a reload-safe resolver, and segment internal networks + add mTLS/TLS between services.

---

## Layer Inventory Reviewed

| Layer | Path(s) | Notes |
|---|---|---|
| App Router (pages) | `src/app/(auth)/`, `src/app/(dashboard)/`, `src/app/(public)/` | Route groups for auth, dashboard, public. Most UI pages are thin shells over shared components. |
| App Router (API) | `src/app/api/v1/**` | ~150 route handlers. Most use `createApiHandler`; judge/worker routes do not. |
| Middleware/proxy | `src/proxy.ts` | Next.js 16 middleware convention. Runs in Edge Runtime, does JWT decode + DB user lookup + CSP nonce. |
| Components | `src/components/`, `src/app/(public)/_components/` | UI components separated by domain. |
| Business logic | `src/lib/**` (~200 modules) | Broadly clean dependency direction: lib does not import from `app/`. |
| ORM / schema | `src/lib/db/schema.pg.ts`, `relations.pg.ts`, `src/lib/db/index.ts` | PostgreSQL via Drizzle. Some legacy SQLite/MySQL artifacts remain. |
| Auth | `src/lib/auth/`, `src/lib/security/` | NextAuth v5 beta, role + capability checks, rate limiting, env validation. |
| Judge orchestration | `src/lib/judge/`, `src/lib/compiler/execute.ts` | Claim/poll/report, local Docker fallback, language sync. |
| Rust worker | `judge-worker-rs/src/` | Polls app, runs sandboxed containers, reports results. Also exposes an HTTP runner/admin API. |
| Sidecars | `rate-limiter-rs/`, `code-similarity-rs/` | Optional in-memory fast-paths; DB remains authoritative for rate limits. |
| Docker | `docker/`, `Dockerfile`, `Dockerfile.judge-worker`, `docker-compose*.yml` | 100+ language images, production compose with flat bridge network. |
| Deployment | `deploy-docker.sh`, `deploy.sh`, `scripts/` | Server-side builds, env generation, nginx generation, migrations. |
| Static site | `static-site/` | Separate nginx static site config. |

Dependency direction check: no imports from `src/lib/**` or `src/components/**` into `src/app/**` were found. The dependency graph is top-down (app → lib), which is correct.

---

## Findings

### 1. Language configuration is triplicated with no contract test

- **Severity:** High
- **Confidence:** High
- **Files / Regions:**
  - `src/lib/judge/languages.ts:199+` — TypeScript `JUDGE_LANGUAGE_CONFIGS`
  - `src/types/index.ts` — TypeScript `Language` union
  - `judge-worker-rs/src/types.rs:56+` — Rust `Language` enum
  - `judge-worker-rs/src/languages.rs` — Rust per-language command configuration
  - `src/lib/judge/sync-language-configs.ts` — DB sync at startup
  - `src/lib/db/schema.pg.ts` (language_configs table)
- **Problem:** The same language list and command templates are authored in TypeScript, Rust, and the database. Adding a language requires touching at least five places and keeping naming conventions aligned (`clang_cpp23` vs `ClangCpp23`, etc.). The worker reads `dockerImage`/`compileCommand`/`runCommand` from the DB at runtime, but the Rust enum must still contain the variant and the TS union must still contain the key. There is no generated contract or test that proves all three sources agree.
- **Failure scenario:** An admin enables a language that exists in the DB but whose Rust enum variant is missing or spelled differently; the worker deserializes the claim request and the submission hangs/fails with an internal parse error. Conversely, a Rust-only language cannot be selected from the UI because the TS union lacks it.
- **Fix:** Generate the TypeScript `Language` union and Rust enum from a single YAML/JSON manifest checked into the repo. Add a CI contract test that asserts: (a) every manifest entry has a TS type, Rust enum variant, Dockerfile, and DB sync entry; (b) the DB-stored command templates are byte-identical to the manifest defaults after sync. Treat the manifest as the source of truth.

### 2. `deploy-docker.sh` exceeds modularization threshold and couples unrelated concerns

- **Severity:** High
- **Confidence:** High
- **Files / Regions:** `deploy-docker.sh:1-1704+`
- **Problem:** A single shell script performs SSH setup, remote architecture detection, env generation, Docker builds (app + worker + ~100 languages), BuildKit recovery, DB migration, raw SQL additive patches, nginx generation, container lifecycle, health checks, artifact pruning, and worker-host reconciliation. Any failure late in the script leaves prior mutations applied with no automated rollback. The script is also difficult to unit-test, review, and reuse.
- **Failure scenario:** A typo in the nginx heredoc causes the deploy to fail after migrations have already run and new app/worker containers have started. The operator must manually determine whether to roll back the DB, restart old containers, or fix the nginx template and re-run. During incident response this ambiguity extends downtime.
- **Fix:** Decompose `deploy-docker.sh` into phase scripts under `scripts/deploy/` (e.g., `01-build.sh`, `02-migrate.sh`, `03-up.sh`, `04-healthcheck.sh`, `05-prune.sh`) and make the main script a thin sequencer that captures per-phase exit codes and supports `--rollback`. Move nginx templates into static template files rather than inline heredocs.

### 3. `system_settings` cache can return stale data during background reload

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/lib/system-settings-config.ts:84-195`
- **Problem:** `getConfiguredSettings()` returns a 15-second in-memory cache. When the TTL expires, it triggers an asynchronous DB reload and returns the *previous* cached value (or defaults if none). For the first 15 seconds after `invalidateSettingsCache()` is called, callers still see old values. Admin UI updates therefore do not take effect immediately despite the invalidation API, and settings-dependent code (rate limits, queue limits, sandbox timeouts) can operate on stale thresholds for up to one TTL window.
- **Failure scenario:** An admin lowers `apiRateLimitMax` from 1000 to 30 during an abuse incident. The settings cache invalidates but the next few hundred requests still see 1000 because `getConfiguredSettings()` returned the old object while the DB reload was in flight.
- **Fix:** Make `getConfiguredSettings()` await the reload on the first cache miss after invalidation (or use a short `async` cache with a synchronous fallback only during initial load). Alternatively, switch to an explicit version counter in the DB and atomically swap the cached object only after the new value resolves.

### 4. Configuration resolution is scattered across env, DB, and code

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:**
  - `src/lib/system-settings-config.ts:66-82` — env overrides for some settings
  - `src/lib/db/schema.pg.ts` — `system_settings` single-row table
  - `src/lib/security/env.ts`, `src/lib/security/production-config.ts` — env validation
  - `docker-compose.production.yml` — env injection
- **Problem:** Operational settings live in three places with overlapping authority. Some settings can be overridden by env (`ENV_OVERRIDES`), some only in the DB, and some are hardcoded defaults. There is no generated documentation or runtime UI that shows the active source for each value. New settings are frequently added without corresponding env overrides, making emergency config changes require a DB write.
- **Failure scenario:** During an incident an operator sets `SUBMISSION_GLOBAL_QUEUE_LIMIT=10` in `.env.production` and restarts, but the setting is not in `ENV_OVERRIDES`, so the DB value of 100 remains active. The operator believes the limit is 10.
- **Fix:** Define a single schema for tunable settings that declares default, env-var name, DB column, and validation rule. Generate docs and a runtime "effective config" admin endpoint from that schema. Ensure every production-relevant knob has an env override.

### 5. Real-time coordination does not scale beyond single instance without DB locks

- **Severity:** High
- **Confidence:** High
- **Files / Regions:** `src/lib/realtime/realtime-coordination.ts:21-267`
- **Problem:** SSE connection slots and exam heartbeats are coordinated either process-locally (single-instance mode) or via PostgreSQL advisory locks. The module explicitly warns that multi-instance deployments require `REALTIME_COORDINATION_BACKEND=postgresql`, which serializes every SSE acquisition and heartbeat update through `pg_advisory_xact_lock` and a single table. This is a DB bottleneck and an anti-pattern for real-time fan-out.
- **Failure scenario:** A contest with 1,000 concurrent users opens. Each SSE connection attempt acquires an advisory lock and performs `DELETE + SELECT count(*) + INSERT` in a transaction. Lock contention and table bloat cause connection acquisition latency to spike, degrading the live submission-status experience.
- **Fix:** Move SSE/heartbeat coordination to a purpose-built shared state store (Redis, NATS, or a dedicated coordination service) rather than PostgreSQL advisory locks. Keep PostgreSQL as the durable source of truth for submissions, but not as the real-time coordination bus.

### 6. Middleware performs DB lookups in Edge Runtime

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/proxy.ts:290-324` (`_proxy` calls `getActiveAuthUserById`)
- **Problem:** The Next.js Edge Runtime is optimized for short, stateless, CPU-bound work. The proxy middleware does a JWT decode and then a PostgreSQL query (with an in-memory FIFO cache) on many requests. This couples every request to the DB, complicates cold-start behavior, and makes middleware behavior dependent on the same Drizzle/Node stack used by API routes.
- **Failure scenario:** A brief DB blip causes every page load and API request to fail at the middleware layer with 500, even for public pages, because the active-user lookup cannot complete. The cache only softens this for already-cached users.
- **Fix:** Move non-critical auth refresh out of middleware. Use middleware only for lightweight checks (JWT presence, cookie security, CSP nonce, locale). Do the active-user DB lookup lazily in layouts/server components or API handlers, where failures can be handled per-route.

### 7. API error handling swallows exceptions into generic 500s

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/lib/api/handler.ts:210-213`; `src/proxy.ts:278-288`
- **Problem:** `createApiHandler` catches all unhandled errors and returns `{ error: "internalServerError" }` with status 500. No request ID, no structured error code taxonomy, and no distinction between programmer errors (bugs), operational errors (DB down), and validation errors. The proxy middleware does the same. This makes production debugging rely entirely on server logs.
- **Failure scenario:** A subtle Drizzle query bug causes intermittent 500s on a critical endpoint. Because the client sees only `internalServerError`, operators cannot correlate user reports with logs without manually matching timestamps and IPs.
- **Fix:** Introduce a small error taxonomy (`ValidationError`, `AuthError`, `NotFoundError`, `UpstreamError`, `InternalError`) and a request-scoped context (request ID in AsyncLocalStorage). Return stable public error codes plus the request ID; log the full stack with the same ID. Preserve the generic message for `InternalError` only.

### 8. No API versioning strategy beyond the v1 path prefix

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/app/api/v1/**`, `src/lib/api/handler.ts`
- **Problem:** All routes are under `/api/v1/`, but there is no versioning machinery: no version header support, no deprecation markers, no backwards-compatibility tests, and no staged rollout mechanism. As the UI and external consumers evolve, breaking changes will require global coordination.
- **Failure scenario:** A new front-end feature needs a different shape for `/api/v1/submissions`. Because there is no v2, the change must be made in-place. Mobile clients or third-party integrations that depended on the old shape break silently.
- **Fix:** Adopt a version negotiation scheme (URL path `/api/v2/...` or `Accept: application/vnd.judgekit.v2+json`). Write compatibility tests for at least one previous version. Document deprecation and sunset policy.

### 9. Rate-limiting has two sources of truth (sidecar + DB)

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/lib/security/api-rate-limit.ts:48-179`; `src/lib/security/rate-limiter-client.ts`
- **Problem:** API rate limits use the `rate-limiter-rs` sidecar as a fast pre-check, then always hit the DB as the authoritative source. The sidecar is stateful and in-memory; if it restarts, its counters reset, while the DB path continues. The two stores can disagree during partial outages. The sidecar circuit breaker is also process-local, so a multi-instance deployment sees inconsistent sidecar health.
- **Failure scenario:** An attacker exceeds the rate limit. The sidecar says blocked, but a DB race or clock-skew handling difference allows one request through before the DB path also blocks. The result is non-deterministic 429s that are hard to explain to users.
- **Fix:** Either make PostgreSQL the sole source of truth and remove the sidecar, or make the sidecar authoritative with a shared backing store (Redis) and explicit DB persistence only for audit. Do not run both as decision makers.

### 10. Internal service traffic is unencrypted HTTP on a flat network

- **Severity:** High
- **Confidence:** High
- **Files / Regions:**
  - `docker-compose.production.yml:104-144` (`JUDGE_BASE_URL=http://app:3000/api/v1`, `COMPILER_RUNNER_URL=http://judge-worker:3001`, `RATE_LIMITER_URL=http://rate-limiter:3001`, `CODE_SIMILARITY_URL=http://code-similarity:3002`)
  - `judge-worker-rs/src/config.rs:67-114` (accepts plain HTTP for internal hostnames)
- **Problem:** App, worker, rate-limiter, and code-similarity communicate over plain HTTP on the default Docker bridge. A compromised sidecar or auxiliary container can sniff bearer tokens, hidden test cases in claim responses, and submission source code.
- **Failure scenario:** A vulnerability in the code-similarity sidecar allows an attacker to run arbitrary code inside that container. Because all services share the bridge, the attacker can intercept `JUDGE_AUTH_TOKEN` and `RUNNER_AUTH_TOKEN` by passively observing traffic.
- **Fix:** Segment the compose network into isolated subnets (`frontend`, `backend`, `judge`, `db`). Terminate TLS at each service boundary using an internal reverse proxy or service mesh, or enable mTLS between app and worker. At minimum, place worker and app on a dedicated backend network not shared by sidecars.

### 11. Docker socket proxy grants broad container lifecycle privileges

- **Severity:** High
- **Confidence:** High
- **Files / Regions:** `docker-compose.production.yml:64-86`
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1 IMAGES=1`. The worker can create, start, stop, delete arbitrary containers and list images on the host Docker daemon.
- **Failure scenario:** A compromised worker sends Docker API requests through the proxy to spawn a privileged container with `--pid=host` or host volume mounts, escaping the sandbox and gaining host access.
- **Fix:** Restrict the proxy to the exact API endpoints required (e.g., only container create/start/kill for judge-* images). Run Docker rootless, add AppArmor/SELinux profiles to the worker, drop all capabilities, and split image management into a separate admin service that does not run submission containers.

### 12. Judge worker container runs as root

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `Dockerfile.judge-worker` (no `USER` directive in final stage)
- **Problem:** The worker final stage does not drop to a non-root user. Combined with the Docker socket proxy, a sandbox escape or supply-chain compromise inside the worker yields root-equivalent privileges in the container and broad Docker API access.
- **Failure scenario:** A malicious language image exploit breaks out of the judged container into the worker. The worker process is root, so the attacker has full control of the worker container and can use the Docker proxy to launch further containers.
- **Fix:** Add a non-root user/group in the final stage, `chown` the binary and `/judge-workspaces`, and end with `USER <uid>:<gid>`. Ensure the user can still reach `docker-proxy:2375` and write to `/judge-workspaces` and `/app/dead-letter`.

### 13. Build-phase DB connection is a dummy string used for type-checking

- **Severity:** Low
- **Confidence:** Medium
- **Files / Regions:** `src/lib/db/index.ts:31-37`
- **Problem:** During `NEXT_PHASE === "phase-production-build"`, `drizzle()` is initialized with `postgres://build:build@localhost:5432/build`. The comment says this is only for type-checking, but the module still constructs a real `Pool`-backed drizzle instance at import time. If Drizzle ever changes to validate or connect eagerly, builds could fail or leak connections.
- **Failure scenario:** A Drizzle minor upgrade starts resolving the connection string during construction; production builds fail because `localhost:5432` is unreachable in the builder container.
- **Fix:** Build a stub drizzle instance that does not parse a connection string at all, or guard the import so that build-time code paths never instantiate a database client.

### 14. Raw SQL additive patches bypass the Drizzle migration journal

- **Severity:** High
- **Confidence:** High
- **Files / Regions:** `deploy-docker.sh:1250-1262`; `src/lib/db/migrate.ts:1-7`; `scripts/check-migration-drift.sh:1-28`
- **Problem:** The deploy script applies additive schema changes via raw `psql` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) after `drizzle-kit push`. Because the column already exists, `drizzle-kit push` does not generate a journal entry. A disaster-recovery replay from the journal produces a schema missing those columns.
- **Failure scenario:** A new environment is stood up from backups and migrations. `problems.default_language` and `system_settings.default_language` are absent; queries fail at runtime with "column does not exist".
- **Fix:** Eliminate raw `psql` pre-patches. Add columns only through `drizzle-kit generate` so the journal stays the single source of truth. If a zero-downtime additive change must happen outside `push`, wrap it in a committed journal migration.

### 15. Role/capability authorization is split across role names and capability strings

- **Severity:** Medium
- **Confidence:** Medium
- **Files / Regions:**
  - `src/lib/db/schema.pg.ts:20-63` (`users.role` references `roles.name`)
  - `src/lib/capabilities/` — capability registry
  - `src/lib/api/handler.ts:34-140` — auth config accepts roles and capabilities
- **Problem:** Authorization uses both role names (`admin`, `instructor`, etc.) and capability strings. Roles are stored as text in `users.role` with a foreign-key reference to `roles.name`, but capabilities are checked at runtime from the role. There is no database-enforced guarantee that a role's capabilities are consistent with its name, and custom roles can silently lose required capabilities.
- **Failure scenario:** An operator renames the `admin` role in the DB. The `users.role` FK restricts deletion but not capability mapping, so existing admins keep their role name but `resolveCapabilities` may return an empty set, locking them out of admin endpoints.
- **Fix:** Persist capability assignments in the database with foreign-key integrity, or at minimum add a startup consistency check that warns/fails when built-in roles are missing required capabilities. Treat role names as stable identifiers and document them as such.

### 16. Function-judging adapters duplicate serialization logic between TS and Rust

- **Severity:** Medium
- **Confidence:** Medium
- **Files / Regions:**
  - `src/lib/judge/function-judging/` — TypeScript harness generation
  - `judge-worker-rs/src/languages.rs` — Rust command and adapter assumptions
- **Problem:** Function-signature problems are judged by assembling `prelude + studentCode + generatedMain` in TypeScript and sending the result to the Rust worker as an ordinary `auto` submission. The serialization format expected by the generated harness must match what the TS `serialization.ts` emits. The Rust worker has no knowledge of function judging; if the harness format drifts, verdicts become silently wrong.
- **Failure scenario:** A change to `serialization.ts` adds a trailing newline. The generated harness expects no trailing newline and parses the last token incorrectly, producing wrong-answer verdicts on valid submissions.
- **Fix:** Define a versioned function-judging protocol (e.g., `functionSpecVersion`) and have the Rust worker validate/reject unknown versions. Add golden-file tests that compile and run every adapter harness and assert byte-identical output against `serialization.ts` (the harness smoke layer is a good start; ensure it runs in CI).

### 17. Settings-dependent values captured at module load time

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/lib/auth/config.ts:322-325`; `src/lib/auth/config.ts:146-153`
- **Problem:** `authConfig.session.maxAge` is evaluated once at module load using `getSessionMaxAgeSeconds()`, which reads the system setting at that moment. The comment acknowledges that changes to `sessionMaxAgeSeconds` require a server restart. This is a common pattern elsewhere for env-driven constants.
- **Failure scenario:** An admin changes the session timeout in the UI. Because `authConfig` is frozen at import, existing and new sessions continue to use the old TTL until the process restarts, violating user expectations and compliance requirements.
- **Fix:** Where settings are expected to be dynamic, resolve them per-request or per-token-issuance rather than at module load. For NextAuth, set `maxAge` to the longest supported TTL and implement shorter effective expirations in the JWT `exp` claim based on current settings.

### 18. Worker prewarming fires uncontrolled `docker run` commands at startup

- **Severity:** Low
- **Confidence:** Medium
- **Files / Regions:** `judge-worker-rs/src/main.rs:274-307`
- **Problem:** On registration, the worker spawns one `docker run --rm <image> true` per prewarm image with a 10-second timeout. These are fire-and-forget tasks with no concurrency limit, error surfacing, or backpressure. On a worker host with many languages, startup can generate a burst of Docker operations.
- **Failure scenario:** A worker restarts during a contest. Prewarming 20 language images concurrently saturates the Docker daemon, delaying the first real submission claims.
- **Fix:** Cap prewarm concurrency (e.g., semaphore of 3), expose prewarm status via the health endpoint, and log aggregate success/failure metrics. Consider moving prewarming to a background maintenance window rather than startup.

### 19. No distributed request ID / trace context

- **Severity:** Medium
- **Confidence:** High
- **Files / Regions:** `src/lib/logger.ts:1-29`; `src/lib/api/handler.ts:116-214`; `src/proxy.ts`
- **Problem:** The logger supports child loggers with `requestId` and `userId`, but there is no evidence that a request ID is generated at the edge and propagated through proxy → API → DB → sidecar → worker. Cross-service calls (app → worker, app → rate-limiter, app → code-similarity) do not carry trace headers.
- **Failure scenario:** A submission result is slow. Operators must correlate timestamps across four services manually because no shared ID links the app claim, worker execution, and result report.
- **Fix:** Generate a `request-id`/`traceparent` in middleware and store it in AsyncLocalStorage. Propagate it in outgoing HTTP calls (worker, rate-limiter, code-similarity) and include it in all structured logs. Add OpenTelemetry or equivalent once the baseline ID propagation exists.

### 20. Unit of work / transaction boundary discipline is inconsistent

- **Severity:** Medium
- **Confidence:** Medium
- **Files / Regions:** `src/lib/db/index.ts:90-98` (`execTransaction`); `src/lib/db/queries.ts` (`rawQueryOne`/`rawQueryAll`)
- **Problem:** `execTransaction` wraps callbacks in a Drizzle transaction, but `rawQueryOne`/`rawQueryAll` use the global pool and do not participate in an open transaction. The codebase uses `transactionContext` (AsyncLocalStorage) only to detect this mistake, not to route queries to the transaction client. Many route handlers perform multiple DB operations without an explicit transaction.
- **Failure scenario:** A submission creation writes the submission row, increments pending count, and logs an audit event in separate calls. If the process crashes between calls, the DB is left inconsistent (submission exists but audit event is missing, or pending count is wrong).
- **Fix:** Provide a `db.queryInTransaction` helper that automatically routes raw queries to the active transaction client when inside `execTransaction`. Audit multi-write route handlers and wrap them in transactions. Remove the foot-gun by making raw queries throw when called inside a transaction callback unless explicitly opted out.

### 21. Test and production Docker networks differ in topology

- **Severity:** Low
- **Confidence:** Medium
- **Files / Regions:** `docker-compose.yml` (dev language images), `docker-compose.production.yml`
- **Problem:** Local development builds language images via a separate `docker-compose.yml` that does not model the production network segmentation, sidecars, or proxy. This means network-isolation and sidecar behavior are only exercised during deploys.
- **Failure scenario:** A bug in the rate-limiter sidecar integration only manifests in production because local dev never starts it. CI also does not run the full production compose topology.
- **Fix:** Provide a `docker-compose.override.yml` or a dedicated `docker-compose.local-prod.yml` that mirrors production topology (app, worker, db, sidecars, docker-proxy) for local integration testing.

### 22. Static-site nginx is decoupled from app security headers

- **Severity:** Low
- **Confidence:** Medium
- **Files / Regions:** `static-site/nginx.conf:1-23`; `next.config.ts:141-183`; `src/proxy.ts:248-272`
- **Problem:** The static site has its own nginx config that lacks HSTS, CSP, X-Content-Type-Options, X-Frame-Options, and referrer policy. Meanwhile the Next.js app sets these in middleware and static headers. If the static site serves user-contributed HTML or polyglot files, the inconsistent policy creates a bypass path.
- **Failure scenario:** An attacker uploads a polyglot HTML/PNG file to a static-site-hosted asset. The static site serves it without CSP or X-Content-Type-Options, allowing the browser to render it as HTML and execute script in the site's origin.
- **Fix:** Unify security headers in a shared nginx include file used by both app and static-site configs. Set `server_tokens off;` and add baseline CSP/HSTS/frame-options/referrer-policy headers to `static-site/nginx.conf`.

---

## Final Sweep Notes

- **Files intentionally not read in full:** UI component implementations under `src/components/**` and most page files under `src/app/(public)/` were not audited line-by-line because the architectural focus is on layering, boundaries, and backend/design risks. No obvious wrong-way dependencies were found.
- **Static checks not run:** `npx tsc --noEmit` and `cargo test` were not executed for this review. Type-level and runtime correctness findings are therefore limited to visible patterns.
- **Overlap with aggregate security review:** Several findings here (flat network, root worker, socket proxy, unencrypted internal traffic, raw SQL patches, generic 500s) also have security implications. They are included because they are architectural boundary issues, not implementation bugs. The aggregate review should be consulted for detailed security remediation steps.
- **Commonly missed issues checked:**
  - Wrong-way dependencies: none found from `src/lib/**` into `src/app/**`.
  - God objects: `src/lib/security/env.ts` is large but cohesive; `src/lib/compiler/execute.ts` mixes local fallback, Docker execution, validation, and parsing — a refactor candidate.
  - Missing abstraction boundaries: language config triplication and settings cache are the most prominent.
  - Schema inconsistencies: several `text()` columns encode enums without DB `CHECK` constraints (e.g., `users.role`, `problems.problemType`, `assignments.scoringModel`). The `assignments.exam_mode` table does add a check constraint, showing the pattern exists but is not applied consistently.
  - Observability gaps: no distributed request ID, no metrics for queue depth, no structured error taxonomy.

---

## Recommendations Priority

1. **Immediate (high architectural risk):**
   - Extract `deploy-docker.sh` into phase scripts with rollback support.
   - Establish a single source of truth for language config + contract test.
   - Segment Docker networks and encrypt internal service traffic.
2. **Short term (scalability / operability):**
   - Replace PostgreSQL advisory locks for real-time coordination with Redis/NATS.
   - Fix the settings cache to reload synchronously on invalidation or use atomic swap.
   - Add request-ID propagation and structured error taxonomy.
3. **Medium term (maintainability):**
   - Add API versioning machinery.
   - Unify configuration schema with env overrides for all production knobs.
   - Refactor `src/lib/compiler/execute.ts` into smaller, testable modules.
