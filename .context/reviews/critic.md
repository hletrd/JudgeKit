# Critic Review — Whole-Repository Multi-Perspective Critique

Date: 2026-07-01  
Scope: entire repository (`src/`, `judge-worker-rs/`, `rate-limiter-rs/`, `code-similarity-rs/`, `docker/`, `scripts/`, `deploy-docker.sh`, `deploy.sh`, `docs/`, `static-site/`, `tests/`)

Summary: This review surfaces latent whole-system risks that sit at layer boundaries rather than inside single functions. The most consequential findings are: (1) nginx configs overwrite `X-Forwarded-For`, which neutralizes the new trusted-proxy-hops logic and silently collapses per-IP rate limiting, judge IP allowlists, and audit attribution; (2) the test suite mocks away the central `createApiHandler` middleware stack, so auth/rate-limit/CSRF regressions can ship while unit tests stay green; (3) the Docker socket proxy and runner API are over-privileged and under-tested at their trust boundaries; and (4) several route handlers consume scarce resources (quota, rate-limit budget, anti-cheat event rows) before validating caller authorization, creating denial-of-service and state-corruption paths. Many cycle-3 hardening changes are sound in isolation but assume surrounding layers they do not control.

Findings count: 25 (High 12, Medium 10, Low 3)

## Cross-cutting themes

1. **IP trust boundary is configured to fail safe but nginx makes it fail null.** `src/lib/security/ip.ts` refuses to trust a short `X-Forwarded-For` chain, yet every nginx template replaces the chain with a single `$remote_addr`. The result is not "client IP rejected" but `extractClientIp() === null`, and downstream code often degrades to a shared bucket rather than denying.
2. **Tests validate helper logic, not the wiring.** Most API unit tests mock `createApiHandler` and test the inner handler or a helper in isolation. Middleware-level regressions (dropped `rateLimit`, changed `auth` config, missing CSRF) are invisible to the fast suite.
3. **Privileged surface area is broader than documented.** The Docker socket proxy, runner auth token, judge IP allowlist, and systemd services are all described as restricted, but defaults or broad ACLs let a single compromise escalate quickly.
4. **Resource consumption precedes authorization.** `/compiler/run` deducts daily quota before checking `content.submit_solutions`; similarity runs delete old events before verifying serialization succeeded; file downloads have no rate limit at all.
5. **State lives in single processes with no invalidation story.** Rate-limiter buckets, in-process settings caches, and capability caches do not survive restarts or horizontal scaling, and there is no cross-instance invalidation.

---

## HIGH

### 1. Nginx overwrites `X-Forwarded-For`, collapsing IP-derived security controls
- **Files / Lines:** `scripts/online-judge.nginx.conf:63,77,88,100`; `scripts/online-judge.nginx-http.conf:33,44`; `deploy-docker.sh:1483,1498,1510,1522,1553,1568,1580,1592`; `deploy.sh:257`; `src/lib/security/ip.ts:68-131`
- **Problem:** Every nginx location block sets `proxy_set_header X-Forwarded-For $remote_addr;`. This replaces any existing chain with a single entry. `extractClientIp` with default `TRUSTED_PROXY_HOPS=1` requires `parts.length >= 2`, so it returns `null` for all requests.
- **Scenario:** A default single-proxy production deploy. Login rate limits key by IP, but every client now resolves to `null`, so all users share the same bucket; a single attacker can exhaust it and block legitimate logins. If `JUDGE_ALLOWED_IPS` is configured, every worker request is rejected because `isJudgeIpAllowed` sees `null`. Audit logs lose client attribution.
- **Suggested remediation:** Use `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` everywhere. Add a deploy-time or integration assertion that the live XFF chain length is compatible with `TRUSTED_PROXY_HOPS`. Document that `TRUSTED_PROXY_HOPS` must equal the number of trusted reverse proxies.
- **Confidence:** High
- **Classification:** Security / Operational

### 2. `sshpass` exposes the SSH password in local process listings
- **Files / Lines:** `deploy-docker.sh:391-392,399-400`; `deploy.sh:57-58,65-66`
- **Problem:** `remote()` and `remote_copy()` helpers invoke `sshpass -p "$SSH_PASSWORD"`. Command-line arguments are visible to any local user via `ps` or `/proc/<pid>/cmdline` while the deploy runs.
- **Scenario:** A CI runner or shared operator laptop deploys with password auth. Another unprivileged user captures the plaintext `SSH_PASSWORD`, then SSHes into production or worker hosts.
- **Suggested remediation:** Switch to the environment-variable form (`SSHPASS="$SSH_PASSWORD" sshpass -e ssh ...`) for all remote helpers, or remove password auth entirely and require SSH keys.
- **Confidence:** High
- **Classification:** Security

### 3. Docker socket proxy grants broad container lifecycle privileges
- **Files / Lines:** `docker-compose.production.yml:64-86`; `docker-compose.worker.yml:18-46`
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1 IMAGES=1`. The worker can create, start, stop, delete arbitrary containers, and list images on the host Docker daemon.
- **Scenario:** A compromised judge worker sends Docker API requests through the proxy and spawns a privileged container with `--pid=host` or volume mounts, escaping to the host and accessing the PostgreSQL volume or other containers.
- **Suggested remediation:** Restrict the proxy to the exact endpoints required (e.g., only `POST /containers/create` and `DELETE /containers/{id}`). Run Docker rootless, add AppArmor/SELinux profiles to the worker, and drop all capabilities. Split image management into a separate admin service.
- **Confidence:** High
- **Classification:** Security / Architectural

### 4. Judge API IP allowlist defaults to allow-all
- **Files / Lines:** `src/lib/judge/ip-allowlist.ts:18-55,182-210`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed` returns `true` for every IP. Combined with the XFF overwrite above, even an allowlist configured on the app side may be bypassed because the extracted IP is `null`.
- **Scenario:** A leaked `JUDGE_AUTH_TOKEN` lets an attacker register a rogue worker and inject fabricated judge results from any host.
- **Suggested remediation:** Make `JUDGE_STRICT_IP_ALLOWLIST=1` the default for new deployments. Add a startup health signal that reports when the judge API is in allow-all mode, and require explicit operator acknowledgment in deploy scripts before continuing without an allowlist.
- **Confidence:** High
- **Classification:** Security

### 5. `/compiler/run` consumes daily sandbox quota before checking capability
- **Files / Lines:** `src/app/api/v1/compiler/run/route.ts:38-88`; `src/app/api/v1/playground/run/route.ts` (for contrast)
- **Problem:** The route first calls `gateSandboxEndpoint`, which deducts one invocation from the per-user daily quota, then checks `caps.has("content.submit_solutions")` and returns 403. `/playground/run` checks the capability in `auth` before the gate.
- **Scenario:** A user with a custom role that has `files.upload` but lacks `content.submit_solutions` repeatedly calls `/api/v1/compiler/run`. Each call burns the legitimate daily budget before the 403 is returned, eventually exhausting quota.
- **Suggested remediation:** Move the `content.submit_solutions` capability check before `gateSandboxEndpoint`, matching `/playground/run`.
- **Confidence:** High
- **Classification:** Correctness / UX

### 6. Concurrent similarity checks can delete each other's anti-cheat events
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:441-454`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:43-65`
- **Problem:** Two concurrent similarity runs for the same assignment each read the same submission set, compute independently, then run `db.transaction(delete old events → insert new events)`. PostgreSQL serializes the write transactions, so the later transaction deletes the events the earlier one just inserted.
- **Scenario:** Two TAs click "Run similarity check" at the same time. The final state contains only one run's flagged pairs; the other is silently lost.
- **Suggested remediation:** Serialize similarity runs per assignment with `pg_advisory_xact_lock(hashtextextended(assignmentId, 1)::bigint)` around the compute-and-store path, or add an assignment-level version/timestamp guard that aborts stale writers.
- **Confidence:** High
- **Classification:** Correctness

### 7. `createApiHandler` rejects custom roles in `auth.roles`
- **Files / Lines:** `src/lib/api/handler.ts:131-132`
- **Problem:** The role check calls `isUserRole(user.role)`, which only returns `true` for the five built-in role names. A route configured with `auth: { roles: ["custom_instructor"] }` rejects users whose role is exactly `custom_instructor`.
- **Scenario:** A deployment introduces a custom role and restricts an admin route to it. The route is unreachable for that role, forcing developers to use capabilities only and making the `roles` auth config effectively unusable for custom roles.
- **Suggested remediation:** Remove the `isUserRole` guard from the role check, or change it to allow any string present in `auth.roles`.
- **Confidence:** High
- **Classification:** Correctness

### 8. Runner `/run` endpoint accepts nested shells through single-quote gaps
- **Files / Lines:** `judge-worker-rs/src/runner.rs:124-176`; `runner.rs:813-825`; `runner.rs:887-900`
- **Problem:** `validate_shell_command` blocks a short denylist but permits `&&`, `;`, and environment prefixes, and does not reject single quotes or the tokens `bash`/`sh`. Because the runner wraps the supplied command in `sh -c`, a caller can smuggle arbitrary commands inside quotes.
- **Scenario:** A leaked `RUNNER_AUTH_TOKEN` lets an attacker execute arbitrary code inside the judged container. While the container is sandboxed, the attacker can still probe the kernel syscall surface or wage a noisy DoS.
- **Suggested remediation:** Do not accept raw shell strings from the HTTP API. Accept an argv array, reject shell metacharacters/quotes entirely, and execute with `execvp`-style semantics; or store approved commands server-side and reference them by language ID.
- **Confidence:** High
- **Classification:** Security

### 9. File download endpoint has no rate limiting
- **Files / Lines:** `src/app/api/v1/files/[id]/route.ts:62-140`
- **Problem:** The GET handler performs auth and access checks but never calls `consumeApiRateLimit`. Upload and delete are rate-limited; download is not.
- **Scenario:** An authenticated user enumerates `/api/v1/files/{id}` and repeatedly downloads large files, abusing bandwidth and probing file IDs that may belong to others (the 403 access check is free).
- **Suggested remediation:** Add `rateLimit: "files:download"` in `createApiHandler` for the GET handler.
- **Confidence:** High
- **Classification:** Security / Performance

### 10. Sandbox-gate env bypass fails on common whitespace
- **Files / Lines:** `src/lib/security/sandbox-gate.ts:13-14`
- **Problem:** `ALLOW_UNVERIFIED_EMAIL_ENV` does `raw === "1" || raw.toLowerCase() === "true"` without trimming. A value of `"true\n"` or `" true "` fails the literal comparison.
- **Scenario:** An operator in an air-gapped lab sets `SANDBOX_ALLOW_UNVERIFIED_EMAIL=true` in an `.env` file that ends with a newline. The gate remains enforced even though the operator intended to bypass it, locking students out of the compiler/playground with no actionable error.
- **Suggested remediation:** Trim and normalize: `return raw.trim() === "1" || raw.trim().toLowerCase() === "true";`.
- **Confidence:** High
- **Classification:** Correctness / UX

### 11. In-progress judge reports can indefinitely refresh a stale claim
- **Files / Lines:** `src/app/api/v1/judge/poll/route.ts:82-145`
- **Problem:** A worker POSTing `status: "judging"` with a valid `claimToken` resets `judgeClaimedAt` to `dbNow` each time. There is no maximum-judging-time guard independent of heartbeats.
- **Scenario:** A buggy or malicious worker repeatedly reports "judging" for a submission. The stale-claim sweep never reclaims it, and the submission remains stuck in `judging` forever.
- **Suggested remediation:** Reject in-progress updates when `judgeClaimedAt` is older than the configured claim TTL, or add a `maxJudgingDurationMs` guard that forces the submission back to `pending`/`queued` regardless of worker heartbeats.
- **Confidence:** Medium
- **Classification:** Correctness / Architectural

### 12. Rate-limiter state is in-process and non-replicated
- **Files / Lines:** `rate-limiter-rs/src/main.rs:31,152-213,215-281`
- **Problem:** All buckets live in a `DashMap` inside the single process. There is no persistence or shared backend. Restarting the container resets counters and blocks, and running more than one replica shards state inconsistently.
- **Scenario:** A rolling update of the rate-limiter sidecar wipes out login-failure counts, allowing a brute-force attacker to resume from zero. Horizontal scaling splits counters across instances.
- **Suggested remediation:** Document that the rate limiter must run as a single replica, or back it with Redis or a small persistent store so state survives restarts and replicas.
- **Confidence:** High
- **Classification:** Architectural / Operational

---

## MEDIUM

### 13. `Language::Unknown` silently breaks new-language rollouts
- **Files / Lines:** `judge-worker-rs/src/types.rs:201-203`; `judge-worker-rs/src/languages.rs:1909-2040`; `judge-worker-rs/src/executor.rs:220-234`
- **Problem:** The `Language` enum maps unknown values to `Language::Unknown` via `#[serde(other)]`, and `get_config` returns `None` for it. When no DB overrides are present, the worker rejects the submission as `compile_error`.
- **Scenario:** A new language is added to the web app and database but the Rust enum is not updated. Submissions for that language immediately fail with “Unsupported language” even though the server is ready to judge them.
- **Suggested remediation:** Have the worker advertise its supported languages during `/register`; the app server should only dispatch languages the worker declares. Add a CI contract test comparing the TS language set with the Rust `Language` enum.
- **Confidence:** Medium
- **Classification:** Architectural / Operational

### 14. Shell-command whitelist permits shell interpreters, undermining the denylist
- **Files / Lines:** `src/lib/compiler/execute.ts:189-218,243-251`
- **Problem:** `validateShellCommandStrict` accepts `bash`, `sh`, `powershell`, `pwsh` as command prefixes. A compromised `language_configs` row can set `runCommand` to `bash -c '...'` and the denylist is bypassed because the payload lives inside the `-c` argument.
- **Scenario:** An attacker who can modify a language config (e.g., via a compromised admin account) runs arbitrary code inside the judged container.
- **Suggested remediation:** Remove shell interpreters from `ALLOWED_COMMAND_PREFIXES`, or add an explicit rule that rejects `-c`/`-Command` interpreter invocations. Treat commands as direct binary invocations only.
- **Confidence:** Medium
- **Classification:** Security

### 15. `JUDGE_MAX_OUTPUT_BYTES` is parsed without an upper bound
- **Files / Lines:** `judge-worker-rs/src/docker.rs:420-424,432-464`
- **Problem:** The per-stream output cap is read from the environment as a `u64` and used to size an in-memory buffer. There is no maximum value check.
- **Scenario:** A misconfigured `JUDGE_MAX_OUTPUT_BYTES=10737418240` (10 GiB) with `JUDGE_CONCURRENCY=16` lets the worker try buffering hundreds of gigabytes, leading to worker OOM and cascading failures.
- **Suggested remediation:** Clamp the parsed value to a hard ceiling (e.g., 128 MiB) and log a warning when the env var is ignored or truncated.
- **Confidence:** Medium
- **Classification:** Operational / Performance

### 16. Compile-phase memory limit always evaluates to the default ceiling
- **Files / Lines:** `judge-worker-rs/src/executor.rs:449-450`
- **Problem:** `compile_memory_mb = compilation_memory_limit_mb().max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB))` always evaluates to `compilation_memory_limit_mb()` (default 2048 MB) because the right-hand term is at most 1024 MB.
- **Scenario:** A problem-level memory limit never constrains compilation. A malicious or pathological build can consume up to 2 GiB per concurrent compile slot.
- **Suggested remediation:** Decide whether compile memory should be independently configurable or derived from the problem limit, then implement a clear policy (e.g., `min(env_cap, problem_limit * 2, MAX_COMPILE_MEMORY)`).
- **Confidence:** Medium
- **Classification:** Operational / Performance

### 17. Similarity Rust sidecar call ignores the route's abort signal
- **Files / Lines:** `src/lib/assignments/code-similarity-client.ts:45-54`; `src/lib/assignments/code-similarity.ts:354-370`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:48-65`
- **Problem:** The API route arms a 30 s `AbortController`. The Rust sidecar fetch uses a fixed 25 s timeout and does not receive the route's signal.
- **Scenario:** If the sidecar hangs, the route cannot cancel it early; after 25 s it returns `null` and the TS fallback starts, often only to be aborted milliseconds later when the 30 s deadline fires, wasting CPU. Conversely, if the sidecar takes >30 s, the client sees a 500 while the orphaned fetch continues.
- **Suggested remediation:** Pass the route's `signal` into `computeSimilarityRust` and use it as the `fetch` signal. Check `signal.aborted` before falling back to the TS implementation.
- **Confidence:** Medium
- **Classification:** Performance / Correctness

### 18. Contest access-token expiry boundary is inconsistent between SQL and Drizzle
- **Files / Lines:** `src/lib/assignments/contest-access-tokens.ts:24,57-58`; `src/lib/assignments/contests.ts:185`
- **Problem:** The raw-SQL catalog query treats a token as valid when `cat.expires_at > NOW()`, while `findValidContestAccessToken` treats it as expired when `token.expiresAt.valueOf() <= nowMs`.
- **Scenario:** At the exact instant `expires_at == NOW()`, a participant sees the contest in "My Contests" but receives `assignmentEnrollmentRequired` when trying to submit.
- **Suggested remediation:** Align the two predicates. Either use `expires_at >= NOW()` in SQL or strict `<` in Drizzle, and document the chosen boundary.
- **Confidence:** High
- **Classification:** Correctness

### 19. Dead-letter files are written with default permissions
- **Files / Lines:** `judge-worker-rs/src/executor.rs:1052-1096`
- **Problem:** `fs::create_dir_all` and `fs::write` inherit the process umask. There is no explicit `0o700` directory or `0o600` file mode.
- **Scenario:** Verdicts are persisted to the dead-letter volume. Another unprivileged user or container on the shared worker host can read these files, leaking submission diagnostics and compiler errors.
- **Suggested remediation:** Set the dead-letter directory to `0o700` and each file to `0o600` after writing. Add an operator alert/metric when dead-letter files accumulate.
- **Confidence:** Medium
- **Classification:** Security / Operational

### 20. Assignment status aggregate has no deterministic tie-break for same-timestamp submissions
- **Files / Lines:** `src/lib/assignments/submissions.ts:764-772`
- **Problem:** The aggregate CTE orders only the inner window by `submitted_at DESC, id DESC`; the outer `GROUP BY` has no `ORDER BY`. The JavaScript loop sees rows in undefined order.
- **Scenario:** A student submits to two problems at the exact same DB timestamp. The UI may show a different `latestSubmissionId`/`latestStatus` on each page load for the same student.
- **Suggested remediation:** Add `ORDER BY MAX(submitted_at) DESC, MAX(id) DESC` or tie-break by `id` in the JS reducer so the overall latest submission is deterministic.
- **Confidence:** Medium
- **Classification:** Correctness

---

## LOW

### 21. API route unit tests bypass the real `createApiHandler` middleware stack
- **Files / Lines:** `src/lib/api/handler.ts:94-219`; widespread in `tests/unit/api/*.test.ts`
- **Problem:** Most route tests mock `@/lib/api/handler` so `createApiHandler` becomes a thin wrapper that injects a synthetic user and skips rate limiting, session/API-key auth, role/capability checks, CSRF validation, and Zod body parsing.
- **Scenario:** A regression that removes `rateLimit: "similarity-check"` or the `capabilities` requirement from the route config passes the unit suite but leaves the deployed endpoint unprotected.
- **Suggested remediation:** For at least one representative route per category, remove the `createApiHandler` mock and call the exported handler through the real wrapper. Add negative cases for missing CSRF, wrong role, and missing capability.
- **Confidence:** High
- **Classification:** Testing / Architectural

### 22. Factory `MockSubmissionRow` is missing production columns and uses wrong timestamp types
- **Files / Lines:** `tests/unit/support/factories.ts:76-119`; `src/lib/db/schema.pg.ts` (submissions table)
- **Problem:** The mock declares only 14 columns and omits `judgeClaimToken`, `judgeClaimedAt`, `judgeWorkerId`, `failedTestCaseIndex`, `runtimeErrorType`, and `ipAddress`. It uses `number` for `submittedAt`/`judgedAt` while the real columns are `timestamp with time zone`.
- **Scenario:** A unit test for the judge claim/poll path creates a mock row and asserts on `judgeClaimToken`. The mock returns `undefined`, so a regression in how the route reads or writes those fields is not caught.
- **Suggested remediation:** Sync `MockSubmissionRow` with `schema.pg.ts`, add missing fields, and change timestamp fields to `Date`. Consider deriving mock shapes from the schema.
- **Confidence:** High
- **Classification:** Testing / Correctness

### 23. Infrastructure tests are static substring checks and do not execute scripts or validate generated artifacts
- **Files / Lines:** `tests/unit/infra/deploy-security.test.ts:9-147`; `tests/unit/infra/deploy-storage-safety.test.ts:21-144`; `tests/unit/infra/judge-report-nginx.test.ts:9-45`
- **Problem:** The infra suites grep for expected substrings. They do not run `bash -n`, validate rendered nginx config with `nginx -t`, or assert that `.env.production` permissions are `0600` after a real deploy run.
- **Scenario:** `deploy-test-backends.sh` creates `.env.production` on first remote deploy without the later `chmod 600`, leaving secrets at `0644`. The substring tests pass.
- **Suggested remediation:** Add unit-level negative assertions and a CI step that runs deploy scripts against a throwaway container and asserts generated env file permissions and no plaintext secrets in logs.
- **Confidence:** Medium
- **Classification:** Testing / Operational

---

## Final sweep — commonly missed whole-system issues

- **Process-local caches have no cross-instance invalidation.** `src/lib/system-settings-config.ts:84`, `src/lib/capabilities/cache.ts:17`, `src/lib/assignments/contest-analytics-cache.ts:27` all hold module-level singletons. In a multi-instance deployment, a settings or role change is stale in other processes until TTL expires. There is no invalidation bus.
- **Container logs are unbounded.** `docker-compose.production.yml` has no `logging:` section on any service; the default json-file driver accumulates without limit. This was flagged in `_aggregate.md` and remains unaddressed.
- **`code-similarity-rs.service` lacks systemd hardening.** Unlike `online-judge.service` and `online-judge-worker-rs.service`, the code-similarity unit has no `ProtectSystem`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`, `CapabilityBoundingSet`, `RestrictNamespaces`, or memory/CPU limits.
- **Backup retention can erase all historical backups.** `deploy-docker.sh:1019-1020` and `deploy.sh:178-181` run `find ... -mtime +${BACKUP_RETAIN_DAYS} -delete`. `BACKUP_RETAIN_DAYS` is operator-overridable; a value of `0` or `1` deletes all prior backups immediately after creating one.
- **Backup verification only checks gzip structure.** `scripts/verify-db-backup.sh:13-65` does not call `pg_restore` by default, so a truncated or corrupted custom-format dump can report success.
- **PostCSS moderate CVE remains unpatched.** `npm audit` reports GHSA-qx2v-qp2m-jg93 (PostCSS <8.5.10 XSS). The project uses Next.js which depends on the vulnerable range.
- **`.gitignore` comment contradicts tracked `.env.deploy*` files.** `.gitignore:41-54` claims `.env.*` are ignored, but `.env.deploy*` files are tracked and may be mistaken for secret stores.
- **No off-host backup.** Backups are written to `~/backups/` on the same host, violating the 3-2-1 rule. A disk failure or host loss destroys the database and every backup simultaneously.
- **Rust worker graceful shutdown does not drain runner requests.** `judge-worker-rs/src/main.rs:655-689` aborts the axum task without waiting for active `/run` requests, risking orphaned containers.
- **Similarity check is contest-only.** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:18` returns 404 for `examMode === "none"` (regular homework), where copying is common.

---

## Verification recommendations

1. **Manual deploy smoke:** Deploy to a staging host, set `TRUSTED_PROXY_HOPS=1`, and verify that `extractClientIp` returns a real client IP (not `null`) for requests through nginx. Also verify that per-IP rate limits actually isolate distinct source IPs.
2. **Worker security drill:** With a valid `JUDGE_AUTH_TOKEN`, attempt judge registration from a non-allowlisted IP and confirm it is rejected when `JUDGE_STRICT_IP_ALLOWLIST=1`.
3. **Compiler capability ordering:** Use a custom role lacking `content.submit_solutions` and confirm that calling `/api/v1/compiler/run` does not decrement the daily quota.
4. **Concurrent similarity:** Run two similarity checks for the same assignment in parallel and assert the final event count equals one complete result set, not zero.
5. **Rate-limiter restart:** Restart the `rate-limiter` container while a login-failure block is active and confirm whether the block is preserved.
6. **nginx syntax + XFF chain:** Render the config for each `DEPLOY_TARGET` and run `nginx -t`; send requests through the proxy and assert the XFF chain length matches `TRUSTED_PROXY_HOPS`.

---

*End of review. Do not implement fixes without first reviewing the XFF/nginx impact on production rate limits and allowlists, and without rotating any credentials that may have been exposed via sshpass command lines.*
