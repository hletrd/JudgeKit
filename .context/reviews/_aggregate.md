# Aggregate Multi-Agent Review — JudgeKit Cycle 3 / 2026-07-01

Scope: entire repository (`/tmp/judgekit-local`).
Agents contributing: code-reviewer, security-reviewer, perf-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, designer.

This document merges overlapping findings across the 11 per-agent reviews. Within each theme, distinct issues are listed once with the highest severity/confidence of any duplicate and the set of agents who flagged it.

---

## Theme: Security / IP Trust / Reverse Proxy

### HIGH: Generated nginx overwrites `X-Forwarded-For`, collapsing IP-derived controls
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer, critic, tracer, debugger, code-reviewer
- **Files / Lines:**
  - `deploy-docker.sh` lines 1483, 1498, 1510, 1522, 1553, 1568, 1580, 1592
  - `scripts/online-judge.nginx.conf` lines 62-63, 76-77, 87-88, 99-100
  - `scripts/online-judge.nginx-http.conf` line 33, 44
  - `deploy.sh` line 257
  - Downstream consumers: `src/lib/security/ip.ts:68-131`, `src/lib/security/rate-limit.ts:45-47`, `src/lib/judge/ip-allowlist.ts:182-210`
- **Problem:** Every generated `location` block uses `proxy_set_header X-Forwarded-For $remote_addr;`, replacing any existing forwarded-for chain with a single entry. `extractClientIp` with default `TRUSTED_PROXY_HOPS=1` requires `parts.length >= trustedHops + 1`, so it returns `null` in production.
- **Failure scenario:** Rate limiting collapses to a single global bucket (`api:<endpoint>:unknown`); one attacker can exhaust per-endpoint limits for all users. If `JUDGE_ALLOWED_IPS` is configured, `isJudgeIpAllowed` receives `null` and denies every legitimate worker. Audit logs lose client attribution.
- **Suggested fix:** Change every application nginx `X-Forwarded-For` line to `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Update both HTTPS and HTTP blocks, plus `scripts/online-judge.nginx.conf`. Add a deploy-time/integration assertion that the live XFF chain length matches `TRUSTED_PROXY_HOPS`.

### HIGH: `AUTH_TRUST_HOST` defaults to true in production
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer, critic, tracer, architect
- **Files / Lines:** `deploy-docker.sh:662` (`.env.production` generation), `docker-compose.production.yml:106`, `src/lib/security/env.ts:260-266`, `src/lib/auth/config.ts:321`, `deploy-docker.sh:856`
- **Problem:** Fresh `.env.production` files set `AUTH_TRUST_HOST=true`. `shouldTrustAuthHost()` returns `true` in production whenever the env var is not explicitly `"false". With NextAuth `trustHost` enabled, Auth.js derives canonical URLs from `Host` / `X-Forwarded-Host` headers. The generated nginx config sets `Host $host` but does not strip a client-supplied `X-Forwarded-Host`.
- **Failure scenario:** An attacker sending direct HTTPS requests with `Host: attacker.com` or `X-Forwarded-Host: attacker.com` can cause Auth.js to generate session state, callback URLs, or password-reset links bound to an attacker-controlled domain.
- **Suggested fix:** Default `AUTH_TRUST_HOST=false` in production when `AUTH_URL` is set; have nginx explicitly overwrite or remove `X-Forwarded-Host` before proxying; rely on `AUTH_URL` and DB `allowedHosts` as the trusted-host set.

### HIGH: Judge API IP allowlist defaults to allow-all
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer, critic, tracer, architect
- **Files / Lines:** `src/lib/judge/ip-allowlist.ts:17-25,182-210`; `docker-compose.production.yml`; generated `.env.production` in `deploy-docker.sh:658-682`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every IP. The production compose file sets neither variable.
- **Failure scenario:** A leaked `JUDGE_AUTH_TOKEN` lets any internet host register fake workers, claim submissions (reading `sourceCode` and hidden `testCases`), and inject arbitrary judge verdicts.
- **Suggested fix:** Generate `.env.production` with `JUDGE_ALLOWED_IPS` restricted to the worker subnet(s), or set `JUDGE_STRICT_IP_ALLOWLIST=1` and require operators to configure an explicit allowlist before workers can register.

### MEDIUM: Inconsistent fail-open/fail-closed posture for missing client IP
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Likely
- **Agents:** tracer, critic
- **Files / Lines:** `src/lib/security/rate-limit.ts:45-47`; `src/lib/judge/ip-allowlist.ts:204-207`
- **Problem:** The same `extractClientIp` return value (`null` in production) is treated differently: rate limiting coalesces missing IPs into a shared `unknown` bucket, while the judge allowlist denies unknown IPs when an allowlist exists.
- **Failure scenario:** An attacker who can trigger the `unknown` bucket (e.g., by omitting XFF) gets a shared global quota rather than being blocked, making per-IP rate limits ineffective for that vector.
- **Suggested fix:** Audit all endpoints that rely on `consumeApiRateLimit` and decide whether the `unknown` bucket should be separately bounded or rejected.

### MEDIUM: Dev-only IP sentinel `0.0.0.0` collapses rate limits in non-production
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** architect
- **Files / Lines:** `src/lib/security/ip.ts:130`; `src/lib/security/rate-limit.ts`; `src/lib/security/api-rate-limit.ts:160`
- **Problem:** In non-production environments, `extractClientIp` returns `"0.0.0.0"` when no proxy headers are present. All IP-derived rate-limit keys collapse to the same value.
- **Failure scenario:** Multiple developers on the same network running E2E tests against staging share one bucket and accidentally trigger 429s.
- **Suggested fix:** In non-production, derive a more granular fallback from the request socket's `remoteAddress` when available, or document the sentinel behavior and require staging deployments to set `X-Forwarded-For`.

### LOW/MEDIUM: `isValidIpv4` accepts leading-zero octets, breaking canonicalization
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Files / Lines:** `src/lib/security/ip.ts:18-24`; cross-reference `src/lib/judge/ip-allowlist.ts`
- **Problem:** `isValidIpv4` validates each octet with `Number(...)` after a regex that permits one-to-three-digit octets. `Number("01")` evaluates to `1`, so addresses like `192.168.01.001` pass validation. Downstream consumers may treat the same client as multiple distinct keys.
- **Failure scenario:** A determined client can bypass per-IP rate limits or allowlist entries by submitting syntactically different but semantically identical IPv4 strings in `X-Forwarded-For`.
- **Suggested fix:** Reject octets with leading zeros (except the single digit `0`) in `isValidIpv4`, or normalize octets to decimal before returning. Align with `src/lib/judge/ip-allowlist.ts`.

---

## Theme: Deployment / Docker / Infrastructure

### CRITICAL: Removing global nginx `client_max_body_size` breaks file uploads
- **Severity:** CRITICAL
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect, security-reviewer
- **Files / Lines:** `deploy-docker.sh:1473,1543` (removed lines); `src/app/api/v1/files/route.ts:35`; `src/lib/system-settings-config.ts:61`; `deploy-docker.sh` nginx template lines 1476-1597
- **Problem:** The hardened nginx config sets `client_max_body_size` only on `/api/auth/` (1m) and `/api/v1/judge/poll` (50M). The catch-all `location /` has no explicit limit, so it falls back to the nginx default of 1 MiB. The application defaults `uploadMaxFileSizeBytes` to 50 MiB.
- **Failure scenario:** Instructors uploading 10 MiB PDFs or ZIP archives of test data receive `413 Request Entity Too Large` before the application can validate the upload. Admin restore/import also fails for backup ZIPs/JSON exports >1 MiB.
- **Suggested fix:** Add `client_max_body_size 50M;` to the `location /` block (or scoped to `/api/v1/files/` and `/api/v1/admin/*`) and keep it aligned with `MAX_IMPORT_BYTES`. Add a deployment test asserting `/api/v1/files/` has a body limit matching the configured upload maximum.

### HIGH: Inline SQL patches bypass the Drizzle migration journal
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `deploy-docker.sh:1250-1262`; `src/lib/db/migrate.ts:1-7`; `scripts/check-migration-drift.sh:1-28`; `src/lib/db/schema.pg.ts:275,606`
- **Problem:** `deploy-docker.sh` applies additive schema changes via raw `psql` after `drizzle-kit push` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Because the column is already present, `drizzle-kit push` does not generate a journal entry. The drift guard compares schema to journal snapshots, so it cannot detect the bypass.
- **Failure scenario:** A disaster-recovery replay from the journal produces a schema missing `problems.default_language` and `system_settings.default_language`; queries fail at runtime.
- **Suggested fix:** Eliminate the raw `psql` pre-patches. Add columns only through `drizzle-kit generate` so the journal stays the single source of truth. If a zero-downtime additive change must happen outside `push`, wrap it in a committed journal migration.

### HIGH: Docker socket proxy grants broad container lifecycle privileges
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `docker-compose.production.yml:64-86`; `docker-compose.worker.yml:18-46`
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1 IMAGES=1`. The worker can create, start, stop, delete arbitrary containers, and list images on the host Docker daemon.
- **Failure scenario:** A compromised judge worker sends Docker API requests through the proxy and spawns a privileged container with `--pid=host` or volume mounts, escaping to the host.
- **Suggested fix:** Restrict the proxy to the exact endpoints required. Run Docker rootless, add AppArmor/SELinux profiles to the worker, and drop all capabilities. Split image management into a separate admin service.

### MEDIUM: Docker Compose lacks internal network segmentation
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `docker-compose.production.yml` (no `networks:` block, services defined at lines 13-180)
- **Problem:** All services (`db`, `app`, `judge-worker`, `docker-proxy`, `code-similarity`, `rate-limiter`) share the default bridge network.
- **Failure scenario:** A compromised sidecar or auxiliary container can reach `db:5432`, `app:3000`, and `judge-worker:3001`, enabling lateral movement.
- **Suggested fix:** Define isolated networks (`frontend`, `backend`, `judge`, `db`) and attach each service only to the networks it needs.

### MEDIUM: Judge worker container runs as root
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `Dockerfile.judge-worker` lines 27-42 (no `USER` directive)
- **Problem:** The final `runner` stage does not drop to a non-root user.
- **Failure scenario:** A sandbox escape, supply-chain compromise, or bug in the worker gives root privileges inside the container, making host compromise easier.
- **Suggested fix:** Add a non-root user/group in the final stage, `chown` the binary and `/judge-workspaces`, and end with `USER <uid>:<gid>`. Ensure the user can still reach `docker-proxy:2375` and write to `/judge-workspaces`.

### MEDIUM: Internal worker-to-app traffic is unencrypted HTTP
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** security-reviewer
- **Files / Lines:** `docker-compose.production.yml:138`; `src/lib/compiler/execute.ts` (local fallback default URL); `judge-worker-rs/src/config.rs:validate_secure_judge_urls`
- **Problem:** The production compose sets `JUDGE_BASE_URL=http://app:3000/api/v1` and `COMPILER_RUNNER_URL=http://judge-worker:3001`. The Rust worker treats internal hostnames as local and accepts plain HTTP.
- **Failure scenario:** A compromised sidecar container on the default bridge can sniff worker registration, claim responses containing hidden test cases, or capture bearer tokens.
- **Suggested fix:** Terminate TLS at an internal reverse proxy or enable mTLS between app and worker; at minimum, place app and worker on an isolated backend network.

### MEDIUM: Static-site and generated app nginx missing HSTS/CSP/security headers
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** security-reviewer, code-reviewer
- **Files / Lines:** `static-site/nginx.conf:1-23`; generated app nginx in `deploy-docker.sh` lines 1446-1598; `src/lib/api/handler.ts:199-207`
- **Problem:** Neither the static site nor the generated app-server nginx config sets `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, or `Strict-Transport-Security`. The app-level handler only adds `Cache-Control` and `X-Content-Type-Options`.
- **Failure scenario:** Clickjacking, MIME-sniffing attacks, referrer leakage, and downgrade attacks become possible, especially if the static site serves user-contributed HTML or polyglot files.
- **Suggested fix:** Add `add_header` directives in both nginx configs. Set `server_tokens off;` in `static-site/nginx.conf`.

### MEDIUM: `deploy-docker.sh` exceeds modularization threshold
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `deploy-docker.sh:1-1704`
- **Problem:** The deploy script is over 1,700 lines and mixes Docker builds, BuildKit recovery, DB migration, raw SQL patches, nginx generation, health checks, and env validation. A failure in any concern aborts the whole deploy with no per-phase rollback.
- **Failure scenario:** A typo in nginx config generation causes the script to fail after migrations have already run and new containers have started, leaving the operator to manually determine rollback state.
- **Suggested fix:** Extract phase scripts (`scripts/deploy/01-build.sh`, `02-migrate.sh`, `03-up.sh`, `04-healthcheck.sh`) and make `deploy-docker.sh` a thin sequencer.

### MEDIUM: Static site nginx serves only HTTP with no redirect or HSTS
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** security-reviewer
- **Files / Lines:** `static-site/nginx.conf:1-23`
- **Problem:** The static-site config listens only on port 80, has no HTTPS server, no HSTS, and no redirect to HTTPS.
- **Failure scenario:** If used in production, users connect over plaintext, exposing cookies and static assets to interception and downgrade.
- **Suggested fix:** Serve static assets behind the same TLS-terminated reverse proxy as the app, or add a TLS server block, redirect HTTP to HTTPS, set HSTS, and add security headers.

### LOW/MEDIUM: Deploy script sources per-target env files without validation
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Agents:** security-reviewer
- **Files / Lines:** `deploy-docker.sh` (per-target `source .env.deploy.<target>` logic)
- **Problem:** `deploy-docker.sh` sources `.env.deploy.*` files through the shell. These files can contain arbitrary shell commands, not just variable assignments.
- **Failure scenario:** A compromised operator account or attacker with write access to the deployment host can execute attacker-controlled commands with the deploy user's privileges.
- **Suggested fix:** Parse env files with a restricted parser (e.g., `grep '^[A-Z_][A-Z0-9_]*='`) instead of `source`, and reject lines containing command substitution, backticks, or semicolons.

### LOW: Unfiltered `docker container prune -f` on app host
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `deploy-docker.sh:459`; `deploy-docker.sh:530` (worker variant uses `--filter 'until=24h'`)
- **Problem:** `prune_old_docker_artifacts` runs `docker container prune -f` without `--filter` on the app host.
- **Failure scenario:** If the host is ever shared or an operator runs a one-off stopped container, the deploy silently deletes it, potentially destroying forensic evidence.
- **Suggested fix:** Apply the same `--filter until=24h` guard to the app-host prune for defense in depth.

### LOW: Aggressive build-cache purge under disk pressure
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `deploy-docker.sh:532`
- **Problem:** `safe_docker_storage_cleanup` runs `docker builder prune -af` when disk usage exceeds the warning threshold.
- **Failure scenario:** A concurrent build on the same Docker daemon could lose its cache mid-build, causing flakiness or longer build times.
- **Suggested fix:** Measure build-time impact after a cache purge and consider whether `--filter until=24h` is sufficient.

### LOW: Worker-host restart lacks the `docker-compose` fallback used for the app host
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Confirmed
- **Agents:** verifier
- **Files / Lines:** `deploy-docker.sh:1285` (app fallback); `deploy-docker.sh:1393-1396` (worker no fallback)
- **Problem:** When starting containers on the app host, the script uses `docker compose ... || docker-compose ...`. When restarting the worker compose on a dedicated worker host, it uses only `docker compose`.
- **Failure scenario:** A worker host running an older Docker version with only `docker-compose` fails at the worker restart step.
- **Suggested fix:** Apply the same fallback pattern on the worker host.

---

## Theme: Compiler / Execution

### HIGH: Compiler local-fallback workspace cannot be cleaned up after chown to sandbox uid
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger, tracer, architect
- **Files / Lines:** `src/lib/compiler/execute.ts:724-758,842-848`; `Dockerfile:108`
- **Problem:** The local fallback creates a temp workspace, writes the source file, then `chown`s the directory and source file to `SANDBOX_UID`/`SANDBOX_GID` (65534/nobody) with modes `0o700`/`0o600`. The `finally` block then tries `rm(workspaceDir, { recursive: true, force: true })`. The production Dockerfile runs the Next.js app as the `nextjs` user (uid 1001), so a directory owned by uid 65534 with mode `0o700` is not traversable or removable by uid 1001.
- **Failure scenario:** Every compile request in local-fallback mode leaves a `compiler-*` directory under `/tmp`/`$COMPILER_WORKSPACE_DIR`. Over time this fills the root or workspace filesystem. The caught warning masks the leak.
- **Suggested fix:** Before attempting `rm`, re-chown the workspace back to the process uid inside the `finally` block, or spawn a short-lived privileged cleanup container. Alternatively, run `chmod -R 777` on the workspace before `rm` (transient permission widening only for cleanup), or gate local fallback behind a loud runtime warning.

### HIGH: Rust judge-worker temp workspace also cannot be removed after chown to sandbox uid
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `judge-worker-rs/src/executor.rs:301-316,324-358`
- **Problem:** The Rust executor creates a `tempfile::TempDir`, then `chown`s it to `65534:65534` with mode `0o700`. `TempDir::drop` silently ignores cleanup failures. If the worker process is not running as root, it cannot delete the directory.
- **Failure scenario:** A dedicated worker judging thousands of submissions per day leaves thousands of `/tmp/.tmp*` directories; disk exhaustion eventually alerts operators, but no operator-visible error is emitted.
- **Suggested fix:** Explicitly `chown` the workspace back to the worker process uid/gid before the `TempDir` goes out of scope, or run cleanup through a root-privileged container. Log and surface cleanup failures.

### MEDIUM: `validateShellCommandStrict` rejects legitimate environment-variable prefixes
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, debugger, tracer, critic
- **Files / Lines:** `src/lib/compiler/execute.ts:189-251`; `execute.ts:764-767` (comment claims env-var prefixes are supported)
- **Problem:** The stricter validator splits a command on `&&` or `;` and requires each segment's first token to match an allowed compiler prefix. If a segment begins with an environment assignment such as `CC=gcc gcc ...` or `LANG=C ./a.out`, the first token `CC=gcc` does not match any prefix and the whole command is rejected.
- **Failure scenario:** An admin who legitimately configures a language with an env-var prefix will see submissions failing with `"Invalid compile command"` even though `validateShellCommand` regex would have accepted it. The Rust runner uses its own validator, so the same command may succeed via the runner but fail in local fallback.
- **Suggested fix:** Strip leading `KEY=VALUE` assignments before checking the command prefix, or move the prefix check into the Rust runner and keep local fallback validation aligned with it. At minimum update the comment.

### MEDIUM: Shell-command whitelist permits shell interpreters, undermining the denylist
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic, tracer
- **Files / Lines:** `src/lib/compiler/execute.ts:189-218,243-251`
- **Problem:** `validateShellCommandStrict` accepts `bash`, `sh`, `powershell`, `pwsh` as command prefixes. A compromised `language_configs` row can set `runCommand` to `bash -c '...'` and the denylist is bypassed because the payload lives inside the `-c` argument.
- **Failure scenario:** An attacker who can modify a language config runs arbitrary code inside the judged container.
- **Suggested fix:** Remove shell interpreters from `ALLOWED_COMMAND_PREFIXES`, or add an explicit rule that rejects `-c`/`-Command` interpreter invocations. Treat commands as direct binary invocations only.

### MEDIUM: Rust runner `/run` endpoint accepts nested shells through single-quote gaps
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `judge-worker-rs/src/runner.rs:124-176,813-825,887-900`
- **Problem:** `validate_shell_command` blocks a short denylist but permits `&&`, `;`, environment prefixes, and does not reject single quotes or the tokens `bash`/`sh`. Because the runner wraps the supplied command in `sh -c`, a caller can smuggle arbitrary commands inside quotes.
- **Failure scenario:** A leaked `RUNNER_AUTH_TOKEN` lets an attacker execute arbitrary code inside the judged container to probe syscalls or wage a noisy DoS.
- **Suggested fix:** Do not accept raw shell strings from the HTTP API. Accept an argv array, reject shell metacharacters/quotes entirely, and execute with `execvp`-style semantics; or store approved commands server-side and reference them by language ID.

### MEDIUM: Local compiler fallback runs with default seccomp if custom profile is missing
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** security-reviewer
- **Files / Lines:** `src/lib/compiler/execute.ts:379-388`
- **Problem:** When `SECCOMP_PROFILE_PATH` is missing, the local Docker fallback logs a one-time warning and proceeds with Docker's default seccomp policy instead of the project-specific restricted profile.
- **Failure scenario:** A mis-packaged deployment silently weakens the sandbox for local fallback compilations, potentially exposing syscalls that the custom profile blocks.
- **Suggested fix:** Fail closed when the configured custom seccomp profile is missing, or require an explicit opt-out environment variable before falling back to the default policy.

### MEDIUM: `parseTimestampEpochMs` does not handle Docker's nanosecond timestamps
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** code-reviewer
- **Files / Lines:** `src/lib/compiler/execute.ts:254-266,277-301`
- **Problem:** The JSDoc states the helper handles `"2024-01-15T10:30:45.123456789Z"`, but it delegates to `Date.parse`, which only supports millisecond precision and may return `NaN` for nine-digit fractional seconds depending on the JS engine.
- **Failure scenario:** On Node.js versions where `Date.parse` rejects nanosecond timestamps, container inspection loses accurate execution duration and falls back to wall-clock duration, skewing execution-time reporting.
- **Suggested fix:** Truncate the fractional seconds to three digits before calling `Date.parse`, or use a small regex/parser that explicitly handles nanoseconds.

### MEDIUM: Node fallback run timeout counts container startup against the user budget
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/compiler/execute.ts:468-473,828`
- **Problem:** The run phase uses the raw `timeLimitMs` as the wall-clock kill timeout, unlike the Rust worker which adds `DOCKER_RUN_OVERHEAD_BUDGET_MS` (2 s).
- **Failure scenario:** Near-limit legitimate submissions receive spurious timeouts because Docker container startup overhead is counted against the user's time budget.
- **Suggested fix:** Add the same startup-overhead buffer to the Node fallback kill timeout.

### MEDIUM: Compile tmpfs is smaller than the compile memory limit
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/compiler/execute.ts` lines 20, 357-366; `judge-worker-rs/src/docker.rs` line 17
- **Problem:** The compile phase is granted 2048 MB of memory but only a 1024 MB `/tmp` tmpfs.
- **Failure scenario:** Compilers that write large intermediate files to `/tmp` hit `ENOSPC` on tmpfs while the container memory limit still shows headroom.
- **Suggested fix:** Make the compile tmpfs size configurable and at least as large as the compile memory limit, or default both to the same value.

### LOW: Validation failures return `exitCode: null`
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `src/lib/compiler/execute.ts:667-687`
- **Problem:** When `validateShellCommandStrict` rejects a command, `executeCompilerRun` returns `{ ..., exitCode: null, stderr: "Invalid compile command" | "Invalid run command" }`.
- **Failure scenario:** A downstream component that assumes `exitCode` is always a number may misclassify `null` as a system error.
- **Suggested fix:** Audit all consumers of `CompilerRunResult.exitCode` for null handling and document the contract.

### LOW: `execute.ts` `child.stdin.write` may not handle backpressure
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `src/lib/compiler/execute.ts:442-444`
- **Problem:** `child.stdin.write(opts.stdin)` is called once without checking the return value or waiting for the `drain` event.
- **Failure scenario:** For very large stdin this can fail with `EAGAIN` or partial writes.
- **Suggested fix:** Use `child.stdin.end(opts.stdin)` or a small writable-stream helper that handles backpressure.

---

## Theme: Similarity Check

### HIGH: Concurrent similarity checks can delete each other's anti-cheat events
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic, tracer
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:441-454`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:43-65`
- **Problem:** Two concurrent similarity runs for the same assignment each read the same submission set, compute independently, then run `db.transaction(delete old events → insert new events)`. PostgreSQL serializes the write transactions, so the later transaction deletes the events the earlier one just inserted.
- **Failure scenario:** Two TAs click "Run similarity check" at the same time. The final state contains only one run's flagged pairs; the other is silently lost.
- **Suggested fix:** Serialize similarity runs per assignment with `pg_advisory_xact_lock(hashtextextended(assignmentId, 1)::bigint)` around the compute-and-store path, or add an assignment-level version/timestamp guard that aborts stale writers.

### HIGH: Similarity-check Rust sidecar ignores the route's AbortSignal and swallows abort errors
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer, critic, verifier, tracer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-64`; `src/lib/assignments/code-similarity.ts:319-399`; `src/lib/assignments/code-similarity-client.ts:35-62`
- **Problem:** The route creates a 30-second `AbortController` and passes the signal into `runAndStoreSimilarityCheck`. That signal is forwarded only to the TypeScript fallback path. The Rust sidecar call in `computeSimilarityRust` uses its own hard-coded `AbortSignal.timeout(25_000)` and does not accept, compose, or propagate the caller's signal. It catches all exceptions and returns `null`.
- **Failure scenario:** If the Rust sidecar is slow but not quite 25 seconds, or if the caller wants to abort earlier, the route cannot cancel the sidecar request. A Rust-sidecar timeout returns `null`, falls through to the TS fallback, and may consume the full 30 seconds without returning the explicit `timed_out` status the test expects.
- **Suggested fix:** Add an optional `signal?: AbortSignal` parameter to `computeSimilarityRust` and compose it with the internal timeout via `AbortSignal.any` (or a manual `AbortController` that listens to both). Re-throw `AbortError` instead of returning `null` so callers can distinguish cancellation/timeouts from sidecar unavailability.

### MEDIUM: `MAX_SUBMISSIONS_FOR_SIMILARITY` limit enforced only on TypeScript fallback
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** verifier
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:236,354-367,379-388`
- **Problem:** `runSimilarityCheck` first attempts the Rust sidecar and only applies the 500-submission guard when falling back to the TypeScript implementation. The constant name and response field `maxSupportedSubmissions` advertise it as a general ceiling.
- **Failure scenario:** On a deployment where the Rust sidecar is running, a contest with 700+ best submissions is sent to the sidecar without any cap. If the sidecar is not bounded internally, this causes excessive CPU/memory usage and route timeout.
- **Suggested fix:** Move the `rows.length > MAX_SUBMISSIONS_FOR_SIMILARITY` check before the Rust sidecar attempt, or add an equivalent limit inside `computeSimilarityRust`/the sidecar. If the sidecar is intentionally allowed to handle larger contests, update the constant name and response semantics.

### MEDIUM: Similarity-check timeout starts before the expensive work
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** architect
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-65`; `src/lib/assignments/code-similarity.ts:319-390`
- **Problem:** The route arms a 30-second `AbortController` timeout, then awaits `getContestAssignment`, authorization checks, and the database query before starting `runAndStoreSimilarityCheck`. The raw SQL query that fetches the best submission per user/problem/language does not observe the abort signal.
- **Failure scenario:** On a large assignment, the CTE query takes 20 s due to lock contention or missing indexes. The route aborts the similarity computation shortly after it begins, returning `timed_out` even though the expensive query—not the computation—caused the timeout.
- **Suggested fix:** Start the abort timer immediately before `runSimilarityCheck`. Pass the abort signal into the raw query path via `Promise.race`, or add a separate query timeout and return a distinct error so operators can distinguish query slowness from computation slowness.

### MEDIUM: Similarity-check authorization duplicates the handler's authz model
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24,37`
- **Problem:** The route uses `auth: true` in `createApiHandler` and then performs its own authorization inside the handler via `canRunSimilarityCheck`, layering `canManageContest`, capability resolution, group-TA check, and assigned-group check. This bypasses the handler's built-in `{ capabilities: [...] }` authz and scatters access-control semantics across route files.
- **Failure scenario:** A new admin route with the same intent uses `createApiHandler({ auth: { capabilities: ["anti_cheat.run_similarity"] }})`, which does not include the TA/assigned-group exceptions, creating inconsistent authorization rules.
- **Suggested fix:** Move `canRunSimilarityCheck` into a shared helper (e.g., `src/lib/assignments/contests.ts`) and make `createApiHandler` capable of accepting it, or standardize on capability checks for the API surface and keep TA/assignment checks as an explicit secondary gate.

### MEDIUM: Capability check runs before group-TA check, leaving pure-TA path possibly dead
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`
- **Problem:** `canRunSimilarityCheck` returns early for managers, then rejects non-managers who lack `anti_cheat.run_similarity`, and only afterward checks group TA / assigned instructor status. A pure group TA whose role does not carry the capability is denied.
- **Failure scenario:** A custom role named "ta" or a future capability edit that removes `anti_cheat.run_similarity` from the TA role silently denies group TAs, while the UI may still show the affordance based on group membership.
- **Suggested fix:** Add a route test for a pure group TA without `anti_cheat.run_similarity`; confirm whether denial is intended policy or dead code.

### LOW: Similarity-check timeout handler treats any "timed out" message as a timeout
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-62`
- **Problem:** The catch block returns the `timed_out` envelope if `error.name === "AbortError"` OR `error.message.includes("timed out")`. The string match is broad.
- **Failure scenario:** A database query timeout inside `runAndStoreSimilarityCheck` could be surfaced to the dashboard as `status: "timed_out"`, misleading an admin into thinking the similarity engine was slow rather than that the database is unhealthy.
- **Suggested fix:** Only treat `AbortError` / `DOMException` with name `"AbortError"` as the scan timeout. For other errors, let them propagate to the generic `createApiHandler` error handler.

### LOW: `code-similarity-client.ts` uses `console.warn` instead of the project logger
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** code-reviewer
- **Files / Lines:** `src/lib/assignments/code-similarity-client.ts:6`
- **Problem:** The module logs a missing-auth warning with `console.warn(...)` rather than the structured `logger` used everywhere else in `src/lib`.
- **Failure scenario:** In production, this warning bypasses the configured logging transport and will print in a different format than other security warnings.
- **Suggested fix:** Import `logger` from `@/lib/logger` and replace the `console.warn` call with `logger.warn(...)`.

### LOW: Source-code normalizer is language-agnostic and may mis-handle whitespace-sensitive languages
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** architect
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:27-111`
- **Problem:** `normalizeSource` collapses all whitespace (including newlines) to a single space for every language. For Python, Haskell, YAML, and other whitespace-sensitive languages, this destroys semantic structure before n-gram comparison.
- **Failure scenario:** Two Python submissions identical except for indentation may have Jaccard similarity drop below the 0.85 threshold even though the code is semantically identical.
- **Suggested fix:** Make the normalizer language-aware: preserve significant whitespace for whitespace-sensitive languages, or document the limitation in `docs/languages.md` and the admin anti-cheat UI.

## Theme: Contest Join

### MEDIUM: Access-code failure rate limits accumulate without success reset
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Status:** Risk
- **Agents:** architect, document-specialist
- **Files / Lines:** `src/app/api/v1/contests/join/route.ts:29-37`; `src/lib/security/api-rate-limit.ts:198-222`
- **Problem:** On a failed access-code redemption, the route consumes two additional rate-limit buckets: `contest:join:invalid` (per-user) and `contest:join:invalid-code` (per access-code hash). The global `contest:join` limit is already consumed by `createApiHandler`. There is no mechanism to reset these invalid-attempt counters when a user eventually redeems a valid code.
- **Failure scenario:** A student mistypes an access code 30 times in one minute, then receives the correct code. The per-user invalid bucket is at its limit; the next redemption attempt is blocked with 429 for the remainder of the window.
- **Suggested fix:** Treat invalid-code attempts as part of the same `contest:join` bucket, or reset the invalid-attempt counters on a successful redemption. If separate buckets are required, use a higher threshold for the invalid bucket than for the success bucket.

### MEDIUM: Per-user failure limiter runs before per-code limiter, giving multi-account attackers N budgets
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `src/app/api/v1/contests/join/route.ts:28-42`
- **Problem:** A failed redemption first consumes the per-user bucket, then the per-code bucket. If the user bucket blocks, the code bucket is never incremented.
- **Failure scenario:** An attacker with M accounts gets M independent user budgets before the shared per-code bucket becomes the binding constraint, enabling distributed brute-force against a single access code.
- **Suggested fix:** Consume the code-scoped bucket unconditionally so distributed attempts converge immediately.

### MEDIUM: `23505` recovery in `redeemAccessCode` assumes the conflict is `(assignmentId, userId)`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `src/lib/assignments/access-codes.ts:207-221`
- **Problem:** `redeemAccessCode` catches Postgres `23505` and returns `alreadyEnrolled: true` without inspecting the constraint name or verifying the conflicting row belongs to the calling user.
- **Failure scenario:** A future schema change (e.g., a unique index on `accessCode`) makes the recovery branch misleading: a user could be told they are already enrolled when the conflict was actually on the code itself.
- **Suggested fix:** In the recovery branch, assert the constraint name matches the expected `(assignmentId, userId)` index or re-run the existing-token check for the specific user.

### LOW/MEDIUM: Access codes stored as plaintext in `assignments.accessCode`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed (design choice with residual risk)
- **Agents:** tracer
- **Files / Lines:** `src/lib/assignments/access-codes.ts:31-44,101,118`
- **Problem:** `setAccessCode` persists the raw 8-character code; `redeemAccessCode` compares normalized user input directly against that column. No hashing, HMAC, or encryption is applied.
- **Failure scenario:** A read-only DB breach (e.g., via SQL injection or backup leak) exposes every active contest access code, allowing mass unauthorized enrollment.
- **Suggested fix:** This is a deliberate usability trade-off. If retained, ensure DB backups/export tooling redact this column; `EXPORT_SANITIZED_COLUMNS` does not currently include `assignments.accessCode`.

---

## Theme: API / Auth / Capabilities

### HIGH: `/compiler/run` consumes daily sandbox quota before checking capability
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `src/app/api/v1/compiler/run/route.ts:38-88`; `src/app/api/v1/playground/run/route.ts` (for contrast)
- **Problem:** The route first calls `gateSandboxEndpoint`, which deducts one invocation from the per-user daily quota, then checks `caps.has("content.submit_solutions")` and returns 403. `/playground/run` checks the capability in `auth` before the gate.
- **Failure scenario:** A user with a custom role that has `files.upload` but lacks `content.submit_solutions` repeatedly calls `/api/v1/compiler/run`. Each call burns the legitimate daily budget before the 403 is returned.
- **Suggested fix:** Move the `content.submit_solutions` capability check before `gateSandboxEndpoint`, matching `/playground/run`.

### HIGH: `createApiHandler` rejects custom roles in `auth.roles`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `src/lib/api/handler.ts:131-132`
- **Problem:** The role check calls `isUserRole(user.role)`, which only returns `true` for the five built-in role names. A route configured with `auth: { roles: ["custom_instructor"] }` rejects users whose role is exactly `custom_instructor`.
- **Failure scenario:** A deployment introduces a custom role and restricts an admin route to it. The route is unreachable for that role, making the `roles` auth config unusable for custom roles.
- **Suggested fix:** Remove the `isUserRole` guard from the role check, or change it to allow any string present in `auth.roles`.

### MEDIUM: File download endpoint has no rate limiting
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `src/app/api/v1/files/[id]/route.ts:62-140`
- **Problem:** The GET handler performs auth and access checks but never calls `consumeApiRateLimit`. Upload and delete are rate-limited; download is not.
- **Failure scenario:** An authenticated user enumerates `/api/v1/files/{id}` and repeatedly downloads large files, abusing bandwidth and probing file IDs that may belong to others.
- **Suggested fix:** Add `rateLimit: "files:download"` in `createApiHandler` for the GET handler.

### MEDIUM: `sandbox-gate.ts` env bypass fails on common whitespace
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `src/lib/security/sandbox-gate.ts:13-14`
- **Problem:** `ALLOW_UNVERIFIED_EMAIL_ENV` does `raw === "1" || raw.toLowerCase() === "true"` without trimming. A value of `"true\n"` or `" true "` fails the literal comparison.
- **Failure scenario:** An operator sets `SANDBOX_ALLOW_UNVERIFIED_EMAIL=true` in an `.env` file ending with a newline. The gate remains enforced even though the operator intended to bypass it.
- **Suggested fix:** Trim and normalize: `return raw.trim() === "1" || raw.trim().toLowerCase() === "true";`.

### MEDIUM: In-progress judge reports can indefinitely refresh a stale claim
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `src/app/api/v1/judge/poll/route.ts:82-145`
- **Problem:** A worker POSTing `status: "judging"` with a valid `claimToken` resets `judgeClaimedAt` to `dbNow` each time. There is no maximum-judging-time guard independent of heartbeats.
- **Failure scenario:** A buggy or malicious worker repeatedly reports "judging" for a submission. The stale-claim sweep never reclaims it, and the submission remains stuck in `judging` forever.
- **Suggested fix:** Reject in-progress updates when `judgeClaimedAt` is older than the configured claim TTL, or add a `maxJudgingDurationMs` guard that forces the submission back to `pending`/`queued` regardless of worker heartbeats.

### MEDIUM: Session `maxAge` is captured at module-load time
- **Severity:** HIGH (downgraded to MEDIUM because architectural scope)
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `src/lib/auth/config.ts:325`
- **Problem:** `session: { strategy: "jwt", maxAge: getSessionMaxAgeSeconds() }` evaluates once when the module is first loaded. The value is frozen for the process lifetime.
- **Failure scenario:** During a security incident, an operator reduces session lifetime from 30 days to 1 hour. Existing sessions expire as expected, but newly issued sessions still receive a 30-day `exp` until process restart.
- **Suggested fix:** Move enforcement to the `jwt` callback: read the current `sessionMaxAgeSeconds` on each validation and return `null` if `now - iat` exceeds the configured lifetime. Alternatively, add a prominent admin UI notice that changes require a restart.

### MEDIUM: `submissions.judgeWorkerId` lacks a foreign key constraint
- **Severity:** HIGH (downgraded to MEDIUM in aggregate because not an immediate exploit)
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `src/lib/db/schema.pg.ts:487,507`
- **Problem:** `submissions.judgeWorkerId` is declared as plain `text` with no `.references(() => judgeWorkers.id)`. When a worker row is deleted, historical submissions retain the old string with no cascade behavior or referential integrity.
- **Failure scenario:** Operations decommissions a worker by deleting its `judgeWorkers` row. Later, an audit query joins `submissions` to `judgeWorkers`; all historical submissions from that worker disappear from the join.
- **Suggested fix:** Add `references(() => judgeWorkers.id, { onDelete: "set null" })` to preserve the historical row while nullifying the worker reference. Generate a migration with `drizzle-kit generate`.

### MEDIUM: Contest access-token expiry boundary is inconsistent between SQL and Drizzle
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `src/lib/assignments/contest-access-tokens.ts:24,57-58`; `src/lib/assignments/contests.ts:185`
- **Problem:** The raw-SQL catalog query treats a token as valid when `cat.expires_at > NOW()`, while `findValidContestAccessToken` treats it as expired when `token.expiresAt.valueOf() <= nowMs`.
- **Failure scenario:** At the exact instant `expires_at == NOW()`, a participant sees the contest in "My Contests" but receives `assignmentEnrollmentRequired` when trying to submit.
- **Suggested fix:** Align the two predicates. Either use `expires_at >= NOW()` in SQL or strict `<` in Drizzle, and document the chosen boundary.

### MEDIUM: Assignment status aggregate has no deterministic tie-break for same-timestamp submissions
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `src/lib/assignments/submissions.ts:764-772`
- **Problem:** The aggregate CTE orders only the inner window by `submitted_at DESC, id DESC`; the outer `GROUP BY` has no `ORDER BY`. The JavaScript loop sees rows in undefined order.
- **Failure scenario:** A student submits to two problems at the exact same DB timestamp. The UI may show a different `latestSubmissionId`/`latestStatus` on each page load for the same student.
- **Suggested fix:** Add `ORDER BY MAX(submitted_at) DESC, MAX(id) DESC` or tie-break by `id` in the JS reducer.

### LOW: Dummy password hash uses a static, identifiable salt
- **Severity:** LOW
- **Confidence:** Low
- **Status:** Risk
- **Agents:** security-reviewer
- **Files / Lines:** `src/lib/auth/config.ts:51-52`
- **Problem:** The `DUMMY_PASSWORD_HASH` constant embeds the salt `Y2xhdWRlZHVtbXloYXNo`, which base64-decodes to `claudedummyhash`.
- **Failure scenario:** The sentinel hash is immediately recognizable in a source leak or DB dump.
- **Suggested fix:** Replace the constant with a random Argon2id hash generated offline, or generate a per-process dummy hash at startup.

---

## Theme: Database / Performance / Caching

### HIGH: Process-local caches have no cross-instance invalidation
- **Severity:** HIGH
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect, critic, perf-reviewer
- **Files / Lines:** `src/lib/system-settings-config.ts:84`; `src/lib/capabilities/cache.ts:17`; `src/lib/assignments/contest-analytics-cache.ts:27`
- **Problem:** `resolveCapabilities`, `getConfiguredSettings`, and the analytics LRU are module-level, in-process singletons. Invalidation only clears the current process. In a horizontally scaled deployment, an admin change to role capabilities or system settings propagates only to the replica that handled the write.
- **Failure scenario:** An admin revokes `MANAGE_CONTESTS` from a role. Other replicas continue to authorize `MANAGE_CONTESTS` actions for up to 60 s.
- **Suggested fix:** Short-term: reduce capabilities cache TTL to ~5 s. Correct solution: introduce a DB version counter or Redis pub/sub invalidation so all replicas observe writes promptly.

### HIGH: Unbounded code-similarity query loads every best submission before the cap is enforced
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:330-339` (CTE), `379` (fallback guard)
- **Problem:** `runSimilarityCheck` fetches the best submission per `(user, problem, language)` for the whole assignment via a raw CTE with no `LIMIT`. The `MAX_SUBMISSIONS_FOR_SIMILARITY = 500` guard is applied only to the TypeScript fallback after rows are materialized in memory.
- **Failure scenario:** A large contest with tens of thousands of source-code rows causes the app process to allocate a huge array before the Rust sidecar or fallback guard can run, leading to OOM.
- **Suggested fix:** Apply the cap in SQL (e.g., wrap the CTE in `SELECT ... LIMIT $1`) or sample in the database. Move the row-count guard before the fetch when the sidecar is unavailable.

### HIGH: Leaderboard recomputes over the full assignment submissions table on every cache miss
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/assignments/contest-scoring.ts:201-244` (scoring CTE), `132-191` (cache logic)
- **Problem:** `_computeContestRankingInner` builds a CTE over `submissions` filtered only by `assignment_id` and terminal statuses, then applies window functions over the full per-assignment set. The 30-second in-process cache is invalidated by every judge verdict (`src/app/api/v1/judge/poll/route.ts:198-200`).
- **Failure scenario:** In a large contest with many re-submissions, the CTE scans/aggregates a very wide intermediate set on every leaderboard request and after every submission update. Under burst judging the cache is constantly cold and DB CPU saturates.
- **Suggested fix:** Maintain a materialized/incremental per-user/problem best-score table updated when a verdict lands, and have the leaderboard read from that summary. Alternatively extend cache TTL and use stale-while-revalidate.

### HIGH: Contest replay recomputes ranking up to 40 times per request
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/assignments/contest-replay.ts:38-83`
- **Problem:** `computeContestReplay` samples up to 40 replay cutoffs and invokes `computeContestRanking` for each one. Each ranking invocation runs multiple heavy raw-SQL aggregations, throttled only by `pLimit(2)`.
- **Failure scenario:** A large contest triggers 40+ sequential heavy ranking queries, monopolizing pool connections and causing 504s or connection-pool exhaustion.
- **Suggested fix:** Cache snapshot rankings, precompute them in the background, or compute all cutoffs in a single set-based SQL query instead of re-running the full ranking function per cutoff.

### HIGH: Public contests listing is unbounded and eagerly loads every problem
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/assignments/public-contests.ts:33-64`
- **Problem:** `getPublicContests()` calls `db.query.assignments.findMany` with no `limit` and eager-loads every `assignmentProblems.problem`. It then counts public/private problems in JavaScript.
- **Failure scenario:** As the public contest catalog grows, each request loads every public contest row and every associated problem. Network transfer and JS object allocation grow linearly and can block the event loop.
- **Suggested fix:** Add pagination (`limit`/`offset` or cursor), push the public-problem count into SQL with a subquery/lateral join, and avoid eager-loading nested problem rows just to count visibility.

### MEDIUM: Missing indexes on heavily filtered columns
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/db/schema.pg.ts` — `sessions` (lines 65-71), `problems` (250-290), `assignments` (329-378), `problemSets` (800-816), `discussionThreads` (922-947), `antiCheatEvents` (1186-1210), `examSessions` (381-402)
- **Problem:** High-cardinality filter columns lack supporting indexes: `sessions.userId`/`expires`, `problems.visibility`, `assignments.visibility`/`examMode`, `problemSets.isPublic`/`createdBy`, `discussionThreads.authorId`, and IP-address columns in `antiCheatEvents`/`examSessions`.
- **Failure scenario:** Public pages that filter `visibility = 'public'` scan the entire `problems` table. Session lookups degrade as the session table grows. Anti-cheat IP-overlap reports scan hundreds of thousands of heartbeat rows.
- **Suggested fix:** Add composite indexes: `problems_visibility_created_idx`, `sessions_user_expires_idx`, `assignments_visibility_exam_mode_idx`, `problem_sets_is_public_created_idx`, `dt_author_idx`, `ace_assignment_ip_idx`, `exam_sessions_assignment_ip_idx`.

### MEDIUM: Unbounded JSON body parsing in shared API handler
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/api/handler.ts:157-162`
- **Problem:** `createApiHandler` calls `raw = await req.json()` before any body-size guard. Next.js buffers the entire body into memory and parses it before the Zod schema can reject an oversized payload.
- **Failure scenario:** A few concurrent malicious POSTs with multi-megabyte JSON bodies to `/api/v1/submissions`, `/api/v1/admin/migrate/import`, or anti-cheat endpoints can exhaust the Node.js heap and crash the app container.
- **Suggested fix:** Reject requests whose `Content-Length` exceeds a route-specific cap before calling `req.json()`, or add a global body-size limit in nginx/Next.js middleware. Use streaming parsers for large import routes.

### MEDIUM: Contest export builds the full ranking before truncation
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:60-62`
- **Problem:** `computeContestRanking(assignmentId)` is invoked with no row limit. The `MAX_EXPORT_ENTRIES` cap is applied only after the full ranking array, anti-cheat counts, and IP aggregates are computed and held in memory.
- **Failure scenario:** Exporting a contest with tens of thousands of participants allocates huge intermediate structures and can OOM or hang the request worker.
- **Suggested fix:** Push the entry limit into `computeContestRanking` so aggregation stops early, or compute ranking in a streaming/paginated fashion for exports.

### MEDIUM: Code-snapshot list returns full source code for up to 200 rows per page
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:20-23,41-47`
- **Problem:** The paginated endpoint allows up to 200 rows per page and selects `sourceCode: codeSnapshots.sourceCode` for every row. The route has no `rateLimit` key.
- **Failure scenario:** A single page can return hundreds of megabytes of source code, stalling JSON serialization, response transfer, and the DB. Repeated fetches are unthrottled.
- **Suggested fix:** Cap the page size lower (e.g., 20-50) for source-code-heavy endpoints, or offer a summary endpoint without `sourceCode` and a separate fetch for individual snapshots. Add rate limiting.

### MEDIUM: Discussion thread view loads all posts without limit
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/discussions/data.ts:270-283`
- **Problem:** `getDiscussionThreadById()` eagerly loads `posts` for a thread with no `LIMIT`.
- **Failure scenario:** A popular editorial or solution thread with thousands of posts loads the entire thread into memory and returns a huge JSON response.
- **Suggested fix:** Paginate posts in the thread query and add a per-page limit.

### MEDIUM: Admin chat-log transcript returns every message for a session
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/admin/chat-logs/route.ts:24-48`
- **Problem:** When `sessionId` is provided, the route loads every chat message for that session with no `limit`. The route also has no `rateLimit` key.
- **Failure scenario:** A long support session with thousands of messages returns a multi-megabyte response; an admin/API key can repeatedly trigger this without throttling.
- **Suggested fix:** Add pagination to the transcript query and a `rateLimit` key (e.g., `chat-logs:view`).

### MEDIUM: Analytics cache mixes DB clock and app clock
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `src/lib/assignments/contest-analytics-cache.ts:47,62`
- **Problem:** Cache entries are written with `createdAt: await getDbNowMs()` (DB server clock) but aged with `Date.now() - cached.createdAt` (app server clock). If the two clocks drift, the computed age is wrong.
- **Failure scenario:** App clock behind DB clock produces negative ages and suppresses background refresh; app clock ahead produces premature refreshes.
- **Suggested fix:** Use a consistent clock source. Replace `createdAt: await getDbNowMs()` with `createdAt: Date.now()`.

### MEDIUM: Data-retention prunes run eight large table deletes concurrently
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/data-retention-maintenance.ts:8-35,146-155`
- **Problem:** Eight independent prunes run via `Promise.allSettled`, each deleting batches of 5,000 rows with a fixed 100 ms sleep. There is no per-run row cap or adaptive backoff.
- **Failure scenario:** Years of submissions/audit/chat data can cause a single daily window to run for hours, generating WAL traffic and lock contention.
- **Suggested fix:** Add a per-prune row cap, make sleep adaptive based on recent delete throughput, and run prunes during a configurable low-traffic window.

### MEDIUM: DB pool has a fixed max of 20 connections and no statement timeout
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/db/index.ts:41-54`
- **Problem:** The PostgreSQL pool defaults to `max: 20`, `connectionTimeoutMillis: 10s`, `idleTimeoutMillis: 30s`, with no `statement_timeout` configured.
- **Failure scenario:** Bursty workloads queue for more than 10 seconds and return connection-timeout errors; a single runaway query can hold a connection indefinitely.
- **Suggested fix:** Make pool size and timeouts env-driven, set a reasonable `statement_timeout` on new connections (e.g., 30-60s), and add pool-saturation alerting.

### MEDIUM: File download reads the entire stored file into a Buffer
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/files/[id]/route.ts:100-102,123`
- **Problem:** The GET handler reads the whole uploaded file into memory with `buffer = await readUploadedFile(file.storedName)` and then wraps it in a `Uint8Array` for the response. There is no streaming.
- **Failure scenario:** Concurrent downloads of a few large test-case attachments or PDFs can exhaust the Node.js heap and crash the app.
- **Suggested fix:** Stream files from disk through the response without loading the full content into memory.

### MEDIUM: Judge claim endpoint fetches every test case for the problem after claiming
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/judge/claim/route.ts:319-329`
- **Problem:** The claim response loads all test-case `input` and `expectedOutput` columns for the claimed problem in one query. There is no count or size cap.
- **Failure scenario:** Problems with hundreds of test cases or very large generated inputs/outputs transfer multi-megabyte payloads from DB to app server to worker.
- **Suggested fix:** Enforce a maximum number of test cases and a per-case size limit at problem-import time, or stream/lazy-load test cases to the worker in chunks.

### MEDIUM: Heartbeat endpoint runs the worker staleness sweep inline
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/judge/heartbeat/route.ts:80`
- **Problem:** Every worker heartbeat awaits `sweepStaleWorkers(now)`, which updates the status of stale workers in the same request handler.
- **Failure scenario:** With many workers heartbeating frequently, the sweep runs repeatedly and serializes updates to `judgeWorkers`. Under worker churn, heartbeats pile up behind the sweep.
- **Suggested fix:** Move the staleness sweep to a single background interval/cron and make the heartbeat path a minimal `UPDATE` of the calling worker.

### MEDIUM: Docker image build blocks a Next.js request worker for up to 600s
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/admin/docker/images/build/route.ts:119`
- **Problem:** The handler awaits `buildDockerImage(...)` synchronously in the request thread with only the underlying build timeout.
- **Failure scenario:** A slow multi-GB language image build occupies a request worker for up to 10 minutes, reducing capacity for other admin requests.
- **Suggested fix:** Move image builds to an asynchronous job queue or background worker and return a build-id/job-status response.

### MEDIUM: Bulk file delete performs sequential disk I/O
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/files/bulk-delete/route.ts:33-39`
- **Problem:** After the DB delete, the handler loops over deleted files and awaits `deleteUploadedFile` sequentially.
- **Failure scenario:** Bulk-deleting the maximum allowed files spends most of the request waiting on serial I/O, holding the connection open.
- **Suggested fix:** Run disk deletions in parallel with `Promise.all` (or a bounded `p-limit`) and return success based on the DB delete.

### LOW/MEDIUM: Rate-limiter state is in-process and non-replicated
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `rate-limiter-rs/src/main.rs:31,152-213,215-281`
- **Problem:** All buckets live in a `DashMap` inside the single process. There is no persistence or shared backend. Restarting the container resets counters and blocks; running more than one replica shards state inconsistently.
- **Failure scenario:** A rolling update of the rate-limiter sidecar wipes out login-failure counts, allowing a brute-force attacker to resume from zero. Horizontal scaling splits counters across instances.
- **Suggested fix:** Document that the rate limiter must run as a single replica, or back it with Redis or a small persistent store so state survives restarts and replicas.

### LOW/MEDIUM: Audit-event buffer can grow unbounded during DB back-pressure
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/audit/events.ts:163-262`
- **Problem:** `recordAuditEvent()` synchronously pushes rows into an in-memory buffer and triggers an async flush. On flush failure, the failed batch is re-buffered unless the total exceeds `FLUSH_SIZE_THRESHOLD * 2`, at which point events are dropped silently.
- **Failure scenario:** If the DB slows down, high-frequency events keep arriving faster than flushes complete. The buffer balloons until the drop threshold is hit, losing audit entries and increasing GC pressure.
- **Suggested fix:** Apply a hard upper bound on `_auditBuffer.length` with a documented drop policy, or switch to a bounded queue with backpressure for critical events.

### LOW/MEDIUM: Audit flush interval starts once and is never stopped
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/audit/events.ts:167-178`
- **Problem:** `ensureFlushTimer` starts a 5-second interval on the first audit event and never stops it. The timer fires for the process lifetime and survives HMR/test module reloads.
- **Failure scenario:** Empty-buffer flushes waste CPU and can retain the module closure in long-running dev/test processes.
- **Suggested fix:** Provide a `stopAuditFlushTimer` export and call it during graceful shutdown/HMR; only arm the timer when the buffer is non-empty and stop it after a flush if the buffer is empty.

### LOW/MEDIUM: Anti-cheat event ingestion performs one INSERT per event
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:180-190`
- **Problem:** Non-heartbeat telemetry events are inserted one row at a time with no batching or queue.
- **Failure scenario:** A burst of client telemetry creates a synchronous DB round-trip per request and can backlog the connection pool.
- **Suggested fix:** Batch insert events (e.g., accept an array of events and use `INSERT ... VALUES ...`) or add a small in-memory queue flushed periodically.

## Theme: UI / UX / Accessibility

### MEDIUM: Dialog and Sheet close buttons expose a duplicate accessible name
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/components/ui/dialog.tsx:66-79`; `src/components/ui/sheet.tsx:66-79`
- **Problem:** `DialogPrimitive.Close` / `SheetPrimitive.Close` is rendered with a `Button` that already has `aria-label={tCommon("close")}` inside the `render` prop, and then contains children `<XIcon aria-hidden="true" />` plus `<span className="sr-only">{tCommon("close")}</span>`. `DialogContent` / `SheetContent` do not forward `aria-labelledby` pointing at the title.
- **Failure scenario:** Screen-reader users hear a duplicated or inconsistent label and cannot rely on the title to identify the modal.
- **Suggested fix:** Remove either the `aria-label` on the `Button` or the inner `sr-only` text. Generate an `id` for the title and pass `aria-labelledby={titleId}` to the popup.

### MEDIUM: Tab panels lack programmatic labels on nested tab sets
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/app/(public)/practice/problems/[id]/page.tsx:522,879`; `src/app/(public)/dashboard/_components/dashboard-judge-system-tabs.tsx:68`; `src/components/code/compiler-client.tsx:452,551`; `src/components/submissions/output-diff-view.tsx:30`
- **Problem:** Multiple `<Tabs>` instances on the same page are rendered without an `aria-label`. Screen-reader users cannot distinguish tablists, and voice-control users cannot target a tablist by name.
- **Failure scenario:** VoiceOver/NVDA rotor lists two generic "tab groups" with no context; a voice-control user cannot say "switch to accepted solutions".
- **Suggested fix:** Add `aria-label` (or `aria-labelledby`) to every `<Tabs>` root.

### MEDIUM: Yellow/amber semantic text likely fails WCAG AA contrast
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/app/(public)/_components/public-problem-list.tsx:163`; `src/components/contest/leaderboard-table.tsx:98`; `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:479,484`; `src/lib/ratings.ts:25` (consumed by `src/components/tier-badge.tsx`)
- **Problem:** `text-yellow-600` on a white/light surface is estimated below the 4.5:1 required for normal body text under WCAG 2.2 1.4.3.
- **Failure scenario:** Users with low contrast sensitivity cannot distinguish success rates, first place, or stale/load-error badge text.
- **Suggested fix:** Move to a darker hue such as `text-yellow-700`/`amber-700` or add non-color cues (icon, weight).

### MEDIUM: Empty `<SelectValue />` causes triggers to display raw values instead of labels
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx:81`; `src/components/problem/accepted-solutions.tsx:121,136`; `src/components/contest/score-timeline-chart.tsx:66`; `src/components/contest/contest-replay.tsx:222`; `src/components/contest/anti-cheat-dashboard.tsx:504`; `src/components/contest/contest-clarifications.tsx:203`
- **Problem:** These call sites render `<SelectValue />` with no children. Base UI falls back to the raw `value` string.
- **Failure scenario:** Users see untranslated keys or opaque identifiers such as `"newest"`, `"shortest"`, a user UUID, or a numeric playback speed rather than the human-readable label.
- **Suggested fix:** Pass the selected label as children to `<SelectValue>`, mirroring the pattern already used elsewhere. Add these call sites to `tests/unit/select-value-contract-implementation.test.ts`.

### MEDIUM: Single-key "n"/"p" shortcuts conflict with screen-reader reading keys
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** designer
- **Files / Lines:** `src/app/(public)/practice/problems/[id]/problem-keyboard-nav.tsx:15-18`; `src/hooks/use-keyboard-shortcuts.ts:32-67`
- **Problem:** The component registers unmodified `n` and `p` keys to navigate to the next/previous problem. These keys are commonly used by NVDA/JAWS for next/previous paragraph.
- **Failure scenario:** A screen-reader user presses "p" to read the previous paragraph and is unexpectedly navigated to the previous problem.
- **Suggested fix:** Require a modifier for problem navigation (e.g., `Alt+n` / `Alt+p`), or provide a user preference to disable single-key shortcuts. After navigation, move focus to the top of the new problem content and announce the change via `aria-live`.

### MEDIUM: Login form errors are not programmatically associated with inputs
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/app/(auth)/login/login-form.tsx:62-101`
- **Problem:** When login fails, the error is rendered inside `<p role="alert" aria-live="polite">`. The inputs do not receive `aria-invalid="true"`, and none are linked to the alert via `aria-describedby`.
- **Failure scenario:** A screen-reader user tabs back to the email field after a failed login and has no programmatic indication that the field is invalid or relates to the alert text.
- **Suggested fix:** Add `aria-invalid={!!error}` and `aria-describedby="login-error"` to both inputs, and give the alert paragraph `id="login-error"`.

### MEDIUM: Contest join success state is not announced and redirects quickly
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** designer
- **Files / Lines:** `src/app/(public)/contests/join/contest-join-client.tsx:101-105`
- **Problem:** After a successful join, the UI shows a green `CheckCircle2` icon with `animate-pulse` plus green success text, but there is no `aria-live` announcement. The redirect is delayed by a timer.
- **Failure scenario:** A screen-reader user submits the form and receives no confirmation that the join succeeded before the redirect.
- **Suggested fix:** Wrap the success message in a container with `role="status" aria-live="polite"` and move focus to it when `success` becomes true. Make the auto-redirect delay configurable or longer.

### MEDIUM: StatusBoard mobile card uses invalid nested interactive elements
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:135-190`
- **Problem:** The mobile card uses a `<div role="button" tabIndex={0}>` that contains a student-name `<Link>` and a "view submissions" `<Button>` wrapped in another `<Link>`. Nesting interactive controls inside a button is invalid HTML and breaks keyboard/AT behavior.
- **Failure scenario:** Voice-control users cannot target "view submissions". Keyboard users may activate the wrong action because events bubble inconsistently.
- **Suggested fix:** Restructure the card so the expand/collapse action is a separate native `<button>` and the nested links/buttons are siblings. Remove the manual keyboard handler.

### MEDIUM: Many form labels are not programmatically associated with controls
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** Representative call sites: `src/lib/plugins/chat-widget/admin-config.tsx`; `src/components/contest/recruiting-invitations-panel.tsx`; `src/components/contest/quick-create-contest-form.tsx`; `src/components/problem/function-reference-solution.tsx`; `src/components/contest/contest-clarifications.tsx`; `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx`; `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx`; `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx`; `src/app/(dashboard)/dashboard/admin/settings/home-page-content-form.tsx`; `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx`
- **Problem:** `<Label>` is used without `htmlFor` and the associated input/select/textarea is not nested inside it.
- **Failure scenario:** Screen-reader users hear a label but the control is not programmatically named by it. Voice-control users cannot say "click Provider" to focus the select.
- **Suggested fix:** Add `htmlFor` to each `<Label>` matching the `id` on the associated control, or wrap the control inside the `<Label>`.

### LOW: File upload dropzone has faint border and custom keyboard behavior
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** designer
- **Files / Lines:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:196-225,246-255`
- **Problem:** The dropzone is a `<div role="button" tabIndex={0}>` with a dashed border using `border-muted-foreground/25`. At 25% opacity the boundary may fall below the 3:1 non-text contrast requirement. Keyboard activation is handled manually for only Enter/Space.
- **Failure scenario:** Low-vision users cannot perceive the dropzone boundary. Screen-reader users cannot tell what the remove button does.
- **Suggested fix:** Increase border contrast, replace the custom div with a native `<button>`, and add `aria-label` to the remove button.

### LOW: Active navigation links lack `aria-current`
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** designer
- **Files / Lines:** `src/components/layout/public-header.tsx:180-196`
- **Problem:** The desktop navigation highlights the active page visually but does not add `aria-current="page"`.
- **Failure scenario:** Screen-reader users browsing the navigation rotor hear a list of links with no indication of the current page.
- **Suggested fix:** Add `aria-current={active ? "page" : undefined}` to each navigation `<Link>`.

---

## Theme: Documentation / API Drift

### HIGH: `docs/api.md` omits ~31 live `/api/v1` endpoints
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/api.md:1-2037`; `src/app/api/v1/**` (113 `route.ts` files)
- **Problem:** The documented endpoint list covers roughly 82 of the 113 live route files. Missing routes include auth, code snapshots, community threads/posts/votes, contest sub-resources (announcements, clarifications, code snapshots, stats, recruiting invitations, quick-create), playground, problem import/draft/accepted-solutions, recruiting validate, submissions queue-status, admin submissions export/rejudge, and admin test-email.
- **Failure scenario:** API consumers, SDK generators, and integration tests cannot discover a large portion of the public surface.
- **Suggested fix:** Add a documentation pass for each missing route group, including method, auth model, capability/role, rate-limit key, request body schema, and response shape.

### HIGH: `flix` documented as `judge-jvm`; actual image is `judge-flix`
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `AGENTS.md:113`; `docs/languages.md:73`; `src/lib/judge/languages.ts:1197`
- **Problem:** Docs say `flix` uses Docker image `judge-jvm`; code uses `judge-flix:latest`.
- **Failure scenario:** Operators following the docs will not build `judge-flix`; submissions in Flix fail at runtime with "image not found".
- **Suggested fix:** Update `AGENTS.md:113` and `docs/languages.md:73` to `judge-flix`.

### HIGH: `flix` is simultaneously marked arm64-ready and listed as ARM-prohibitive
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/languages.md:73` (table), `docs/languages.md:224` (ARM-prohibitive set); `deploy-docker.sh:220`
- **Problem:** The docs contain two contradictory statements about `flix` ARM support.
- **Failure scenario:** Operators cannot tell whether `flix` is included in the `all` preset.
- **Suggested fix:** Decide canonical status. If ARM-ready, remove from ARM-prohibitive set; if prohibitive, change table checkmarks to `—`.

### HIGH: `roc` listed as active in `AGENTS.md` but absent from TypeScript language system
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `AGENTS.md:20,119`; `docs/languages.md:208-210`; `src/types/index.ts:30-156`; `src/lib/judge/languages.ts`
- **Problem:** `AGENTS.md` treats `roc` as active; TypeScript app cannot accept `roc` submissions because it is not in the `Language` union.
- **Failure scenario:** An agent scanning `AGENTS.md` to enumerate supported languages includes `roc` and then fails when using it.
- **Suggested fix:** Remove the `roc` row from `AGENTS.md` (or mark it `[DISABLED]`). Optionally remove `Roc` from the Rust worker if permanently retired.

### HIGH: README image-size table lists images with no active language configuration
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `README.md:86,94,104`; `src/types/index.ts:30-156`; `src/lib/judge/languages.ts`
- **Problem:** README lists `judge-j`, `judge-malbolge`, `judge-roc` as active images, but none have active language configs.
- **Failure scenario:** Contributors conclude these languages are supported; submissions using them would fail validation.
- **Suggested fix:** Remove the three rows from the README size table or add a footnote that these Dockerfiles exist but are not integrated.

### HIGH: Similarity-check endpoint auth described as "Instructor or above"; code also allows assistants
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/api.md:1089-1091`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`
- **Problem:** Docs say "Instructor or above"; code also allows any role with `anti_cheat.run_similarity` that is a group TA or assigned to the teaching group.
- **Failure scenario:** A client built against the API docs hides the similarity-check affordance from assistants even though the backend accepts the call.
- **Suggested fix:** Update `docs/api.md` to: "Requires `anti_cheat.run_similarity` capability plus group TA/assigned teaching-group membership, or `canManageContest`."

### HIGH: `docs/deployment.md` misstates the app container's internal listen port
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/deployment.md:7`; `docker-compose.production.yml:96`
- **Problem:** Docs say the app container listens on port 3100 internally; actual internal port is 3000 (host 3100 is the nginx upstream target).
- **Failure scenario:** Operators debugging connectivity or writing custom compose overrides target the wrong internal port.
- **Suggested fix:** Change `docs/deployment.md:7` to state the app listens on port 3000 internally and is mapped to host port 3100.

### MEDIUM: README and AGENTS.md claim 43 capabilities; code defines 46
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `README.md:29`; `AGENTS.md`; `src/lib/capabilities/types.ts:8-53`
- **Problem:** Docs claim 43 capabilities; `ALL_CAPABILITIES` contains 46.
- **Failure scenario:** Security architecture descriptions and automation that counts capabilities are off by three.
- **Suggested fix:** Update README.md and AGENTS.md to state 46 capabilities.

### MEDIUM: Documentation claims 102 active Docker images; active configs reference 98
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `README.md:77`; `docs/languages.md:192`; `src/lib/judge/languages.ts`
- **Problem:** Docs claim 102 active images; active language configs reference 98 distinct images. Four Dockerfiles (`judge-j`, `judge-malbolge`, `judge-roc`, `judge-simula`) are orphans.
- **Failure scenario:** Image-count claims and size tables are inflated by orphan images. Operators overestimate disk capacity and build time.
- **Suggested fix:** Update docs to 98 images. Remove or annotate orphan image rows. Decide whether to delete `docker/Dockerfile.judge-simula` or complete its integration.

### MEDIUM: `all` language preset contents disagree between `setup.sh` and `deploy-docker.sh`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/languages.md:214-220`; `README.md:71`; `deploy-docker.sh:220-221`; `scripts/setup.sh:59-67`
- **Problem:** `deploy-docker.sh` excludes the ARM-prohibitive set from `all`; `scripts/setup.sh` includes the prohibitive set in `all`.
- **Failure scenario:** A developer running `scripts/setup.sh --all` builds a different image set than a production operator running `./deploy-docker.sh --languages=all`.
- **Suggested fix:** Align `scripts/setup.sh` with `deploy-docker.sh`. Update preset descriptions.

### MEDIUM: `docs/deployment.md` language-preset size estimates are stale
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/deployment.md:80`; `deploy-docker.sh:268-277`; `AGENTS.md:375`; `README.md:71`
- **Problem:** Docs use smaller size estimates than the script help text and README/AGENTS.md.
- **Failure scenario:** Operators provisioning disk space from `docs/deployment.md` may underestimate by up to 50% for smaller presets.
- **Suggested fix:** Update `docs/deployment.md:80` to match current estimates.

### MEDIUM: Several documented admin/problem endpoints have incorrect role-based auth descriptions
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/api.md:1666-1668` (`GET /api/v1/admin/docker/images`); `AGENTS.md:260-261`; `src/app/api/v1/admin/docker/images/route.ts:55,93,165`
- **Problem:** Docs describe these endpoints as "Admin or Super Admin"; code requires the `system.settings` capability.
- **Failure scenario:** Custom roles or integrations that gate on role names apply the wrong authorization model.
- **Suggested fix:** Change auth descriptions to "Requires `system.settings` capability."

### MEDIUM: Contest join endpoint docs omit failure-scoped rate-limit buckets
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `docs/api.md:941-943`; `src/app/api/v1/contests/join/route.ts:28-36`
- **Problem:** Docs list only `contest:join`; the route also consumes `contest:join:invalid` (per-user) and `contest:join:invalid-code` (per access-code hash) on failed redemption.
- **Failure scenario:** API consumers retrying on 400 may hit 429 from undocumented buckets.
- **Suggested fix:** Expand the docs to list all three buckets and the conditions that trigger the failure buckets.

### MEDIUM: `judge-haskell` base image/OS reported three different ways
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** document-specialist
- **Files / Lines:** `AGENTS.md:210`; `src/lib/judge/languages.ts:110`; `docker/Dockerfile.judge-haskell:1`
- **Problem:** AGENTS says `ghc:9.4-alpine`; code says "Debian Bookworm / GHC 9.4"; Dockerfile says `alpine:3.21`.
- **Failure scenario:** Operators troubleshooting musl/glibc or shell-path issues are misled.
- **Suggested fix:** Update both docs and code to "Alpine 3.21 / GHC 9.4".

### LOW: AGENTS.md "Adding a New Language" checklist omits Rust runner-side validation
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** document-specialist
- **Files / Lines:** `AGENTS.md:151-159`; `judge-worker-rs/src/languages.rs`
- **Problem:** The checklist stops at Rust config + test entry, but production sidecar mode requires the new language's commands to also be accepted by the Rust-side validator.
- **Failure scenario:** A contributor validates locally via Node fallback and discovers production failures only after deploy.
- **Suggested fix:** Add a checklist step: "Verify the new language's compile/run commands pass the Rust-side validator."

### LOW: README language-preset list omits the `everything` preset
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** document-specialist
- **Files / Lines:** `README.md:71`; `docs/languages.md:214-220`; `AGENTS.md:375`
- **Problem:** README lists only `core`, `popular`, `extended`, `all`; five presets exist including `everything`.
- **Failure scenario:** README readers miss the `everything` escape hatch.
- **Suggested fix:** Add `everything` to the README presets list or reference `docs/languages.md`.

## Theme: Testing / Test Coverage

### HIGH: Critical security gates have zero unit tests
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** test-engineer
- **Files / Lines:** `src/lib/security/sandbox-gate.ts:37-92`; `src/lib/security/hcaptcha.ts:1-89`; `src/lib/security/production-config.ts:54-89`; `src/lib/security/sensitive-settings.ts:19-61`; `src/lib/security/derive-key.ts:1-31`
- **Problem:** Five security-critical library modules have no unit tests despite being on the direct path of production routes. Every route test mocks them away.
- **Failure scenario:** A fresh deployment without SMTP can silently block instructors, a refactor swaps DB/env priority for hCaptcha, a typo in a required env var passes startup checks, a new sensitive setting is added without password reconfirmation, or a domain string change breaks plugin-config decryption — all with no failing test.
- **Suggested fix:** Add unit tests for: `sandbox-gate` (all five branches), `hcaptcha` (precedence/verify paths), `production-config` (missing required vars → `process.exit`), `sensitive-settings` (key list contract), and `derive-key` (HKDF determinism/domain separation).

### HIGH: E2E `contest-participant-audit.spec.ts` is permanently dead
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** test-engineer
- **Files / Lines:** `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136,177,190,203`
- **Problem:** Every assertion branch uses unconditional `test.skip(true, "...")`. The participant audit flow is never exercised.
- **Failure scenario:** A route rename, tab rename, or nav restructuring breaks the flow, yet CI reports green because the spec silently skips.
- **Suggested fix:** Seed data in `beforeAll` and navigate/assert the audit sections without runtime data discovery.

### MEDIUM: ~90 implementation-checklist tests assert string presence instead of runtime behavior
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** test-engineer
- **Files / Lines:** `tests/unit/*-implementation.test.ts` (~90 files), plus proxy-error-handling, auto-review-implementation, deployment-automation-docs, admin-security-docs, etc.
- **Problem:** These tests read source files and assert `toContain`/`not.toContain`. They inflate coverage numbers without proving logic works at runtime.
- **Failure scenario:** A behavior-preserving refactor breaks dozens of "tests" while real regressions elsewhere go undetected. Conversely, a behavioral regression that does not change the searched strings passes the suite.
- **Suggested fix:** Treat source-scan tests as documentation/contract checks. Add corresponding runtime tests that import the function/module and exercise behavior. Exclude checklist files from coverage thresholds.

### MEDIUM: Compiler local fallback Docker path is not behavior-tested
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** test-engineer
- **Files / Lines:** `src/lib/compiler/execute.ts:717-951`; `tests/unit/compiler/execute.test.ts`; `tests/unit/compiler/execute-implementation.test.ts:6-34`
- **Problem:** The local-fallback Docker path is only checked by source-scan assertions. Untested runtime behavior includes temp workspace creation/removal, permission application, chown failure handling, and compile-command propagation.
- **Failure scenario:** A refactor changes the order of `chown` vs. `chmod` or swallows a Docker error. Source-scan tests pass, but the sandbox becomes world-readable or failures are silently reported as success.
- **Suggested fix:** Add behavior tests for the local fallback behind `ENABLE_COMPILER_LOCAL_FALLBACK=1` using `vi.mock` for `child_process.execFile`/`fs`/`docker`.

### MEDIUM: `similarity-check` route lacks negative authorization and error-path tests
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-94`; `tests/unit/api/similarity-check.route.test.ts:86-193`
- **Problem:** Existing tests cover `not_run`, timeout, and assistant authorization. Missing: 403 for non-managers/assistants without `anti_cheat.run_similarity`, 404 for missing assignment/`examMode === "none"`, non-abort error rethrow, and DB enrichment of pairs with usernames.
- **Failure scenario:** A regression removes the `canManageContest` check or returns 200 for assistants assigned to a different group.
- **Suggested fix:** Extend the route tests with 403, 404, non-abort error propagation, and pair username enrichment cases.

### MEDIUM: API route unit tests bypass the real `createApiHandler` middleware stack
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic, test-engineer
- **Files / Lines:** `src/lib/api/handler.ts:94-219`; widespread in `tests/unit/api/*.test.ts`
- **Problem:** Most route tests mock `@/lib/api/handler` so `createApiHandler` becomes a thin wrapper that skips rate limiting, session/API-key auth, role/capability checks, CSRF validation, and Zod body parsing.
- **Failure scenario:** A regression that removes `rateLimit: "similarity-check"` or the `capabilities` requirement passes the unit suite but leaves the deployed endpoint unprotected.
- **Suggested fix:** For at least one representative route per category, remove the `createApiHandler` mock and call the exported handler through the real wrapper. Add negative cases for missing CSRF, wrong role, and missing capability.

### MEDIUM: Infrastructure tests are static substring checks and do not execute scripts
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer, critic
- **Files / Lines:** `tests/unit/infra/deploy-security.test.ts:9-251`; `tests/unit/infra/deploy-storage-safety.test.ts:21-143`; `tests/unit/infra/judge-report-nginx.test.ts:9-45`
- **Problem:** These tests assert that scripts/configs contain specific strings. They do not run `bash -n`, validate rendered nginx with `nginx -t`, or assert `.env.production` permissions after a real deploy run.
- **Failure scenario:** A deployment script is syntactically valid and contains expected strings, but a subtle bug causes `.env.production` permissions to remain world-readable in practice.
- **Suggested fix:** Complement string-presence checks with lightweight runtime smoke tests: `bash -n`, spin up compose in CI and assert generated env file permissions, and validate nginx config with `nginx -t`.

### MEDIUM: `rate-limit-core.ts` `ON CONFLICT` first-insert race path not directly tested
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `src/lib/security/rate-limit-core.ts:89-138`; `tests/unit/security/api-rate-limit.test.ts`
- **Problem:** `insertRateLimitEntryIfAbsent()` returns `true` on a winning insert and `false` when a concurrent transaction already inserted. Existing tests mock the insert as always succeeding, so the UPDATE fallback is never exercised.
- **Failure scenario:** A refactor removes the `if (inserted) return` guard; on a genuine first insert the UPDATE path may undercount or misorder attempts.
- **Suggested fix:** Add `tests/unit/security/rate-limit-core.test.ts` with a DB mock returning `{ rowCount: 0 }` to exercise the conflict/fallthrough path.

### MEDIUM: `rate-limiter-rs` middleware, constant-time compare, and backoff cap are untested
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `rate-limiter-rs/src/main.rs:52-85,257-263`
- **Problem:** Existing Rust tests call handler functions directly and bypass the Axum stack. Missing coverage for `constant_time_eq`, `require_bearer` middleware, and exponential backoff cap (`MAX_CONSECUTIVE_BLOCKS_EXP = 4`).
- **Failure scenario:** A refactor of `require_bearer` accidentally drops the `strip_prefix("Bearer ")` check.
- **Suggested fix:** Use Axum's test helpers to invoke the full router including middleware. Add direct tests for `constant_time_eq` and backoff cap.

### MEDIUM: `judge-worker-rs/src/runner.rs` HTTP handler validation logic has no unit tests
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `judge-worker-rs/src/runner.rs:658-713`
- **Problem:** `runner.rs` contains source-code size enforcement, stdin size enforcement, Docker image validation, and semaphore capacity enforcement, but has no `#[cfg(test)]` blocks.
- **Failure scenario:** The `source_code.len() > MAX_SOURCE_CODE_BYTES` guard is removed in a refactor; a 1 MB source file reaches Docker and OOM-kills the container.
- **Suggested fix:** Add `#[cfg(test)]` blocks to `runner.rs` covering oversized source/stdin, invalid `docker_image`, semaphore exhausted, and `docker_capability_ok = false`.

### MEDIUM: `ip.ts` `unwrapMappedIpv4()` edge cases lack direct tests
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `src/lib/security/ip.ts:33-44`; `tests/unit/security/ip.test.ts:106-133`
- **Problem:** `unwrapMappedIpv4` is exported but only exercised indirectly. Direct edge cases not tested: uppercase `::FFFF:...`, empty string, trailing garbage, invalid octet >255.
- **Failure scenario:** `unwrapMappedIpv4("::ffff:999.1.1.1")` returns an invalid IP that flows into rate-limit keying or audit logs.
- **Suggested fix:** Add direct `unwrapMappedIpv4` cases to `tests/unit/security/ip.test.ts`.

### MEDIUM: `MockSubmissionRow` factory is missing production columns and uses wrong timestamp types
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `tests/unit/support/factories.ts:76-119`; `src/lib/db/schema.pg.ts` (submissions table)
- **Problem:** The mock declares only 14 columns and omits `judgeClaimToken`, `judgeClaimedAt`, `judgeWorkerId`, `failedTestCaseIndex`, `runtimeErrorType`, and `ipAddress`. It uses `number` for `submittedAt`/`judgedAt` while the real columns are `timestamp with time zone`.
- **Failure scenario:** A unit test for the judge claim/poll path creates a mock row and asserts on `judgeClaimToken`. The mock returns `undefined`, so a regression is not caught.
- **Suggested fix:** Sync `MockSubmissionRow` with `schema.pg.ts`, add missing fields, and change timestamp fields to `Date`.

### LOW/MEDIUM: Coverage thresholds are low and not enforced on the default unit gate
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `vitest.config.ts:36-54`; `package.json`
- **Problem:** The default `npm run test:unit` runs `vitest run` without `--coverage`. Thresholds are only evaluated under `npm run test:unit:coverage`. Global thresholds are permissive (functions 40%).
- **Failure scenario:** A PR adds a new security-critical module with zero tests and still passes the default CI-style gate.
- **Suggested fix:** Run `npm run test:unit:coverage` in CI and consider failing the gate on uncovered additions to `src/lib/security/**` or `src/lib/auth/**`. Raise the global function threshold over time.

### LOW/MEDIUM: Integration tests are conditionally skipped and not guaranteed locally
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** test-engineer
- **Files / Lines:** `tests/integration/db/catalog-numbers.test.ts:23`; `tests/integration/db/user-crud.test.ts:15`; `tests/integration/db/submission-lifecycle.test.ts:28`; `tests/integration/db/judge-claim-reclaim.test.ts:28`; `tests/integration/api/health.test.ts:6`
- **Problem:** All integration suites use `describe.skipIf(!hasPostgresIntegrationSupport)`. They run in CI but silently skip locally.
- **Failure scenario:** A developer running `npm run test:unit` believes reliability logic is tested, but judge claim reclaim after worker death is never exercised locally.
- **Suggested fix:** Provide a `docker-compose.test-backends.yml` or documented one-liner to spin up test Postgres. Add a pre-test warning when integration tests skip.

---

## Theme: Latent Bugs / Operational

### HIGH: `sshpass` exposes the SSH password in local process listings
- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic, tracer, debugger, security-reviewer
- **Files / Lines:** `deploy-docker.sh:391-392,399-400,595`; `deploy.sh:57-58,65-66`
- **Problem:** `remote()` and `remote_copy()` helpers invoke `sshpass -p "$SSH_PASSWORD"`. Command-line arguments are visible to any local user via `ps` or `/proc/<pid>/cmdline` while the deploy runs.
- **Failure scenario:** A CI runner or shared operator laptop deploys with password auth. Another unprivileged user captures the plaintext `SSH_PASSWORD`.
- **Suggested fix:** Switch to the environment-variable form (`SSHPASS="$SSH_PASSWORD" sshpass -e ssh ...`) for all remote helpers, or remove password auth entirely and require SSH keys.

### MEDIUM: Rate-limiter sidecar uses wall-clock time for windows and blocks
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `rate-limiter-rs/src/main.rs:137-142,152-212,215-281,292-315`
- **Problem:** `now_ms()` is `SystemTime::now().duration_since(UNIX_EPOCH)`. If the system clock jumps backward (NTP sync, manual adjustment), an active block can appear expired and a window may not reset when it should.
- **Failure scenario:** An attacker blocked for 15 minutes benefits from a backward NTP correction and is allowed more attempts before the DB path re-synchronizes.
- **Suggested fix:** Store `tokio::time::Instant` values for windows/blocks and use monotonic elapsed durations for interval comparisons.

### MEDIUM: Fixed `/tmp` filenames create races during parallel deploys
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `deploy-docker.sh:1446,1530,1602-1605` (nginx config); `1663,1669` (smoke log)
- **Problem:** The nginx config is written to `/tmp/judgekit-nginx.conf` and the smoke log to `/tmp/judgekit-smoke-${DOMAIN}.log` on the deploying machine. These paths are deterministic.
- **Failure scenario:** Two concurrent deploys on the same machine can overwrite each other's files; the wrong config may be copied to a production host.
- **Suggested fix:** Use `mktemp /tmp/judgekit-nginx.XXXXXX` and include PID/timestamp in the smoke log filename. Clean up files in the `EXIT` trap.

### MEDIUM: Migration container runs unpinned `npm install --no-save drizzle-kit@latest pg`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** tracer
- **Files / Lines:** `deploy-docker.sh:~1237`
- **Problem:** The migration step runs a transient container that installs `drizzle-kit@latest` and `pg` without a lockfile. The container is launched with `--env-file .env.production`, giving it access to all secrets.
- **Failure scenario:** A compromised npm registry, a malicious takeover, or an accidental breaking release could cause the migration container to execute attacker-controlled code with full database credentials.
- **Suggested fix:** Pin `drizzle-kit` and `pg` to exact versions in `package.json` or the deploy script, and install from the locked dependency tree.

### MEDIUM: `pg-volume-safety-check.sh` can return `.` as the cluster source
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `scripts/pg-volume-safety-check.sh:156-158`
- **Problem:** Candidate cluster path discovery uses `find ... | head -1 | xargs -I{} dirname {}`. When `find` produces no output, `xargs` without `-r` still runs `dirname` once with an empty argument, printing `.`.
- **Failure scenario:** The script treats the current working directory as the cluster source, potentially reporting a false orphan-cluster emergency.
- **Suggested fix:** Use `xargs -r` or `find ... -printf '%h\n' -quit`.

### MEDIUM: `rebuild-worker-language-images.sh` `eval`s part of `deploy-docker.sh`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `scripts/rebuild-worker-language-images.sh:37-38`
- **Problem:** The script extracts language list assignments from `deploy-docker.sh` and `eval`s them. Future shell-special characters inside those assignments can break or execute unexpected code.
- **Failure scenario:** A future edit adds a language list like `CORE_LANGS="cpp python # core only"`. The `#` is treated as a comment by `eval`, truncating the list.
- **Suggested fix:** Move language list constants into a dedicated sourced file (`scripts/language-lists.sh`) that both scripts source without `eval`.

### MEDIUM: `bootstrap-instance.sh` assumes `--swap` is always in gigabytes
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `scripts/bootstrap-instance.sh:112-124`
- **Problem:** Swap-size fallback uses `echo ${SWAP_SIZE} | sed 's/G//' | awk '{print $1 * 1024}'`. If the operator passes `--swap=512M`, the `G` removal does nothing and the script tries to allocate 512 GB of swap.
- **Failure scenario:** An operator on a small instance runs `--swap=2M` expecting 2 MB and instead creates a 2 GB swap file, potentially filling the root filesystem.
- **Suggested fix:** Parse the numeric suffix explicitly and convert M/G/T to megabytes. Reject unsupported units.

### MEDIUM: Rust Dockerfiles use rolling `rust:1-alpine` tag
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `Dockerfile.judge-worker:10`; `Dockerfile.code-similarity:6`; `Dockerfile.rate-limiter-rs:8`
- **Problem:** `rust:1-alpine` is a rolling tag. A future Rust release can introduce new deprecation warnings treated as errors, edition changes, or dependency breakage.
- **Failure scenario:** A routine deploy on a fresh worker host fails mid-build because `rust:1-alpine` now resolves to a newer Rust without any code change.
- **Suggested fix:** Pin to a specific minor/patch version (e.g., `rust:1.93-alpine`) and update deliberately after testing.

### MEDIUM: Language Dockerfiles download `latest` releases without checksum verification
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `docker/Dockerfile.judge-jvm:10`; `docker/Dockerfile.judge-moonbit:16,21`; `docker/Dockerfile.judge-uiua:7`; `docker/Dockerfile.judge-v:8`
- **Problem:** Several language images fetch `latest` release artifacts directly from GitHub or vendor CDNs with no version pinning, checksum verification, or signature checking.
- **Failure scenario:** A compromised release, breaking upstream change, or network MitM can break or poison the image, causing all submissions in that language to fail.
- **Suggested fix:** Pin to explicit release tags/versions and verify SHA-256 checksums after download. Store expected checksums in the repo.

### MEDIUM: `apiFetchJson` calls `.json()` before checking `response.ok`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `src/lib/api/client.ts:147-158`
- **Problem:** The file's own documentation states "Always check `response.ok` BEFORE calling `.json()`." `apiFetchJson` parses first and then branches on `res.ok && parseOk`.
- **Failure scenario:** A reverse proxy returns an HTML 502 page. `apiFetchJson` returns `{ ok: false, data: fallback }`; the caller cannot distinguish a network failure from a 502/503/504.
- **Suggested fix:** Restructure to check `res.ok` first, then parse success/error bodies separately.

### MEDIUM: `generateNgrams` does not validate `n`
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:197-204`
- **Problem:** The loop condition `i <= tokens.length - n` produces an infinite loop when `n` is 0 or negative.
- **Failure scenario:** A malformed setting or future caller passes `ngramSize=0`. The similarity-check API route times out after 30 seconds, but the synchronous loop blocks the event loop.
- **Suggested fix:** Add an early guard: `if (n <= 0 || tokens.length < n) return new Set();`.

### MEDIUM: `normalizeSource` string-literal cap leaks content into normalized output
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** debugger
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:67-93,106`
- **Problem:** When a string literal exceeds `MAX_STRING_LITERAL_LENGTH` (10 000 chars), the inner while exits without reaching the closing delimiter. The outer loop continues from inside the string body and appends that character to `result` as if it were code.
- **Failure scenario:** Two unrelated submissions sharing the same long base64 blob may get an artificially high similarity score.
- **Suggested fix:** When the cap is hit, skip ahead to the delimiter (or newline) without emitting anything.

### MEDIUM: `judge-worker-rs` startup/periodic sweeps only reap `status=exited`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `judge-worker-rs/src/docker.rs:574-650`
- **Problem:** The periodic `cleanup_orphaned_containers` filters on `status=exited`. Containers in `dead` or `created` states are never reaped by the periodic sweep.
- **Failure scenario:** A Docker daemon restart leaves `oj-*` containers in `dead` state. The periodic sweep ignores them until the next worker restart.
- **Suggested fix:** Remove the `status=exited` filter or explicitly include `status=dead` and `status=created`.

### LOW/MEDIUM: Backup retention can erase all historical backups
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `deploy-docker.sh:1019-1020`; `deploy.sh:178-181`
- **Problem:** `find ... -mtime +${BACKUP_RETAIN_DAYS} -delete`. `BACKUP_RETAIN_DAYS` is operator-overridable; a value of `0` or `1` deletes all prior backups immediately after creating one.
- **Failure scenario:** A misconfigured `BACKUP_RETAIN_DAYS=0` deletes all backups after the daily backup runs.
- **Suggested fix:** Enforce a minimum retention value (e.g., 2) or require explicit confirmation for values <=1.

### LOW/MEDIUM: Backup verification only checks gzip structure
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `scripts/verify-db-backup.sh:13-65`
- **Problem:** The script does not call `pg_restore` by default, so a truncated or corrupted custom-format dump can report success.
- **Failure scenario:** A corrupted backup is trusted as valid; disaster recovery fails when the backup is actually needed.
- **Suggested fix:** Run `pg_restore --list` (or a dry-run restore) as the default verification step.

### LOW/MEDIUM: No off-host backup
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `deploy-docker.sh`, `deploy.sh` backup logic
- **Problem:** Backups are written to `~/backups/` on the same host.
- **Failure scenario:** A disk failure or host loss destroys the database and every backup simultaneously.
- **Suggested fix:** Implement off-host backup copy (e.g., via `rclone` to object storage or another host) as part of the daily backup job.

### LOW/MEDIUM: Rust worker graceful shutdown does not drain runner requests
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `judge-worker-rs/src/main.rs:655-689`
- **Problem:** Shutdown aborts the axum task without waiting for active `/run` requests.
- **Failure scenario:** In-flight verdict submissions may be lost or orphaned containers left running during a restart.
- **Suggested fix:** Add a graceful shutdown handler that waits for active requests to complete within a bounded timeout.

### LOW/MEDIUM: `ensure_env_secret` base64 generator branch is dead and misleading
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `deploy-docker.sh:715-718`
- **Problem:** The function accepts a `generator` argument. For `generator == "base64"` it first generates a hex value and then unconditionally overwrites it with `openssl rand -base64 32`. There are no callers that pass `"base64"`.
- **Failure scenario:** A future maintainer adds `ensure_env_secret SOME_KEY base64` expecting a hex string and gets a base64 string, which may be rejected by a downstream validator.
- **Suggested fix:** Remove the dead branch or make the generator logic explicit and test it.

### LOW/MEDIUM: Dedicated worker `.env` only receives a subset of required variables
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `scripts/deploy-worker.sh:137-144`
- **Problem:** The script creates a remote `.env` with only `JUDGE_BASE_URL`, `JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, `JUDGE_CONCURRENCY`, `JUDGE_WORKER_HOSTNAME`, and `RUST_LOG`. Additional compose-required vars must be pre-provisioned manually.
- **Failure scenario:** An operator adds a required env var to `docker-compose.worker.yml` but forgets to copy it to the worker host; the worker fails to start after deploy.
- **Suggested fix:** Document required worker env vars in `AGENTS.md` and optionally sync an allow-listed set from `.env.production`.

### LOW: `compute-expected` populates `expectedOutput` with stdout even when reference exits non-zero
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** verifier
- **Files / Lines:** `src/app/api/v1/problems/[id]/compute-expected/route.ts:162-170`
- **Problem:** The route marks `ok: false` for non-zero exit but still stores the captured stdout in `expectedOutput`. The field name implies the value will be used as expected output.
- **Failure scenario:** An authoring UI that ignores `ok` writes a crashing reference solution's partial/empty stdout as canonical expected output.
- **Suggested fix:** When `exitCode !== 0`, set `expectedOutput: ""` so the field is unambiguously not usable, or rename the field to `output` for non-success cases. Document the contract.

### LOW: Java function harness formats `double` returns with only 10 significant digits
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** verifier
- **Files / Lines:** `src/lib/judge/function-judging/adapters/java.ts:186`
- **Problem:** The Java adapter serializes `double` returns using `String.format(Locale.ROOT, "%.10g", v)`. `serialization.ts` uses `String(Number(v))` (~17 digits), and C# uses `"R"`.
- **Failure scenario:** Values near the tolerance boundary with more than 10 significant digits may produce wrong verdicts across languages.
- **Suggested fix:** Replace `%.10g` with `%.17g` or `Double.toString(v)` to match the precision contract used elsewhere.

### LOW: PostScript runner disables SAFER mode
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** security-reviewer
- **Files / Lines:** `src/lib/judge/languages.ts:854`
- **Problem:** The PostScript run command passes `-dNOSAFER`, which disables Ghostscript's file-access sandbox.
- **Failure scenario:** A PostScript submission can read or write any file reachable in the writable tmpfs or mounted workspace.
- **Suggested fix:** Use `-dSAFER` for normal submissions and only allow `NOSAFER` for specific problems that require file I/O, gated by a problem-level flag.

### LOW: Uploaded files written with world-readable permissions
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `src/lib/files/storage.ts:27-30`
- **Problem:** `writeUploadedFile` passes `{ mode: 0o644 }`.
- **Failure scenario:** If the data volume is accessible to other users on the host, submission source code, test data, or attachments can be read outside the application.
- **Suggested fix:** Use `{ mode: 0o600 }` for uploaded files.

### LOW: Dead-letter files are written with default permissions
- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `judge-worker-rs/src/executor.rs:1052-1096`
- **Problem:** `fs::create_dir_all` and `fs::write` inherit the process umask. There is no explicit `0o700` directory or `0o600` file mode.
- **Failure scenario:** Verdicts persisted to the dead-letter volume can be read by another unprivileged user or container on the shared worker host.
- **Suggested fix:** Set the dead-letter directory to `0o700` and each file to `0o600` after writing.

---

## Theme: Judge Worker / Rust

### MEDIUM: `Language::Unknown` silently breaks new-language rollouts
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `judge-worker-rs/src/types.rs:201-203`; `judge-worker-rs/src/languages.rs:1909-2040`; `judge-worker-rs/src/executor.rs:220-234`
- **Problem:** The `Language` enum maps unknown values to `Language::Unknown` via `#[serde(other)]`, and `get_config` returns `None` for it. When no DB overrides are present, the worker rejects the submission as `compile_error`.
- **Failure scenario:** A new language is added to the web app and database but the Rust enum is not updated. Submissions for that language immediately fail with "Unsupported language" even though the server is ready to judge them.
- **Suggested fix:** Have the worker advertise its supported languages during `/register`; the app server should only dispatch languages the worker declares. Add a CI contract test comparing the TS language set with the Rust `Language` enum.

### MEDIUM: Compile-phase memory limit always evaluates to the default ceiling
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `judge-worker-rs/src/executor.rs:449-450`
- **Problem:** `compile_memory_mb = compilation_memory_limit_mb().max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB))` always evaluates to `compilation_memory_limit_mb()` (default 2048 MB) because the right-hand term is at most 1024 MB.
- **Failure scenario:** A problem-level memory limit never constrains compilation. A malicious or pathological build can consume up to 2 GiB per concurrent compile slot.
- **Suggested fix:** Decide whether compile memory should be independently configurable or derived from the problem limit, then implement a clear policy.

### MEDIUM: Run-phase memory cap differs between Rust worker and Node fallback
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `judge-worker-rs/src/executor.rs:23,579`; `src/lib/compiler/execute.ts:15`
- **Problem:** The Rust worker silently clamps per-submission memory to `MAX_MEMORY_LIMIT_MB = 1024`, while the Node local fallback hard-codes `MEMORY_LIMIT_MB = 2048`.
- **Failure scenario:** Problems authored with a memory limit between 1024 MB and 2048 MB produce inconsistent verdicts across runners.
- **Suggested fix:** Make both runners use the same configurable ceiling and surface the clamp in logs/metrics. Prefer making the cap env-driven and identical across runners.

### MEDIUM: `JUDGE_MAX_OUTPUT_BYTES` parsed without upper bound
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** critic
- **Files / Lines:** `judge-worker-rs/src/docker.rs:420-424,432-464`
- **Problem:** The per-stream output cap is read from the environment as a `u64` and used to size an in-memory buffer. There is no maximum value check.
- **Failure scenario:** A misconfigured `JUDGE_MAX_OUTPUT_BYTES=10737418240` (10 GiB) with `JUDGE_CONCURRENCY=16` lets the worker try buffering hundreds of gigabytes, leading to OOM.
- **Suggested fix:** Clamp the parsed value to a hard ceiling (e.g., 128 MiB) and log a warning when the env var is ignored or truncated.

### MEDIUM: `/api/v1/judge/poll` route path is baked into the Rust worker binary
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** Confirmed
- **Agents:** architect
- **Files / Lines:** `src/app/api/v1/judge/poll/route.ts:1-5`; `judge-worker-rs/src/main.rs`
- **Problem:** The route name `/api/v1/judge/poll` is semantically misleading and permanently frozen because the Rust worker hard-codes the URL. Renaming or restructuring judge routes requires a coordinated app + worker redeploy.
- **Failure scenario:** A future refactor moves judge routes; the worker binary on `worker-0` posts results to a 404, and submissions remain stuck in "judging".
- **Suggested fix:** Externalize the result-submission URL as a worker env var, add an `/api/v1/judge/results` alias, and document the frozen path prominently in `AGENTS.md`.

### LOW/MEDIUM: Rust worker output buffers up to 128 MiB per stream per sandbox
- **Severity:** LOW (covered under performance; included here for worker-specific visibility)
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** perf-reviewer
- **Files / Lines:** `judge-worker-rs/src/docker.rs:420-464`
- **Problem:** Each judged container spawns two Tokio tasks that read stdout/stderr into memory until `max_output_bytes` (default 128 MiB per stream).
- **Failure scenario:** A `JUDGE_CONCURRENCY` of 8 already reserves ~2 GiB just for output buffers; a malicious submission that prints in a tight loop fills these buffers.
- **Suggested fix:** Lower the default (e.g., 8-32 MiB) and stream outputs to the comparator without fully materializing them in memory.

---

## Theme: Files / Storage

### MEDIUM: File download endpoint has no rate limiting (also listed under API/Auth)
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `src/app/api/v1/files/[id]/route.ts:62-140`
- **Problem / Fix:** Same as API/Auth entry above. Add `rateLimit: "files:download"`.

### LOW: Uploaded files written with world-readable permissions (also listed under Latent Bugs)
- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** security-reviewer
- **Files / Lines:** `src/lib/files/storage.ts:27-30`
- **Problem / Fix:** Same as Latent Bugs entry above. Use `{ mode: 0o600 }`.

---

## Theme: Rate Limiter

### MEDIUM: Rate-limiter state is in-process and non-replicated (also listed under Performance)
- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Agents:** critic
- **Files / Lines:** `rate-limiter-rs/src/main.rs:31,152-213,215-281`
- **Problem / Fix:** Same as Performance entry above. Document single-replica requirement or back with Redis/Postgres.

### MEDIUM: Rate-limiter sidecar uses wall-clock time (also listed under Latent Bugs)
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** debugger
- **Files / Lines:** `rate-limiter-rs/src/main.rs:137-142,152-212,215-281,292-315`
- **Problem / Fix:** Same as Latent Bugs entry above. Use monotonic `tokio::time::Instant` for interval comparisons.

### LOW/MEDIUM: API rate limiter still performs a DB transaction on every allowed request
- **Severity:** LOW/MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Agents:** perf-reviewer
- **Files / Lines:** `src/lib/security/api-rate-limit.ts:69-129`; `src/lib/security/rate-limit.ts:178-209`
- **Problem:** The sidecar only short-circuits when the caller is already blocked; allowed requests still execute a PostgreSQL transaction with `SELECT ... FOR UPDATE` and an update. Multi-key updates run serially inside the transaction.
- **Failure scenario:** High-traffic authenticated endpoints create hot rows in `rate_limits`; `FOR UPDATE` row locks serialize requests sharing an IP/user key.
- **Suggested fix:** Use the sidecar as the primary increment authority for allowed requests and asynchronously sync counters to Postgres, or shard keys by a small time bucket to spread lock contention.

---

## AGENT FAILURES

None this cycle. All 11 agents produced readable, structured reviews within scope and without apparent tool failures or hallucinated file references.

---

## Final Sweep / Commonly Missed Cross-Cutting Risks

The following risks were surfaced by multiple agents or fall between theme boundaries:

1. **IP trust boundary is configured to fail safe, but nginx makes it fail null.** `extractClientIp` refuses to trust a short `X-Forwarded-For` chain, yet nginx replaces the chain with a single `$remote_addr`. The result is not "IP rejected" but `null`, and downstream code degrades to a shared bucket rather than denying. This is the single highest-impact deployment finding and should be validated before the next production deploy. (security-reviewer, critic, tracer, debugger, architect, code-reviewer)

2. **Tests validate helper logic, not the wiring.** Most API unit tests mock `createApiHandler` and test the inner handler in isolation. Middleware-level regressions (dropped `rateLimit`, changed `auth` config, missing CSRF) are invisible to the fast suite. The dominance of ~90 source-scan "implementation" tests further inflates confidence without proving runtime behavior. (critic, test-engineer)

3. **Privileged surface area is broader than documented.** The Docker socket proxy, runner auth token, judge IP allowlist, and systemd services are all described as restricted, but defaults or broad ACLs let a single compromise escalate quickly. (security-reviewer, critic)

4. **Resource consumption precedes authorization.** `/compiler/run` deducts daily quota before checking `content.submit_solutions`; similarity runs delete old events before verifying serialization succeeded; file downloads have no rate limit. (critic, security-reviewer)

5. **State lives in single processes with no invalidation story.** Rate-limiter buckets, in-process settings caches, and capability caches do not survive restarts or horizontal scaling. (critic, architect, perf-reviewer)

6. **Container logs are unbounded.** `docker-compose.production.yml` has no `logging:` section on any service; the default json-file driver accumulates without limit. (critic)

7. **Process-local caches have no cross-instance invalidation.** `system-settings-config.ts`, `capabilities/cache.ts`, and `contest-analytics-cache.ts` all hold module-level singletons. In a multi-instance deployment, settings/role changes are stale in other processes until TTL expires. (architect, critic, perf-reviewer)

8. **PostCSS moderate CVE remains unpatched.** `npm audit` reports GHSA-qx2v-qp2m-jg93 (PostCSS <8.5.10 XSS). The project uses Next.js which depends on the vulnerable range. (critic)

9. **`.gitignore` comment contradicts tracked `.env.deploy*` files.** `.gitignore` claims `.env.*` are ignored, but `.env.deploy*` files are tracked and may be mistaken for secret stores. (critic)

10. **Code-similarity normalization consistency between TS and Rust sidecar is unverified.** If the Rust sidecar normalizes differently than the TypeScript fallback, the same contest could produce inconsistent flagged pairs depending on which path runs. (architect, debugger)

11. **No API-side dead-letter for mismatched judge claim tokens.** The Rust worker writes local dead-letter files, but the API never records that a worker attempted to report a result for a reclaimed submission, leaving operators without a metric to distinguish benign races from systemic worker lag. (tracer)

12. **Similarity check is contest-only.** The route returns 404 for `examMode === "none"` (regular homework), where copying is common. (critic)

---

*End of aggregate review. Do not implement fixes without first reviewing the XFF/nginx impact on production rate limits and allowlists, and without rotating any credentials that may have been exposed via `sshpass` command lines.*
