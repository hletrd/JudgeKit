# Debugger Review — Latent Bug Surface / Failure Modes (Cycle 1)

Date: 2026-06-30
Scope: entire repository
Summary: This review focuses on latent bugs, hard-to-reproduce failure modes, concurrency issues, resource leaks, and test/comment mismatches in the judge execution pipeline, compiler/runner code, deployment scripts, SSE realtime path, and supporting tests. Several findings are already remediated in the current working tree; the review notes both residual risks and the residual regression-test gaps.

Findings count: 10

---

## CRITICAL: SSE connection count leaks and stale-map inconsistency under eviction races (confidence: High)
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts` (lines 39-89, 287-294, 348-365)
- **Problem**: `addConnection` first adds to `activeConnectionSet` (line 72) and then to `connectionInfoMap`/`userConnectionCounts` (lines 73-74). If an error or early return occurs between the two mutations, or if `removeConnection` runs concurrently, the three structures drift. More importantly, `removeConnection` only decrements `userConnectionCounts` if the `connId` is still present in `connectionInfoMap` when it runs; if a connection is evicted from the map by the FIFO/stale pass but `activeConnectionSet` still contains it, `activeConnectionSet.size` can exceed the true count, and the per-user cap can under-count.
- **Failure scenario**: Under a burst of 500+ concurrent SSE clients, `addConnection` hits `MAX_TRACKED_CONNECTIONS` and evicts the oldest keys with `removeConnection`. The evicted IDs may still be live in-flight connection objects whose streams later call `close()` -> `removeConnection()` again. The second `removeConnection` finds no `info`, so `userConnectionCounts` is not decremented, eventually exhausting the per-user limit for legitimate users even when no real connections exist.
- **Suggested fix**: Store connection state in a single structure (e.g., one Map keyed by connId with `{ userId, createdAt, active }`). Make `addConnection` and `removeConnection` atomic with respect to each other. Add a unit test that simulates eviction + duplicate close and asserts `userConnectionCounts` returns to zero.
- **Cross-references**: `src/lib/submissions/events-stream-timers.ts` (test helper), `tests/unit/api/submissions.events.test.ts` (if any).

---

## CRITICAL: Shared SSE poll timer can stop while subscribers still exist (confidence: High)
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts` (lines 175-188)
- **Problem**: `unsubscribeFromPoll` deletes the submission key and stops the timer when `submissionSubscribers.size === 0`. Between `subs.delete(callback)` and `submissionSubscribers.size === 0` there is no lock. Two concurrent unsubscribes for the same submission can race: both see size 1, both delete, then the size becomes 0, but only one stops the timer. More importantly, `subscribeToPoll` starts the timer only if `!globalThis.__submissionEventsSharedPollTimer`. If a prior subscriber set the timer, a later subscriber does not restart it. If `unsubscribeFromPoll` stops the timer while another request is mid-subscribe but has not yet added its callback, the new subscriber will have no timer running.
- **Failure scenario**: Rapid subscribe/unsubscribe churn during a contest results in clients connected to a stream that never receives poll ticks, appearing to hang indefinitely. This is especially likely in tests that call `stopSharedPollTimer()` and then re-subscribe without guaranteeing a fresh start.
- **Suggested fix**: Protect subscribe/unsubscribe with a mutex or refactor to a single `start/stop` counter (`activeSubscriberCount`). Restart the timer whenever a subscriber is added and the timer is absent, and stop only when the count reaches zero. Add a regression test that alternates subscribe/unsubscribe and verifies the timer is running when at least one subscriber exists.
- **Cross-references**: `src/lib/submissions/events-stream-timers.ts`, `tests/unit/api/submissions.events.test.ts`.

---

## HIGH: Local compiler fallback timeout handling leaves containers alive after spawn errors (confidence: High)
- **File**: `src/lib/compiler/execute.ts` (lines 419-431, 467-473, 476-526)
- **Problem**: If `spawn("docker", args)` throws synchronously (line 421-424), `cleanup()` is invoked but it is async and returns a rejected promise only logged via `.catch`. If the Docker daemon is wedged and `spawn` fails because the CLI cannot connect, the container name may already exist from a previous partial run. The timeout timer is only created after `spawn` succeeds, so there is no bound on how long a wedged child can remain. The `stopContainer` call uses `spawn(... "stop", "-t", "0", ...)` without awaiting or timeout (line 318-324), so a stuck `docker stop` leaks a detached process.
- **Failure scenario**: A Docker daemon restart during a local-fallback judge run causes `spawn` to throw; the partially-created `compiler-<uuid>` container is never force-removed because `cleanupContainer` (`docker rm -f`) is fire-and-forget and may itself fail while dockerd is down. The container name persists and blocks future runs until `cleanupOrphanedContainers` runs.
- **Suggested fix**: In the synchronous spawn-error path, force-remove with a timeout and await it before throwing. Make `stopContainer` return a promise and cap it with a timeout. Add a test that mocks `spawn` throwing and verifies `cleanupContainer` is awaited.
- **Cross-references**: `tests/unit/compiler/execute.test.ts`, `src/lib/docker/client.ts`.

---

## HIGH: `tryRustRunner` response-shape validation omits `exitCode` and `executionTimeMs` type checks (confidence: Medium)
- **File**: `src/lib/compiler/execute.ts` (lines 586-608)
- **Problem**: The response-shape guard checks `stdout`, `stderr`, `timedOut`, and `oomKilled`, but accepts `exitCode` and `executionTimeMs` as optional/any-type. If the Rust sidecar returns a malformed `exitCode` (e.g., a string) or a negative `executionTimeMs`, the local fallback returns it verbatim, causing downstream `verdict.ts` or submission-result serialization to fail or misclassify.
- **Failure scenario**: A partial Rust runner crash returns JSON `{ stdout: "", stderr: "panic", timedOut: false, oomKilled: false, exitCode: "undefined" }`. `executeCompilerRun` returns `exitCode: "undefined"`, which later numeric comparisons treat as non-zero and mark a correct solution as wrong.
- **Suggested fix**: Validate `exitCode` is `number | null` and `executionTimeMs` is a non-negative finite number before accepting the runner response. Add a unit test for malformed numeric fields.
- **Cross-references**: `judge-worker-rs/src/runner.rs` `RunResponse`, `src/lib/judge/verdict.ts`.

---

## HIGH: Rust runner workspace `temp_dir` cleanup silently skipped if a child process holds the mount (confidence: Medium)
- **File**: `judge-worker-rs/src/runner.rs` (lines 747-925)
- **Problem**: `execute_run` creates a `tempfile::TempDir`, writes source files inside it, runs Docker with `--volume {workspace_dir}:...`, and relies on `temp_dir` being dropped at the end of scope to delete the directory. However, `docker run` mounts the host path; on Linux, you cannot remove a directory that is still a mount point inside a running container. If the container leaks (e.g., `docker run` hangs because dockerd is slow), the drop will fail silently (`TempDir` only logs on debug builds) and the workspace remains on disk.
- **Failure scenario**: A slow network pull or a stuck container keeps the workspace mount busy; the TempDir destructor returns `Err` but the runner continues. Repeated leaked submissions fill `/tmp` or the configured workspace base until disk pressure causes the worker to fail.
- **Suggested fix**: Explicitly `rm -rf` the workspace after waiting for the container to be removed, with a timeout and logging on failure. Add a metric or log line for workspace cleanup failures so operators can alert on it.
- **Cross-references**: `judge-worker-rs/src/docker.rs` `run_docker_once`, `tests` in `judge-worker-rs/src/runner.rs`.

---

## MEDIUM: `cleanupOrphanedContainers` parses `docker ps` JSON but ignores `Names` may be a list (confidence: Medium)
- **File**: `src/lib/compiler/execute.ts` (lines 871-951)
- **Problem**: The code assumes `parsed.Names` is the first (or only) container name. Docker's `{{json .}}` format emits `Names` as an array of strings when a container has multiple names or aliases. `parsed.Names` can therefore be an array; passing `[object Object]` or a comma-separated string to `docker rm -f` will fail.
- **Failure scenario**: A dev/test environment renames a compiler container or attaches an alias; `cleanupOrphanedContainers` cannot remove it, leading to false-positive "orphan" containers accumulating.
- **Suggested fix**: Use `--format '{{.ID}}'` or handle `Names` as a string/array and fall back to `.ID`. Add a test that feeds a multi-name container JSON line and verifies the correct name/ID is removed.
- **Cross-references**: `tests/unit/compiler/execute.test.ts`.

---

## MEDIUM: TS/Rust shell command validator divergence on env-prefixed commands (confidence: High)
- **File**: `src/lib/compiler/execute.ts` (lines 189-251), `judge-worker-rs/src/runner.rs` (lines 124-183)
- **Problem**: `executeCompilerRun` calls `validateShellCommandStrict` before delegating to the Rust runner. The strict validator splits on `&&` and `;`, then checks that the first token of each segment is in `ALLOWED_COMMAND_PREFIXES`. If an admin uses an environment prefix such as `HOME=/tmp mono /workspace/solution.exe` (a pattern the Rust unit test explicitly allows at `runner.rs:984-986`), the first token is `HOME=/tmp`, which is not in the allowlist. The local fallback rejects it, while the Rust runner accepts it. Conversely, the Rust `validate_shell_command` rejects `$1`/`$_` via `contains_shell_variable_expansion`, which only checks `$` followed by alphanumeric/`_`; the TS regex also catches `$` followed by digits via `$[A-Za-z0-9_]`. These are aligned enough to be safe, but the env-prefix case is a real behavioral split.
- **Failure scenario**: A legitimate language config like `CC=clang clang ...` works in production (Rust runner) but fails in local dev/fallback mode, causing confusing "Invalid compile command" errors that only appear when the sidecar is down.
- **Suggested fix**: Update `validateShellCommandStrict` to strip leading `KEY=VALUE` assignments before checking the command prefix, matching the Rust test's intent. Add a unit test for env-prefixed commands in `execute.test.ts`.
- **Cross-references**: `tests/unit/compiler/execute.test.ts`, `judge-worker-rs/src/runner.rs` tests.

---

## MEDIUM: `similarity-check` route abort timeout can leave DB write half-applied (confidence: Medium)
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (lines 43-65), `src/lib/assignments/code-similarity.ts` (implementation not fully inspected)
- **Problem**: The route arms a 30-second AbortController and clears it in `finally`. If the scan is aborted, the route returns `status: "timed_out"`, but `runAndStoreSimilarityCheck` may have already partially inserted similarity rows into the database before noticing the abort signal. The route then reports `submissionCount: null`, while the DB could contain a partial result set.
- **Failure scenario**: A large contest with 600 submissions triggers the 30 s timeout mid-write. The user sees "timed out" and re-runs the scan; the second run reads partial similarity data from the first run, producing inflated or incorrect flagged pairs.
- **Suggested fix**: Wrap the scan in a database transaction and pass the signal to `runAndStoreSimilarityCheck` so it can roll back on abort. Alternatively, delete partial similarity rows when an abort error is caught. Add an integration test that aborts mid-write and verifies the DB is clean.
- **Cross-references**: `src/lib/assignments/code-similarity.ts`, `tests/unit/api/similarity-check.route.test.ts`.

---

## LOW: `judge-worker-rs` orphan sweep can remove containers from in-flight tasks after worker restart (confidence: Medium)
- **File**: `judge-worker-rs/src/docker.rs` (lines 574-650), `judge-worker-rs/src/main.rs` (lines 503-517)
- **Problem**: `cleanup_all_oj_containers_at_startup` force-removes every `oj-*` container regardless of status. The startup sweep is wrapped in a shutdown `select!`, which is good, but there is no coordination with the claim/report loop. If a worker crashes and restarts while a previous process has an in-flight judgement whose container is still running, the startup sweep will kill that judgement; the previous process may then report a `runtime_error` based on the killed container, even though the judgement was valid.
- **Failure scenario**: Host OOM-kills the worker during a long-running submission. Docker keeps the `oj-*` container running. The worker restarts, reaps the container, and the (now stale) previous worker process reports an incorrect verdict.
- **Suggested fix**: This may be acceptable by design (a crashed worker cannot safely resume), but document the behavior and consider keeping a "generation" ID in the container name so a restarted worker only reaps containers from its own generation. Add a test or log assertion that startup sweep only removes containers older than the worker start time.
- **Cross-references**: `docs/judge-workers.md`, `judge-worker-rs/src/main.rs` startup sweep tests.

---

## LOW: `deploy-docker.sh` worker build preflight runs against `${WHOST}` before verifying SSH reachability (confidence: Medium)
- **File**: `deploy-docker.sh` (lines related to `preflight_docker_storage "worker ${WHOST}" _worker_ssh true` and `build judge-worker image on ${WHOST}`)
- **Problem**: The deploy script runs `preflight_docker_storage "worker ${WHOST}" _worker_ssh true` before building the worker image. If `${WHOST}` is unreachable or SSH key permissions are wrong, the preflight call hangs on SSH connection setup (default TCP timeout can be minutes) before the script reports a useful error. The preflight function itself has a timeout, but the SSH invocation underneath may not.
- **Failure scenario**: A misconfigured `SSH_PASSWORD` or wrong `WHOST` causes the deploy to hang for several minutes at the worker preflight step, blocking CI/CD and making failures hard to attribute.
- **Suggested fix**: Add an explicit quick SSH reachability check (e.g., `ssh -o ConnectTimeout=5 -o BatchMode=yes`) before the storage preflight, with a clear error message. Add a test that mocks an unreachable `WHOST` and verifies the script exits quickly.
- **Cross-references**: `tests/unit/infra/deploy-storage-safety.test.ts`, `scripts/deploy-worker.sh`.

---

## Final sweep
- **Skipped/needs manual validation**:
  - End-to-end behavior of the SSE route under high concurrency (requires running Next.js server and many concurrent clients).
  - Actual Docker daemon wedge behavior in local fallback path (requires a simulated broken Docker socket).
  - Rust worker behavior when a workspace temp directory cannot be removed (requires a mount-holding container).
  - Real-world `deploy-docker.sh` failure timing when `WHOST` is unreachable (requires a network partition test).
- **Commonly missed issues checked**: race conditions (SSE tracking, shared poll timer), resource leaks (containers, timers, workspaces), unhandled rejections (spawn error path), fallback logic (local fallback validation/env prefix), off-by-one errors (connection cap eviction), and test/comment mismatches (Rust/TS validator divergence).
- **Already remediated in current working tree** (not duplicated as new findings): HTTP/2 nginx syntax, deploy profile chmod-before-source, broad `client_max_body_size` removal, static-site `autoindex off`, IP X-Real-IP fallback fix, join route code-scoped rate limiting, similarity-check TA capability path, and execute.ts validation ordering before Rust runner delegation.
