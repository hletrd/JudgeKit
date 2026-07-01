# Latent-Bug Review — /tmp/judgekit-local

**Date:** 2026-07-01
**Scope:** `src/**`, `tests/**`, `judge-worker-rs/**`, `rate-limiter-rs/**`, `deploy-docker.sh`, `deploy.sh`, `scripts/**`, `docker/**`
**Deliverable:** Structured findings only — no fixes implemented.

---

## Executive Summary

This review focused on failure modes that are likely to surface in production rather than style issues. The highest-risk latent bugs are:

1. **Sandbox workspace directories are chowned to `65534:65534` and then cannot be cleaned up** by the app or worker process, causing a temp-directory leak on every compiler run / judgement.
2. **Generated nginx configs overwrite `X-Forwarded-For` with `$remote_addr`** instead of appending with `$proxy_add_x_forwarded_for`, which silently breaks the trusted-proxy hop validation in `extractClientIp` when any upstream proxy or CDN exists.
3. **The TypeScript `validateShellCommandStrict` validator rejects legitimate env-var-prefixed compiler commands** (e.g. `CC=gcc gcc ...`) that the looser `validateShellCommand` is documented to allow.
4. **The Rust rate-limiter sidecar uses `SystemTime::now()` for all window/block decisions**, so an NTP step backward can prematurely expire blocks and reset windows.
5. **Deployment temp files use fixed `/tmp` paths**, creating race conditions when multiple deploys run concurrently.

The full list follows, ordered by confidence (High → Medium → Low) and grouped by classification.

---

## Findings

### High Confidence

#### 1. Compiler workspace cannot be removed after chown to sandbox UID
- **File:** `/tmp/judgekit-local/src/lib/compiler/execute.ts`
- **Lines:** 742–758, 842–848
- **Classification:** Resource leak / Permissions
- **Explanation:**
  `executeCompilerRun` creates a temp workspace, writes the source file, then `chown`s both the directory and source file to `SANDBOX_UID=65534` with modes `0o700`/`0o600`. In the production Docker image the Node process runs as the `nextjs` user (uid 1001), so the `finally` block's `rm(workspaceDir, { recursive: true, force: true })` fails with `EACCES`/permission denied. The error is only logged; the directory is leaked.
- **Concrete failure scenario:**
  Every local-fallback compiler run (or every run if `COMPILER_RUNNER_URL` is misconfigured) leaves a `/tmp/compiler-*` directory behind. Over time `/tmp` fills up and the host runs out of inodes/disk space, eventually causing Docker builds and the app itself to fail.
- **Suggested fix:**
  Before cleanup, re-`chown` the workspace back to the process uid/gid (requires running the app container as root or adding `CAP_CHOWN`), or perform cleanup from a root-privileged helper. A safer alternative is to create the workspace under a parent directory with `0o755` and delete the parent (still needs ownership). The cleanest fix is to run a small `docker run --rm -v … alpine rm -rf …` as part of cleanup, leveraging the container runtime which has host root access.

#### 2. Judge-worker temp workspace cannot be removed after chown to sandbox UID
- **File:** `/tmp/judgekit-local/judge-worker-rs/src/executor.rs`
- **Lines:** 301–316, 324–358
- **Classification:** Resource leak / Permissions
- **Explanation:**
  The Rust executor creates a `tempfile::TempDir`, then `chown`s it to `65534:65534` with mode `0o700`. `TempDir::drop` silently ignores cleanup failures. If the worker process is not running as root, it cannot delete the directory, so every judgement leaks a workspace directory.
- **Concrete failure scenario:**
  A dedicated worker judging thousands of submissions per day leaves thousands of `/tmp/.tmp*` directories. The implicit drop means no operator-visible error; only disk exhaustion eventually alerts them.
- **Suggested fix:**
  Use an explicit cleanup step that `chown`s the workspace back to the worker process uid/gid before the `TempDir` goes out of scope, or run cleanup through a root-privileged container (the worker already has Docker access). At minimum, log and surface cleanup failures so operators can act.

#### 3. Generated nginx configs overwrite X-Forwarded-For with `$remote_addr`
- **File:** `/tmp/judgekit-local/deploy-docker.sh`
- **Lines:** 1482–1498, 1509–1522, 1552–1568, 1579–1592
- **File:** `/tmp/judgekit-local/scripts/online-judge.nginx.conf`
- **Lines:** 62–63, 76–77, 87–88, 99–100
- **Classification:** Configuration / Trust-boundary / IP spoofing
- **Explanation:**
  Every `proxy_set_header X-Forwarded-For $remote_addr;` statement replaces any existing XFF chain with the single immediate client IP. The app's `extractClientIp` (default `TRUSTED_PROXY_HOPS=1`) expects the chain to contain the real client IP followed by each trusted proxy. When the chain is truncated, the hop-count guard (`parts.length >= trustedHops + 1`) fails and the app returns `null` (production) or `0.0.0.0` (dev). The static-site reverse proxy (`static-site/static.nginx.conf`) correctly uses `$proxy_add_x_forwarded_for`, but the application nginx template does not.
- **Concrete failure scenario:**
  Production is fronted by Cloudflare or a corporate load balancer. Nginx receives `X-Forwarded-For: <real-client>, <cloudflare>` but overwrites it with `X-Forwarded-For: <cloudflare-ip>`. The app now sees only one hop while expecting two, so all client IP extraction fails. Rate-limit keys, audit logs, and the judge IP allowlist become unreliable.
- **Suggested fix:**
  Change every application nginx `X-Forwarded-For` line to `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Update `scripts/online-judge.nginx.conf` and both HTTPS and HTTP blocks in `deploy-docker.sh`.

#### 4. `sshpass -p` exposes the SSH password in local process listings
- **File:** `/tmp/judgekit-local/deploy-docker.sh`
- **Lines:** 392, 595
- **Classification:** Secrets leak / Operational security
- **Explanation:**
  When `SSH_PASSWORD` is set, the script invokes `sshpass -p "$SSH_PASSWORD" ssh …`. On the deploying machine the password is visible in `ps`/`/proc` to any local user while the SSH command is running. The same pattern appears inside `remote_sudo` when it pipes the sudo password.
- **Concrete failure scenario:**
  A shared CI runner or operator laptop has other users/processes. While `deploy-docker.sh` runs, `ps aux` reveals `SSH_PASSWORD=supersecret` for the `sshpass` process. The password can also be captured in shell history if the variable was set on the command line.
- **Suggested fix:**
  Prefer key-based auth for production deploys. If password auth is unavoidable, use `sshpass -f <(printf '%s\n' "$SSH_PASSWORD")` (with appropriate file permissions) or an `SSH_ASKPASS` wrapper so the password does not appear in argv. Document that `SSH_PASSWORD` must be exported, not typed on the command line.

---

### Medium Confidence

#### 5. `validateShellCommandStrict` rejects env-var-prefixed commands
- **File:** `/tmp/judgekit-local/src/lib/compiler/execute.ts`
- **Lines:** 243–251, 189–236
- **Classification:** Input-validation false positive
- **Explanation:**
  The looser `validateShellCommand` comment explicitly notes that env-var prefixes are permitted because admin-configured compile commands legitimately use them (e.g. `CC=gcc gcc …`). However, `validateShellCommandStrict` splits the command on `&&`/`;`, takes the first whitespace-delimited token, and requires it to match an allowed compiler prefix. A token like `CC=gcc` fails the prefix check, so the whole command is rejected.
- **Concrete failure scenario:**
  An admin sets a language config compile command to `CFLAGS="-O2 -Wall" gcc solution.c -o solution`. The local fallback path returns `"Invalid compile command"` even though the command is safe and the looser validator allows it.
- **Suggested fix:**
  In `validateShellCommandStrict`, strip leading shell variable assignments (`/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/`) from each segment before validating the first real command token. Keep the existing prefix check for the actual executable.

#### 6. Rate-limiter sidecar uses wall-clock time for windows and blocks
- **File:** `/tmp/judgekit-local/rate-limiter-rs/src/main.rs`
- **Lines:** 137–142, 152–212, 215–281, 292–315
- **Classification:** Time / Race condition
- **Explanation:**
  `now_ms()` is `SystemTime::now().duration_since(UNIX_EPOCH)`. All rate-limit decisions compare this wall-clock value against `window_started_at`, `blocked_until`, and `last_attempt`. If the system clock jumps backward (NTP sync, manual adjustment), an active block can appear to have expired (`blocked_until > now` becomes false) and a window may not reset when it should.
- **Concrete failure scenario:**
  An attacker is blocked for 15 minutes after failed logins. The host's NTP client corrects the clock backward by 5 minutes. The sidecar now believes the block has expired and allows more attempts. The PostgreSQL-backed limiter (which uses DB time) remains correct, but the sidecar fast-path becomes the weak link.
- **Suggested fix:**
  Store `tokio::time::Instant` values for windows/blocks and use monotonic elapsed durations for all interval comparisons. Only use wall-clock time for external-facing `blocked_until` timestamps if needed by callers.

#### 7. Fixed `/tmp` filenames create races during parallel deploys
- **File:** `/tmp/judgekit-local/deploy-docker.sh`
- **Lines:** 1446, 1530, 1602–1605 (nginx config); 1663, 1669 (smoke log)
- **Classification:** Race condition / Operational reliability
- **Explanation:**
  The nginx config is written to `/tmp/judgekit-nginx.conf` and the smoke log to `/tmp/judgekit-smoke-${DOMAIN}.log` on the deploying machine. These paths are deterministic. If two deploys run concurrently on the same machine (e.g. CI deploying to staging and production, or two operators), one can overwrite the other's file.
- **Concrete failure scenario:**
  Operator A deploys to `algo.xylolabs.com` while operator B deploys to `worv`. Both write to `/tmp/judgekit-nginx.conf`. Operator A's `remote_copy` may transfer operator B's config to `algo`, deploying the wrong `server_name` and TLS certificate paths.
- **Suggested fix:**
  Use `mktemp /tmp/judgekit-nginx.XXXXXX` and include PID/timestamp in the smoke log filename (e.g. `/tmp/judgekit-smoke-${DOMAIN}-$$-${EPOCHSECONDS}.log`). Clean up files in the `EXIT` trap.

#### 8. `pg-volume-safety-check.sh` can return `.` as the cluster source
- **File:** `/tmp/judgekit-local/scripts/pg-volume-safety-check.sh`
- **Lines:** 156–158
- **Classification:** Data-loss / False positive
- **Explanation:**
  The candidate cluster path is discovered with `find "$ANON_SRC" -mindepth 2 -maxdepth 3 -name PG_VERSION | head -1 | xargs -I{} dirname {}`. When `find` produces no output, `xargs` without `-r/--no-run-if-empty` still runs `dirname` once with an empty argument, which prints `.`. The script then treats the current working directory as the cluster source.
- **Concrete failure scenario:**
  Run the safety check from a directory that happens to contain a `PG_VERSION` file. `CLUSTER_SRC` becomes `.`, `cluster_has_pg_version(".")` returns true, and the script reports an orphan-cluster emergency. Auto-migrate could then `rm -rf ${NAMED_SRC}/*` (constrained to the named volume, so data loss is limited) and copy the current directory into the Postgres data volume.
- **Suggested fix:**
  Use `xargs -r` or, better, `find "$ANON_SRC" -mindepth 2 -maxdepth 3 -name PG_VERSION -printf '%h\n' -quit` to avoid the pipe-to-`dirname` entirely.

#### 9. `rebuild-worker-language-images.sh` `eval`s part of `deploy-docker.sh`
- **File:** `/tmp/judgekit-local/scripts/rebuild-worker-language-images.sh`
- **Lines:** 37–38
- **Classification:** Maintenance / Injection
- **Explanation:**
  The script extracts language list assignments from `deploy-docker.sh` and `eval`s them. If `deploy-docker.sh` is later changed to include comments, conditionals, or shell-special characters inside those assignments, the eval can break or execute unexpected code.
- **Concrete failure scenario:**
  A future edit adds a language list like `CORE_LANGS="cpp python # core only"`. The `#` inside the quoted string is treated as a comment by the `eval`, truncating the list silently.
- **Suggested fix:**
  Move the language list constants into a dedicated sourced file (`scripts/language-lists.sh`) that both `deploy-docker.sh` and `rebuild-worker-language-images.sh` source without `eval`.

#### 10. `bootstrap-instance.sh` assumes `--swap` is always in gigabytes
- **File:** `/tmp/judgekit-local/scripts/bootstrap-instance.sh`
- **Lines:** 112–124
- **Classification:** Resource misconfiguration
- **Explanation:**
  The swap-size fallback uses `echo ${SWAP_SIZE} | sed 's/G//' | awk '{print $1 * 1024}'`. If the operator passes `--swap=512M`, the `G` removal does nothing and the script tries to allocate `512 * 1024` MB = 512 GB of swap.
- **Concrete failure scenario:**
  An operator on a small instance runs `--swap=2M` expecting 2 MB and instead creates a 2 GB swap file, potentially filling the root filesystem.
- **Suggested fix:**
  Parse the numeric suffix explicitly (e.g. `num=${SWAP_SIZE%[A-Za-z]*}`, `unit=${SWAP_SIZE#$num}`) and convert M/G/T to megabytes. Reject unsupported units with a clear error.

#### 11. Rust Dockerfiles use rolling `rust:1-alpine` tag
- **File:** `/tmp/judgekit-local/Dockerfile.judge-worker`
- **Lines:** 10
- **File:** `/tmp/judgekit-local/Dockerfile.code-similarity`
- **Lines:** 6
- **File:** `/tmp/judgekit-local/Dockerfile.rate-limiter-rs`
- **Lines:** 8
- **Classification:** Build reproducibility / Supply chain
- **Explanation:**
  `rust:1-alpine` is a rolling tag that points to the latest Rust 1.x release. A future Rust release can introduce new deprecation warnings treated as errors (`-D warnings`), edition changes, or dependency breakage. Builds that worked yesterday may fail today without any code change.
- **Concrete failure scenario:**
  Rust 1.94 ships and `cargo` changes behavior; a routine deploy on a fresh worker host fails mid-build because `rust:1-alpine` now resolves to 1.94. Debugging takes time because the codebase did not change.
- **Suggested fix:**
  Pin to a specific minor/patch version, e.g. `rust:1.93-alpine`, and update deliberately after testing.

#### 12. `apiFetchJson` calls `.json()` before checking `response.ok`
- **File:** `/tmp/judgekit-local/src/lib/api/client.ts`
- **Lines:** 147–158
- **Classification:** API client / Error handling
- **Explanation:**
  The file's own documentation (lines 25–53) states as a critical rule: "Always check `response.ok` BEFORE calling `.json()`." `apiFetchJson` violates this by parsing first and then branching on `res.ok && parseOk`. It uses `.catch()` to avoid throws, but it consumes the body before knowing whether the response was successful, and a non-JSON error body still results in `ok: false` with no status information.
- **Concrete failure scenario:**
  A reverse proxy returns an HTML 502 page. `apiFetchJson` returns `{ ok: false, data: fallback }`. The caller cannot distinguish a network failure from a 502/503/504, so retry logic and user messaging may be wrong.
- **Suggested fix:**
  Restructure to check `res.ok` first, then parse success/error bodies separately:
  ```ts
  if (!res.ok) {
    const data = await res.json().catch(() => fallback);
    return { ok: false, data };
  }
  const data = await res.json().catch(() => fallback);
  return { ok: true, data };
  ```

#### 13. `generateNgrams` does not validate `n`
- **File:** `/tmp/judgekit-local/src/lib/assignments/code-similarity.ts`
- **Lines:** 197–204
- **Classification:** Infinite loop / Input validation
- **Explanation:**
  The loop condition is `i <= tokens.length - n`. If `n` is 0, the condition is `i <= tokens.length` and `i` is never constrained, producing an infinite loop. If `n` is negative, the condition is always true.
- **Concrete failure scenario:**
  A malformed setting or a future caller passes `ngramSize=0`. The similarity-check API route times out after 30 seconds, but because the loop is synchronous it blocks the event loop and prevents other requests on the same instance from being handled.
- **Suggested fix:**
  Add an early guard: `if (n <= 0 || tokens.length < n) return new Set();`.

#### 14. `normalizeSource` string-literal cap leaks content into normalized output
- **File:** `/tmp/judgekit-local/src/lib/assignments/code-similarity.ts`
- **Lines:** 67–93, 106
- **Classification:** Algorithmic correctness
- **Explanation:**
  When a string literal exceeds `MAX_STRING_LITERAL_LENGTH` (10 000 chars), the inner while exits without reaching the closing delimiter. The outer loop then continues from the current `index`, which is still inside the string body, and line 106 appends that character to `result` as if it were code.
- **Concrete failure scenario:**
  A submission embeds a 12 000-character base64 blob in a string. After normalization, the characters following the 10 000th position are emitted as tokens, which then get placeholder identifiers and n-grams. Two otherwise unrelated submissions that share the same long blob may get an artificially high similarity score.
- **Suggested fix:**
  When the cap is hit, skip ahead to the delimiter (or newline for non-template strings) without emitting anything, mirroring the "unclosed string" branch that already discards the opening delimiter.

#### 15. `judge-worker-rs` startup/periodic sweeps only reap `status=exited`
- **File:** `/tmp/judgekit-local/judge-worker-rs/src/docker.rs`
- **Lines:** 574–650
- **Classification:** Resource leak
- **Explanation:**
  The periodic `cleanup_orphaned_containers` filters on `status=exited`. Containers in `dead` or `created` states (which can occur after Docker daemon restarts or failed creates) are never reaped by the periodic sweep. The startup sweep reaps all statuses, so the issue is limited to long-running workers.
- **Concrete failure scenario:**
  A Docker daemon restart leaves several `oj-*` containers in `dead` state. The periodic sweep ignores them and they accumulate until the next worker restart.
- **Suggested fix:**
  Remove the `status=exited` filter from the periodic sweep, or explicitly include `status=dead` and `status=created`.

#### 16. `bootstrap-instance.sh` certbot email flag is not robustly quoted
- **File:** `/tmp/judgekit-local/scripts/bootstrap-instance.sh`
- **Lines:** 230–267
- **Classification:** Shell robustness
- **Explanation:**
  `EMAIL_FLAG="--email ${EMAIL}"` is interpolated into a double-quoted remote command string. If `EMAIL` contains spaces or shell metacharacters, the remote shell will split or interpret them.
- **Concrete failure scenario:**
  An operator passes `--email="admin@example.com (Admin)"`. The remote command becomes `--email admin@example.com (Admin)`, which is a syntax error and certbot fails.
- **Suggested fix:**
  Use an array (`EMAIL_FLAG=(--email "$EMAIL")`) or single-quote the value when expanding into the remote heredoc command.

#### 17. Dedicated worker `.env` only receives `JUDGE_BASE_URL`
- **File:** `/tmp/judgekit-local/scripts/deploy-worker.sh`
- **Lines:** 137–144
- **Classification:** Configuration drift
- **Explanation:**
  The script creates a remote `.env` file and writes only `JUDGE_BASE_URL`, `JUDGE_AUTH_TOKEN`, `RUNNER_AUTH_TOKEN`, `JUDGE_CONCURRENCY`, `JUDGE_WORKER_HOSTNAME`, and `RUST_LOG`. If the worker compose requires additional secrets (e.g. `DOCKER_HOST`, `JUDGE_OCI_RUNTIME`, or future variables), they must be pre-provisioned manually and are not synchronized from the app's `.env.production`.
- **Concrete failure scenario:**
  An operator adds a required env var to `docker-compose.worker.yml` but forgets to copy it to the worker host. The worker fails to start after deploy, and the error is not obvious because the deploy script reports success.
- **Suggested fix:**
  Document the required worker env vars in `AGENTS.md` and optionally sync an allow-listed set of variables from `.env.production` to the worker `.env`.

#### 18. `ensure_env_secret` base64 generator branch is dead and misleading
- **File:** `/tmp/judgekit-local/deploy-docker.sh`
- **Lines:** 715–718
- **Classification:** Logic / Maintainability
- **Explanation:**
  The function accepts a `generator` argument. For `generator == "base64"` it first generates a hex value and then unconditionally overwrites it with `openssl rand -base64 32`. There are no callers that pass `"base64"`, so the branch is dead, but if a future caller expects the generated value to be hex-sized it will receive a base64 string instead.
- **Concrete failure scenario:**
  A future maintainer adds `ensure_env_secret SOME_KEY base64` expecting a 64-character hex string and gets a 44-character base64 string, which may be rejected by a downstream validator expecting hex.
- **Suggested fix:**
  Remove the dead branch or make the generator logic explicit and test it.

#### 19. Language Dockerfiles download `latest` releases without checksum verification
- **File:** `/tmp/judgekit-local/docker/Dockerfile.judge-jvm`
- **Lines:** 10
- **File:** `/tmp/judgekit-local/docker/Dockerfile.judge-moonbit`
- **Lines:** 16, 21
- **File:** `/tmp/judgekit-local/docker/Dockerfile.judge-uiua`
- **Lines:** 7
- **File:** `/tmp/judgekit-local/docker/Dockerfile.judge-v`
- **Lines:** 8
- **Classification:** Supply chain / Build reproducibility
- **Explanation:**
  Several language images fetch `latest` release artifacts (zip/tar/jar) directly from GitHub or vendor CDNs. There is no version pinning, no checksum verification, and no signature checking. A compromised release, a breaking upstream change, or a network MitM can break or poison the image.
- **Concrete failure scenario:**
  A vendor accidentally publishes a broken `latest` zip. The next language-image build on a fresh worker host succeeds at the Docker layer but the runtime is broken, causing all submissions in that language to fail with `runtime_error` or `compile_error`.
- **Suggested fix:**
  Pin to explicit release tags/versions and verify SHA-256 checksums after download. Store expected checksums in the repo and fail the build on mismatch.

#### 20. Judge-worker Dockerfile arch check only logs, does not enforce
- **File:** `/tmp/judgekit-local/Dockerfile.judge-worker`
- **Lines:** 19–22
- **Classification:** Build correctness
- **Explanation:**
  The Dockerfile compares `EXPECTED_ARCH` (`uname -m`) with `BINARY_ARCH` from `readelf`, but it only `echo`s the values. It does not exit if they mismatch. On a cross-build where the binary ends up for the wrong architecture, the later `judge-worker --help` check will likely fail, but the earlier comparison should be a hard gate.
- **Concrete failure scenario:**
  A future `docker buildx` cross-compile for ARM produces an x86 binary by accident. The build proceeds, `readelf` reports `Advanced Micro Devices X86-64` while `uname -m` is `aarch64`, but the build only logs the mismatch and then fails opaquely at `--help`.
- **Suggested fix:**
  Normalize both strings (e.g. lowercase, map `aarch64` ↔ `arm64`) and `exit 1` on mismatch with a clear message.

---

### Low Confidence

#### 21. `execute.ts` `child.stdin.write` may not handle backpressure
- **File:** `/tmp/judgekit-local/src/lib/compiler/execute.ts`
- **Lines:** 442–444
- **Classification:** Edge-case I/O
- **Explanation:**
  `child.stdin.write(opts.stdin)` is called once without checking the return value or waiting for the `drain` event. For very large stdin this can fail with `EAGAIN` or partial writes. The stdin cap in the runner is 64 KiB, so this is unlikely in practice.
- **Suggested fix:**
  Use `child.stdin.end(opts.stdin)` or a small writable-stream helper that handles backpressure.

#### 22. `run_docker_once` kills the docker CLI process, not the container
- **File:** `/tmp/judgekit-local/judge-worker-rs/src/docker.rs`
- **Lines:** 468–473, 522–526
- **Classification:** Timeout handling
- **Explanation:**
  On timeout the code calls `child.kill()` on the `docker` CLI process. The actual container continues running until `kill_container` is invoked. If the CLI process is killed before the container name is reliably known, cleanup can be skipped. In practice `kill_container` is called immediately after, so the risk is low.
- **Suggested fix:**
  Skip killing the CLI process and go straight to `docker kill <container_name>`; the CLI will exit once the container is gone.

#### 23. `parse_timestamp_epoch_ms` uses hand-rolled calendar math
- **File:** `/tmp/judgekit-local/judge-worker-rs/src/docker.rs`
- **Lines:** 99–145
- **Classification:** Date/time correctness
- **Explanation:**
  The function implements its own days-from-epoch calculation. The comment says it is sufficient for 2000–2100. Outside that range it may be off by leap-year rules or have subtle integer-edge bugs. It also returns `None` for any pre-1970 timestamp.
- **Concrete failure scenario:**
  Very unlikely in production, but a container with a corrupt clock or a test fixture date of 2101 could produce a wrong duration, misclassifying a TLE.
- **Suggested fix:**
  Use the `time` or `chrono` crate to parse RFC 3339 timestamps.

#### 24. `isValidImageReference` regex is permissive and rejects single-character names
- **File:** `/tmp/judgekit-local/src/lib/docker/client.ts`
- **Lines:** 150–156
- **Classification:** Validation edge case
- **Explanation:**
  The regex requires at least two characters and allows consecutive dots, which Docker's reference grammar does not. A single-character repository like `a` is rejected. In practice all judge images have multi-character names.
- **Suggested fix:**
  If stricter validation is desired, use Docker's reference grammar or a well-tested library. Otherwise document the intentional leniency.

#### 25. `static-site/nginx.conf` `try_files` may serve directory indexes unexpectedly
- **File:** `/tmp/judgekit-local/static-site/nginx.conf`
- **Lines:** 19–21
- **Classification:** Configuration
- **Explanation:**
  `try_files $uri $uri/ $uri/index.html =404;` will serve `index.html` inside any directory even if the request did not end with `/`. This is usually desired for static sites, but combined with `autoindex off` it is benign.
- **Concrete failure scenario:**
  None identified; included for completeness.

---

## Final Sweep: Commonly Missed Latent Bugs

The following patterns were explicitly searched and either found safe or already mitigated:

- **Unvalidated `parseInt` / radix:** `src/lib/security/ip.ts:12` uses radix 10; `src/lib/db-time.ts` and other call sites were checked and use explicit radices.
- **`==` loose equality in critical paths:** Reviewed; production code uses `===` consistently.
- **Unhandled promise rejections:** API routes use `createApiHandler` which wraps async handlers. The Rust worker uses panic recovery via `catch_unwind`.
- **Resource leaks in timers:** The similarity-check route's `AbortController` timeout is cleared in `finally` (`route.ts:64`). The compiler runner's timeout is cleared on finish/error.
- **Secrets in logs:** `deploy-docker.sh` sanitizes worker logs before printing them (line 1418). API error responses avoid leaking env-var names.
- **`rm -rf` / `docker system prune --volumes`:** All deploy scripts explicitly avoid volume pruning and use `docker image prune -f` (dangling only). `pg-volume-safety-check.sh` destructive paths are guarded by `NAMED_SRC` checks.
- **Drizzle `where` alias-rewrite footgun:** Searched for raw `where` aliasing in recently modified routes; the similarity-check route uses `inArray(users.id, …)` correctly.

---

## Recommendations Priority

1. **Fix workspace cleanup in both TypeScript and Rust** — these are silent resource leaks that scale with production traffic.
2. **Switch nginx `X-Forwarded-For` to `$proxy_add_x_forwarded_for`** — this restores correct trusted-proxy semantics.
3. **Use monotonic time in the rate-limiter sidecar** — closes a time-skew window in the security path.
4. **Use mktemp for deploy temp files** — prevents rare but dangerous cross-deploy races.
5. **Allow env-var prefixes in `validateShellCommandStrict`** — removes a false-positive that can break admin-configured language commands.
6. **Pin Rust and language-image dependency versions** — improves build reproducibility and supply-chain safety.
