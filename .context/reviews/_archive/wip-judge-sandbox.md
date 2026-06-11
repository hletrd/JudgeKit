# Deep Security & Code Review: Judge Execution, Sandboxing, and Rust Services

**Reviewer:** Claude Code (code-reviewer agent)
**Date:** 2026-04-18
**Scope:** Judge worker, compiler execution, Docker sandboxing, Rust sidecar services, API routes, Dockerfiles
**Verdict:** REQUEST CHANGES (2 Critical, 5 High, 12 Medium, 8 Low, 6 Info findings)

---

## Executive Summary

The judge execution pipeline is **architecturally sound** with strong defense-in-depth:
containers run as nobody (65534), networking is disabled, capabilities are dropped,
a custom seccomp profile is applied, workspaces are read-only during execution, and
output sizes are capped. The Rust judge worker is well-structured with proper graceful
shutdown, semaphore-based concurrency control, and dead-letter persistence for failed
result reports.

However, two critical findings and several high-severity issues require attention
before this system should face adversarial users at scale.

---

## Findings

### CRITICAL

#### C-1. Heartbeat route compares plaintext `secretToken` instead of hashed token

- **Severity:** Critical
- **Confidence:** High
- **Status:** Confirmed
- **File:** `src/app/api/v1/judge/heartbeat/route.ts:43-51`

```typescript
const worker = await db.query.judgeWorkers.findFirst({
  where: eq(judgeWorkers.id, workerId),
  columns: { secretToken: true },  // fetches PLAINTEXT secret
});
if (!worker) return apiError("workerNotFound", 404);
if (!worker.secretToken) return apiError("workerSecretNotConfigured", 403);
const a = Buffer.from(workerSecret);
const b = Buffer.from(worker.secretToken);  // compares against plaintext
if (a.length !== b.length || !timingSafeEqual(a, b)) {
```

**Explanation:** The register route correctly stores both `secretToken` (plaintext)
and `secretTokenHash` (SHA-256 hash) and returns the plaintext to the worker. The
deregister route correctly compares against `secretTokenHash`. But the heartbeat
route fetches `secretToken` (plaintext) and compares it directly. This means:

1. **Plaintext secrets are stored in the DB** -- the `secretToken` column contains
   the raw secret, which is a data-at-rest exposure risk.
2. **Inconsistency with deregister** -- deregister uses `secretTokenHash`, heartbeat
   uses `secretToken`. If the plaintext column is ever dropped (as the migration
   comments suggest should happen), heartbeat auth will break.
3. The `isJudgeAuthorizedForWorker` function in `auth.ts:67-73` already correctly
   rejects workers with only plaintext tokens (no hash), logging a migration warning.
   But the heartbeat route bypasses this by fetching plaintext directly.

**Exploit scenario:** If an attacker gains read access to the DB (SQL injection
elsewhere, backup leak), they get plaintext worker secrets and can impersonate any
worker to send heartbeats, keeping stale workers "online" and disrupting scheduling.

**Fix:** Change the heartbeat route to fetch `secretTokenHash` and compare
`hashToken(workerSecret) === worker.secretTokenHash`, exactly like the deregister
route does. Remove the `secretToken` plaintext column after migration.

---

#### C-2. Runner HTTP server in judge-worker has no request body size limit

- **Severity:** Critical
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/runner.rs` (entire router), `judge-worker-rs/src/main.rs:336-359`

**Explanation:** The runner HTTP server (`create_router` in `runner.rs:806-817`)
exposes endpoints like `/run`, `/docker/build`, `/docker/pull` etc. behind Bearer
token auth. However, axum's default configuration does not impose a request body
size limit. An authenticated caller (the app server with `RUNNER_AUTH_TOKEN`) can
send an arbitrarily large JSON body to `/run`, causing the worker to allocate
unbounded memory parsing the request.

The `/run` endpoint validates `source_code` and `stdin` lengths *after* the full
body has been deserialized into memory. A malicious or buggy app server request
with a multi-gigabyte `sourceCode` field would OOM the worker process before
validation fires.

**Exploit scenario:** A compromised app server (or SSRF through it) sends a 4GB
JSON body to the runner's `/run` endpoint, OOMing the judge worker and halting
all judging.

**Fix:** Add an axum `DefaultBodyLimit` layer to the router:
```rust
use axum::extract::DefaultBodyLimit;
// 2 MB is generous for source code + stdin + JSON overhead
Router::new()
    .route(...)
    .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
    .with_state(state)
```

---

### HIGH

#### H-1. `socket` syscall allowed in seccomp profile enables container-to-container communication

- **Severity:** High
- **Confidence:** Medium
- **Status:** Needs-validation
- **File:** `docker/seccomp-profile.json:233`

```json
"socket",
"socketpair",
```

**Explanation:** The seccomp profile allows `socket`, `socketpair`, `bind`, `listen`,
`accept`, `connect`, `sendto`, `recvfrom`, `sendmsg`, `recvmsg`, and related
syscalls. While `--network=none` prevents TCP/IP networking, Unix domain sockets
are still usable within the container's filesystem namespace. A submission could:

1. Create a Unix socket in `/tmp` (which is a writable tmpfs).
2. Use it for inter-process communication between forked processes.
3. More concerning: if any mount leaks a shared path (e.g., the workspace bind
   mount during compilation when `read_only_workspace: false`), two concurrent
   submissions for the same language could theoretically communicate.

The workspace is a unique `tempfile::TempDir` per submission, so cross-submission
communication via workspace is not possible. However, the broad socket allowlist
is more permissive than necessary for a pure computation sandbox.

**Fix:** Consider removing `socket`, `bind`, `listen`, `accept`, `connect`,
`sendto`, `recvfrom`, `sendmsg`, `recvmsg` from the seccomp profile and testing
which languages break. At minimum, restrict socket domain to `AF_UNIX` only via
seccomp arg filters, or accept the risk given `--network=none`.

---

#### H-2. TS compiler `validateShellCommand` allows `&&` and `;` while Rust runner blocks them

- **Severity:** High
- **Confidence:** High
- **Status:** Confirmed
- **File:** `src/lib/compiler/execute.ts:119-124` vs `judge-worker-rs/src/runner.rs:112-134`

```typescript
// TS (execute.ts) — allows && and ;
const dangerous = /`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b/;
```
```rust
// Rust (runner.rs) — blocks && and ;
let dangerous_patterns = [
    "`", "$(", "${", "<(", ">(", "&&", "||", ";", "|", ">", "<", "\n", "\r",
];
```

**Explanation:** The TypeScript `validateShellCommand` in `execute.ts` intentionally
allows `&&` and `;` because "trusted admin-configured compile commands legitimately
chain steps." However, the Rust runner's `validate_shell_command` blocks them. This
inconsistency means:

1. A DB-configured compile command with `&&` (e.g., `mkdir -p out && javac ...`)
   will work when executed via the TS local fallback but **fail** when routed to
   the Rust runner.
2. The TS version also does not block `||`, only the pipe `|` character.

The comment in `execute.ts` says commands come from "trusted DB configs," but the
runner endpoint receives commands from the app server over HTTP. If an attacker
can inject a compile command into the DB (e.g., via admin panel XSS or SQL injection),
the TS path allows shell chaining while the Rust path does not.

**Fix:** Align the two validators. Either:
- Make both strict (block `&&`, `;`) and update Java/Kotlin compile commands to use
  a wrapper script instead of shell chaining, OR
- Make both permissive for compile commands specifically (since they come from
  admin-configured DB records), with a clear comment about the trust boundary.

---

#### H-3. Compile command passed as `sh -c <user_string>` enables shell injection for DB-sourced commands

- **Severity:** High
- **Confidence:** Medium
- **Status:** Needs-validation
- **File:** `judge-worker-rs/src/runner.rs:698`, `src/lib/compiler/execute.ts:546`

```rust
// runner.rs
command: vec!["sh".into(), "-c".into(), compile_command.clone()],
```
```typescript
// execute.ts
const compileCmd = ["sh", "-c", options.language.compileCommand];
```

**Explanation:** Both the Rust runner and TS compiler wrap compile/run commands in
`sh -c`. The commands come from the `language_configs` DB table, which is
admin-configured. If an admin (or an attacker who compromises the admin panel)
inserts a malicious compile command, it executes as a shell command inside the
container.

The static language configs in `languages.rs` use explicit argument arrays without
`sh -c`, which is safer. The runner path wraps everything in `sh -c` because it
receives a single command string from the API.

Inside the container, the damage is limited (no network, no capabilities, read-only
rootfs, nobody user), but the attacker could:
- Read `/workspace/solution.*` (the source code of the current submission)
- Write to `/tmp` during compilation
- Consume resources up to the configured limits

**Fix:** For the judge worker path (executor.rs), commands are already passed as
argument arrays, which is good. For the runner/compiler paths, consider splitting
commands into arrays server-side and passing them as `["compiler", "arg1", "arg2"]`
instead of `sh -c "compiler arg1 arg2"`. This removes the shell interpretation
layer entirely.

---

#### H-4. Code similarity service has no authentication

- **Severity:** High
- **Confidence:** High
- **Status:** Confirmed
- **File:** `code-similarity-rs/src/main.rs:112-113`, `src/lib/assignments/code-similarity-client.ts:31`

```rust
// No auth middleware on any route
let app = Router::new()
    .route("/health", get(health))
    .route("/compute", post(compute));
```
```typescript
// Client sends no auth headers
const response = await fetch(`${CODE_SIMILARITY_URL}/compute`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
```

**Explanation:** The code similarity Rust service has zero authentication. Any
process that can reach it on the network can submit source code for analysis.
In the production docker-compose, it runs on an internal Docker network, so
external access is unlikely. But:

1. Any container on the same Docker network can access it.
2. There is no rate limiting on the `/compute` endpoint.
3. The endpoint accepts unbounded submissions arrays -- an attacker could send
   thousands of large source files, causing O(n^2) comparison and memory exhaustion.

**Exploit scenario:** A compromised container (or any service on the Docker network)
sends a `/compute` request with 10,000 submissions of 256KB each. The service
allocates ~2.5GB for source code alone, plus n-gram sets, and the O(n^2) pairwise
comparison takes hours.

**Fix:**
1. Add Bearer token auth (similar to the runner).
2. Add a request body size limit via axum `DefaultBodyLimit`.
3. Add input validation: cap `submissions.len()` and individual `source_code.len()`.

---

#### H-5. Rate limiter service has no authentication

- **Severity:** High
- **Confidence:** High
- **Status:** Confirmed
- **File:** `rate-limiter-rs/src/main.rs:338-348`

```rust
let app = Router::new()
    .route("/health", get(health))
    .route("/check", post(check))
    .route("/record-failure", post(record_failure));
```

**Explanation:** Like the code similarity service, the rate limiter has no auth.
Any process on the Docker network can call `/reset` (if enabled) to clear rate
limit state, or call `/check` to consume rate limit quota for arbitrary keys,
effectively DoS-ing legitimate users.

The `/reset` endpoint is gated behind `RATE_LIMITER_ENABLE_RESET` (default false),
which is good. But `/check` and `/record-failure` are fully open.

**Fix:** Add Bearer token auth or restrict to the app container's IP. At minimum,
ensure the Docker network is isolated and document the trust boundary.

---

### MEDIUM

#### M-1. `RUNNER_AUTH_TOKEN` falls back to `JUDGE_AUTH_TOKEN` silently

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/config.rs:152-172`

**Explanation:** When `RUNNER_AUTH_TOKEN` is not set, it falls back to
`JUDGE_AUTH_TOKEN`. This means the same token authenticates both judge
claim/report operations AND the runner's admin Docker management endpoints
(pull, build, remove images, disk usage). A warning is logged, but in
practice many deployments will use the shared token. The runner endpoints
allow pulling arbitrary (judge-namespaced) images and building Dockerfiles,
which is more privileged than judging submissions.

**Fix:** In production, require `RUNNER_AUTH_TOKEN` to be set separately.
The config already warns; consider making it a hard error in production.

---

#### M-2. Docker image validation allows `latest` tag -- no digest pinning

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/validation.rs:1-49`, `src/lib/judge/docker-image-validation.ts`

**Explanation:** `validate_docker_image` ensures images start with `judge-` and
optionally come from trusted registries. However, it allows `:latest` tags and
does not require digest pinning (`@sha256:...`). If an attacker compromises a
trusted registry or poisons the local Docker cache, they can replace a
`judge-python:latest` image with a malicious one.

**Fix:** Consider supporting digest-pinned image references for production
deployments, or at minimum document the trust model for image provenance.

---

#### M-3. Workspace directory permissions 0o777 during compilation

- **Severity:** Medium
- **Confidence:** Medium
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/executor.rs:238-255`

```rust
fs::set_permissions(
    workspace_dir,
    std::os::unix::fs::PermissionsExt::from_mode(0o777),
).await
```

**Explanation:** The workspace is set to world-writable (0o777) so the container
user (65534) can write compiled output. This is necessary for the current design
but means any process on the host with access to `/tmp` can also read/write the
workspace while it exists. Since `tempfile::TempDir` creates directories in the
system temp dir with unpredictable names, the risk is low but not zero.

**Fix:** Consider using 0o755 for the workspace and 0o777 only for a designated
output subdirectory. Or run the container with a specific UID that matches a
restricted host user.

---

#### M-4. No wall-clock timeout on `docker inspect` calls

- **Severity:** Medium
- **Confidence:** Medium
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/docker.rs:142-194`

**Explanation:** `inspect_container_state` calls `docker inspect` without a timeout.
If the Docker daemon is hung or slow, this blocks the judge task indefinitely. The
TS implementation (`execute.ts:150-155`) correctly sets `{ timeout: 5_000 }`.

**Fix:** Add `.timeout(std::time::Duration::from_secs(5))` or wrap in
`tokio::time::timeout`.

---

#### M-5. `cleanup_orphaned_containers` has no limit on batch size

- **Severity:** Medium
- **Confidence:** Medium
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/docker.rs:495-523`

**Explanation:** `cleanup_orphaned_containers` lists all exited `oj-` containers
and batch-removes them in a single `docker rm` call. If thousands of containers
have accumulated (e.g., after a crash loop), the command line could exceed OS
limits (`ARG_MAX`).

**Fix:** Batch the removal into chunks of ~100 container IDs.

---

#### M-6. `Submission.source_code` deserialized into memory without size validation in Rust worker

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/types.rs:218`, `judge-worker-rs/src/executor.rs:258-269`

**Explanation:** The `Submission` struct deserializes `sourceCode` as a `String`
with no serde size limit. The size check happens after deserialization in
`executor.rs:258`. If the app server sends a submission with a multi-MB source
code field, it is fully allocated before the check. The claim endpoint on the
app server side does not limit source code size before sending it to the worker.

**Fix:** The source code already exists in the DB (inserted during submission with
a 64KB/256KB limit), so the risk is low in practice. But consider adding a serde
deserialize limit or checking `Content-Length` before parsing.

---

#### M-7. Seccomp profile allows `ptrace` via `prctl` -- potential sandbox weakening

- **Severity:** Medium
- **Confidence:** Low
- **Status:** Needs-validation
- **File:** `docker/seccomp-profile.json:155`

**Explanation:** The seccomp profile allows `prctl` which can be used for
`PR_SET_DUMPABLE` and other operations. Combined with `--security-opt=no-new-privileges`,
the risk is reduced, but `prctl` is a common target for sandbox escape research.
The `clone3` syscall is correctly blocked (returning ENOSYS), which is good.

**Fix:** Consider restricting `prctl` to specific operations via arg filtering,
or accept the risk given the other layers of defense.

---

#### M-8. Dead-letter directory path not validated against symlink attacks

- **Severity:** Medium
- **Confidence:** Low
- **Status:** Needs-validation
- **File:** `judge-worker-rs/src/executor.rs:807`

**Explanation:** `report_with_retry` creates the dead-letter directory with
`fs::create_dir_all` and writes JSON files into it. The `safe_id` sanitization
prevents path traversal in the filename. However, if the dead-letter directory
itself is a symlink (placed by an attacker with host access), files could be
written to an unexpected location.

**Fix:** The `validate_runtime_path` in config.rs blocks `..` but does not check
for symlinks. Add a symlink check when creating the dead-letter directory, or
document that the directory must be on a trusted filesystem.

---

#### M-9. Compile phase allows 4x memory-swap in Rust worker but 1x in TS compiler

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/docker.rs:266-269` vs `src/lib/compiler/execute.ts:231-232`

```rust
// Rust worker: 4x swap for compilation
"--memory-swap".into(),
if options.phase == Phase::Compile {
    format!("{}m", mem_limit * 4)
```
```typescript
// TS compiler: 1x swap (equal to memory, i.e., no swap)
"--memory-swap", `${MEMORY_LIMIT_MB}m`,
```

**Explanation:** The Rust judge worker allows 4x memory swap during compilation
"for heavy languages (qemu)" but the TS compiler local fallback sets swap equal
to memory (effectively no swap). This inconsistency means a submission could pass
compilation on the remote worker but fail locally, or vice versa. More importantly,
4x swap means a container can use up to 4x the memory limit before being OOM
killed, which could impact host performance.

**Fix:** Align the two implementations. Document the rationale for 4x swap and
consider whether 2x is sufficient.

---

#### M-10. Dockerfile.judge-worker runs as root

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `Dockerfile.judge-worker:27-42`

**Explanation:** The judge worker Dockerfile does not add a non-root user or
`USER` directive. The worker process runs as root inside its container. While
the worker needs Docker access (via the socket proxy), running as root means
any vulnerability in the worker binary could be exploited with full container
privileges.

**Fix:** Add a non-root user and run the binary as that user. Docker socket
access can be granted via group membership.

---

#### M-11. Dockerfile.code-similarity and Dockerfile.rate-limiter-rs run as root

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `Dockerfile.code-similarity:17-25`, `Dockerfile.rate-limiter-rs:17-30`

**Explanation:** Neither Dockerfile includes a `USER` directive. The services
run as root unnecessarily -- they only need to bind a port and do computation.

**Fix:** Add `RUN adduser -D -s /bin/false app` and `USER app` to both.

---

#### M-12. Production docker-compose exposes `POSTGRES_PASSWORD` in environment

- **Severity:** Medium
- **Confidence:** High
- **Status:** Confirmed
- **File:** `docker-compose.production.yml:49,94`

**Explanation:** The PostgreSQL password is passed via environment variable
interpolation from `.env.production`. While this is standard Docker practice,
the password is visible in `docker inspect` output and `/proc/<pid>/environ`
on the host. The app service constructs `DATABASE_URL` with the password
inline in the environment block.

**Fix:** Use Docker secrets or a secrets manager for production deployments.
At minimum, document that `.env.production` must have restricted permissions.

---

### LOW

#### L-1. Judge language images use `USER judge` but worker overrides to `--user 65534:65534`

- **Severity:** Low
- **Confidence:** High
- **Status:** Confirmed
- **File:** `docker/Dockerfile.judge-python:9`, `judge-worker-rs/src/docker.rs:283`

**Explanation:** The judge Dockerfiles create a `judge` user and set `USER judge`.
But the worker's `docker run` command explicitly passes `--user 65534:65534`
(nobody). The `judge` user in the images has a different UID (typically 1000).
The `USER` directive in the Dockerfile is effectively ignored. This is harmless
but confusing -- developers might assume the `judge` user matters.

**Fix:** Either align the UIDs (make `judge` user UID 65534) or remove the
`USER` directive from the Dockerfiles since it is overridden.

---

#### L-2. `pids_limit` is the same for compile and run phases

- **Severity:** Low
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/docker.rs:249`

```rust
let pids_limit = if options.phase == Phase::Compile { "128" } else { "128" };
```

**Explanation:** The code has a conditional that returns "128" for both branches.
The comment says "VM-based languages spawn many threads even at runtime" but the
conditional is a no-op.

**Fix:** Either differentiate the limits or remove the dead conditional.

---

#### L-3. `now_ms()` in rate-limiter uses `as u64` truncation

- **Severity:** Low
- **Confidence:** Medium
- **Status:** Confirmed
- **File:** `rate-limiter-rs/src/main.rs:91-96`

```rust
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
```

**Explanation:** `as_millis()` returns `u128`. Casting to `u64` will truncate
after year ~584 million, which is not a real concern. However, `unwrap_or_default()`
silently returns 0 if the system clock is before the Unix epoch, which could
cause all rate limit windows to expire instantly.

**Fix:** This is acceptable; document the assumption that the system clock is sane.

---

#### L-4. IP allowlist does not support IPv6 CIDR

- **Severity:** Low
- **Confidence:** High
- **Status:** Confirmed
- **File:** `src/lib/judge/ip-allowlist.ts:50-68`

**Explanation:** `ipMatchesAllowlistEntry` only handles IPv4 dotted-quad addresses
and CIDR notation. If a judge worker connects over IPv6, the allowlist will not
match CIDR ranges (exact match still works).

**Fix:** Add IPv6 CIDR support or document the limitation.

---

#### L-5. `scripts/deploy-worker.sh` passes `AUTH_TOKEN` on command line

- **Severity:** Low
- **Confidence:** High
- **Status:** Confirmed
- **File:** `scripts/deploy-worker.sh:38`

**Explanation:** The `--token=<token>` argument is visible in process listings
(`ps aux`) on the machine running the script. The script does use `umask 077`
and writes to a temp file with restricted permissions, which is good.

**Fix:** Prefer reading the token from a file or stdin instead of a CLI argument.

---

#### L-6. `MAX_TIME_LIMIT_MS` read from env on every submission without caching

- **Severity:** Low
- **Confidence:** High
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/executor.rs:20-25`

```rust
fn max_time_limit_ms() -> u64 {
    std::env::var("MAX_TIME_LIMIT_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30_000)
}
```

**Explanation:** This reads and parses an environment variable on every test case
execution. While cheap, it should be parsed once at startup for consistency and
to avoid TOCTOU if the env var is somehow modified.

**Fix:** Move to `Config::from_env()` and store in the config struct.

---

#### L-7. Compiler orphan cleanup runs on a single-shot periodic basis only

- **Severity:** Low
- **Confidence:** Medium
- **Status:** Confirmed
- **File:** `judge-worker-rs/src/main.rs:394-397`

**Explanation:** Orphaned container cleanup runs every 300 seconds in the main
poll loop. If the worker crashes and restarts, orphaned containers from the
previous run will persist for up to 5 minutes. The TS compiler has a separate
cleanup function but it is not called on startup either.

**Fix:** Run cleanup once on startup before entering the poll loop.

---

#### L-8. Float comparison allows NaN == NaN

- **Severity:** Low
- **Confidence:** Medium
- **Status:** Needs-validation
- **File:** `judge-worker-rs/src/comparator.rs:133-146`

**Explanation:** When both expected and actual tokens parse as `f64`, the
comparison uses `(exp_val - act_val).abs()`. If both are `NaN`, the difference
is `NaN`, and `NaN <= abs_eps` is false, so `NaN` submissions are correctly
rejected (not accepted). However, if the expected output intentionally contains
"NaN" as a string and the actual also outputs "NaN", `f64::parse` succeeds for
both, the difference is `NaN`, and the comparison fails. This might be
unexpected for problems that expect NaN output.

**Fix:** Add a special case: if both parse to NaN, treat as equal (or document
that NaN comparison is not supported in float mode).

---

### INFO

#### I-1. Positive: Strong sandbox layering

The container sandboxing uses multiple independent defense layers:
- `--network=none` (no IP networking)
- `--cap-drop=ALL` (no Linux capabilities)
- `--security-opt=no-new-privileges` (no setuid escalation)
- `--read-only` rootfs with restricted tmpfs
- `--user 65534:65534` (nobody)
- `--pids-limit 128` (fork bomb protection)
- `--memory` and `--memory-swap` limits
- Custom seccomp profile (default deny)
- `--init` for zombie process reaping
- 4 MiB output truncation
- Source code size limits (256KB judge, 64KB compiler)

This is an excellent defense-in-depth design.

#### I-2. Positive: Atomic claim with `FOR UPDATE SKIP LOCKED`

The claim route uses PostgreSQL `FOR UPDATE SKIP LOCKED` with an atomic CTE
that simultaneously claims the submission and increments the worker's active
task count. This prevents double-claiming and race conditions elegantly.

#### I-3. Positive: Dead-letter persistence for failed result reports

When the worker cannot report results after 3 retries, it writes the result
to a dead-letter JSON file for manual recovery. This prevents submissions
from being permanently stuck in "judging" status with lost results.

#### I-4. Positive: Worker registration with per-worker secrets

The register/heartbeat/deregister lifecycle uses per-worker cryptographic
secrets (generated via `randomBytes(32)`) stored as SHA-256 hashes. This is
a good pattern that limits blast radius if a shared token is compromised.

#### I-5. Positive: Docker image validation prevents arbitrary image pulls

Both the Rust and TS implementations validate that Docker images must start
with `judge-` and optionally come from trusted registries. This prevents
a malicious language config from pulling `alpine:latest` or any arbitrary
image from Docker Hub.

#### I-6. Positive: Constant-time token comparison throughout

Auth tokens are compared using timing-safe comparison (`timingSafeEqual` in
Node.js, custom `constant_time_eq` in Rust). This prevents timing side-channel
attacks on token validation.

---

## Files Read

### judge-worker-rs/src/ (all files)
- `main.rs` -- Worker entry, poll loop, graceful shutdown, heartbeat
- `executor.rs` -- Submission execution pipeline, compile + run phases
- `docker.rs` -- Docker container management, seccomp, timeout, inspect
- `runner.rs` -- HTTP runner server for compiler/admin operations
- `api.rs` -- API client for app server communication
- `config.rs` -- Environment configuration parsing
- `types.rs` -- Type definitions, SecretString, Verdict enum
- `comparator.rs` -- Output comparison (exact and float)
- `languages.rs` -- Static language configuration (first 200 lines)
- `validation.rs` -- Docker image, extension, path validation

### rate-limiter-rs/src/
- `main.rs` -- Rate limiter service, token bucket with exponential backoff

### code-similarity-rs/src/
- `main.rs` -- Similarity service entry, axum router
- `similarity.rs` -- Source normalization, n-gram generation, Jaccard comparison
- `types.rs` -- Request/response types

### src/lib/judge/ (all files)
- `auth.ts` -- Judge Bearer token validation, per-worker auth
- `auto-review.ts` -- AI code review on accepted submissions
- `code-templates.ts` -- Default editor templates
- `dashboard-catalog.ts` -- Language catalog for admin dashboard
- `dashboard-data.ts` -- System snapshot (workers, languages)
- `docker-image-validation.ts` -- TS image validation
- `ip-allowlist.ts` -- Judge IP allowlist with CIDR
- `languages.ts` -- Language definitions, toolchain versions (first 200 lines)
- `status-labels.ts` -- Localized status labels
- `sync-language-configs.ts` -- DB language config sync on startup
- `verdict.ts` -- Verdict computation, metrics, result row building

### src/lib/compiler/
- `catalog.ts` -- Enabled compiler languages from DB
- `execute.ts` -- Docker-sandboxed compilation and execution

### src/lib/docker/
- `client.ts` -- Docker image management (local + remote worker)

### src/app/api/v1/judge/
- `claim/route.ts` -- Atomic submission claim with capacity gating
- `poll/route.ts` -- Result reporting (status updates + final verdicts)
- `heartbeat/route.ts` -- Worker heartbeat + stale sweep
- `register/route.ts` -- Worker registration with secret generation
- `deregister/route.ts` -- Worker deregistration + submission release

### src/app/api/v1/compiler/
- `run/route.ts` -- Compiler run endpoint

### src/app/api/v1/playground/
- `run/route.ts` -- Playground run endpoint

### src/app/api/v1/submissions/
- `route.ts` -- Submission list (GET) and create (POST)
- `[id]/route.ts` -- Single submission detail
- `[id]/rejudge/route.ts` -- Rejudge endpoint
- `[id]/events/route.ts` -- SSE status stream
- `[id]/comments/route.ts` -- Submission comments
- `[id]/queue-status/route.ts` -- Queue position

### src/lib/assignments/
- `code-similarity.ts` -- TS similarity implementation + DB storage
- `code-similarity-client.ts` -- Rust sidecar client

### Docker/Infrastructure
- `docker/seccomp-profile.json` -- Custom seccomp profile
- `docker/Dockerfile.judge-python` -- Sample judge image
- `docker/Dockerfile.judge-cpp` -- Sample judge image
- `docker/Dockerfile.judge-node` -- Sample judge image
- `docker/Dockerfile.judge-bash` -- Sample judge image
- `Dockerfile.judge-worker` -- Worker image
- `Dockerfile.code-similarity` -- Similarity service image
- `Dockerfile.rate-limiter-rs` -- Rate limiter image
- `docker-compose.worker.yml` -- Dedicated worker compose
- `docker-compose.yml` -- Development compose (language images)
- `docker-compose.production.yml` -- Production compose

### Scripts
- `scripts/deploy-worker.sh` -- Remote worker deployment
- `scripts/check-high-stakes-runtime.sh` -- Production config validation

## Files Skipped

- `tle-test.mjs`, `tle-test2.mjs` -- Stress test tools, not security-critical
- `scripts/sync-language-configs.ts` -- Thin wrapper, already covered via `sync-language-configs.ts` in judge lib
- `scripts/validate-enhance-*.mjs`, `scripts/fix-copyright.mjs` -- Utility scripts outside scope
- `judge-worker-rs/src/languages.rs` lines 201+ -- Repetitive language config definitions (first 200 lines reviewed for pattern)
- `src/lib/judge/languages.ts` lines 200+ -- Same as above, repetitive language definitions
- ~90 `docker/Dockerfile.judge-*` files -- Sampled 4 representative Dockerfiles (python, cpp, node, bash); all follow the same pattern

---

## Summary by Severity

| Severity | Count | Action Required |
|----------|-------|-----------------|
| Critical | 2     | Must fix before production |
| High     | 5     | Should fix soon |
| Medium   | 12    | Consider fixing |
| Low      | 8     | Optional improvements |
| Info     | 6     | Positive observations |

**Recommendation: REQUEST CHANGES** -- The two critical findings (heartbeat plaintext
secret comparison and unbounded request body on runner) must be addressed. The high
findings around authentication gaps in sidecar services and shell command inconsistencies
should be prioritized for the next security iteration.
