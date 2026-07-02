# Cycle 2 (2026-07-02) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (2026-07-02 cycle) and the per-agent review files under `.context/reviews/`.

Supersedes the cycle-4 plan archived at `plan/archive/cycle-4-2026-07-01-review-remediation.md.archived`. Cycle-4 Phase A stories (A1–A12) are treated as completed and are not repeated here.

Repo rules honored: `CLAUDE.md` (preserve `src/lib/auth/config.ts`; `algo.xylolabs.com` is app-only; never build worker/language images there), `AGENTS.md` (testing rules, deployment safety), `.context/development/conventions.md` (semantic commits + gitmoji, GPG-signed, one fix per commit, every commit includes tests), `git pull --rebase` before push. Security/correctness/data-loss findings are NOT silently dropped or deferred without explicit risk acceptance.

Cycle constraints:
- Deploy mode is per-cycle. Targets: `algo.xylolabs.com`, `test.worv.ai`, `oj.auraedu.me`.
- Deploy command: `for target in algo worv auraedu; do DEPLOY_TARGET=$target SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh || exit 1; done`.
- Never run `docker system prune --volumes` or automated `docker volume prune`.
- Preserve `src/lib/auth/config.ts` as-is during deploy.

This cycle implements the remaining CRITICAL/HIGH security, correctness, and data-loss findings plus the non-deferrable MEDIUM findings from the aggregate. Broader roadmap, UI/UX, performance, documentation-drift, E2E/test-quality, and operational-convenience items are recorded in `plan/cycle-2-2026-07-02-deferred.md`.

---

## Phase A — Implement this cycle

### S1. Restore `client_max_body_size` to the generated nginx catch-all and fix static XFF templates
- **Finding citations:**
  - CRITICAL: "Generated nginx `location /` lacks `client_max_body_size`, breaking uploads >1 MiB" (aggregate lines 22, 794).
  - HIGH: "Nginx template/config mismatch: committed templates overwrite X-Forwarded-For" (aggregate lines 849, 895, 904).
  - MEDIUM: "Generated nginx drops global `client_max_body_size` for non-judge routes" (aggregate line 178).
- **Severity:** CRITICAL.
- **Files:** `deploy-docker.sh`, `scripts/online-judge.nginx.conf`, `scripts/online-judge.nginx-http.conf`, `src/lib/system-settings-config.ts`, `tests/unit/infra/judge-report-nginx.test.ts`, `tests/unit/infra/deploy-security.test.ts`.
- **Plan:**
  1. In the generated nginx template in `deploy-docker.sh`, add `client_max_body_size 50M;` (or derive from `uploadMaxFileSizeBytes`/`MAX_IMPORT_BYTES`) to the catch-all `location /` block.
  2. Optionally scope larger limits to `/api/v1/files/*` and `/api/v1/admin/*` explicitly.
  3. Replace `proxy_set_header X-Forwarded-For $remote_addr;` with `$proxy_add_x_forwarded_for` in the committed static nginx templates.
  4. Render the generated config in tests and assert both the body-size and XFF values.
- **Acceptance:**
  - Generated `location /` contains `client_max_body_size 50M;` (no default 1 MiB fallback).
  - No static template uses `$remote_addr` for `X-Forwarded-For`.
  - Unit tests pass and `deploy-docker.sh --dry-run` generation succeeds.

### S2. Segment internal Docker networks and reduce socket-proxy privileges
- **Finding citations:**
  - HIGH: "Internal service traffic is unencrypted HTTP on a flat network" (aggregate line 32).
  - HIGH: "Docker socket proxy grants broad container lifecycle privileges" (aggregate line 811).
  - MEDIUM: "Docker Compose lacks internal network segmentation" (aggregate line 988).
  - MEDIUM: "Judge worker container runs as root" (aggregate line 1037).
- **Severity:** HIGH.
- **Files:** `docker-compose.production.yml`, `Dockerfile.judge-worker`, `deploy-docker.sh`, `.env.production.example`.
- **Plan:**
  1. Define isolated networks in `docker-compose.production.yml` (`frontend`, `backend`, `judge`, `db`) and attach each service only to the networks it needs.
  2. Restrict `tecnativa/docker-socket-proxy` environment to the minimum required permissions; remove broad `DELETE=1`, `ALLOW_START=1`, `ALLOW_STOP=1`, `IMAGES=1` if not strictly required, or document why each remains.
  3. Add a non-root `USER` directive to the final stage of `Dockerfile.judge-worker`; `chown` the binary and `/judge-workspaces` to that user.
  4. Update `.env.production.example` and `deploy-docker.sh` to reference the new network names where needed.
- **Acceptance:**
  - `docker compose -f docker-compose.production.yml config` validates.
  - Worker container final stage has a `USER` directive and starts successfully.
  - Docker-proxy environment no longer grants arbitrary container lifecycle privileges.
  - App, worker, DB, and sidecars are reachable only across the networks they require.

### S3. Harden shell-command validation and runner authorization ordering
- **Finding citations:**
  - MEDIUM: "Rust runner `/run` endpoint accepts nested shells through single-quote gaps" (aggregate line 236).
  - MEDIUM: "Shell-command validators diverge and both permit shell interpreter invocations" (aggregate line 255).
  - MEDIUM: "Shell-command whitelist permits shell interpreters" (aggregate line 678).
  - MEDIUM: `/api/v1/compiler/run` consumes sandbox quota before capability check (aggregate line 264).
  - MEDIUM: `validateShellCommandStrict` rejects legitimate environment-variable prefixes (aggregate line 275).
  - LOW: "Rust runner shell validation lacks the TS allowed-prefix guard" (aggregate line 360).
  - LOW: "Validation failures return `exitCode: null`" (aggregate line 763).
- **Severity:** HIGH (combined sandbox-escape and authorization-ordering risk).
- **Files:** `src/lib/compiler/execute.ts`, `judge-worker-rs/src/runner.rs`, `src/app/api/v1/compiler/run/route.ts`, `tests/unit/compiler/execute.test.ts`, Rust tests.
- **Plan:**
  1. Define a single `ALLOWED_COMMAND_PREFIXES` set and an `isValidCommandPrefix` helper in `execute.ts`; reject `bash`, `sh`, `powershell`, `pwsh` as command prefixes and reject payloads that smuggle commands inside `-c` arguments or nested quotes.
  2. Port the same prefix whitelist to `judge-worker-rs/src/runner.rs` and apply it in the `/run` handler before `execute_run`.
  3. In `validateShellCommandStrict`, strip leading `KEY=VALUE` environment assignments before checking the prefix.
  4. Move the `content.submit_solutions` capability check in `/api/v1/compiler/run` before `gateSandboxEndpoint` (or add the requirement to the route's `auth` config).
  5. Return a numeric non-zero `exitCode` (e.g., `1`) instead of `null` when command validation fails.
- **Acceptance:**
  - `bash -c 'id'`, `sh -c '...'`, and single-quote-smuggled commands are rejected in both TS and Rust validators.
  - `CC=gcc gcc main.c` is accepted.
  - `/api/v1/compiler/run` returns 403 without consuming sandbox quota for callers lacking `content.submit_solutions`.
  - Validation failures return `exitCode: 1` and a clear `stderr` message.

### S4. Eliminate workspace leaks after sandbox `chown`
- **Finding citations:**
  - HIGH: "Compiler local-fallback workspace cannot be cleaned up after `chown` to sandbox UID" (aggregate line 549).
  - HIGH: "Judge-worker temp workspace cannot be removed after `chown` to sandbox UID" (aggregate line 559).
  - HIGH: "Local compiler fallback leaks workspaces after sandbox `chown`" (aggregate line 569).
  - HIGH: "Rust runner sidecar also leaks temp workspaces after sandbox `chown`" (aggregate lines 578, 587).
- **Severity:** HIGH.
- **Files:** `src/lib/compiler/execute.ts`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/runner.rs`, Rust tests, Node tests.
- **Plan:**
  1. In Node fallback, run the sandbox command in a subdirectory of the temp workspace that the app user can still delete, or spawn a privileged cleanup step, or `chown` the workspace back to the app user in a `finally` block.
  2. In Rust executor/runner, implement an explicit cleanup in `Drop` that first `chown`s the `TempDir` back to the worker uid before deletion, or use a wrapper that reports cleanup failures.
  3. Add tests that assert no `/tmp/compiler-*` or `/tmp/.tmp*` directories remain after a run.
- **Acceptance:**
  - After local-fallback compile/run, the temp workspace is removed.
  - After Rust executor and runner runs, temp workspaces are removed even when the process is not root.
  - Leak-regression tests pass on CI.

### S5. Fix similarity-check race conditions, timeout misclassification, and sidecar integration
- **Finding citations:**
  - HIGH: "Concurrent similarity checks can delete each other's anti-cheat events" (aggregate line 1241).
  - HIGH: "Similarity-check route misclassifies arbitrary failures as timeouts" (aggregate lines 1250, 1260).
  - HIGH: "Similarity-check Rust sidecar ignores the route's `AbortSignal`" (aggregate line 885).
  - HIGH: "Code-similarity client swallows errors and bypasses the logger" (aggregate line 420).
- **Severity:** HIGH.
- **Files:** `src/lib/assignments/code-similarity.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/lib/assignments/code-similarity-client.ts`, `tests/unit/api/similarity-check.route.test.ts`.
- **Plan:**
  1. Serialize similarity runs per assignment with a PostgreSQL advisory lock or a `running_since` guard; the second caller should wait for or observe the first run's results instead of blindly deleting and re-inserting.
  2. Distinguish `AbortError` (caller signal) from generic errors; only return `status: "timed_out"` when the abort was intentional or a true sidecar timeout occurred. Do not match on the substring `"timed out"` alone.
  3. Thread the caller's `AbortSignal` into `computeSimilarityRust` and compose it with a sidecar-specific timeout.
  4. Replace `console.warn` with the project `logger` and return structured error codes instead of swallowing exceptions to `null`.
- **Acceptance:**
  - Concurrent runs for the same assignment do not lose flagged pairs.
  - Database/network errors are surfaced as errors, not `timed_out`.
  - The sidecar request is cancelled when the route's 30-second signal fires.
  - Centralized logger receives similarity-sidecar warnings and errors.

### S6. Harden public auth routes, CSRF origin handling, and token revocation
- **Finding citations:**
  - HIGH: "Public state-changing auth routes bypass the CSRF guard" (aggregate line 50).
  - HIGH: "Token revocation has a one-second grace window" (aggregate line 79).
  - MEDIUM: "CSRF Origin check does not honor the database allowed-hosts list" (aggregate line 140).
  - LOW: "Public auth routes silently swallow malformed JSON bodies" (aggregate line 336).
  - LOW: "Invalid API keys are authenticated twice per request" (aggregate line 326).
  - LOW: "Dummy password hash uses a static, identifiable salt" (aggregate line 304).
- **Severity:** HIGH.
- **Files:** `src/app/api/v1/auth/forgot-password/route.ts`, `verify-email`, `reset-password`, `src/lib/security/csrf.ts`, `src/lib/auth/session-security.ts`, `src/lib/api/auth.ts`, `src/lib/auth/config.ts`, tests.
- **Plan:**
  1. Refactor the public auth routes to use `createApiHandler` (with CSRF enabled) or call `validateCsrf` explicitly before processing.
  2. Extend `validateCsrf` to consult the DB/system `allowedHosts` list in addition to `AUTH_URL`.
  3. Change token-revocation comparison to millisecond precision (`authenticatedAt.getTime() <= tokenInvalidatedAt.getTime()`).
  4. Return a distinct `invalidJson` error (HTTP 400) when `req.json()` throws, instead of an empty object.
  5. Cache the result of `authenticateApiKey` so a failed bearer key is not re-evaluated after JWT extraction.
  6. Replace the static `DUMMY_PASSWORD_HASH` constant with a hash generated from a random offline salt and document it as a deployment artifact (or generate per-process), preserving timing-safe comparison.
- **Acceptance:**
  - CSRF tests fail for missing `X-Requested-With`/Origin on forgot-password, verify-email, and reset-password.
  - A token issued one millisecond before revocation is rejected.
  - Hosts in `allowedHosts` pass CSRF origin validation.
  - Malformed JSON returns `invalidJson`.
  - Revoked API keys are authenticated once per request.

### S7. Improve error observability and fix the `tsc --noEmit` gate
- **Finding citations:**
  - HIGH: "Generic 500 catch-all hides root causes" (aggregate line 508).
  - MEDIUM: "API error handling swallows exceptions into generic 500s" (aggregate line 932).
  - HIGH: "`tsc --noEmit` gate fails on generated Next.js route validator" (aggregate line 1287).
- **Severity:** HIGH.
- **Files:** `src/lib/api/handler.ts`, `src/lib/proxy/middleware.ts`, `src/app/(public)/contests/manage/page.tsx`, `tsconfig.json`, `tests/unit/api/handler.test.ts`.
- **Plan:**
  1. Generate a request/correlation ID at the edge (middleware or handler wrapper), attach it to the logger child, and return it in the `X-Request-Id` response header.
  2. Introduce a minimal error taxonomy (programmer, operational, validation) and return a structured `code` field for known operational failures.
  3. Resolve the `/contests/manage` generated-route type conflict by adjusting the route/page layout, excluding the generated validator from `tsc`, or upgrading Next.js types so `npx tsc --noEmit` passes.
- **Acceptance:**
  - Unhandled exceptions include `X-Request-Id` and a machine-readable `code` when applicable.
  - `npm run lint` and `npx tsc --noEmit` pass.
  - Existing handler tests still pass.

### S8. Align judge/runtime configuration contract and sandbox policy
- **Finding citations:**
  - HIGH: "Language configuration is triplicated with no contract test" (aggregate line 41).
  - MEDIUM: "PID limits do not match the documented phase split" (aggregate line 653).
  - MEDIUM: "Judge-container DNS hardening is documented but not implemented" (aggregate line 617).
  - MEDIUM: "Local compiler fallback runs with default seccomp if custom profile is missing" (aggregate line 633).
  - MEDIUM: "Compile tmpfs is smaller than the compile memory limit" (aggregate line 607).
  - MEDIUM: "Source-code size limit is inconsistent between worker executor and runner" (aggregate line 457).
  - MEDIUM: "Runner run timeout omits Docker startup overhead" (aggregate line 449).
  - MEDIUM: "Node fallback run timeout counts container startup against the user budget" (aggregate line 643).
  - LOW: "PostScript runner disables SAFER mode" (aggregate line 1155).
  - LOW: "`execute.ts` `child.stdin.write` may not handle backpressure" (aggregate line 783).
- **Severity:** HIGH (language-contract + sandbox consistency).
- **Files:** `src/types/index.ts`, `judge-worker-rs/src/types.rs`, `src/lib/judge/languages.ts`, scripts/seed files, `judge-worker-rs/src/docker.rs`, `src/lib/compiler/execute.ts`, `AGENTS.md`, Rust tests, Node tests.
- **Plan:**
  1. Add a CI contract test (or a small script) that verifies the TypeScript `Language` union, the Rust `Language` enum, and seeded `language_configs` rows contain the same identifiers.
  2. Set `--pids-limit 64` for the run phase and `--pids-limit 128` for the compile phase in both Node and Rust Docker argument builders.
  3. Implement DNS hardening: pass `--dns 1.1.1.1` and bind-mount `/etc/resolv.conf` read-only (or apply `chattr +i` via a wrapper), aligning with `AGENTS.md`.
  4. Fail closed when `SECCOMP_PROFILE_PATH` is unset in production; keep the warning path for development only.
  5. Increase the compile tmpfs to at least the compile memory limit (2048 MB) or document the intentional cap.
  6. Align `MAX_SOURCE_CODE_BYTES` between the executor and the runner.
  7. Add `DOCKER_RUN_OVERHEAD_BUDGET_MS` to the runner and Node fallback run timeouts.
  8. Switch PostScript run command to `-dSAFER`; gate `-dNOSAFER` behind a problem-level flag if required.
  9. Handle `stdin.write` backpressure by checking the return value and awaiting `drain`.
- **Acceptance:**
  - Contract test passes and catches missing/new language mismatches.
  - PID limits are phase-specific in both Node and Rust.
  - Missing seccomp profile causes a clear error in production.
  - Source-code size limit is identical across executor and runner.
  - Runner and Node fallback timeouts include overhead budget.
  - PostScript runs with `-dSAFER` by default.

### S9. Harden deployment and test-backends scripts
- **Finding citations:**
  - HIGH: "`deploy-test-backends.sh` runs migrations inside the app container without `drizzle-kit`" (aggregate line 924).
  - HIGH: "`sshpass -p` exposes the SSH password in local process listings" (aggregate line 119).
  - MEDIUM: "SQLite seed in test-backends silently swallows all migration errors" (aggregate line 395).
  - MEDIUM: "Test-backends compose uses PostgreSQL 17 while claiming 18" (aggregate line 467).
  - MEDIUM: "Test-backends worker only polls the SQLite app queue" (aggregate line 688).
  - MEDIUM: "MySQL healthcheck hardcodes the default password" (aggregate line 208).
  - MEDIUM: "Many env vars are referenced in code but missing from `.env.example`" (aggregate line 1048).
  - MEDIUM: "Fixed `/tmp` nginx path creates races during parallel deploys" (aggregate line 998).
  - LOW: "Unfiltered `docker container prune -f` on app host" (aggregate line 476).
- **Severity:** HIGH.
- **Files:** `deploy-test-backends.sh`, `docker-compose.test-backends.yml`, `deploy-docker.sh`, `deploy.sh`, `.env.example`, `.env.production.example`, `scripts/bootstrap-instance.sh` (if needed), tests.
- **Plan:**
  1. Run `drizzle-kit push` from the host (with `DB_URL`) or from a dedicated migration container that includes dev dependencies; fail the script on non-zero exit.
  2. Remove the SQLite migration try/catch swallow so any error fails the deploy.
  3. Update `docker-compose.test-backends.yml` to `postgres:18-alpine` (or remove the "PG 18" comment).
  4. Add per-backend worker services or configure the single worker to poll all backend app queues.
  5. Use `${MYSQL_PASSWORD:-judgekit_test}` in the MySQL healthcheck.
  6. Audit `src/**`, `judge-worker-rs/src/**`, and `scripts/**` for `process.env.*` references and add missing variables to `.env.example` and `.env.production.example`.
  7. Use `mktemp` for the generated nginx config path in `deploy-docker.sh` to avoid parallel-deploy races.
  8. Replace `sshpass -p "$SSH_PASSWORD"` with the `SSHPASS` environment variable (e.g., `SSHPASS="$SSH_PASSWORD" sshpass -e ssh ...`) in both `deploy-docker.sh` and `deploy.sh`.
  9. Add `--filter` to `docker container prune` on the app host (e.g., `--filter "until=24h"`) to match the worker variant.
- **Acceptance:**
  - `deploy-test-backends.sh` applies schema to PostgreSQL and MySQL backends.
  - SQLite migration errors cause the script to exit non-zero.
  - Test-backends stack uses the documented PostgreSQL version.
  - Submissions to PostgreSQL/MySQL test backends are judged.
  - MySQL healthcheck works when `MYSQL_PASSWORD` is overridden.
  - `.env.example` documents all referenced environment variables.
  - Two parallel deploys cannot clobber the same `/tmp/judgekit-nginx.conf`.
  - `sshpass` no longer exposes the password in `ps` listings.

### S10. Add security headers to generated app and static-site nginx
- **Finding citations:**
  - MEDIUM: "Generated app nginx lacks security headers" (aggregate line 1017).
  - MEDIUM: "Public static-site reverse proxy lacks security headers and HSTS" (aggregate line 1073).
  - MEDIUM: "Static site nginx serves only HTTP with no redirect or HSTS" (aggregate line 1083).
  - MEDIUM: "Static-site nginx drops security headers for static assets" (aggregate line 1093).
  - LOW: "Static-site nginx still lacks HSTS and CSP" (aggregate line 371).
  - LOW: "Static-site nginx is decoupled from app security headers" (aggregate line 1175).
- **Severity:** MEDIUM.
- **Files:** `deploy-docker.sh`, `static-site/nginx.conf`, `static-site/static.nginx.conf`, `tests/unit/infra/deploy-security.test.ts`.
- **Plan:**
  1. Add `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, and `Strict-Transport-Security` headers to the generated app-server nginx config.
  2. Add an HTTPS server block or redirect in `static-site/nginx.conf` and include the same baseline headers.
  3. In `static-site/static.nginx.conf`, add headers to the HTTPS server block and ensure cached static-asset location blocks do not override them (use `include` or duplicate directives).
  4. Render generated and static configs in tests and assert headers are present on both HTML and static-asset responses.
- **Acceptance:**
  - Generated app nginx config sets all baseline security headers.
  - Static-site config redirects HTTP to HTTPS and sets HSTS/CSP.
  - Static assets receive `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.

### S11. Harden IP canonicalization, allowlist matching, and rate-limit ordering
- **Finding citations:**
  - MEDIUM: "IPv6 validation is permissive and does not canonicalize" (aggregate line 1028).
  - LOW: "IP allowlist matcher accepts leading-zero IPv4 octets" (aggregate line 1144).
  - LOW: "`ip-allowlist.ts` accepts leading-zero IPv4 octets in allowlist entries" (aggregate line 1212).
  - MEDIUM: "/api/v1/contests/join applies rate limit before recruiting-access rejection" (aggregate line 1112).
  - LOW: "Rate limiter runs before auth check in `createApiHandler`" (aggregate line 345).
- **Severity:** MEDIUM.
- **Files:** `src/lib/security/ip.ts`, `src/lib/judge/ip-allowlist.ts`, `src/app/api/v1/contests/join/route.ts`, `src/lib/api/handler.ts`, `src/lib/security/rate-limit.ts`, tests.
- **Plan:**
  1. Canonicalize IPv6 addresses before validation; reject invalid compression forms so equivalent strings map to the same rate-limit bucket and allowlist entry.
  2. Normalize IPv4 octets in `ip-allowlist.ts` (reject or canonicalize leading zeros) to match `src/lib/security/ip.ts`.
  3. Move the `recruitingAccess` rejection before rate-limit consumption in `/api/v1/contests/join`, or bucket recruiting candidates separately.
  4. For endpoints keyed on user identity, consume the rate limit after authentication; for IP-keyed endpoints, document the ordering trade-off.
- **Acceptance:**
  - Equivalent IPv6 strings produce the same canonical form in tests.
  - Allowlist entries with leading-zero octets match the canonical address.
  - Recruiting candidates cannot exhaust the contest-join rate limit.

### S12. Harden backup retention, timestamp parsing, and Java harness edge cases
- **Finding citations:**
  - MEDIUM: "Backup retention safety check ignores encrypted `.age` backups" (aggregate line 952).
  - MEDIUM: "Backup script off-host rclone copy has no timeout and silently skips when rclone is missing" (aggregate line 962).
  - MEDIUM: "`parseTimestampEpochMs` cannot parse nanosecond Docker timestamps" (aggregate lines 698, 708).
  - MEDIUM: "Java harness string escape assumes four hex digits after `\\u`" (aggregate line 439).
- **Severity:** MEDIUM.
- **Files:** `scripts/backup-db.sh`, `src/lib/compiler/execute.ts`, `src/lib/judge/function-judging/adapters/java.ts`, tests.
- **Plan:**
  1. Include `.age` files in the `NEWER_COUNT` safety check in `scripts/backup-db.sh`.
  2. Wrap the rclone copy with `timeout` and emit a clear warning/error when `BACKUP_REMOTE` is set but `rclone` is missing.
  3. Update `parseTimestampEpochMs` to truncate nanosecond fractional digits to milliseconds before `Date.parse`.
  4. In the Java adapter, check that at least four characters remain after `\\u` before calling `substring(i, i + 4)`.
- **Acceptance:**
  - Encrypted backups are counted toward retention safety.
  - rclone copy times out and reports missing binary.
  - Nanosecond Docker timestamps parse correctly.
  - A string ending in `\\u` no longer crashes the Java harness.

### S13. Improve settings consistency, transaction discipline, and migration import hygiene
- **Finding citations:**
  - MEDIUM: "`system_settings` cache can return stale data during background reload" (aggregate line 735).
  - MEDIUM: "Unit of work / transaction boundary discipline is inconsistent" (aggregate line 1103).
  - MEDIUM: "Problem-set visibility helpers use `unknown` casts" (aggregate line 519).
  - MEDIUM: "Function-judging adapters duplicate serialization logic between TS and Rust" (aggregate line 1008).
  - MEDIUM: "Deprecated migrate/import JSON path still accepts password in request body" (aggregate line 159).
  - LOW: "Admin settings audit payload omits security-relevant fields" (aggregate line 284).
  - LOW: "Async role helper exports are unused" (aggregate line 294).
  - LOW: "`decodeValue` throws on malformed stored function values" (aggregate line 497).
- **Severity:** MEDIUM.
- **Files:** `src/lib/system-settings.ts`, `src/lib/db/transaction.ts`, `src/lib/problem-sets/visibility.ts`, `src/lib/judge/function-judging/serialization.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/settings/route.ts`, `src/lib/auth/role-helpers.ts`, tests.
- **Plan:**
  1. Make `getConfiguredSettings()` await the DB reload after `invalidateSettingsCache()` or synchronously refresh the cache before returning.
  2. Route `rawQueryOne`/`rawQueryAll` through the active transaction client when inside `transactionContext`.
  3. Remove `unknown` casts from problem-set visibility queries; use typed Drizzle shapes or explicit runtime validation.
  4. Add a serialization round-trip contract/fuzz test for function judging to catch TS/Rust drift.
  5. Remove the JSON `{ password, data }` path from the migrate/import endpoint, or gate it behind an env flag defaulting to off and emit a `SECURITY_ALERT` audit log when used.
  6. Include `allowedHosts`, `sessionMaxAgeSeconds`, `emailVerificationRequired`, and `allowStandaloneCompilerInRestrictedModes` in the admin-settings audit payload.
  7. Remove the unused async role helpers or mark them deprecated.
  8. Wrap `decodeValue` JSON parsing in a try/catch and return a typed decode error.
- **Acceptance:**
  - Settings updates are visible immediately after invalidation.
  - Raw queries inside a transaction use the transaction client.
  - Problem-set query results are typed.
  - Function-judging round-trip test passes.
  - JSON password path is removed or default-off with a security alert.
  - Audit payload includes the listed security fields.

### S14. Fix Rust worker deregister semantics and rate-limiter monotonic clock
- **Finding citations:**
  - HIGH: "Rust worker `deregister` returns success on non-2xx responses" (aggregate line 69).
  - HIGH: "Rate-limiter sidecar uses wall-clock time for windows and blocks" (aggregate line 866).
  - LOW: "`SecretString` does not zeroize memory on drop" (aggregate line 486).
- **Severity:** HIGH.
- **Files:** `judge-worker-rs/src/api.rs`, `rate-limiter-rs/src/main.rs`, `judge-worker-rs/src/types.rs`, Rust tests.
- **Plan:**
  1. In `deregister`, return `Err` for any non-2xx HTTP status so callers can retry or surface the failure.
  2. Replace `SystemTime`-based window/block bookkeeping in the rate-limiter with a monotonic clock source (`std::time::Instant` or `tokio::time::Instant`).
  3. Implement a `Drop` handler for `SecretString` that overwrites the buffer with zeros before deallocation (or adopt a crate such as `zeroize`).
- **Acceptance:**
  - Worker deregister returns an error on 404/500 and the orchestrator does not treat it as success.
  - Rate-limiter tests assert correct behavior when the system clock jumps backward.
  - `SecretString` zeroizes on drop.

---

## Phase B — Deferred

Remaining product roadmap, UI/UX, performance, documentation-drift, E2E/test-quality, and operational-convenience items are recorded in `plan/cycle-2-2026-07-02-deferred.md`.
