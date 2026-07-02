# Latent-Bug Review — debugger perspective

**Scope:** `/tmp/judgekit-local` (Cycle 3 post-remediation)  
**Focus:** root causes, failure modes, regressions, edge cases, hidden leaks — resource leaks, cleanup failures, off-by-one/null/undefined handling, async/await hazards, timeout errors, subprocess zombies, temp-file leaks, permission/cleanup interactions.  
**Date:** 2026-07-03

## Executive Summary

Cycle 3 remediated most of the aggregate findings from Cycle 2, but one core cleanup fix is still broken in production: both the Node.js compiler fallback and the Rust judge worker attempt to `chown` sandbox-owned files back to the app/worker user before deletion, which fails when the process runs as a non-root user (the production configuration). The regression tests guard the root-only path and skip in the production-like non-root case, so the leak is not caught in CI. Beyond that, several medium/high issues remain around subprocess lifecycle, temp-directory permissions, backup restore memory pressure, and batch-delete semantics.

## Confirmed Issues

### 1. Workspace cleanup still leaks in production — Node.js local fallback relies on impossible `chown`

- **Files:** `src/lib/compiler/execute.ts:348-384`, `Dockerfile` (production app runs as `nextjs` uid 1001)
- **Severity:** CRITICAL
- **Confidence:** High
- **Problem:** `cleanupCompilerWorkspace` calls `chownRecursive(workspaceDir, appUid, appGid)` and then `rm(...)`. In production the app runs as `nextjs` (uid 1001). The sandbox container writes files as uid 65534 (`nobody`). A non-root process cannot `chown` files owned by another uid unless it holds `CAP_CHOWN`, which the production `Dockerfile` does not grant. The `chownRecursive` call therefore throws `EPERM`, logs a warning, and the subsequent `rm` fails because it cannot delete files owned by uid 65534.
- **Failure scenario:** Every local compiler fallback run in production leaves `/tmp/compiler-*` directories on disk. Over time `/tmp` fills up, causing new `mkdtemp` calls to fail with `ENOSPC` and breaking all submissions that fall back to local Docker execution.
- **Evidence:** `tests/unit/compiler/execute.test.ts:225-266` explicitly skips the sandbox-owned cleanup test when `process.getuid() !== 0`.
- **Suggested fix:** Run the cleanup container or a one-shot privileged sidecar with `--user root` (or `CAP_CHOWN`) to chown+rm the workspace. Alternatively, mount the workspace as a Docker volume and let a root-owned cleanup container remove it, or use `podman unshare`-style uid shifting if the runtime supports it. The current "chown then rm" logic only works when the app is root.

### 2. Workspace cleanup still leaks in production — Rust worker `SandboxWorkspace::drop` has the same flaw

- **Files:** `judge-worker-rs/src/workspace.rs:31-65`, `Dockerfile.judge-worker` (worker runs as `judge` uid 1000)
- **Severity:** CRITICAL
- **Confidence:** High
- **Problem:** `SandboxWorkspace::drop` calls `chown_recursive(&path, uid, gid)` where `uid/gid` come from `libc::getuid/getgid`. The worker image runs as non-root `judge` (uid 1000). Sandbox runs create files owned by uid 65534, so the recursive chown fails with `EPERM` and `remove_dir_all` cannot delete the tree.
- **Failure scenario:** Same as issue 1 but on the dedicated judge worker (`worker-0.algo.xylolabs.com`). Temporary workspace directories accumulate under `/tmp`, eventually exhausting disk space and causing all judging to fail.
- **Evidence:** `judge-worker-rs/src/workspace.rs:89-94` skips the sandbox-owned cleanup test when not root.
- **Suggested fix:** Same approach as issue 1 — run a privileged cleanup step. In Rust, consider spawning a short-lived `docker run --rm --user root -v <parent-tmp>:/work alpine chown -R <worker_uid> /work/<dir>` before `remove_dir_all`, or grant `CAP_CHOWN` to the worker process and keep the current logic.

### 3. `buildDockerImageLocal` leaves a running `docker build` process on timeout

- **Files:** `src/lib/docker/client.ts:320-372`
- **Severity:** HIGH
- **Confidence:** Medium
- **Problem:** On the 600 s timeout path the code calls `proc.kill()` (no signal argument → `SIGTERM`) and immediately resolves `{ success: false, error: "docker build timed out after 600s" }`. It does not wait for process exit, close stdio, or kill with `SIGKILL`. A `docker build` child may ignore `SIGTERM` for a long time or become orphaned, leaving the build running and consuming CPU/disk on the worker.
- **Failure scenario:** A long/hung image build hits the 600 s timeout. The API returns an error, but the `docker build` process continues in the background, possibly holding locks on the build context or producing intermediate layers until the next startup sweep or manual intervention.
- **Suggested fix:** Use `proc.kill("SIGKILL")` (or `proc.kill("SIGTERM")` followed by a short wait then `SIGKILL`), drain/destroy stdout/stderr, and call `proc.unref()` only after confirming the process has exited. Prefer `await once(proc, "close")` with a short grace period.

### 4. Backup restore keeps all uploaded files in memory before writing to disk

- **Files:** `src/lib/db/export-with-files.ts:267-349`, `src/app/api/v1/admin/restore/route.ts:82-124`
- **Severity:** HIGH
- **Confidence:** Medium
- **Problem:** `parseBackupZip` calls `entry.async("nodebuffer")` for every file in `uploads/` and stores the resulting `Buffer` objects in an in-memory array. The route already read the entire ZIP into memory as `Buffer.from(arrayBuffer)`. For a backup near the 512 MB decompressed limit with many uploaded files, the process can hold well over 1 GB of transient memory (ZIP buffer + extracted buffers + JSZip internal copies), risking OOM before the DB transaction even begins.
- **Failure scenario:** An admin restores a large backup. The Node process OOMs during `parseBackupZip`. The DB is untouched (transaction has not started), but the app container restarts and the operator gets no useful error message.
- **Suggested fix:** Stream uploads directly from the ZIP to disk in a staging directory, validate integrity incrementally (using the manifest checksums), and only after all files are staged and verified run the DB import. This removes the memory spike and also provides the atomic "stage-then-rename" behavior noted as deferred in `export-with-files.ts:366-367`.

### 5. Uploads directory created with overly permissive default mode

- **Files:** `src/lib/files/storage.ts:14-16`, `src/lib/files/storage.ts:27-30`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** `ensureUploadsDir()` calls `mkdir(..., { recursive: true })` without an explicit `mode`. The resulting directory permissions depend on the process umask (commonly `0o755`). Files inside are written with `0o600`, but directory listing is world-readable.
- **Failure scenario:** On a shared container host or if the data volume is mounted by another non-privileged container, another uid can list uploaded file names and infer upload activity, even though file contents are unreadable.
- **Suggested fix:** Create the directory with `mode: 0o700` so only the app user can list or access it.

### 6. `cleanupOldEvents` batch DELETE may not honor `LIMIT` under PostgreSQL optimization

- **Files:** `src/lib/db/cleanup.ts:45-63`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** The pruner uses `DELETE ... WHERE id IN (SELECT id FROM ... WHERE createdAt < cutoff LIMIT 5000)`. PostgreSQL's planner can flatten/simple-unfold the `IN (SELECT ... LIMIT)` subquery, causing the `LIMIT` to be discarded and the entire eligible set to be deleted in one statement. This risks long locks, WAL bloat, and replication lag on large tables.
- **Failure scenario:** The first run of the cleanup cron on a system with millions of old audit events deletes them all at once, blocking concurrent audit inserts for seconds to minutes and potentially filling the WAL.
- **Suggested fix:** Use `DELETE FROM auditEvents WHERE id IN (SELECT id FROM auditEvents WHERE createdAt < cutoff ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 5000)` or use Drizzle/drizzle-raw with `ctid` and explicit loop termination on `rowCount === 0`.

## Likely Issues

### 7. `withTimeout` + `cleanupWithTimeout` can leak timers if callers do not retain the combined signal

- **Files:** `src/lib/abort.ts:55-81`, `src/lib/docker/client.ts:178-191`, `src/lib/docker/client.ts:218-231`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** `withTimeout` stores the timer-cleanup function in a `WeakMap` keyed by the combined `AbortSignal`. `cleanupWithTimeout` needs that signal reference to clear the timer. If a caller obtains the combined signal but passes it directly to `fetch` and never calls `cleanupWithTimeout`, the timer keeps running until it fires. `docker/client.ts` does call `cleanupWithTimeout(signal)` in a `finally`, so the known call sites are safe. Future call sites may forget, and the API design makes the leak easy.
- **Failure scenario:** A future route composes a timeout signal for a long-running operation but omits the `finally { cleanupWithTimeout(...) }` call. Armed timers accumulate; each fires after its timeout even though the operation completed, wasting event-loop ticks and holding closures.
- **Suggested fix:** Return a disposable object (e.g., `{ signal, cleanup }`) or use `using`/`Symbol.dispose` so the cleanup is syntactically required. Alternatively, use `AbortSignal.timeout(ms)` directly when the source signal is not needed, which avoids a custom timer entirely.

### 8. `normalizeSource` leaks long unclosed string content after `MAX_STRING_LITERAL_LENGTH`

- **Files:** `src/lib/assignments/code-similarity.ts:69-95`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** When a string literal exceeds `MAX_STRING_LITERAL_LENGTH`, the inner `while` exits because `stringLength >= MAX`. The code then continues without checking whether it stopped at the closing delimiter. The remaining string characters are processed as ordinary code on subsequent iterations, so long string/blob content appears in the normalized output and pollutes the identifier-renaming map.
- **Failure scenario:** A submission embeds a 20 KB base64 blob inside a string literal. After truncation the remaining base64 characters are emitted as fake identifiers, increasing the n-gram set and causing false-negative similarity matches with other submissions that have different blobs.
- **Suggested fix:** When the loop exits due to length, scan to the end of the string (respecting escapes) without emitting the content, or emit a single sentinel placeholder. Ensure the loop always advances past the string.

### 9. `normalizeSource` strips line-start `#` lines that are not C preprocessor directives

- **Files:** `src/lib/assignments/code-similarity.ts:56-64`
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** A `#` at the start of a line is preserved only if `startsWithPreprocessorDirective` returns true. For Python, Ruby, Shell, or YAML submissions, `#` comments at line start are discarded, but so are any code tokens on the same line if the line happens to start with `#` and is not a recognized directive. Shebangs and pragma-like comments disappear. This is a latent correctness issue for similarity scoring across non-C languages.
- **Failure scenario:** Two Python solutions differ only in comments; the current code already strips `//` and `/* */` comments, so the bug is mostly cosmetic. However, a line like `# TODO: fix edge case` followed by real code on the same line cannot occur for Python because `#` starts a comment, but for other languages this branch may drop content unexpectedly.
- **Suggested fix:** Scope the preprocessor-preservation logic to known C-family languages, or document that `#` line stripping is intentional for similarity purposes.

### 10. `block_persists_when_system_clock_jumps_backward` logic relies on `Instant`, but `record_failure` recomputes wall-clock expiry

- **Files:** `rate-limiter-rs/src/main.rs:277-346`
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** Internal block decisions use monotonic `Instant`, which is correct. The `blocked_until` timestamp returned to callers is `now_unix_ms + block_duration`, where `now_unix_ms` is captured at the top of the handler. If the system clock is adjusted backward between computing the monotonic block and reading `now_unix_ms`, the returned timestamp can be earlier than it should be. The test only covers the monotonic side.
- **Failure scenario:** Around an NTP step, a client receives a `blocked_until` that is a few milliseconds too early. It retries slightly before the real block expires and gets a fresh "blocked" response. Operational but slightly confusing.
- **Suggested fix:** Return `now_unix_ms` at handler entry plus `blocked_until.saturating_duration_since(now_monotonic)` so both timestamps are anchored to the same instant.

## Risks Requiring Manual Validation

### 11. `AbortSignal.any` availability in the deployed Node.js runtime

- **Files:** `src/lib/assignments/code-similarity-client.ts:58`
- **Severity:** MEDIUM
- **Confidence:** Low
- **Problem:** `AbortSignal.any` was added in Node.js 20.3.0 / 18.17.0. The project targets Node.js 24 LTS, but if a production host runs an older interpreter or if a polyfilled environment is used, the similarity route will throw a runtime `TypeError`.
- **Validation:** Run `node --version` on `algo.xylolabs.com` and the CI image. Add a feature-test at startup or a fallback that implements `any` with `AbortController` + listeners.

### 12. `TRUSTED_PROXY_HOPS` default may be unset in production

- **Files:** `src/lib/security/ip.ts` (assumed, not re-read in this pass)
- **Severity:** HIGH
- **Confidence:** Low
- **Problem:** `extractClientIp` falls back to `0.0.0.0` (dev sentinel) when `TRUSTED_PROXY_HOPS` is not configured. Several rate-limit and audit paths key off this sentinel. If production nginx is not explicitly setting `TRUSTED_PROXY_HOPS`, rate limits will be keyed on `0.0.0.0`, allowing all clients to share a single bucket and effectively disabling per-IP throttling.
- **Validation:** Inspect production environment files and the generated nginx config for `TRUSTED_PROXY_HOPS`. Add an assertion at startup that refuses to start in production without a valid proxy-hop count when `NODE_ENV=production`.

### 13. Docker build context includes the entire repo root

- **Files:** `src/lib/docker/client.ts:310`, `judge-worker-rs` build endpoints (assumed)
- **Severity:** MEDIUM
- **Confidence:** Low
- **Problem:** `buildDockerImageLocal` passes `.` as the build context. If this function is ever invoked from the app server by mistake (despite `BUILD_WORKER_IMAGE=false`), it would transmit the entire application source tree and possibly secrets to the Docker daemon/buildkit.
- **Validation:** Confirm that app-server builds are disabled in `deploy-docker.sh` and that the worker host uses a narrow context. Consider validating that the context path is within `docker/`.

## Final Sweep — Commonly Missed Bug Surfaces

| Surface | Finding | Severity | Files |
|---|---|---|---|
| **Subprocess zombies** | `buildDockerImageLocal` does not wait for process exit after timeout; `stopContainer` uses `spawn` without waiting. | HIGH | `src/lib/docker/client.ts:347-372`, `src/lib/compiler/execute.ts:389-395` |
| **Temp-file leaks** | Confirmed: sandbox-owned workspace trees leak in production (issues 1 and 2). | CRITICAL | `src/lib/compiler/execute.ts:365-384`, `judge-worker-rs/src/workspace.rs:42-65` |
| **Timer leaks** | `withTimeout` requires explicit cleanup; known call sites are correct but API is fragile. | MEDIUM | `src/lib/abort.ts:55-81` |
| **Off-by-one / loop exit** | `normalizeSource` can re-emit truncated string content. | MEDIUM | `src/lib/assignments/code-similarity.ts:69-95` |
| **Null/undefined** | `callWorkerJson` response JSON parse failure path throws generic error; no structured code. | LOW | `src/lib/docker/client.ts:197-199` |
| **Async/await hazards** | `parseBackupZip` holds all file buffers in memory; crash before DB import leaves no audit but consumes memory. | HIGH | `src/lib/db/export-with-files.ts:267-349` |
| **Permission/cleanup interaction** | `ensureUploadsDir` uses default umask-dependent permissions. | MEDIUM | `src/lib/files/storage.ts:14-16` |
| **Batch-delete semantics** | `cleanupOldEvents` `LIMIT` inside `IN` subquery may be ignored by PostgreSQL. | MEDIUM | `src/lib/db/cleanup.ts:45-63` |
| **Timeout errors** | Similarity-check route only surfaces `AbortError` as `timed_out`; other errors become 500. This is intentional but means sidecar `SIDECAR_HTTP_ERROR` is not distinguishable to callers. | LOW | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:51-67` |
| **Abort composition** | `code-similarity-client.ts` correctly composes caller signal with sidecar timeout; no leak found there. | — | `src/lib/assignments/code-similarity-client.ts:51-113` |

## Recommendations

1. **Fix workspace cleanup for non-root production users** (issues 1 and 2) before the next deploy. This is the only CRITICAL item and will cause production outages if local fallback or the Rust worker is exercised heavily.
2. Harden `buildDockerImageLocal` subprocess teardown (issue 3).
3. Stream backup uploads to disk instead of materializing them in memory (issue 4).
4. Tighten uploads directory permissions to `0o700` (issue 5).
5. Rewrite the event pruner to use a stable batched delete pattern (issue 6).
6. Add runtime validation for `TRUSTED_PROXY_HOPS` in production and `AbortSignal.any` availability.

## Notes on Prior Findings

- Cycle 2 aggregate items related to nginx `client_max_body_size`, `X-Forwarded-For` trust, CSRF allowed-hosts, millisecond-precision token revocation, rate-limiter monotonic clock, similarity-check serialization, and Docker network segmentation are all validated as implemented in the current tree.
- The workspace-leak "fix" added in Cycle 3 works only when the process is root. The regression tests correctly document this limitation by skipping on non-root, but production runs non-root, so the fix is incomplete.
