# Critic Review — Whole-Repository Multi-Perspective Critique

Date: 2026-07-02  
Scope: entire repository (`src/`, `judge-worker-rs/`, `rate-limiter-rs/`, `code-similarity-rs/`, `docker/`, `scripts/`, `deploy-docker.sh`, `deploy.sh`, `docs/`, `static-site/`, `tests/`)

Summary: This is the post-cycle-3 follow-up to the 2026-07-01 critic review. Several previously flagged high-severity issues have been remediated (XFF chain preservation, IP leading-zero rejection, bulk-rejudge `activeTasks` accounting, similarity submission-count guard, raw-SQL additive repair removal, static-site baseline security headers, uploaded-file `0o600` permissions). The remaining risks cluster around **authorization ordering**, **concurrent state mutation**, **defaults that fail open**, and **layer boundaries that tests do not actually exercise**. The most consequential residual findings are: (1) `/compiler/run` still consumes the per-user daily sandbox quota before verifying the `content.submit_solutions` capability; (2) similarity-check runs can delete each other's anti-cheat events because no per-assignment serialization exists; (3) `createApiHandler` still rejects custom roles; (4) the judge API still defaults to allow-all IP posture; and (5) the Rust runner and TypeScript compiler validators both permit shell interpreters, turning a compromised `language_configs` row into arbitrary container code execution. The test suite continues to mock away the central middleware stack, so most regressions at the auth/rate-limit/CSRF boundary will not be caught by the fast unit suite.

Findings count: 24 (High 10, Medium 9, Low 5)

## Cross-cutting themes

1. **Authorization ordering is still wrong in one hot path.** `/compiler/run` deducts scarce daily quota before checking the capability that would make the deduction legitimate. `/playground/run` already does this in the correct order.
2. **Concurrent writers are unprotected at the anti-cheat boundary.** `runAndStoreSimilarityCheck` deletes all `code_similarity` events for an assignment and re-inserts them; two overlapping runs for the same assignment silently lose one writer's results.
3. **Fail-open defaults survive for backward-compatibility reasons.** Judge IP allowlist, unverified-email sandbox bypass, and `AUTH_TRUST_HOST=true` all default to the permissive posture and require explicit operator opt-in to harden.
4. **Privileged surface area is broader than documented.** The Docker socket proxy, runner admin endpoints, and shell-command validators all accept constructs (`bash -c …`, `;`, `&&`) that let a single compromise escalate.
5. **Tests validate helpers, not the wiring.** Most API route tests mock `createApiHandler` and test the inner handler in isolation, so middleware-level regressions are invisible to CI.

## File inventory reviewed

- Project instructions: `CLAUDE.md`, `AGENTS.md`
- Prior aggregate baseline: `.context/reviews/_aggregate.md`, `.context/reviews/critic.md` (2026-07-01)
- Auth / API middleware: `src/lib/api/handler.ts`, `src/lib/api/auth.ts`
- IP / rate limit: `src/lib/security/ip.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/rate-limiter-client.ts`, `src/lib/security/sandbox-gate.ts`
- Judge lifecycle: `src/lib/judge/ip-allowlist.ts`, `src/lib/judge/auth.ts`, `src/lib/judge/claim-query.ts`, `src/lib/judge/worker-staleness.ts`, `src/lib/judge/worker-staleness-sweep.ts`, `src/app/api/v1/judge/poll/route.ts`
- Compiler / execution: `src/lib/compiler/execute.ts`, `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/validation.rs`, `judge-worker-rs/src/types.rs`
- Similarity / anti-cheat: `src/lib/assignments/code-similarity.ts`, `src/lib/assignments/code-similarity-client.ts`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`
- Contest access: `src/lib/assignments/contest-access-tokens.ts`, `src/lib/assignments/submissions.ts`
- Files: `src/app/api/v1/files/[id]/route.ts`, `src/app/api/v1/files/route.ts`, `src/lib/files/storage.ts`
- Deployment / infra: `deploy-docker.sh`, `deploy.sh`, `docker-compose.production.yml`, `docker-compose.worker.yml`, `Dockerfile.judge-worker`, `static-site/nginx.conf`, `scripts/online-judge.nginx.conf`, `scripts/online-judge.nginx-http.conf`
- Sidecars: `rate-limiter-rs/src/main.rs`
- Tests: `tests/unit/security/ip.test.ts`, `tests/unit/api/similarity-check.route.test.ts`, `tests/unit/api/contests.route.test.ts`, `tests/unit/compiler/execute.test.ts`, `tests/unit/infra/deploy-security.test.ts`, `tests/unit/infra/judge-report-nginx.test.ts`, `tests/unit/infra/deploy-storage-safety.test.ts`

---

## HIGH

### 1. `/compiler/run` consumes daily sandbox quota before checking capability
- **Files / Lines:** `src/app/api/v1/compiler/run/route.ts:77-88`; contrast with `src/app/api/v1/playground/run/route.ts`
- **Problem:** The route calls `gateSandboxEndpoint` (which decrements the per-user daily quota) before resolving capabilities and checking `caps.has("content.submit_solutions")`. A user whose role lacks the capability pays the quota cost for every 403.
- **Scenario:** A custom role with `files.upload` but not `content.submit_solutions` repeatedly hits `/api/v1/compiler/run`. Each request burns one invocation from the legitimate daily budget and eventually exhausts it, locking out authorized users.
- **Suggested remediation:** Move the `content.submit_solutions` capability check before `gateSandboxEndpoint`, exactly as `/playground/run` does.
- **Confidence:** High
- **Classification:** Correctness / DoS

### 2. Concurrent similarity checks can delete each other's anti-cheat events
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:439-454`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-64`
- **Problem:** `runAndStoreSimilarityCheck` deletes all `code_similarity` events for the assignment and then inserts the newly computed pairs inside a transaction. Two concurrent runs for the same assignment serialize their write transactions, so the later transaction deletes the events the earlier one just inserted.
- **Scenario:** Two TAs or an assistant and an instructor click "Run similarity check" at nearly the same time. The final DB state contains only one run's flagged pairs; the other is silently lost, and the dashboard shows a partial anti-cheat picture.
- **Suggested remediation:** Serialize similarity compute-and-store per assignment with `pg_advisory_xact_lock(hashtextextended(assignmentId, 1)::bigint)`, or add an assignment-level version/timestamp guard that aborts stale writers.
- **Confidence:** High
- **Classification:** Correctness

### 3. `createApiHandler` rejects custom roles in `auth.roles`
- **Files / Lines:** `src/lib/api/handler.ts:131-132`
- **Problem:** The role check calls `isUserRole(user.role)`, which only returns `true` for the five built-in role names. A route configured with `auth: { roles: ["custom_instructor"] }` rejects users whose role is exactly `custom_instructor`.
- **Scenario:** A deployment introduces a custom role and restricts an admin route to it. The route is unreachable for that role, forcing all authorization onto capabilities and making the `roles` auth config effectively unusable for custom roles.
- **Suggested remediation:** Remove the `isUserRole` guard from the role check, or change it to allow any string present in `auth.roles`.
- **Confidence:** High
- **Classification:** Correctness

### 4. File download endpoint has no rate limiting
- **Files / Lines:** `src/app/api/v1/files/[id]/route.ts:62-140`
- **Problem:** The GET handler performs auth and access checks but never calls `consumeApiRateLimit`. Upload and delete are rate-limited; download is not.
- **Scenario:** An authenticated user enumerates `/api/v1/files/{id}` and repeatedly downloads large files, abusing bandwidth and probing file IDs that may belong to others (the 403 access check is free).
- **Suggested remediation:** Add `rateLimit: "files:download"` in `createApiHandler` for the GET handler.
- **Confidence:** High
- **Classification:** Security / Performance

### 5. Judge API IP allowlist defaults to allow-all
- **Files / Lines:** `src/lib/judge/ip-allowlist.ts:18-55,182-210`
- **Problem:** When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed` returns `true` for every IP. The code warns once, but the default remains open for backward compatibility.
- **Scenario:** A leaked `JUDGE_AUTH_TOKEN` lets an attacker register a rogue worker and inject fabricated judge results from any host.
- **Suggested remediation:** Make `JUDGE_STRICT_IP_ALLOWLIST=1` the default for new deployments. Add a startup health signal that reports when the judge API is in allow-all mode, and require explicit operator acknowledgment in deploy scripts before continuing without an allowlist.
- **Confidence:** High
- **Classification:** Security

### 6. Docker socket proxy grants broad container lifecycle privileges
- **Files / Lines:** `docker-compose.production.yml:64-86`; `docker-compose.worker.yml:18-46`
- **Problem:** `tecnativa/docker-socket-proxy` is configured with `POST=1 DELETE=1 ALLOW_START=1 ALLOW_STOP=1 IMAGES=1`. The worker can create, start, stop, delete arbitrary containers, and list images on the host Docker daemon.
- **Scenario:** A compromised judge worker sends Docker API requests through the proxy and spawns a privileged container with `--pid=host` or volume mounts, escaping to the host and accessing the PostgreSQL volume or other containers.
- **Suggested remediation:** Restrict the proxy to the exact endpoints required (e.g., only `POST /containers/create` and `DELETE /containers/{id}`). Run Docker rootless, add AppArmor/SELinux profiles to the worker, and drop all capabilities. Split image management into a separate admin service.
- **Confidence:** High
- **Classification:** Security / Architectural

### 7. Runner `/run` endpoint accepts nested shells through single-quote gaps
- **Files / Lines:** `judge-worker-rs/src/runner.rs:124-176`; `judge-worker-rs/src/runner.rs:890`
- **Problem:** `validate_shell_command` blocks a short denylist but permits `&&`, `;`, environment prefixes, and single quotes, and does not reject the tokens `bash`/`sh`. Because the runner wraps the supplied command in `sh -c`, a caller can smuggle arbitrary commands inside quotes.
- **Scenario:** A leaked `RUNNER_AUTH_TOKEN` lets an attacker execute arbitrary code inside the judged container. While the container is sandboxed, the attacker can still probe the kernel syscall surface or wage a noisy DoS.
- **Suggested remediation:** Do not accept raw shell strings from the HTTP API. Accept an argv array, reject shell metacharacters/quotes entirely, and execute with `execvp`-style semantics; or store approved commands server-side and reference them by language ID.
- **Confidence:** High
- **Classification:** Security

### 8. Rate-limiter sidecar state is in-process and non-replicated
- **Files / Lines:** `rate-limiter-rs/src/main.rs:31,152-213`; `src/lib/security/api-rate-limit.ts:156-179`
- **Problem:** All buckets live in a `DashMap` inside the single process. There is no persistence or shared backend. Restarting the container resets counters and blocks, and running more than one replica shards state inconsistently.
- **Scenario:** A rolling update of the rate-limiter sidecar wipes out login-failure counts, allowing a brute-force attacker to resume from zero. Horizontal scaling splits counters across instances.
- **Suggested remediation:** Document that the rate limiter must run as a single replica, or back it with Redis or a small persistent store so state survives restarts and replicas.
- **Confidence:** High
- **Classification:** Architectural / Operational

### 9. In-progress judge reports can indefinitely refresh a stale claim
- **Files / Lines:** `src/app/api/v1/judge/poll/route.ts:82-119`
- **Problem:** A worker POSTing `status: "judging"` with a valid `claimToken` resets `judgeClaimedAt` to `dbNow` each time. There is no maximum-judging-time guard independent of heartbeats.
- **Scenario:** A buggy or malicious worker repeatedly reports "judging" for a submission. The stale-claim sweep never reclaims it, and the submission remains stuck in `judging` forever.
- **Suggested remediation:** Reject in-progress updates when `judgeClaimedAt` is older than the configured claim TTL, or add a `maxJudgingDurationMs` guard that forces the submission back to `pending`/`queued` regardless of worker heartbeats.
- **Confidence:** Medium
- **Classification:** Correctness / Architectural

### 10. Legacy deploy path still overwrites `X-Forwarded-For` and defaults `AUTH_TRUST_HOST=true`
- **Files / Lines:** `deploy-docker.sh:700,894`; `deploy.sh:257`; `scripts/online-judge.nginx.conf:63,77,88,100`; `scripts/online-judge.nginx-http.conf:33,44`
- **Problem:** `deploy-docker.sh` correctly generates `$proxy_add_x_forwarded_for` (cycle-3 fix), but `deploy.sh` and the checked-in `scripts/online-judge.nginx*.conf` templates still replace the chain with `$remote_addr`. `deploy-docker.sh` also hard-codes `AUTH_TRUST_HOST=true` in generated `.env.production`.
- **Scenario:** Anyone using the legacy `deploy.sh` or the static template directly re-introduces the XFF-collapse bug: `extractClientIp` returns `null`, rate limits collapse into a shared bucket, and judge IP allowlists deny legitimate workers. `AUTH_TRUST_HOST=true` means the app trusts the `Host` header supplied by the reverse proxy; combined with a permissive proxy this enables host-header attacks.
- **Suggested remediation:** Update `deploy.sh` and the static templates to use `$proxy_add_x_forwarded_for`. Add an integration assertion that the live XFF chain length is compatible with `TRUSTED_PROXY_HOPS`. Make `AUTH_TRUST_HOST` opt-in per deployment target rather than universally true.
- **Confidence:** High
- **Classification:** Security / Operational

---

## MEDIUM

### 11. Sandbox-gate env bypass fails on common whitespace
- **Files / Lines:** `src/lib/security/sandbox-gate.ts:14-16`
- **Problem:** `ALLOW_UNVERIFIED_EMAIL_ENV` does `raw === "1" || raw.toLowerCase() === "true"` without trimming. A value of `"true\n"` or `" true "` fails the literal comparison.
- **Scenario:** An operator in an air-gapped lab sets `SANDBOX_ALLOW_UNVERIFIED_EMAIL=true` in an `.env` file that ends with a newline. The gate remains enforced even though the operator intended to bypass it, locking students out of the compiler/playground with no actionable error.
- **Suggested remediation:** Trim and normalize: `return raw.trim() === "1" || raw.trim().toLowerCase() === "true";`.
- **Confidence:** High
- **Classification:** Correctness / UX

### 12. Shell-command whitelist permits shell interpreters, undermining the denylist
- **Files / Lines:** `src/lib/compiler/execute.ts:189-251`; `judge-worker-rs/src/runner.rs:124-176`
- **Problem:** `validateShellCommandStrict` accepts `bash`, `sh`, `powershell`, `pwsh` as command prefixes. A compromised `language_configs` row can set `runCommand` to `bash -c '...'` and the denylist is bypassed because the payload lives inside the `-c` argument.
- **Scenario:** An attacker who can modify a language config (e.g., via a compromised admin account) runs arbitrary code inside the judged container.
- **Suggested remediation:** Remove shell interpreters from `ALLOWED_COMMAND_PREFIXES`, or add an explicit rule that rejects `-c`/`-Command` interpreter invocations. Treat commands as direct binary invocations only.
- **Confidence:** Medium
- **Classification:** Security

### 13. `JUDGE_MAX_OUTPUT_BYTES` is parsed without an upper bound
- **Files / Lines:** `judge-worker-rs/src/docker.rs:420-424,432-464`
- **Problem:** The per-stream output cap is read from the environment as a `u64` and used to size an in-memory buffer. There is no maximum value check.
- **Scenario:** A misconfigured `JUDGE_MAX_OUTPUT_BYTES=10737418240` (10 GiB) with `JUDGE_CONCURRENCY=16` lets the worker try buffering hundreds of gigabytes, leading to worker OOM and cascading failures.
- **Suggested remediation:** Clamp the parsed value to a hard ceiling (e.g., 128 MiB) and log a warning when the env var is ignored or truncated.
- **Confidence:** Medium
- **Classification:** Operational / Performance

### 14. Compile-phase memory limit always evaluates to the default ceiling
- **Files / Lines:** `judge-worker-rs/src/executor.rs:452-453`
- **Problem:** `compile_memory_mb = compilation_memory_limit_mb().max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB))` always evaluates to `compilation_memory_limit_mb()` (default 2048 MB) because the right-hand term is at most 1024 MB.
- **Scenario:** A problem-level memory limit never constrains compilation. A malicious or pathological build can consume up to 2 GiB per concurrent compile slot.
- **Suggested remediation:** Decide whether compile memory should be independently configurable or derived from the problem limit, then implement a clear policy (e.g., `min(env_cap, problem_limit * 2, MAX_COMPILE_MEMORY)`).
- **Confidence:** Medium
- **Classification:** Operational / Performance

### 15. Similarity Rust sidecar call ignores the route's abort signal
- **Files / Lines:** `src/lib/assignments/code-similarity-client.ts:53`; `src/lib/assignments/code-similarity.ts:370-386`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-64`
- **Problem:** The API route arms a 30 s `AbortController`. The Rust sidecar fetch uses a fixed 25 s timeout and does not receive the route's signal.
- **Scenario:** If the sidecar hangs, the route cannot cancel it early; after 25 s it returns `null` and the TS fallback starts, often only to be aborted milliseconds later when the 30 s deadline fires, wasting CPU. Conversely, if the sidecar takes >30 s, the client sees a 500 while the orphaned fetch continues.
- **Suggested remediation:** Pass the route's `signal` into `computeSimilarityRust` and use it as the `fetch` signal. Check `signal.aborted` before falling back to the TS implementation.
- **Confidence:** Medium
- **Classification:** Performance / Correctness

### 16. Rate-limiter sidecar and PostgreSQL authoritative path double-count requests
- **Files / Lines:** `src/lib/security/api-rate-limit.ts:156-179`; `src/lib/security/rate-limiter-client.ts:127-141`
- **Problem:** `consumeApiRateLimit` calls `sidecarConsume` (which increments the in-memory sidecar counter) and then unconditionally runs `atomicConsumeRateLimit` (which increments the DB counter). The two stores diverge and the sidecar may return a 429 earlier or later than the authoritative DB.
- **Scenario:** Under load the sidecar blocks a key while the DB still has budget, or the DB blocks while the sidecar has budget. After a sidecar restart its counter is zero even though the DB is near the limit, allowing a burst.
- **Suggested remediation:** Use the sidecar only as a read-only cache or short-circuit, not as an independent counter. If it is kept as a fast path, the DB path should not re-increment after a sidecar "allowed" response.
- **Confidence:** Medium
- **Classification:** Correctness / Operational

### 17. Dead-letter files are written with default permissions
- **Files / Lines:** `judge-worker-rs/src/executor.rs:1074-1091`
- **Problem:** `fs::create_dir_all` and `fs::write` inherit the process umask. There is no explicit `0o700` directory or `0o600` file mode.
- **Scenario:** Verdicts are persisted to the dead-letter volume. Another unprivileged user or container on the shared worker host can read these files, leaking submission diagnostics and compiler errors.
- **Suggested remediation:** Set the dead-letter directory to `0o700` and each file to `0o600` after writing. Add an operator alert/metric when dead-letter files accumulate.
- **Confidence:** Medium
- **Classification:** Security / Operational

### 18. `sshpass` still exposes the SSH password for non-rsync remote helpers
- **Files / Lines:** `deploy-docker.sh:392,400`
- **Problem:** `remote()` and `remote_copy()` helpers invoke `sshpass -p "$SSH_PASSWORD" ssh` and `sshpass -p "$SSH_PASSWORD" scp`. Command-line arguments are visible to any local user via `ps` or `/proc/<pid>/cmdline` while the deploy runs. Only the rsync path was migrated to the environment-variable form.
- **Scenario:** A CI runner or shared operator laptop deploys with password auth. Another unprivileged user captures the plaintext `SSH_PASSWORD`, then SSHes into production or worker hosts.
- **Suggested remediation:** Switch all remote helpers to `SSHPASS="$SSH_PASSWORD" sshpass -e ssh ...` / `sshpass -e scp ...`, or remove password auth entirely and require SSH keys.
- **Confidence:** High
- **Classification:** Security

### 19. Worker workspace is chowned to 65534 but never re-chowned before `TempDir` drop
- **Files / Lines:** `judge-worker-rs/src/executor.rs:304-691`
- **Problem:** The temporary workspace directory and source file are `chown`ed to `65534:65534` with mode `0o700`. When `temp_dir` is dropped at the end of the function, the worker process (which may not be root) cannot remove files owned by `65534`, so cleanup fails and workspaces leak on disk.
- **Scenario:** A worker running as a non-root user accumulates orphaned judge workspaces in `/tmp` or `/judge-workspaces`, eventually exhausting disk space.
- **Suggested remediation:** Re-chown the workspace back to the worker process UID in a `Drop` guard or explicit cleanup block before `temp_dir` goes out of scope, or run a periodic cleanup job with appropriate privileges.
- **Confidence:** Medium
- **Classification:** Operational

### 20. Catch-all nginx location has no explicit `client_max_body_size`
- **Files / Lines:** `deploy-docker.sh:1515-1630` (generated nginx); `src/app/api/v1/files/route.ts:17-89`
- **Problem:** Generated nginx sets `client_max_body_size` only for `/api/auth/`, `/api/v1/judge/poll`, and `/api/v1/judge/`. The catch-all `location /` falls back to nginx's 1 MiB default.
- **Scenario:** Legitimate file uploads via `/api/v1/files` that exceed 1 MiB are rejected by nginx before the app can enforce its own size limits, producing a confusing 413 for users.
- **Suggested remediation:** Add an explicit `client_max_body_size` to the catch-all block that matches the application's maximum upload size, or set a server-level default.
- **Confidence:** Medium
- **Classification:** Operational / UX

---

## LOW

### 21. API route unit tests bypass the real `createApiHandler` middleware stack
- **Files / Lines:** `src/lib/api/handler.ts:94-219`; widespread in `tests/unit/api/*.test.ts`
- **Problem:** Most route tests mock `@/lib/api/handler` so `createApiHandler` becomes a thin wrapper that injects a synthetic user and skips rate limiting, session/API-key auth, role/capability checks, CSRF validation, and Zod body parsing.
- **Scenario:** A regression that removes `rateLimit: "similarity-check"` or the `capabilities` requirement from the route config passes the unit suite but leaves the deployed endpoint unprotected.
- **Suggested remediation:** For at least one representative route per category, remove the `createApiHandler` mock and call the exported handler through the real wrapper. Add negative cases for missing CSRF, wrong role, and missing capability.
- **Confidence:** High
- **Classification:** Testing / Architectural

### 22. `code-similarity-client.ts` logs with `console.warn` instead of the project logger
- **Files / Lines:** `src/lib/assignments/code-similarity-client.ts:6-9`
- **Problem:** The module uses `console.warn` for a missing-auth-token warning, bypassing the structured logger and making the message invisible to centralized log aggregation.
- **Scenario:** Operators relying on log pipelines miss the warning that the similarity sidecar is unauthenticated.
- **Suggested remediation:** Import `logger` from `@/lib/logger` and use `logger.warn(...)`.
- **Confidence:** High
- **Classification:** Observability

### 23. Production compose uses the default bridge network without segmentation
- **Files / Lines:** `docker-compose.production.yml:13-202`
- **Problem:** All services share the default Docker bridge. There is no separate network for the database, app, worker, or sidecars.
- **Scenario:** A compromised sidecar or worker can directly reach the PostgreSQL port and every other service, increasing lateral-movement options.
- **Suggested remediation:** Define separate networks (e.g., `frontend`, `backend`, `worker`) and attach services only to the networks they need.
- **Confidence:** Medium
- **Classification:** Security / Architectural

### 24. Assignment per-user latest-submission aggregate has no deterministic tie-break
- **Files / Lines:** `src/lib/assignments/submissions.ts:750-775`
- **Problem:** The per-user reducer picks the latest submission by comparing `latestSubmittedAt`. If a user submitted to two problems at the exact same millisecond, the order of `problemAggRows` (which is undefined) determines which submission is reported as the user's latest.
- **Scenario:** A student submits to two problems at the same instant. The dashboard may show a different `latestSubmissionId`/`latestStatus` on each page load for the same student.
- **Suggested remediation:** Tie-break by `latestSubId` (or problem order) when `rowDate === existDate`.
- **Confidence:** Low
- **Classification:** Correctness

---

## Final sweep notes

- **Static checks:** `npm run lint` passes. `cargo test` in `rate-limiter-rs/` passes (2/2). `npx tsc --noEmit` emits two pre-existing errors in `.next/types/validator.ts` (generated Next.js types) that are unrelated to the reviewed code and likely stem from a stale `.next` build directory in the local clone.
- **Resolved since the 2026-07-01 critic review:** XFF chain is preserved in `deploy-docker.sh` generated nginx; IPv4 leading-zero octets are rejected; bulk-rejudge correctly decrements `activeTasks`; `MAX_SUBMISSIONS_FOR_SIMILARITY` is enforced before invoking the Rust sidecar; raw-SQL additive repair blocks were removed from `deploy-docker.sh`; baseline security headers were added to `static-site/nginx.conf`; uploaded files are written with mode `0o600`.
- **Commonly missed issues checked:** no hardcoded secrets in the reviewed files; no `docker system prune --volumes`; the production DB image is pinned to `postgres:18-alpine`; the similarity route now returns explicit `not_run` and `timed_out` reasons; dedicated-worker deployment forces HTTPS `JUDGE_BASE_URL` before restart.
- **Residual risk overall:** The codebase has a solid cycle-3 hardening baseline, but several high-severity findings persist because they require intentional behavior changes rather than configuration fixes: quota-before-capability, unprotected concurrent similarity writers, custom-role rejection, and default-allow judge IP posture. These should be prioritized in the next remediation cycle.
