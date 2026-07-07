# Cycle 4 (2026-07-03) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (Cycle 4, 2026-07-03) plus the per-agent files under `.context/reviews/`.

Repo rules read before planning, in required order: `CLAUDE.md`, `AGENTS.md`, `.context/README.md`, `.context/development/conventions.md`, `.context/development/documentation-rules.md`, `.context/development/open-workstreams.md`, `.context/plans/README.md`, `.context/project/current-state.md`, `docs/deployment.md`, `docs/deployment-automation.md`, `docs/admin-security-operations.md`, `docs/data-retention-policy.md`, `docs/transcript-access-policy.md`, and `docs/api.md`.

Cycle constraints:
- Deploy mode is per-cycle.
- Correct deploy targets are `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; never deploy to `oj.worv.ai`.
- Preserve cycle-3 deployment health. If app/worker health regresses, treat it as a deployment blocker.
- **algo.xylolabs.com** is the app server only (Next.js app, PostgreSQL DB, Nginx). Judge/worker images and language images must be built on **worker-0.algo.xylolabs.com**.
- When deploying to `algo.xylolabs.com`, always use `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, `INCLUDE_WORKER=false`.
- Preserve the current `src/lib/auth/config.ts` as-is during deployment; do not overwrite or regenerate it.
- Before deploy/build, verify target storage posture and rely on safe cleanup only: stopped containers, dangling images, BuildKit cache/history. Never run `docker system prune --volumes`, automated `docker volume prune`, or delete PostgreSQL/user-data volumes.
- Use semantic git messages with gitmoji and GPG-signed commits.
- Korean text must keep browser default letter spacing; do not apply custom `letter-spacing` or `tracking-*` utilities to Korean content.

## Phase A - Implement This Cycle

This cycle schedules all **CRITICAL** findings (C4-001 through C4-007) and all **HIGH** findings (C4-008 through C4-034). Related MEDIUM findings are co-scheduled when they fall in the same blast radius. The following items are explicitly prioritized and sequenced first:

- **C4-005 + C4-006** — workspace cleanup leaks for non-root production users.
- **C4-007** — `similarity-check.route.test.ts` mocks `createApiHandler`, bypassing all middleware.
- **C4-013** — committed standalone nginx template still caps catch-all `location /` at `client_max_body_size 1m`.

### Phase A Implementation Status

| US | Title | Status | Evidence |
|---|---|---|---|
| C4-US-001 | Non-Root Workspace Cleanup — Node Compiler | Implemented | `src/lib/compiler/execute.ts` non-root cleanup path + regression tests |
| C4-US-002 | Non-Root Workspace Cleanup — Rust Worker | Implemented | `judge-worker-rs/src/workspace.rs` root cleanup container + tests |
| C4-US-003 | Real Similarity-Check Route Tests | Implemented | `tests/unit/api/similarity-check.route.test.ts` exercises real middleware stack |
| C4-US-004 | Committed Nginx Body Limit | Implemented | `static-site/nginx.conf`, `deploy-docker.sh`, `judge-report-nginx.test.ts` |
| C4-US-005 | Production Trust-Host / X-Forwarded-Host | Implemented | `src/lib/security/production-config.ts` `assertAuthTrustHostOverride`, nginx sets `$host` |
| C4-US-006 | Internal Service Encryption | Deferred | No TLS/mTLS between app, worker, sidecar, compiler; requires cert lifecycle |
| C4-US-007 | Judge API IP Allowlist Default | Implemented | `src/lib/judge/ip-allowlist.ts` fail-closed default + deploy auto-population |
| C4-US-008 | Raw SQL Schema Patch Governance | Deferred | `secret_token` backfill still in `deploy-docker.sh`; moving to Drizzle journal is larger |
| C4-US-009 | Real-Time Coordination Lock Bottleneck | Deferred | Global PostgreSQL advisory lock remains in `realtime-coordination.ts` |
| C4-US-010 | Docker Socket Proxy Privileges | Deferred | `docker-compose.production.yml`/`worker.yml` still grant POST/DELETE/START/STOP |
| C4-US-011 | Deploy Script Modularity / Atomicity | Deferred | `deploy-docker.sh` remains monolithic; phased refactor with rollback/mutex needed |
| C4-US-012 | Rate-Limiting Single Source of Truth | Deferred | Sidecar and Node both maintain independent counters |
| C4-US-013 | Role/Capability Authorization Unification | Implemented | `src/lib/api/handler.ts` accepts custom roles via capability check |
| C4-US-014 | Admin Restore/Import Security and Streaming | Deferred | ZIP restore buffers entire file in `src/app/api/v1/admin/restore/route.ts` |
| C4-US-015 | Language Configuration Contract | Deferred | No generated manifest; TS/Rust/DB not cross-validated by sync script |
| C4-US-016 | Function Judging Literal Validation | Deferred | Only safe-integer check exists; per-language range validation missing |
| C4-US-017 | Database Import Boolean Coercion Fix | Implemented | `src/lib/db/import.ts` explicit string mapper + round-trip tests |
| C4-US-018 | Files API Rate Limiting and Streaming | Implemented | `src/app/api/v1/files/route.ts` rate limit + stream download |
| C4-US-019 | createApiHandler Error Taxonomy | Implemented | `src/lib/api/handler.ts` `ApiError` taxonomy + `requestId` on all responses |
| C4-US-020 | Judge Claim Heartbeat Integrity | Deferred | In-progress reports still refresh `judgeClaimedAt`; heartbeat does not extend claim |
| C4-US-021 | Cancellable Rust Sidecar Compute | Deferred | `code-similarity-rs/src/main.rs` `spawn_blocking` has no cancellation token |
| C4-US-022 | Migration / Test Backend Script Security | Deferred | `deploy-test-backends.sh` uses unpinned `npm install` and `judgekit_test` fallback |
| C4-US-023 | Docker Build Timeout Cleanup | Deferred | Process kill exists; BuildKit record prune and regression test missing |
| C4-US-024 | Trusted Proxy Hops Default | Implemented | `src/lib/security/production-config.ts` `assertTrustedProxyHops`, env profiles set `1` |
| C4-US-025 | Similarity-Check Route Test Hardening | Implemented | Fake-timer timeout test + enrichment failure test |
| C4-US-026 | Contest Join Route Test Hardening | Implemented | CSRF/malformed-body/rate-limit tests added |
| C4-US-027 | Request-ID and Error Taxonomy Route Tests | Implemented | X-Request-Id and taxonomy asserted on real endpoints |
| C4-US-028 | Integration Test Database Guard | Implemented | `tests/integration/setup.ts` fail-fast guard + `SKIP_INTEGRATION_TESTS` |

Deferred CRITICAL/HIGH items are documented in `plan/cycle-4-2026-07-03-deferred.md` with exit criteria for Cycle 5.

### C4-US-001. Non-Root Workspace Cleanup — Node Compiler

- **Findings:** C4-005.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `src/lib/compiler/execute.ts`, `Dockerfile`, `tests/unit/compiler/execute.test.ts`.
- **Plan:**
  1. Detect non-root runtime in `cleanupCompilerWorkspace` (compare `process.getuid()` to `0` or check `os.userInfo().uid`).
  2. When running as the `nextjs` (uid 1001) production user, skip the in-process `chownRecursive` step that fails without `CAP_CHOWN`.
  3. Spawn a short-lived privileged cleanup container (`docker run --rm --user root -v <parent-tmp>:/work alpine`) to `chown -R <app_uid>` and `rm -rf` the workspace directory.
  4. Preserve the existing root-path behavior so local development and CI continue to work.
  5. Add a non-root regression test and update the existing cleanup tests to cover both code paths.
- **Acceptance criteria:**
  - A non-root Node compiler container removes sandbox-owned workspace directories without disk leakage.
  - The root-path cleanup still passes existing tests.
  - No `chown` capability is added to the production app image.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/compiler/execute.test.ts` passes.
  - Manual smoke test: run the compiler in a non-root container, confirm `/tmp` workspace parent is empty after execution.

### C4-US-002. Non-Root Workspace Cleanup — Rust Worker

- **Findings:** C4-006.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `judge-worker-rs/src/workspace.rs`, `Dockerfile.judge-worker`, Rust unit tests.
- **Plan:**
  1. In `SandboxWorkspace::drop`, detect non-root runtime via `nix::unistd::getuid()`.
  2. When `remove_dir_all` fails with a permission error while non-root, spawn a root-owned cleanup container (e.g., `docker run --rm --user root -v <parent>:/work alpine`) to `chown -R judge:judge` and `rm -rf` the workspace.
  3. Fall back to the existing root-only `chown` + `remove_dir_all` path when running as root.
  4. Add a non-root regression test and document the production `USER judge` constraint in `Dockerfile.judge-worker`.
- **Acceptance criteria:**
  - A non-root Rust worker removes sandbox-owned workspace directories without disk leakage.
  - The root-path cleanup still passes existing tests.
  - No `USER root` escalation is added to the worker image.
- **Verification steps:**
  - `cargo test` in `judge-worker-rs` passes.
  - Manual smoke test: run the worker as `judge` uid 1000, confirm workspace parent is empty after a submission.

### C4-US-003. Real Similarity-Check Route Tests

- **Findings:** C4-007.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `tests/unit/api/similarity-check.route.test.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`.
- **Plan:**
  1. Remove the `createApiHandler` mock from `similarity-check.route.test.ts`; route tests must exercise the real handler and middleware stack.
  2. Add tests that verify:
     - Authentication rejection (missing/invalid session).
     - CSRF enforcement for the `POST` mutation.
     - Rate-limit consumption and 429 response.
     - Body parsing / malformed payload handling.
     - Request-ID propagation in success and error responses.
  3. Keep the sidecar client mocked at the network boundary so the tests remain fast and deterministic.
  4. Preserve coverage of the assignment/group-TA/capability guard matrix and the timeout/abort path.
- **Acceptance criteria:**
  - No route test mocks `createApiHandler`.
  - Auth, CSRF, rate-limit, body parsing, and request-ID behavior are explicitly asserted.
  - All similarity-check route tests pass deterministically.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/api/similarity-check.route.test.ts` passes.
  - Confirm the test file no longer contains `jest.mock` / `vi.mock` for `createApiHandler`.

### C4-US-004. Committed Nginx Body Limit

- **Findings:** C4-013.
- **Original severity/confidence:** HIGH / High.
- **Files:** `scripts/online-judge.nginx.conf`, `deploy-docker.sh`, `tests/unit/infra/judge-report-nginx.test.ts`.
- **Plan:**
  1. Update the committed standalone nginx template so the catch-all `location /` uses the same body-limit posture as the generated deploy config (`client_max_body_size 50M` or a deliberately scoped value).
  2. Remove the stale `client_max_body_size 1m;` directive from the committed template.
  3. Add a static infra regression test that rejects `client_max_body_size 1m` in catch-all `location /` blocks across committed and generated nginx sources.
  4. Verify `static-site/nginx.conf` and generated templates remain aligned.
- **Acceptance criteria:**
  - No committed template caps general traffic at 1 MiB.
  - Generated and committed nginx configs stay consistent.
  - Regression test fails if the 1 MiB catch-all limit reappears.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/infra/judge-report-nginx.test.ts` passes.
  - `nginx -t` against the rendered committed template succeeds.

### C4-US-005. Production Trust-Host / X-Forwarded-Host

- **Findings:** C4-001.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `docker-compose.production.yml`, `src/lib/security/env.ts`, `src/lib/auth/config.ts`, `static-site/nginx.conf`, `deploy-docker.sh`.
- **Plan:**
  1. Change the production default so `AUTH_TRUST_HOST` is `false` unless the operator explicitly opts in.
  2. Configure Nginx to strip or override untrusted `X-Forwarded-Host` values before forwarding to the app; only propagate a host value that matches `allowedHosts`.
  3. Add env validation in `src/lib/security/env.ts` that warns/fails when `AUTH_TRUST_HOST=true` is set in production without an explicit `TRUST_HOST_OVERRIDE=1`.
  4. Update `.env.production.example` and deployment docs to explain the risk and the opt-in flag.
  5. Add regression tests for host-header spoofing scenarios.
- **Acceptance criteria:**
  - Production defaults do not trust `X-Forwarded-Host`.
  - Nginx removes or constrains the forwarded host header.
  - Auth.js host validation cannot be bypassed by a spoofed `X-Forwarded-Host`.
- **Verification steps:**
  - Security-focused unit tests pass.
  - Rendered nginx config diff shows the host header is sanitized.

### C4-US-006. Internal Service Encryption

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-002.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `docker-compose.production.yml`, `docker-compose.worker.yml`, `src/lib/assignments/code-similarity-client.ts`, `src/lib/compiler/execute.ts`.
- **Plan:**
  1. Introduce TLS for internal service traffic between the app, judge worker, code-similarity sidecar, and compiler runner. Prefer mutual TLS where feasible; otherwise terminate TLS at each internal endpoint.
  2. Update Docker Compose production and worker files to mount/internalize CA and service certificates (or use an encrypted overlay network with IPSEC/VXLAN where the environment supports it).
  3. Update internal HTTP clients (`code-similarity-client.ts`, compiler runner client) to require HTTPS and verify certificates.
  4. Add connectivity tests that reject plaintext HTTP between internal services.
- **Acceptance criteria:**
  - No internal service request travels as plaintext HTTP across a shared Docker bridge.
  - Clients reject untrusted or missing certificates.
  - Existing functionality remains intact over TLS.
- **Verification steps:**
  - Unit tests for internal clients pass with HTTPS-only assertions.
  - Compose render and `docker compose config` show TLS/network configuration.

### C4-US-007. Judge API IP Allowlist Default

- **Findings:** C4-003.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `src/lib/judge/ip-allowlist.ts`, `deploy-docker.sh`, `docker-compose.production.yml`, `.env.production.example`.
- **Plan:**
  1. Change the judge IP allowlist default to fail-closed: when `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is enabled, reject all judge API requests.
  2. In `deploy-docker.sh`, auto-populate `JUDGE_ALLOWED_IPS` from known worker/container network sources so a standard deploy does not break polling.
  3. Preserve an explicit allow-all escape hatch (`JUDGE_ALLOWED_IPS=0.0.0.0/0`) that logs a loud warning at startup.
  4. Add unit tests for default deny and explicit allow.
- **Acceptance criteria:**
  - Default production configuration denies unexpected judge API callers.
  - Standard deploy sets allowed IPs automatically.
  - Allow-all remains opt-in and logged.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/security/ip.test.ts` and judge-allowlist tests pass.
  - Deploy dry-run shows `JUDGE_ALLOWED_IPS` populated.

### C4-US-008. Raw SQL Schema Patch Governance

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-004.
- **Original severity/confidence:** CRITICAL / High.
- **Files:** `src/lib/db/migrate.ts`, `deploy-docker.sh`, `src/lib/judge/auth.ts`.
- **Plan:**
  1. Move the `secret_token` backfill/drop raw-SQL block out of `deploy-docker.sh` and into the Drizzle migration journal (or remove it if production databases already carry the replacement column).
  2. Until the migration journal owns the change, keep the existing `ALLOW_SECRET_TOKEN_BACKFILL=1` guard; default to skip and print a clear warning if the legacy column is still present.
  3. Audit `src/lib/db/migrate.ts` and `src/lib/judge/auth.ts` to ensure no other additive schema patches bypass the journal.
  4. Add an infra test that asserts no untracked raw SQL migration block runs by default.
- **Acceptance criteria:**
  - All additive schema changes are tracked in the Drizzle migration journal.
  - The raw SQL block cannot run without the explicit opt-in flag.
  - The documented sunset date (2026-10-26) remains visible.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/infra/deploy-security.test.ts` passes.
  - `npm run db:check` passes.

### C4-US-009. Real-Time Coordination Lock Bottleneck

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-008.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/lib/realtime/realtime-coordination.ts`.
- **Plan:**
  1. Replace the single PostgreSQL advisory lock that serializes every SSE acquisition and heartbeat with a partitioned or per-resource coordination mechanism (e.g., advisory locks keyed by `resourceType:resourceId`, or a Redis-backed coordination layer).
  2. Preserve correctness: no two instances may acquire the same shared SSE slot concurrently.
  3. Add a load/throughput benchmark for acquisition and heartbeat paths.
  4. Add regression tests for concurrent acquisition attempts.
- **Acceptance criteria:**
  - Real-time coordination no longer bottlenecks on a single global PostgreSQL lock.
  - Slot exclusivity is preserved under concurrent load.
- **Verification steps:**
  - Unit tests pass.
  - Load benchmark shows throughput improvement or at least no regression.

### C4-US-010. Docker Socket Proxy Privileges

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-009.
- **Original severity/confidence:** HIGH / High.
- **Files:** `docker-compose.production.yml`, `docker-compose.worker.yml`.
- **Plan:**
  1. Remove `POST`, `DELETE`, `ALLOW_START`, and `ALLOW_STOP` permissions from the Docker socket proxy environment.
  2. Restrict the proxy to read-only endpoints required by the app/worker (e.g., `GET /containers/json`, `GET /containers/{id}/json`, `GET /images/json` if absolutely necessary).
  3. Document the minimal required permissions in `docs/deployment.md`.
  4. Add a compose-render test that asserts the socket proxy cannot mutate container state.
- **Acceptance criteria:**
  - Socket proxy grants least privilege.
  - No production path requires container start/stop/create/delete through the proxy.
- **Verification steps:**
  - `docker compose -f docker-compose.production.yml config` renders the restricted env.
  - Infra tests reject mutable socket-proxy permissions.

### C4-US-011. Deploy Script Modularity, Atomicity, and Safety

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-010, C4-069, C4-070, C4-072, C4-074.
- **Original severity/confidence:** HIGH / High, MEDIUM / Medium.
- **Files:** `deploy-docker.sh`, `deploy-test-backends.sh`.
- **Plan:**
  1. Decompose `deploy-docker.sh` into phase scripts under `scripts/deploy/`: preflight, build, migrate, deploy, smoke, rollback.
  2. Implement per-phase rollback so a failed migration or smoke test reverts to the previous running containers.
  3. Add a deploy mutex (e.g., `flock` on a known file or remote lock) to prevent concurrent deploys to the same host.
  4. Move Playwright smoke tests to run against a canary/blue-green instance *before* switching traffic, or gate the traffic switch on smoke success.
  5. In worker sync, include `.env*` files only when explicitly intended and upsert all required worker tokens (`JUDGE_API_TOKEN`, etc.), not just `JUDGE_BASE_URL`.
- **Acceptance criteria:**
  - Deploy phases are isolated and individually callable.
  - Failed migrations/smoke tests do not leave broken state live.
  - Only one deploy can run against a target host at a time.
  - Fresh worker hosts receive all required tokens.
- **Verification steps:**
  - `shellcheck` passes on extracted scripts.
  - Dry-run deploy executes each phase without error.
  - Infra tests assert rollback/mutex patterns exist.

### C4-US-012. Rate-Limiting Single Source of Truth

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-011, C4-056, C4-057.
- **Original severity/confidence:** HIGH / High, MEDIUM / High.
- **Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/rate-limiter-client.ts`, `rate-limiter-rs/src/main.rs`.
- **Plan:**
  1. Make PostgreSQL the authoritative source of rate-limit counters; the sidecar may only check and cache, not maintain its own independent counter.
  2. Ensure that when the sidecar returns `allowed=false`, the attempt is still recorded in Postgres.
  3. Remove the duplicate counter increment in the sidecar `/check` path.
  4. Add consistency tests that compare sidecar verdicts against the database state.
- **Acceptance criteria:**
  - One authoritative counter per bucket.
  - No attempts are lost when the sidecar blocks.
  - No duplicate increments occur.
- **Verification steps:**
  - Rate-limit unit tests pass.
  - Integration test verifies DB/sidecar counter consistency.

### C4-US-013. Role/Capability Authorization Unification

- **Findings:** C4-012, C4-021, C4-066.
- **Original severity/confidence:** HIGH / High, MEDIUM / High.
- **Files:** `src/lib/db/schema.pg.ts`, `src/lib/capabilities/`, `src/lib/api/handler.ts`, `src/lib/auth/permissions.ts`.
- **Plan:**
  1. Unify authorization checks on capability strings rather than a mix of role names and capability strings.
  2. Fix `createApiHandler` role validation so custom roles declared in `auth.roles` are accepted (replace or augment `isUserRole()` with a capability check).
  3. Add cross-instance cache invalidation for the role/capability cache (e.g., listen to a settings-change event or use a short TTL).
  4. Add regression tests for custom-role access and capability-based guards.
- **Acceptance criteria:**
  - Custom roles work through `auth.roles`.
  - Capability strings are the single source of authorization truth.
  - Permission changes propagate across instances within a bounded window.
- **Verification steps:**
  - Unit tests for handler/permissions pass.
  - Multi-instance cache invalidation is demonstrated or tested.

### C4-US-014. Admin Restore/Import Security and Streaming

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-014, C4-029.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/lib/db/export-with-files.ts`.
- **Plan:**
  1. Confirm `preRestoreSnapshotPath` is removed from all JSON success/error responses (already implemented; verify and add negative test if missing).
  2. Stream uploaded backup files to disk in chunks instead of buffering the entire payload in memory.
  3. Keep full paths in server-side logs and audit events only.
  4. Add a memory-usage regression test or assertion for large restore payloads.
- **Acceptance criteria:**
  - No server-side filesystem path appears in API responses.
  - Large restores do not cause out-of-memory errors.
  - Audit logs retain the path for operators.
- **Verification steps:**
  - Admin restore/import unit tests pass.
  - Negative test rejects snapshot path in response body.

### C4-US-015. Language Configuration Contract

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-015.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/lib/judge/languages.ts`, `judge-worker-rs/src/languages.rs`, `scripts/sync-language-configs.ts`, `src/lib/db/schema.pg.ts`.
- **Plan:**
  1. Define a single source-of-truth language manifest (JSON schema or generated file).
  2. Derive TypeScript constants, Rust enums, and database enum constraints from the manifest.
  3. Update `scripts/sync-language-configs.ts` to fail if the three sources drift.
  4. Add a CI check that runs the sync script and fails on diff.
- **Acceptance criteria:**
  - Language config exists in exactly one editable source.
  - TS, Rust, and DB representations are auto-generated/validated.
  - Drift fails CI.
- **Verification steps:**
  - `npm run sync-language-configs` runs cleanly and produces no diff.
  - Unit tests for language config pass.

### C4-US-016. Function Judging Literal Validation

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-016.
- **Original severity/confidence:** HIGH / Medium.
- **Files:** `src/lib/judge/function-judging/`.
- **Plan:**
  1. Validate function-judging literal values against the target language's type ranges and formats before passing them to the runner.
  2. Reject out-of-range integers, malformed floats, invalid booleans, and oversized strings with a clear error taxonomy.
  3. Add per-language unit tests covering boundary and invalid literals.
- **Acceptance criteria:**
  - Invalid literals are rejected before execution.
  - Valid literals continue to produce correct judgments.
- **Verification steps:**
  - Function-judging unit tests pass.
  - New boundary/invalid literal tests pass.

### C4-US-017. Database Import Boolean Coercion Fix

- **Findings:** C4-017.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/lib/db/import.ts`, `tests/unit/db/import.test.ts` (or create `tests/unit/db/import-implementation.test.ts`).
- **Plan:**
  1. Replace `Boolean(val)` in `convertValue` for boolean columns with an explicit string mapper.
  2. Recognize `"false"`, `"0"`, `"no"`, `"off"` as `false` and `"true"`, `"1"`, `"yes"`, `"on"` as `true`, case-insensitively.
  3. Add a round-trip test covering `false`, `"false"`, `0`, `"0"`, `true`, `"true"`, `1`, `"1"`, `"yes"`, `"no"`.
- **Acceptance criteria:**
  - `"false"` imports as `false`.
  - Non-boolean columns are unaffected.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/db/import.test.ts` passes.

### C4-US-018. Files API Rate Limiting and Streaming

- **Findings:** C4-018, C4-022.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/app/api/v1/files/route.ts`, `src/app/api/v1/files/[id]/route.ts`.
- **Plan:**
  1. Ensure `GET /api/v1/files` carries `rateLimit: "files:list"` and consumes both IP-keyed and user-keyed limits (verify existing implementation).
  2. Add `rateLimit: "files:download"` to `GET /api/v1/files/[id]`.
  3. Stream file content from storage to the response instead of loading the entire file into memory.
  4. Add regression tests for throttling and large-file streaming.
- **Acceptance criteria:**
  - Both file list and file download endpoints are rate-limited.
  - File downloads stream; memory usage is bounded regardless of file size.
- **Verification steps:**
  - Files route unit tests pass.
  - Memory profiling for a large download shows no unbounded growth.

### C4-US-019. createApiHandler Error Taxonomy

- **Findings:** C4-019, C4-067.
- **Original severity/confidence:** HIGH / High, MEDIUM / High.
- **Files:** `src/lib/api/handler.ts`.
- **Plan:**
  1. Ensure unhandled exceptions in `createApiHandler` return the request/correlation ID and a stable error taxonomy code without exposing stack traces or internal details.
  2. Distinguish categories (validation, auth, rate-limit, internal) while keeping the generic 500 shape for unexpected errors.
  3. Add tests that assert request-ID and error taxonomy on real endpoints.
- **Acceptance criteria:**
  - Every error response includes the request ID.
  - Error taxonomy codes are present and do not leak internals.
- **Verification steps:**
  - Handler unit tests pass.
  - At least one route test per error category asserts taxonomy and request ID.

### C4-US-020. Judge Claim Heartbeat Integrity

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-020.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/lib/judge/worker.ts`.
- **Plan:**
  1. Separate the in-progress report path from the heartbeat path.
  2. Progress reports must update submission status only and must not reset `judgeClaimedAt`.
  3. Only dedicated heartbeat calls may extend the claim deadline.
  4. Add tests proving a worker cannot extend a claim indefinitely via status updates.
- **Acceptance criteria:**
  - In-progress reports do not extend claim expiry.
  - Heartbeats extend claims only within the configured window.
- **Verification steps:**
  - Judge worker unit tests pass.
  - Regression test demonstrates claim expiry despite repeated progress reports.

### C4-US-021. Cancellable Rust Sidecar Compute

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-023.
- **Original severity/confidence:** HIGH / Medium.
- **Files:** `code-similarity-rs/src/main.rs`.
- **Plan:**
  1. Make the `spawn_blocking` similarity-compute task abort-aware using a cancellation token or `tokio::select!` between work and cancellation.
  2. When the HTTP client disconnects, propagate cancellation to terminate CPU-bound work promptly.
  3. Add tests that spawn a long compute, drop the request, and assert the task stops.
- **Acceptance criteria:**
  - Client disconnect terminates sidecar compute within seconds.
  - CPU is not pinned by orphaned tasks.
- **Verification steps:**
  - `cargo test` in `code-similarity-rs` passes.
  - Manual smoke test confirms CPU drops after request cancellation.

### C4-US-022. Migration and Test Backend Script Security

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-024, C4-025, C4-026, C4-027, C4-073.
- **Original severity/confidence:** HIGH / High, HIGH / Medium, MEDIUM / Medium.
- **Files:** `deploy-docker.sh`, `deploy-test-backends.sh`, `pg-volume-safety-check.sh`, `deploy.sh`.
- **Plan:**
  1. Pin the versions installed by `npm install --no-save drizzle-kit ...` in migration containers; use `package-lock.json`/`npm ci` where possible.
  2. Avoid mounting full DB secrets into migration containers; use short-lived least-privilege credentials or environment-scoped secrets.
  3. Add an explicit production guard to `deploy-test-backends.sh` so it cannot stop the production compose stack.
  4. Validate the target path before `rm -rf ${NAMED_SRC}/*` in `pg-volume-safety-check.sh` (require absolute path, match expected pattern, use `find` with `-mindepth 1 -maxdepth 1`).
  5. Remove the executable bit from `deploy.sh` or replace it with a wrapper that delegates to `deploy-docker.sh`.
  6. Remove the hard-coded `judgekit_test` fallback password in `deploy-test-backends.sh`; fail if the password cannot be retrieved.
- **Acceptance criteria:**
  - Migration containers use pinned dependencies.
  - Full DB credentials are not exposed to one-off containers.
  - Test backend script cannot affect production.
  - `rm -rf` targets are validated.
  - Legacy `deploy.sh` is no longer a bypass vector.
- **Verification steps:**
  - `shellcheck` passes on modified scripts.
  - Infra tests assert production guard and path validation.

### C4-US-023. Docker Build Timeout Cleanup

> **Status:** Deferred to Cycle 5 — see `plan/cycle-4-2026-07-03-deferred.md` for exit criteria.


- **Findings:** C4-028.
- **Original severity/confidence:** HIGH / Medium.
- **Files:** `src/lib/docker/client.ts`.
- **Plan:**
  1. On `buildDockerImageLocal` timeout, kill the running `docker build` / `docker buildx build` process and prune the associated BuildKit build record.
  2. Ensure the timeout promise rejects with a structured error code so callers can distinguish timeout from build failure.
  3. Add a regression test that simulates a slow build and confirms no orphaned process remains.
- **Acceptance criteria:**
  - No `docker build` process outlives the configured timeout.
  - BuildKit records are cleaned up.
- **Verification steps:**
  - Unit tests pass.
  - Manual test with an intentionally slow build shows process termination.

### C4-US-024. Trusted Proxy Hops Default

- **Findings:** C4-030.
- **Original severity/confidence:** HIGH / Low.
- **Files:** `src/lib/security/ip.ts`.
- **Plan:**
  1. Require `TRUSTED_PROXY_HOPS` to be set explicitly in production; fail closed or log an error if it is unset.
  2. Add a runtime guard that prevents all traffic from collapsing into the shared `api:*:unknown` bucket when the XFF chain is missing or too short.
  3. Update `.env.production.example` and docs.
  4. Add tests for unset, zero, and valid proxy hops.
- **Acceptance criteria:**
  - Production cannot start with an implicit `TRUSTED_PROXY_HOPS` default that breaks rate-limit keys.
  - Missing/short XFF no longer poisons shared buckets.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/security/ip.test.ts` passes.
  - Env validation test fails on missing production proxy hops.

### C4-US-025. Similarity-Check Route Test Hardening

- **Findings:** C4-031, C4-049.
- **Original severity/confidence:** HIGH / High, MEDIUM / High.
- **Files:** `tests/unit/api/similarity-check.route.test.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`.
- **Plan:**
  1. Replace the wall-clock timeout test with fake timers or a mocked sidecar whose delay is controlled by the test.
  2. Add a test for the enrichment query failure path (database error during assignment/user enrichment).
  3. Ensure all similarity-check tests are deterministic under repeated runs.
- **Acceptance criteria:**
  - Timeout test does not flake.
  - Enrichment query failure returns the expected error taxonomy.
- **Verification steps:**
  - Run similarity-check route tests multiple times; all pass.
  - New enrichment-failure test passes.

### C4-US-026. Contest Join Route Test Hardening

- **Findings:** C4-032.
- **Original severity/confidence:** HIGH / High.
- **Files:** `tests/unit/api/contests.route.test.ts`, `src/app/api/v1/contests/join/route.ts`.
- **Plan:**
  1. Add tests verifying CSRF enforcement: missing token, invalid token, wrong origin.
  2. Add tests for malformed body handling (non-JSON, missing fields, wrong types).
  3. Verify the code-scoped and user-scoped failure rate-limiters are consumed on invalid attempts.
- **Acceptance criteria:**
  - CSRF and malformed-body behavior is asserted.
  - Rate-limit consumption on failed redemption is verified.
- **Verification steps:**
  - `npm run test:unit -- tests/unit/api/contests.route.test.ts` passes.

### C4-US-027. Request-ID and Error Taxonomy Route Tests

- **Findings:** C4-033.
- **Original severity/confidence:** HIGH / High.
- **Files:** `src/lib/api/handler.ts`, `tests/unit/api/*.test.ts`.
- **Plan:**
  1. Pick a representative route for each error category (auth, validation, rate-limit, internal).
  2. Add route-level tests that assert the response contains a `X-Request-Id` (or configured header) and an error taxonomy code.
  3. Document the expected header name and taxonomy field in `docs/api.md`.
- **Acceptance criteria:**
  - Real endpoints return request IDs on both success and error.
  - Error taxonomy is visible and testable on real endpoints.
- **Verification steps:**
  - Selected route tests pass.
  - Docs updated with header/taxonomy contract.

### C4-US-028. Integration Test Database Guard

- **Findings:** C4-034.
- **Original severity/confidence:** HIGH / High.
- **Files:** `tests/integration/db/*.test.ts`, `tests/integration/api/health.test.ts`.
- **Plan:**
  1. Replace silent skips with explicit fail-fast guards: if `DATABASE_URL` is missing, points to SQLite, or Postgres is unreachable, fail loudly with a clear message.
  2. Provide a `tests/integration/setup.ts` helper that validates the database and reports the required environment.
  3. Update CI to either provide Postgres or skip integration tests explicitly with `SKIP_INTEGRATION_TESTS=1`.
  4. Document integration test requirements in `docs/development.md` or `docs/api.md`.
- **Acceptance criteria:**
  - Integration tests never skip silently.
  - CI behavior is explicit (run with Postgres or skip with an env flag).
- **Verification steps:**
  - CI logs show integration tests running against Postgres or an explicit skip reason.
  - Local run without `DATABASE_URL` fails with a helpful message.
