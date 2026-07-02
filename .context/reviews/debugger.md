# Latent-Bug Review — /tmp/judgekit-local

**Date:** 2026-07-02  
**Scope:** `src/**`, `judge-worker-rs/**`, `rate-limiter-rs/**`, `docker/**`, `scripts/**`, `tests/**`, `static-site/**`, root config files, and existing review docs.  
**Deliverable:** Structured findings only — no fixes implemented.

---

## Executive Summary

This review focused on failure modes that are likely to surface in production under stress, malformed input, resource exhaustion, or operational drift. The highest-confidence latent bugs remain the sandbox workspace leaks after `chown` to uid 65534, the similarity-check concurrency and cancellation gaps, and several deployment/nginx configuration issues. A number of findings from the previous cycle have been fixed (noted below), but the core workspace-cleanup and similarity races are unchanged.

The most urgent items are:

1. **Workspace directory leaks** in the TypeScript compiler fallback and both Rust worker paths.
2. **Concurrent similarity runs** delete each other's anti-cheat events.
3. **The Rust similarity sidecar ignores the route's abort signal**, so a slow sidecar can consume the whole 30 s budget.
4. **Generated app nginx still limits uploads to 1 MiB** on the catch-all location.
5. **Static nginx templates still overwrite `X-Forwarded-For`**.
6. **The rate-limiter sidecar uses wall-clock time** for block/window decisions.

---

## Scope & File Inventory Reviewed

| Area | Count | Notes |
|------|-------|-------|
| `src/**/*.ts`, `src/**/*.tsx` | 636 | API routes, lib, components, hooks |
| `judge-worker-rs/src/**/*.rs` | 10 | Executor, runner, docker, config, API, validation, languages, comparator, types |
| `rate-limiter-rs/src/**/*.rs` | 1 | Main service |
| `docker/**` | 106 | Dockerfiles, seccomp profile, compose files |
| `scripts/**` | 43 | Shell helpers, TS seed/setup tools, systemd units |
| `tests/**` | 532 | Unit, integration, harness, e2e tests |
| `static-site/**` | 101 | Static nginx config and assets |
| Root config files | 19 | `package.json`, `next.config.ts`, `tsconfig.json`, compose files, deploy scripts, etc. |

Also reviewed the previous aggregate review (`_aggregate.md`) and prior `debugger.md` to distinguish fixed vs. still-present issues.

---

## Findings

### Critical / High Confidence

#### 1. Compiler local-fallback workspace cannot be cleaned up after `chown` to sandbox UID
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `src/lib/compiler/execute.ts:724-758` (workspace setup), `842-848` (cleanup)  
- **Classification:** Resource leak / Permissions  
- **Problem:** `executeCompilerRun` creates a temp workspace, writes the source file, then `chown`s both the directory and source file to `SANDBOX_UID=65534` with modes `0o700`/`0o600`. The production Dockerfile runs the Next.js app as the `nextjs` user (uid 1001). The `finally` block's `rm(workspaceDir, { recursive: true, force: true })` therefore fails with `EACCES`; the error is only logged, so the directory is leaked.  
- **Failure scenario:** Every local-fallback compiler run (or every run if `COMPILER_RUNNER_URL` is misconfigured) leaves a `/tmp/compiler-*` directory behind. Over time `/tmp` fills up and the host runs out of inodes/disk space, eventually causing Docker builds and the app itself to fail.  
- **Suggested fix:** Before cleanup, re-`chown` the workspace back to the process uid/gid inside the `finally` block, or run a short-lived privileged cleanup container. Alternatively, perform the cleanup from a root helper. A regression test should assert that the workspace directory no longer exists after `executeCompilerRun` returns.

#### 2. Judge-worker temp workspace cannot be removed after `chown` to sandbox UID
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `judge-worker-rs/src/executor.rs:303-361` (setup), `691` (drop)  
- **Classification:** Resource leak / Permissions  
- **Problem:** The Rust executor creates a `tempfile::TempDir`, then `chown`s it to `65534:65534` with mode `0o700`. `TempDir::drop` silently ignores cleanup failures. If the worker process is not running as root, it cannot delete the directory, so every judgement leaks a workspace directory.  
- **Failure scenario:** A dedicated worker judging thousands of submissions per day leaves thousands of `/tmp/.tmp*` directories. The implicit drop means no operator-visible error; only disk exhaustion eventually alerts them.  
- **Suggested fix:** Explicitly `chown` the workspace back to the worker process uid/gid before the `TempDir` goes out of scope, or run cleanup through a root-privileged container (the worker already has Docker access). At minimum, log and surface cleanup failures so operators can act.

#### 3. Rust runner sidecar temp workspace also cannot be removed after `chown`
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `judge-worker-rs/src/runner.rs:747-796` (setup), `924` (drop)  
- **Classification:** Resource leak / Permissions  
- **Problem:** Identical to #2: `execute_run` in the runner sidecar creates a `TempDir`, hardens it with `chown` to 65534, and relies on `Drop`. The runner process is not guaranteed to run as root, so cleanup fails silently.  
- **Failure scenario:** Every `/run` request handled by the sidecar leaks a workspace. Under load the sidecar becomes a primary source of disk exhaustion on the worker.  
- **Suggested fix:** Apply the same explicit re-`chown`/cleanup pattern before `TempDir` drops, or use a privileged cleanup helper.

#### 4. Concurrent similarity checks can delete each other's anti-cheat events
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `src/lib/assignments/code-similarity.ts:440-452`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:50`  
- **Classification:** Race condition / Data loss  
- **Problem:** Two concurrent similarity runs for the same assignment each read the same submission set, compute independently, then run `db.transaction(delete old events → insert new events)`. PostgreSQL serializes the write transactions, so the later transaction deletes the events the earlier one just inserted.  
- **Failure scenario:** Two TAs click "Run similarity check" at the same time. The final state contains only one run's flagged pairs; the other is silently lost.  
- **Suggested fix:** Serialize similarity runs per assignment with `pg_advisory_xact_lock(hashtextextended(assignmentId, 1)::bigint)` around the compute-and-store path, or add an assignment-level version/timestamp guard that aborts stale writers.

#### 5. Similarity-check Rust sidecar ignores the route's `AbortSignal`
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-64`; `src/lib/assignments/code-similarity.ts:371-386`; `src/lib/assignments/code-similarity-client.ts:35-62`  
- **Classification:** Cancellation / Latency  
- **Problem:** The route creates a 30-second `AbortController` and passes the signal into `runAndStoreSimilarityCheck`. That signal is forwarded only to the TypeScript fallback path. The Rust sidecar call in `computeSimilarityRust` uses its own hard-coded `AbortSignal.timeout(25_000)` and does not accept, compose, or propagate the caller's signal. It catches all exceptions and returns `null`.  
- **Failure scenario:** If the Rust sidecar is slow but not quite 25 seconds, or if the caller wants to abort earlier, the route cannot cancel the sidecar request. A Rust-sidecar timeout returns `null`, falls through to the TS fallback, and may consume the full 30 seconds without returning the explicit `timed_out` status the test expects.  
- **Suggested fix:** Add an optional `signal?: AbortSignal` parameter to `computeSimilarityRust` and compose it with the internal timeout via `AbortSignal.any` (or a manual `AbortController` that listens to both). Re-throw `AbortError` instead of returning `null` so callers can distinguish cancellation/timeouts from sidecar unavailability.

#### 6. Static nginx templates still overwrite `X-Forwarded-For`
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `scripts/online-judge.nginx.conf:62-63,76-77,87-88,99-100`; `scripts/online-judge.nginx-http.conf:33,44`; `deploy.sh:257`  
- **Classification:** Configuration / Trust-boundary / IP spoofing  
- **Problem:** While `deploy-docker.sh` was fixed to use `$proxy_add_x_forwarded_for`, the static templates used by the legacy `deploy.sh` path and manual installs still use `proxy_set_header X-Forwarded-For $remote_addr;`. This replaces any existing forwarded-for chain with a single immediate client IP. The app's `extractClientIp` (default `TRUSTED_PROXY_HOPS=1`) requires the chain to contain the real client IP followed by each trusted proxy. When the chain is truncated, the hop-count guard fails and the app returns `null` in production.  
- **Failure scenario:** Production is fronted by Cloudflare or a corporate load balancer. Nginx receives `X-Forwarded-For: <real-client>, <cloudflare>` but overwrites it with `X-Forwarded-For: <cloudflare-ip>`. The app now sees only one hop while expecting two, so all client IP extraction fails. Rate-limit keys, audit logs, and the judge IP allowlist become unreliable.  
- **Suggested fix:** Change every application nginx `X-Forwarded-For` line in `scripts/online-judge.nginx.conf`, `scripts/online-judge.nginx-http.conf`, and `deploy.sh` to `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

#### 7. Generated nginx limits catch-all uploads to 1 MiB
- **Severity:** Critical  
- **Confidence:** High  
- **Files / Lines:** `deploy-docker.sh:1515,1542,1585,1612`; `src/app/api/v1/files/route.ts:35`; `src/lib/system-settings-config.ts:61`  
- **Classification:** Configuration / Functional regression  
- **Problem:** The hardened nginx config sets `client_max_body_size` only on `/api/auth/` (1m) and `/api/v1/judge/poll` (50M). The catch-all `location /` has no explicit limit, so it falls back to the nginx default of 1 MiB. The application defaults `uploadMaxFileSizeBytes` to 50 MiB.  
- **Failure scenario:** Instructors uploading 10 MiB PDFs or ZIP archives of test data receive `413 Request Entity Too Large` before the application can validate the upload. Admin restore/import also fails for backup ZIPs/JSON exports >1 MiB.  
- **Suggested fix:** Add `client_max_body_size 50M;` to the `location /` block (or scope it to `/api/v1/files/` and `/api/v1/admin/*`) and keep it aligned with `MAX_IMPORT_BYTES`. Add a deployment test asserting `/api/v1/files/` has a body limit matching the configured upload maximum.

#### 8. Raw SQL schema patches bypass the Drizzle migration journal
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `deploy-docker.sh:1144-1227`; `src/lib/db/migrate.ts:1-7`; `scripts/check-migration-drift.sh:1-28`  
- **Classification:** Deployment / Schema drift  
- **Problem:** `deploy-docker.sh` applies additive schema changes via raw `psql` after `drizzle-kit push` (the `secret_token` backfill/drop). Because the column is already absent by the time `push` runs, the journal does not capture the transition. A DR replay from the journal can produce a schema that is inconsistent with the current app expectations.  
- **Failure scenario:** A disaster-recovery replay from the journal produces a schema still containing `judge_workers.secret_token` or missing the hash column cleanup; queries or auth checks fail at runtime.  
- **Suggested fix:** Eliminate the raw `psql` pre-patches. Add columns only through `drizzle-kit generate` so the journal stays the single source of truth. If a zero-downtime additive change must happen outside `push`, wrap it in a committed journal migration.

#### 9. Rate-limiter sidecar uses wall-clock time for windows and blocks
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `rate-limiter-rs/src/main.rs:137-142,152-281,292-315`  
- **Classification:** Time / Race condition  
- **Problem:** `now_ms()` is `SystemTime::now().duration_since(UNIX_EPOCH)`. All rate-limit decisions compare this wall-clock value against `window_started_at`, `blocked_until`, and `last_attempt`. If the system clock jumps backward (NTP sync, manual adjustment), an active block can appear to have expired and a window may not reset when it should.  
- **Failure scenario:** An attacker is blocked for 15 minutes after failed logins. The host's NTP client corrects the clock backward by 5 minutes. The sidecar now believes the block has expired and allows more attempts. The PostgreSQL-backed limiter (which uses DB time) remains correct, but the sidecar fast-path becomes the weak link.  
- **Suggested fix:** Store `tokio::time::Instant` values for windows/blocks and use monotonic elapsed durations for all interval comparisons. Only use wall-clock time for external-facing `blocked_until` timestamps if needed by callers.

---

### Medium Confidence

#### 10. `validateShellCommandStrict` rejects legitimate environment-variable prefixes
- **Severity:** Medium  
- **Confidence:** High  
- **Files / Lines:** `src/lib/compiler/execute.ts:189-251`  
- **Classification:** Input-validation false positive  
- **Problem:** `validateShellCommandStrict` splits the command on `&&`/`;`, takes the first whitespace-delimited token, and requires it to match an allowed compiler prefix. A token like `CC=gcc` fails the prefix check, so the whole command is rejected, even though the looser `validateShellCommand` comment explicitly notes that env-var prefixes are permitted.  
- **Failure scenario:** An admin sets a language config compile command to `CFLAGS="-O2 -Wall" gcc solution.c -o solution`. The local fallback path returns `"Invalid compile command"` even though the command is safe and the looser validator allows it.  
- **Suggested fix:** In `validateShellCommandStrict`, strip leading shell variable assignments (`/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/`) from each segment before validating the first real command token. Keep the existing prefix check for the actual executable.

#### 11. Shell-command whitelist permits shell interpreters
- **Severity:** Medium  
- **Confidence:** High  
- **Files / Lines:** `src/lib/compiler/execute.ts:189-218,243-251`  
- **Classification:** Input-validation bypass  
- **Problem:** `validateShellCommandStrict` accepts `bash`, `sh`, `powershell`, `pwsh` as command prefixes. A compromised `language_configs` row can set `runCommand` to `bash -c '...'` and the denylist is bypassed because the payload lives inside the `-c` argument.  
- **Failure scenario:** An attacker who can modify a language config runs arbitrary code inside the judged container.  
- **Suggested fix:** Remove shell interpreters from `ALLOWED_COMMAND_PREFIXES`, or add an explicit rule that rejects `-c`/`-Command` interpreter invocations. Treat commands as direct binary invocations only.

#### 12. Rust runner `/run` endpoint accepts nested shells through single-quote gaps
- **Severity:** Medium  
- **Confidence:** High  
- **Files / Lines:** `judge-worker-rs/src/runner.rs:124-176,813-825,887-900`  
- **Classification:** Input-validation bypass  
- **Problem:** `validate_shell_command` blocks a short denylist but permits `&&`, `;`, environment prefixes, and does not reject single quotes or the tokens `bash`/`sh`. Because the runner wraps the supplied command in `sh -c`, a caller can smuggle arbitrary commands inside quotes.  
- **Failure scenario:** A leaked `RUNNER_AUTH_TOKEN` lets an attacker execute arbitrary code inside the judged container to probe syscalls or wage a noisy DoS.  
- **Suggested fix:** Do not accept raw shell strings from the HTTP API. Accept an argv array, reject shell metacharacters/quotes entirely, and execute with `execvp`-style semantics; or store approved commands server-side and reference them by language ID.

#### 13. Node fallback run timeout counts container startup against the user budget
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/compiler/execute.ts:468-473,828`  
- **Classification:** Timing / Fairness  
- **Problem:** The run phase uses the raw `timeLimitMs` as the wall-clock kill timeout, unlike the Rust worker which adds `DOCKER_RUN_OVERHEAD_BUDGET_MS` (2 s).  
- **Failure scenario:** Near-limit legitimate submissions receive spurious timeouts because Docker container startup overhead is counted against the user's time budget.  
- **Suggested fix:** Add the same startup-overhead buffer to the Node fallback kill timeout.

#### 14. Compile tmpfs is smaller than the compile memory limit
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/compiler/execute.ts:20,357-366`; `judge-worker-rs/src/docker.rs:17`  
- **Classification:** Resource limit mismatch  
- **Problem:** The compile phase is granted 2048 MB of memory but only a 1024 MB `/tmp` tmpfs.  
- **Failure scenario:** Compilers that write large intermediate files to `/tmp` hit `ENOSPC` on tmpfs while the container memory limit still shows headroom.  
- **Suggested fix:** Make the compile tmpfs size configurable and at least as large as the compile memory limit, or default both to the same value.

#### 15. `parseTimestampEpochMs` may mishandle nanosecond timestamps
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/compiler/execute.ts:258-266`  
- **Classification:** Time parsing  
- **Problem:** The JSDoc states the helper handles `"2024-01-15T10:30:45.123456789Z"`, but it delegates to `Date.parse`, whose support for nine-digit fractional seconds depends on the JS engine.  
- **Failure scenario:** On Node.js versions where `Date.parse` rejects nanosecond timestamps, container inspection loses accurate execution duration and falls back to wall-clock duration, skewing execution-time reporting.  
- **Suggested fix:** Truncate the fractional seconds to three digits before calling `Date.parse`, or use the same explicit parser already present in `judge-worker-rs/src/docker.rs:99-145`.

#### 16. Similarity-check timeout handler treats any "timed out" message as a timeout
- **Severity:** Medium  
- **Confidence:** High  
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-62`  
- **Classification:** Error classification  
- **Problem:** The catch block returns the `timed_out` envelope if `error.name === "AbortError"` OR `error.message.includes("timed out")`. The string match is broad.  
- **Failure scenario:** A database query timeout inside `runAndStoreSimilarityCheck` could be surfaced to the dashboard as `status: "timed_out"`, misleading an admin into thinking the similarity engine was slow rather than that the database is unhealthy.  
- **Suggested fix:** Only treat `AbortError` / `DOMException` with name `"AbortError"` as the scan timeout. For other errors, let them propagate to the generic `createApiHandler` error handler.

#### 17. Unfiltered `docker container prune -f` on app host
- **Severity:** Low / Medium  
- **Confidence:** Medium  
- **Files / Lines:** `deploy-docker.sh:459`; `deploy-docker.sh:530` (worker variant uses `--filter 'until=24h'`)  
- **Classification:** Operational safety  
- **Problem:** `prune_old_docker_artifacts` runs `docker container prune -f` without `--filter` on the app host.  
- **Failure scenario:** If the host is ever shared or an operator runs a one-off stopped container, the deploy silently deletes it, potentially destroying forensic evidence.  
- **Suggested fix:** Apply the same `--filter until=24h` guard to the app-host prune for defense in depth.

#### 18. Fixed `/tmp` nginx path creates races during parallel deploys
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `deploy-docker.sh:1470,1639,1642`  
- **Classification:** Race condition  
- **Problem:** `deploy-docker.sh` writes the generated nginx config to the fixed path `/tmp/judgekit-nginx.conf` on the deploying machine. Two concurrent deploys (e.g., to different targets) can overwrite each other's config.  
- **Failure scenario:** An operator runs two deploys in parallel. One overwrites the nginx config of the other, leading to a mismatched server block or wrong TLS certificate on one target.  
- **Suggested fix:** Use `mktemp /tmp/judgekit-nginx.XXXXXX` (or include `$$`/target label in the name) and clean up the unique file after copying.

#### 19. `sshpass -p` exposes the SSH password in local process listings
- **Severity:** High  
- **Confidence:** High  
- **Files / Lines:** `deploy-docker.sh:392,595`; `deploy.sh:58,66`  
- **Classification:** Secrets leak / Operational security  
- **Problem:** When `SSH_PASSWORD` is set, the script invokes `sshpass -p "$SSH_PASSWORD" ssh …`. On the deploying machine the password is visible in `ps`/`/proc` to any local user while the SSH command is running.  
- **Failure scenario:** A shared CI runner or operator laptop has other users/processes. While `deploy-docker.sh` runs, `ps aux` reveals the password for the `sshpass` process.  
- **Suggested fix:** Prefer key-based auth for production deploys. If password auth is unavoidable, use `sshpass -f <(printf '%s\n' "$SSH_PASSWORD")` (with appropriate file permissions) or an `SSH_ASKPASS` wrapper so the password does not appear in argv. Document that `SSH_PASSWORD` must be exported, not typed on the command line.

#### 20. Generated app nginx lacks security headers
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `deploy-docker.sh:1471-1630`; `src/lib/api/handler.ts:199-207`  
- **Classification:** Security headers  
- **Problem:** Neither the generated app-server nginx config sets `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, or `Strict-Transport-Security`. The app-level handler only adds `Cache-Control` and `X-Content-Type-Options`.  
- **Failure scenario:** Clickjacking, MIME-sniffing attacks, referrer leakage, and downgrade attacks become possible.  
- **Suggested fix:** Add baseline `add_header` directives in the generated nginx config, mirroring the static-site improvements from US-012.

#### 21. Static site nginx serves only HTTP with no redirect or HSTS
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `static-site/nginx.conf:1-23`  
- **Classification:** Security headers / TLS  
- **Problem:** The static-site config listens only on port 80, has no HTTPS server, no HSTS, and no redirect to HTTPS.  
- **Failure scenario:** If used in production directly, users connect over plaintext, exposing cookies and static assets to interception and downgrade.  
- **Suggested fix:** Serve static assets behind the same TLS-terminated reverse proxy as the app, or add a TLS server block, redirect HTTP to HTTPS, set HSTS, and add a CSP.

#### 22. Local compiler fallback runs with default seccomp if custom profile is missing
- **Severity:** Medium  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/compiler/execute.ts:379-388`  
- **Classification:** Sandbox weakening  
- **Problem:** When `SECCOMP_PROFILE_PATH` is missing, the local Docker fallback logs a one-time warning and proceeds with Docker's default seccomp policy instead of the project-specific restricted profile.  
- **Failure scenario:** A mis-packaged deployment silently weakens the sandbox for local fallback compilations, potentially exposing syscalls that the custom profile blocks.  
- **Suggested fix:** Fail closed when the configured custom seccomp profile is missing, or require an explicit opt-out environment variable before falling back to the default policy.

#### 23. Validation failures return `exitCode: null`
- **Severity:** Low  
- **Confidence:** Low  
- **Files / Lines:** `src/lib/compiler/execute.ts:667-687`  
- **Classification:** Contract ambiguity  
- **Problem:** When `validateShellCommandStrict` rejects a command, `executeCompilerRun` returns `{ ..., exitCode: null, stderr: "Invalid compile command" | "Invalid run command" }`.  
- **Failure scenario:** A downstream component that assumes `exitCode` is always a number may misclassify `null` as a system error.  
- **Suggested fix:** Audit all consumers of `CompilerRunResult.exitCode` for null handling and document the contract.

#### 24. `execute.ts` `child.stdin.write` may not handle backpressure
- **Severity:** Low  
- **Confidence:** Low  
- **Files / Lines:** `src/lib/compiler/execute.ts:442-444`  
- **Classification:** Stream backpressure  
- **Problem:** `child.stdin.write(opts.stdin)` is called once without checking the return value or waiting for the `drain` event.  
- **Failure scenario:** For very large stdin this can fail with `EAGAIN` or partial writes.  
- **Suggested fix:** Use `child.stdin.end(opts.stdin)` or a small writable-stream helper that handles backpressure.

---

### Low / Risks Needing Manual Validation

#### 25. IP allowlist matcher accepts leading-zero IPv4 octets
- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/judge/ip-allowlist.ts:156-160`  
- **Classification:** Canonicalization  
- **Problem:** While `src/lib/security/ip.ts` now rejects leading-zero octets (US-010), the allowlist matcher still uses `Number(part)` on both client and network octets. An entry like `192.168.01.0/24` may not match the canonical `192.168.1.0` form produced by `extractClientIp`.  
- **Failure scenario:** An operator writes an allowlist with leading zeros and cannot understand why legitimate workers are rejected.  
- **Suggested fix:** Reject or normalize leading-zero octets in `ipMatchesAllowlistEntry` to match the canonicalization in `extractClientIp`.

#### 26. Dev-only IP sentinel `0.0.0.0` collapses rate limits in non-production
- **Severity:** Low / Medium  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/security/ip.ts:133`; `src/lib/security/rate-limit.ts:45-47`; `src/lib/security/api-rate-limit.ts:160`  
- **Classification:** Rate-limit behavior  
- **Problem:** In non-production environments, `extractClientIp` returns `"0.0.0.0"` when no proxy headers are present. All IP-derived rate-limit keys collapse to the same value.  
- **Failure scenario:** Multiple developers on the same network running E2E tests against staging share one bucket and accidentally trigger 429s.  
- **Suggested fix:** In non-production, derive a more granular fallback from the request socket's `remoteAddress` when available, or document the sentinel behavior and require staging deployments to set `X-Forwarded-For`.

#### 27. Audit-buffer flush timer can overlap if DB is slow
- **Severity:** Low  
- **Confidence:** Medium  
- **Files / Lines:** `src/lib/audit/events.ts:163-220`  
- **Classification:** Timer overlap / Ordering  
- **Problem:** `flushAuditBuffer` is invoked by an unref'd `setInterval` every 5 s, but `setInterval` does not wait for the async flush to complete. If a flush takes longer than 5 s, two flushes can run concurrently. The buffer swap is atomic, so duplicates are unlikely, but interleaving DB inserts can produce out-of-order audit rows.  
- **Failure scenario:** Under DB pressure, audit events for a sensitive operation may be persisted in a different order than they occurred, complicating forensic analysis.  
- **Suggested fix:** Track an in-flight promise and skip the tick while a flush is running, or switch to a recursive `setTimeout` that waits for completion before scheduling the next tick.

#### 28. `decodeValue` throws on malformed stored function values
- **Severity:** Low  
- **Confidence:** Low  
- **Files / Lines:** `src/lib/judge/function-judging/serialization.ts:103-106`; `src/lib/judge/function-judging/value-fields.ts:217`  
- **Classification:** Error handling  
- **Problem:** `decodeValue` calls `JSON.parse(s)` without a try/catch. Callers such as `decodeFieldValue` rely on their own try/catch, but other future callers may not.  
- **Failure scenario:** Corrupted stored test-case data causes an unhandled exception in a new code path.  
- **Suggested fix:** Wrap `decodeValue` in a try/catch and return a typed error or `null`, or document that it throws and ensure all callers handle it.

---

## Fixed Since Last Review (Verified)

The following prior findings are no longer present in the current code and are recorded here to avoid re-reporting:

- **Leading-zero IPv4 octets rejected** — `src/lib/security/ip.ts:18-27` now rejects octets with leading zeros (US-010).
- **`MAX_SUBMISSIONS_FOR_SIMILARITY` enforced before sidecar** — `src/lib/assignments/code-similarity.ts:357-366` now checks the limit before invoking the Rust sidecar (US-007).
- **X-Forwarded-For preserved in generated `deploy-docker.sh` nginx** — `deploy-docker.sh:1520,1535,1547,1559,1590,1605,1617,1629` now uses `$proxy_add_x_forwarded_for` (US-005).
- **Static-site security headers added** — `static-site/nginx.conf:11-13` adds `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` (US-012).
- **Uploaded files written with `0o600`** — `src/lib/files/storage.ts:29` now uses mode `0o600` (US-011).
- **Abort timer in similarity route cleared in `finally`** — `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:48,63-65` no longer leaks an armed timer on non-abort errors.

---

## Final Sweep Notes

- **Whole-surface coverage:** All 636 TypeScript files, 11 Rust files, deployment scripts, Docker configs, tests, and static assets were inventoried. High-risk files (compiler, judge worker, rate limiter, similarity, deployment) were read line-by-line; the remainder were sampled with targeted grep/AST searches for common latent-bug patterns (unhandled catches, dangling timers, `JSON.parse`, `parseInt`, `rm` after `chown`, `SystemTime::now`, fixed `/tmp` paths, etc.).
- **No empty catch blocks** were found in the TypeScript source (`grep -RInE '\.catch\(\s*\)\s*[;)}]' src` returned none).
- **Timer hygiene:** Most production timers are `unref`'d. Remaining risks are the audit-buffer overlap (#27) and the SSE global cleanup/poll timers, which are guarded but still global singletons.
- **Workspace cleanup is the dominant leak:** the same `chown` → `TempDir::drop` / `fs.rm` pattern appears in three places and is the single largest latent production failure mode.
- **Similarity concurrency and cancellation** remain the dominant data-integrity and latency risks.
- **Deployment/nginx drift** is partially fixed in `deploy-docker.sh`, but the static templates and legacy `deploy.sh` still carry the old XFF and body-size bugs, so a manual or legacy install remains vulnerable.
