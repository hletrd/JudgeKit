# Aggregate Multi-Agent Review — JudgeKit Cycle 2 / 2026-07-02

**Scope:** entire repository (`/tmp/judgekit-local`).
**Agents contributing:** code-reviewer, security-reviewer, perf-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, designer.




This concise aggregate focuses on CRITICAL/HIGH findings and selected MEDIUM issues with security, correctness, or data-loss impact, plus short UI/UX and documentation/test sections. Purely stylistic or roadmap items are omitted.

## Auth / API / CSRF

### CRITICAL: Generated nginx `location /` lacks `client_max_body_size`, breaking uploads >1 MiB

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger, security-reviewer, verifier
- **Files / Lines:** `deploy-docker.sh:1515,1542,1585,1612`; `src/app/api/v1/files/route.ts:35`; `src/lib/system-settings-config.ts:61`; `deploy-docker.sh` nginx template (catch-all `location /`)
- **Problem:** The hardened nginx config sets `client_max_body_size` only on `/api/auth/` (1m) and `/api/v1/judge/poll` (50M). The catch-all `location /` has no explicit limit, so it falls back to the nginx default of 1 MiB. The application defaults `uploadMaxFileSizeBytes` to 50 MiB.
- **Failure scenario:** Instructors uploading 10 MiB PDFs or ZIP archives of test data receive `413 Request Entity Too Large` before the application can validate the upload. Admin restore/import also fails for backup ZIPs/JSON exports >1 MiB. Admin restore/import accepts backup ZIPs and JSON exports that can be tens of megabytes (`src/app/api/v1/admin/restore/route.ts:69`, `src/app/api/v1/admin/migrate/import/route.ts:76`). File uploads through the generic API are also likely to exceed 1 MiB. nginx will reject them with `413 Payload Too Large` before the application sees them, forcing operators to bypass the restore workflow.
- **Suggested fix:** Add `client_max_body_size 50M;` to the `location /` block (or scope it to `/api/v1/admin/*` and `/api/v1/files/*`) and keep it aligned with `MAX_IMPORT_BYTES`.

### HIGH: Internal service traffic is unencrypted HTTP on a flat network

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** App, worker, rate-limiter, and code-similarity communicate over plain HTTP on the default Docker bridge. A compromised sidecar or auxiliary container can sniff bearer tokens, hidden test cases in claim responses, and submission source code.
- **Failure scenario:** A vulnerability in the code-similarity sidecar allows an attacker to run arbitrary code inside that container. Because all services share the bridge, the attacker can intercept `JUDGE_AUTH_TOKEN` and `RUNNER_AUTH_TOKEN` by passively observing traffic.

### HIGH: Language configuration is triplicated with no contract test

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** The same language list and command templates are authored in TypeScript, Rust, and the database. Adding a language requires touching at least five places and keeping naming conventions aligned (`clang_cpp23` vs `ClangCpp23`, etc.). The worker reads `dockerImage`/`compileCommand`/`runCommand` from the DB at runtime, but the Rust enum must still contain the variant and the TS union must still contain the key. There is no generated contract or test that proves all three sources agree.
- **Failure scenario:** An admin enables a language that exists in the DB but whose Rust enum variant is missing or spelled differently; the worker deserializes the claim request and the submission hangs/fails with an internal parse error. Conversely, a Rust-only language cannot be selected from the UI because the TS union lacks it.

### HIGH: Public state-changing auth routes bypass the CSRF guard

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Problem:** These `POST` handlers do not use `createApiHandler` and never call `validateCsrf`. The project baseline requires `X-Requested-With`, `Sec-Fetch-Site`, and Origin checks for all state-changing API routes.
- **Failure scenario:** A malicious site can submit an HTML form to `/api/v1/auth/forgot-password` without JavaScript headers, causing password-reset email spam to arbitrary addresses and consuming the per-email rate-limit budget. The same cross-origin submission works against `/verify-email` and `/reset-password`.

### HIGH: Raw SQL additive patches bypass the Drizzle migration journal

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect, debugger
- **Files / Lines:** `deploy-docker.sh:1144-1227`; `src/lib/db/migrate.ts:1-7`; `scripts/check-migration-drift.sh:1-28`
- **Problem:** `deploy-docker.sh` applies additive schema changes via raw `psql` after `drizzle-kit push` (the `secret_token` backfill/drop). Because the column is already absent by the time `push` runs, the journal does not capture the transition. A DR replay from the journal can produce a schema that is inconsistent with the current app expectations. The deploy script applies additive schema changes via raw `psql` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) after `drizzle-kit push`. Because the column already exists, `drizzle-kit push` does not generate a journal entry. A disaster-recovery replay from the journal produces a schema missing those columns.
- **Failure scenario:** A disaster-recovery replay from the journal produces a schema still containing `judge_workers.secret_token` or missing the hash column cleanup; queries or auth checks fail at runtime. A new environment is stood up from backups and migrations. `problems.default_language` and `system_settings.default_language` are absent; queries fail at runtime with "column does not exist".

### HIGH: Rust worker `deregister` returns success on non-2xx responses

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Files / Lines:** `judge-worker-rs/src/api.rs:154-158`
- **Problem:** `deregister` logs a warning for non-success HTTP status but still returns `Ok(())`. Application-level failures (auth mismatch, stale worker id, 404, 500) are treated as success.
- **Failure scenario:** Ghost worker registrations remain in the database; the orchestrator may believe capacity is still available.

### HIGH: Token revocation has a one-second grace window

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Files / Lines:** `src/lib/auth/session-security.ts:33-34`
- **Problem:** `isTokenInvalidated` compares `authenticatedAtSeconds < Math.floor(tokenInvalidatedAt.getTime() / 1000)`. Both sides are truncated to whole seconds, so a token created in the same wall-clock second as revocation is still considered valid.
- **Failure scenario:** An admin disables a user at 12:00:00.600. A token issued at 12:00:00.100 has `authenticatedAtSeconds = 0` and revocation also floors to `0`. The comparison `0 < 0` is false, so the revoked session remains usable until it expires or another second elapses.

### HIGH: `AUTH_TRUST_HOST` defaults to `true` in production

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer, verifier
- **Files / Lines:** `deploy-docker.sh:700, 828, 894`, `docker-compose.production.yml:106`, `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:321`
- **Problem:** `deploy-docker.sh` generates `.env.production` with `AUTH_TRUST_HOST=true` and enforces the literal value during backfill; `docker-compose.production.yml` defaults the same. `shouldTrustAuthHost()` returns `true` whenever the env var is set to `"true"`. With NextAuth’s `trustHost` enabled, Auth.js derives canonical URLs from the incoming `Host` / `X-Forwarded-Host` headers. The generated nginx template overwrites `Host` but does **not** strip a client-supplied `X-Forwarded-Host`.
- **Failure scenario:** An attacker making direct requests to the origin with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate callback URLs, email links, or session state bound to an attacker-controlled host. If OAuth providers or magic-link flows are enabled later, this becomes an account-takeover vector; today it weakens CSRF origin checks that rely on `AUTH_URL`. An attacker sending direct HTTPS requests with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate session state, callback URLs, or password-reset links bound to an attacker-controlled domain.
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is explicitly set; use `AUTH_URL` and DB `allowedHosts` as the trusted-host set. In nginx, explicitly overwrite or remove `X-Forwarded-Host` before proxying to the app.

### HIGH: `sshpass -p` exposes the SSH password in local process listings

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `deploy-docker.sh:392,595`; `deploy.sh:58,66`
- **Problem:** When `SSH_PASSWORD` is set, the script invokes `sshpass -p "$SSH_PASSWORD" ssh …`. On the deploying machine the password is visible in `ps`/`/proc` to any local user while the SSH command is running.
- **Failure scenario:** A shared CI runner or operator laptop has other users/processes. While `deploy-docker.sh` runs, `ps aux` reveals the password for the `sshpass` process.

### MEDIUM: Admin restore/import responses leak server-side snapshot path

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `src/app/api/v1/admin/restore/route.ts:170, 196, 207, 229, 239`; `src/app/api/v1/admin/migrate/import/route.ts:115-142`
- **Problem:** The `preRestoreSnapshotPath` filesystem path is returned verbatim in JSON responses to authenticated admin callers.
- **Failure scenario:** A compromised admin account, malicious browser extension, or accidentally shared API response reveals the exact host path layout (e.g., `/home/deployer/data/pre-restore-snapshots/...`), which aids lateral movement and targeted file access.
- **Suggested fix:** Return only a snapshot ID or timestamp that operators can correlate with server logs; log the full path server-side.

### MEDIUM: CSRF Origin check does not honor the database allowed-hosts list

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** code-reviewer
- **Problem:** `validateCsrf` only compares the Origin host to `AUTH_URL` (or request headers in development). It does not consult the settings-driven `allowedHosts` list that the server-action origin validator uses.
- **Failure scenario:** An operator adds a new front-end origin to `allowedHosts` via `/admin/settings`. Server actions from that origin succeed, but API calls receive `403 csrfValidationFailed` even though the host is explicitly trusted.

### MEDIUM: Deprecated migrate/import JSON path still accepts password in request body

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `src/app/api/v1/admin/migrate/import/route.ts:145-185`
- **Problem:** The endpoint still supports a JSON body of `{ password, data }` and validates the admin password from the request body. It logs a deprecation warning and adds `Deprecation`/`Sunset` headers, but the path remains functional until November 2026.
- **Failure scenario:** Any reverse proxy, WAF, or debug middleware that logs request bodies will capture the admin password in plaintext. This is exactly the scenario the multipart path was introduced to avoid.
- **Suggested fix:** Remove the JSON path, or gate it behind an env flag that defaults to off before the stated sunset. Emit a rate-limited `SECURITY_ALERT` log if the legacy path is used.

### MEDIUM: Function-judging literal values are not validated against target-language ranges

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** code-reviewer
- **Problem:** The serialization layer preserves int64 precision, but the authoring UI/API does not reject values outside the target language's safe range (e.g., a Java `long` larger than `Long.MAX_VALUE`).
- **Failure scenario:** An author enters a value that the target harness cannot represent, producing wrong verdicts or harness crashes.

### MEDIUM: Rate-limiting has two sources of truth (sidecar + DB)

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** API rate limits use the `rate-limiter-rs` sidecar as a fast pre-check, then always hit the DB as the authoritative source. The sidecar is stateful and in-memory; if it restarts, its counters reset, while the DB path continues. The two stores can disagree during partial outages. The sidecar circuit breaker is also process-local, so a multi-instance deployment sees inconsistent sidecar health.
- **Failure scenario:** An attacker exceeds the rate limit. The sidecar says blocked, but a DB race or clock-skew handling difference allows one request through before the DB path also blocks. The result is non-deterministic 429s that are hard to explain to users.

### MEDIUM: Role/capability authorization is split across role names and capability strings

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** Authorization uses both role names (`admin`, `instructor`, etc.) and capability strings. Roles are stored as text in `users.role` with a foreign-key reference to `roles.name`, but capabilities are checked at runtime from the role. There is no database-enforced guarantee that a role's capabilities are consistent with its name, and custom roles can silently lose required capabilities.
- **Failure scenario:** An operator renames the `admin` role in the DB. The `users.role` FK restricts deletion but not capability mapping, so existing admins keep their role name but `resolveCapabilities` may return an empty set, locking them out of admin endpoints.

### MEDIUM: Rust runner `/run` endpoint accepts nested shells through single-quote gaps

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `judge-worker-rs/src/runner.rs:124-176,813-825,887-900`
- **Problem:** `validate_shell_command` blocks a short denylist but permits `&&`, `;`, environment prefixes, and does not reject single quotes or the tokens `bash`/`sh`. Because the runner wraps the supplied command in `sh -c`, a caller can smuggle arbitrary commands inside quotes.
- **Failure scenario:** A leaked `RUNNER_AUTH_TOKEN` lets an attacker execute arbitrary code inside the judged container to probe syscalls or wage a noisy DoS.

### MEDIUM: Shell-command validators permit shell interpreter invocations

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger
- **Files / Lines:** `src/lib/compiler/execute.ts:189-218,243-251`
- **Problem:** Both validators claim to be "kept in lock-step" but differ materially. More importantly, both allow the tokens `bash`/`sh`/`powershell`/`pwsh` as command prefixes and wrap the supplied command in `sh -c`, so a payload can be smuggled inside `-c` arguments. `validateShellCommandStrict` accepts `bash`, `sh`, `powershell`, `pwsh` as command prefixes. A compromised `language_configs` row can set `runCommand` to `bash -c '...'` and the denylist is bypassed because the payload lives inside the `-c` argument.
- **Failure scenario:** A leaked `RUNNER_AUTH_TOKEN` or a compromised `language_configs` row allows arbitrary command execution inside the judged container. An attacker who can modify a language config runs arbitrary code inside the judged container.

### MEDIUM: `/api/v1/compiler/run` consumes sandbox quota before capability check

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `src/app/api/v1/compiler/run/route.ts:77-88`
- **Problem:** The route calls `gateSandboxEndpoint` (email verification + daily quota) before checking whether the caller has the `content.submit_solutions` capability. By contrast, `/api/v1/playground/run` checks the capability in the `auth` config first.
- **Failure scenario:** An authenticated user whose role lacks `content.submit_solutions` (e.g., a recruiting candidate or suspended account) can still consume their 500-run daily compiler quota. Once the quota is exhausted, the same user cannot use legitimate compiler endpoints even after the capability is granted until the rolling 24-hour window resets.
- **Suggested fix:** Move the capability check before `gateSandboxEndpoint`, or add the capability requirement to the route’s `auth` config so the wrapper rejects unauthorized callers before any quota or sandbox bookkeeping.

## Documentation / Tests

### MEDIUM: Deployment/infrastructure tests verify string presence, not behavior

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** verifier
- **Failure scenario:** `deploy-docker.sh` could contain `docker image prune -f` inside an `if false; then ... fi` block and the storage-safety test would still pass. The XFF/body-size findings above are exactly the kind of drift these tests miss because they do not render and validate the generated config.

### MEDIUM: `roc` language support is inconsistent across the stack

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** verifier
- **Failure scenario:** If an admin enables `roc` in `language_configs`, the worker can attempt to run it while the app layer treats the language identifier as invalid, leading to mismatched validation or UI errors.

## Judge Worker / Rust

### HIGH: Code-similarity client swallows all errors and bypasses the logger

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Problem:** `computeSimilarityRust` hard-codes `AbortSignal.timeout(25_000)`, ignores the caller's signal, catches all errors, returns `null`, and uses `console.warn` instead of the project's `logger`.
- **Failure scenario:** Centralized logging/formatter is bypassed; callers cannot distinguish network failure, timeout, auth failure, or malformed payload; the caller's abort signal is ignored.

### HIGH: Real-time coordination does not scale beyond single instance without DB locks

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** SSE connection slots and exam heartbeats are coordinated either process-locally (single-instance mode) or via PostgreSQL advisory locks. The module explicitly warns that multi-instance deployments require `REALTIME_COORDINATION_BACKEND=postgresql`, which serializes every SSE acquisition and heartbeat update through `pg_advisory_xact_lock` and a single table. This is a DB bottleneck and an anti-pattern for real-time fan-out.
- **Failure scenario:** A contest with 1,000 concurrent users opens. Each SSE connection attempt acquires an advisory lock and performs `DELETE + SELECT count(*) + INSERT` in a transaction. Lock contention and table bloat cause connection acquisition latency to spike, degrading the live submission-status experience.

### MEDIUM: `GET /api/v1/files` has no rate limit

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `src/app/api/v1/files/route.ts:155-208`
- **Problem:** The file-list endpoint is wrapped with `createApiHandler` but omits a `rateLimit` key. It performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search over filenames.
- **Failure scenario:** An authenticated attacker can scrape or brute-force paginated file lists without throttling, driving unnecessary database load and potentially enumerating every uploaded file’s metadata.
- **Suggested fix:** Add `rateLimit: "files:list"` (or reuse `files:upload`) to the `GET` handler config. ## Judge Worker / Rust

## Other

### HIGH: Generic 500 catch-all hides root causes

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Files / Lines:** `src/lib/api/handler.ts:210-212`
- **Problem:** Every unhandled exception returns `{ error: "internalServerError" }` with no request id, structured error code, or correlation id. The log includes method and path but no correlation handle.
- **Failure scenario:** Harder incident response; clients cannot distinguish retryable vs non-retryable failures; repeated identical errors are hard to group.

## Sandbox / Compiler / Execution

### HIGH: Compiler local-fallback workspace leaks after sandbox `chown`

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger
- **Files / Lines:** `src/lib/compiler/execute.ts:724-758` (workspace setup), `842-848` (cleanup)
- **Problem:** `executeCompilerRun` creates a temp workspace, writes the source file, then `chown`s both the directory and source file to `SANDBOX_UID=65534` with modes `0o700`/`0o600`. The production Dockerfile runs the Next.js app as the `nextjs` user (uid 1001). The `finally` block's `rm(workspaceDir, { recursive: true, force: true })` therefore fails with `EACCES`; the error is only logged, so the directory is leaked. The local fallback `chown`s the workspace and source file to uid/gid `65534` (`nobody`) with modes `0o700`/`0o600`. The `finally` block then calls `rm(workspaceDir, { recursive: true })` from the Next.js process uid (`nextjs`, uid 1001 in production), which fails with `EACCES`. The caught warning masks the leak.
- **Failure scenario:** Every local-fallback compiler run (or every run if `COMPILER_RUNNER_URL` is misconfigured) leaves a `/tmp/compiler-*` directory behind. Over time `/tmp` fills up and the host runs out of inodes/disk space, eventually causing Docker builds and the app itself to fail. Every local-fallback compile/run leaves a `compiler-*` directory under `/tmp`/`$COMPILER_WORKSPACE_DIR`; over time the app-server disk fills. Leaked workspaces may also contain student source or hidden test data.

### HIGH: Judge-worker temp workspace cannot be removed after `chown` to sandbox UID

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `judge-worker-rs/src/executor.rs:303-361` (setup), `691` (drop)
- **Problem:** The Rust executor creates a `tempfile::TempDir`, then `chown`s it to `65534:65534` with mode `0o700`. `TempDir::drop` silently ignores cleanup failures. If the worker process is not running as root, it cannot delete the directory, so every judgement leaks a workspace directory.
- **Failure scenario:** A dedicated worker judging thousands of submissions per day leaves thousands of `/tmp/.tmp*` directories. The implicit drop means no operator-visible error; only disk exhaustion eventually alerts them.

### HIGH: Rust runner sidecar temp workspace leaks after sandbox `chown`

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger
- **Files / Lines:** `judge-worker-rs/src/runner.rs:747-796` (setup), `924` (drop)
- **Problem:** `execute_run` creates a `tempfile::TempDir`, then `chown`s it and the source file to `65534:65534` with mode `0o700`/`0o600`. `TempDir::drop` silently ignores cleanup failures, and if the worker process is not root it cannot delete the directory. Identical to #2: `execute_run` in the runner sidecar creates a `TempDir`, hardens it with `chown` to 65534, and relies on `Drop`. The runner process is not guaranteed to run as root, so cleanup fails silently.
- **Failure scenario:** A dedicated worker judging thousands of submissions per day leaves thousands of `/tmp/.tmp*` directories; disk exhaustion eventually alerts operators, but no operator-visible error is emitted. Every `/run` request handled by the sidecar leaks a workspace. Under load the sidecar becomes a primary source of disk exhaustion on the worker.

## Security / IP Trust / Reverse Proxy

### HIGH: Docker socket proxy grants broad container lifecycle privileges

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1 IMAGES=1`. The worker can create, start, stop, delete arbitrary containers and list images on the host Docker daemon.
- **Failure scenario:** A compromised worker sends Docker API requests through the proxy to spawn a privileged container with `--pid=host` or host volume mounts, escaping the sandbox and gaining host access.

### HIGH: Judge API IP allowlist defaults to allow-all in production

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer, verifier
- **Files / Lines:** `src/lib/judge/ip-allowlist.ts:17-25, 178-210`; generated `.env.production` in `deploy-docker.sh:658-682`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file does not set either variable, and the generated `.env.production` does not populate an allowlist. The code logs a one-time warning, but the open posture ships by default.
- **Failure scenario:** A leaked `JUDGE_AUTH_TOKEN` (via env backup, CI log, container inspect, or unencrypted backup) lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.

### HIGH: Rate-limiter sidecar uses wall-clock time for windows and blocks

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `rate-limiter-rs/src/main.rs:137-142,152-281,292-315`
- **Problem:** `now_ms()` is `SystemTime::now().duration_since(UNIX_EPOCH)`. All rate-limit decisions compare this wall-clock value against `window_started_at`, `blocked_until`, and `last_attempt`. If the system clock jumps backward (NTP sync, manual adjustment), an active block can appear to have expired and a window may not reset when it should.
- **Failure scenario:** An attacker is blocked for 15 minutes after failed logins. The host's NTP client corrects the clock backward by 5 minutes. The sidecar now believes the block has expired and allows more attempts. The PostgreSQL-backed limiter (which uses DB time) remains correct, but the sidecar fast-path becomes the weak link.

### HIGH: Similarity-check Rust sidecar ignores the route's `AbortSignal`

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-64`; `src/lib/assignments/code-similarity.ts:371-386`; `src/lib/assignments/code-similarity-client.ts:35-62`
- **Problem:** The route creates a 30-second `AbortController` and passes the signal into `runAndStoreSimilarityCheck`. That signal is forwarded only to the TypeScript fallback path. The Rust sidecar call in `computeSimilarityRust` uses its own hard-coded `AbortSignal.timeout(25_000)` and does not accept, compose, or propagate the caller's signal. It catches all exceptions and returns `null`.
- **Failure scenario:** If the Rust sidecar is slow but not quite 25 seconds, or if the caller wants to abort earlier, the route cannot cancel the sidecar request. A Rust-sidecar timeout returns `null`, falls through to the TS fallback, and may consume the full 30 seconds without returning the explicit `timed_out` status the test expects.

### HIGH: Standalone nginx templates still overwrite the X-Forwarded-For chain

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger, verifier
- **Files / Lines:** `scripts/online-judge.nginx.conf:62-63,76-77,87-88,99-100`; `scripts/online-judge.nginx-http.conf:33,44`; `deploy.sh:257`
- **Problem:** While `deploy-docker.sh` was fixed to use `$proxy_add_x_forwarded_for`, the static templates used by the legacy `deploy.sh` path and manual installs still use `proxy_set_header X-Forwarded-For $remote_addr;`. This replaces any existing forwarded-for chain with a single immediate client IP. The app's `extractClientIp` (default `TRUSTED_PROXY_HOPS=1`) requires the chain to contain the real client IP followed by each trusted proxy. When the chain is truncated, the hop-count guard fails and the app returns `null` in production. These standalone templates use `proxy_set_header X-Forwarded-For $remote_addr;`, replacing any existing forwarded-for chain with a single entry. `extractClientIp` with default `TRUSTED_PROXY_HOPS=1` requires `parts.length >= trustedHops + 1`, so it returns `null` in production.
- **Failure scenario:** Production is fronted by Cloudflare or a corporate load balancer. Nginx receives `X-Forwarded-For: <real-client>, <cloudflare>` but overwrites it with `X-Forwarded-For: <cloudflare-ip>`. The app now sees only one hop while expecting two, so all client IP extraction fails. Rate-limit keys, audit logs, and the judge IP allowlist become unreliable. Rate limiting collapses to a single global bucket; legitimate judge workers may be denied if `JUDGE_ALLOWED_IPS` is configured; audit logs lose client attribution. An operator who copies the committed template to a new host, or a dev/CI path that uses the static file instead of running `deploy-docker.sh`, will collapse the XFF chain. `extractClientIp` with `TRUSTED_PROXY_HOPS=1` then sees only one hop and returns `null`, breaking rate-limit keys, audit attribution, and judge IP allowlists.

### HIGH: `deploy-docker.sh` exceeds modularization threshold and couples unrelated concerns

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** A single shell script performs SSH setup, remote architecture detection, env generation, Docker builds (app + worker + ~100 languages), BuildKit recovery, DB migration, raw SQL additive patches, nginx generation, container lifecycle, health checks, artifact pruning, and worker-host reconciliation. Any failure late in the script leaves prior mutations applied with no automated rollback. The script is also difficult to unit-test, review, and reuse.
- **Failure scenario:** A typo in the nginx heredoc causes the deploy to fail after migrations have already run and new app/worker containers have started. The operator must manually determine whether to roll back the DB, restart old containers, or fix the nginx template and re-run. During incident response this ambiguity extends downtime.

### HIGH: `deploy-test-backends.sh` runs migrations inside the app container without `drizzle-kit`

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Problem:** The script runs `docker exec -e DB_DIALECT=${dialect} ${container} npx drizzle-kit push` inside the `judgekit-app` container. The production `Dockerfile` does not copy `drizzle-kit` (a `devDependency`) into the runner stage, so `npx` will try to download it and will fail in an offline/air-gapped container. The script only `warn`s on failure.
- **Failure scenario:** On a clean test deploy, PostgreSQL and MySQL backends start but have no schema. The deploy appears to succeed while backend endpoints 500 on every DB query.

### MEDIUM: Docker Compose lacks internal network segmentation

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `docker-compose.production.yml` (no `networks:` block, services defined at lines 13-180)
- **Problem:** All services (`db`, `app`, `judge-worker`, `docker-proxy`, `code-similarity`, `rate-limiter`) share the default bridge network.
- **Failure scenario:** A compromised sidecar or auxiliary container can reach `db:5432`, `app:3000`, and `judge-worker:3001`, enabling lateral movement and expanding the blast radius of a single container breach.
- **Suggested fix:** Define isolated networks (`frontend`, `backend`, `judge`, `db`) and attach each service only to the networks it needs.

### MEDIUM: Generated app nginx lacks security headers

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `deploy-docker.sh:1471-1630`; `src/lib/api/handler.ts:199-207`
- **Problem:** Neither the generated app-server nginx config sets `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, or `Strict-Transport-Security`. The app-level handler only adds `Cache-Control` and `X-Content-Type-Options`.
- **Failure scenario:** Clickjacking, MIME-sniffing attacks, referrer leakage, and downgrade attacks become possible.

### MEDIUM: Judge worker container runs as root

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** architect, security-reviewer
- **Files / Lines:** `Dockerfile.judge-worker` (lines 27-42, no `USER` directive)
- **Problem:** The final `runner` stage does not drop to a non-root user. It runs the worker process as root inside the container. The worker final stage does not drop to a non-root user. Combined with the Docker socket proxy, a sandbox escape or supply-chain compromise inside the worker yields root-equivalent privileges in the container and broad Docker API access.
- **Failure scenario:** A sandbox escape, supply-chain compromise, or bug in the worker gives root privileges inside the container, making host compromise via the Docker socket proxy or workspace mounts easier.
- **Suggested fix:** Add a non-root user/group in the final stage, `chown` the binary and `/judge-workspaces`, and end with `USER <uid>:<gid>`. Ensure the user can still reach `docker-proxy:2375` and write to `/judge-workspaces`.

### MEDIUM: Unit of work / transaction boundary discipline is inconsistent

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** architect
- **Problem:** `execTransaction` wraps callbacks in a Drizzle transaction, but `rawQueryOne`/`rawQueryAll` use the global pool and do not participate in an open transaction. The codebase uses `transactionContext` (AsyncLocalStorage) only to detect this mistake, not to route queries to the transaction client. Many route handlers perform multiple DB operations without an explicit transaction.
- **Failure scenario:** A submission creation writes the submission row, increments pending count, and logs an audit event in separate calls. If the process crashes between calls, the DB is left inconsistent (submission exists but audit event is missing, or pending count is wrong).

## Similarity / Anti-cheat

### HIGH: Concurrent similarity checks can delete each other's anti-cheat events

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:440-452`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:50`
- **Problem:** Two concurrent similarity runs for the same assignment each read the same submission set, compute independently, then run `db.transaction(delete old events → insert new events)`. PostgreSQL serializes the write transactions, so the later transaction deletes the events the earlier one just inserted.
- **Failure scenario:** Two TAs click "Run similarity check" at the same time. The final state contains only one run's flagged pairs; the other is silently lost.

### HIGH: Similarity-check route misclassifies arbitrary failures as timeouts

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-62`
- **Problem:** The catch block returns `timed_out` whenever `error.name === "AbortError"` **or** `error.message.includes("timed out")`. Any downstream DB timeout, DNS failure, or network error whose message contains the substring `"timed out"` is reported as a scan timeout. The catch block returns the `timed_out` envelope if `error.name === "AbortError"` OR `error.message.includes("timed out")`. The string match is broad.
- **Failure scenario:** False-positive timeout flags in UI/audit logs; real infrastructure failures are masked. A database query timeout inside `runAndStoreSimilarityCheck` could be surfaced to the dashboard as `status: "timed_out"`, misleading an admin into thinking the similarity engine was slow rather than that the database is unhealthy.

## Tests / Verification

### HIGH: `tsc --noEmit` gate fails on generated Next.js route validator

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Problem:** The route has a client layout (`"use client"`) and a server page. Next.js generates `AppPageConfig<"/contests/manage">` while simultaneously classifying `/contests/manage` only as a `LayoutRoute`, so the generated validator cannot satisfy the `Route` constraint `"/"`.
- **Failure scenario:** `npm run lint` / `npx tsc --noEmit` (the documented quality gate) fails in CI even though `next build` succeeds, blocking merges and forcing developers to bypass the gate.

## UI / UX / Accessibility

### MEDIUM: Empty `<SelectValue />` shows raw option values

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Problem:** `AGENTS.md` explicitly forbids `<SelectValue />` without static children because `@base-ui/react/select` will render the raw `value` string. In these selects the trigger is empty, so users see raw status IDs, user IDs, `all`, or `general` instead of the localized labels.
- **Failure scenario:** A student opens the assignment status filter and sees `all` / `accepted` / `rejected` raw keys, or an admin sees a raw nanoid in the participant selector.

### MEDIUM: Form labels not associated with their controls

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Problem:** The project’s `Label` component (`src/components/ui/label.tsx`) renders a plain `<label>`. When it is used as a sibling of an `<Input>`/`<Select>`/`<Textarea>` without `htmlFor` and without wrapping the control, there is no programmatic association. Clicking the label does not focus the field, and screen readers may not reliably announce the label when the user tabs to the control.
- **Failure scenario:** A keyboard user tabs to the “Duration” field in the quick-create form; the screen reader only reads the placeholder/number, not the label. A mouse user clicks “Assessment title” and the input does not receive focus.

### MEDIUM: Missing visible focus indicators on custom interactive elements

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Problem:** WCAG 2.2 Focus Visible requires a visible indicator when an element receives keyboard focus. Several hand-rolled controls override or omit the ring.
- **Failure scenario:** A keyboard user cannot tell which row is active in the status board, which link is focused on the student detail page, or which snapshot dot is selected in the replay timeline.
