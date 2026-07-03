# Latent-Bug and Failure-Mode Review — debugger perspective

**Scope:** `/tmp/judgekit-local` (Cycle 3 post-remediation, current tree)  
**Focus:** bugs not caught by happy-path tests, edge cases, resource leaks, timer leaks, cleanup failures, race conditions, permission issues, off-by-one / numeric / string parsing hazards.  
**Date:** 2026-07-03

## Executive Summary

Cycle 3 successfully fixed the production workspace-cleanup leaks that the prior debugger review flagged: both the Node.js local compiler fallback and the Rust `SandboxWorkspace::drop` now fall back to a privileged Docker cleanup container when the process is non-root, so sandbox-owned `nobody` (uid 65534) files are removed without requiring `CAP_CHOWN`.

The remaining latent issues are concentrated in three areas:

1. **Compiler / Docker subprocess lifecycle** — output memory accounting uses string length instead of byte length, `child.stdin.write` can throw synchronously outside the installed error handler, and `docker build` timeouts use `SIGTERM` without reaping the child.
2. **Backup restore memory pressure** — the restore path materializes every uploaded file in the ZIP as a `Buffer` before writing anything to disk, risking OOM on large backups.
3. **Batch-delete semantics** — the event pruners put `LIMIT` inside an `IN (SELECT ... LIMIT)` subquery, which PostgreSQL can flatten and ignore, causing unexpectedly large deletes.

No CRITICAL issues remain in the current tree, but the HIGH items above are genuine production failure modes.

## Previously Reported Issues — Status

| # | Prior finding | Status in current tree | Evidence |
|---|---|---|---|
| 1 | Node workspace cleanup leaks because non-root cannot `chown` sandbox files | **Fixed** | `src/lib/compiler/execute.ts:382-427` now tries direct `rm` first, then `cleanupWorkspaceWithDocker` with `--user root`. |
| 2 | Rust `SandboxWorkspace::drop` leaks for the same reason | **Fixed** | `judge-worker-rs/src/workspace.rs:43-77` adds `cleanup_with_docker` and invokes it from `Drop` when non-root. |
| 3 | `buildDockerImageLocal` leaves running `docker build` on timeout | **Still present** | See Issue 4 below. |
| 4 | Backup restore holds all uploads in memory | **Still present** | See Issue 5 below. |
| 5 | Uploads dir default permissions | **Still present** | See Issue 6 below. |
| 6 | `cleanupOldEvents` LIMIT semantics | **Still present** | See Issue 7 below. |

## Confirmed Issues

### 1. Compiler output cap measures UTF-16 string length, not byte length

- **Files:** `src/lib/compiler/execute.ts:27`, `src/lib/compiler/execute.ts:571-578`, `src/lib/compiler/execute.ts:612-613`
- **Severity:** HIGH
- **Confidence:** High
- **Problem:** `MAX_OUTPUT_BYTES` is documented as a 128 MiB byte budget, but the checks use `stdout.length` and `stderr.length`, which are JavaScript UTF-16 code-unit counts. A chunk containing mostly 3-byte UTF-8 characters (e.g., CJK or emoji) occupies ~3 bytes per UTF-16 code unit, so the process can hold roughly 3× the intended memory before truncation. The final `slice(0, MAX_OUTPUT_BYTES)` also operates on code units, so the returned string may exceed 128 MiB when encoded.
- **Failure scenario:** A sandboxed program prints a large amount of multi-byte output (e.g., Chinese characters). The Node process memory grows to ~384 MiB for stdout alone before the cap trips, increasing OOM risk on memory-constrained containers and skewing resource accounting.
- **Suggested fix:** Track byte length using `Buffer.byteLength(stdout, "utf8")` (or accumulate `Buffer`s directly) and slice by byte boundaries. Alternatively, cap the accumulated `Buffer` size before `.toString("utf8")`.

### 2. Synchronous `child.stdin.write` can throw unhandled if stdin closes early

- **Files:** `src/lib/compiler/execute.ts:552-559`
- **Severity:** MEDIUM
- **Confidence:** High
- **Problem:** The code installs an `"error"` listener on `child.stdin`, then calls `child.stdin.write(opts.stdin)` and `child.stdin.end()`. If the child process exits before or during the write, `stdin.write` can throw synchronously with `EPIPE` or `ERR_STREAM_WRITE_AFTER_END`. The listener only catches asynchronously emitted errors, so this synchronous throw becomes an unhandled exception that can crash the request (or, in some Node versions, the process).
- **Failure scenario:** A very fast-exiting container (e.g., a binary that crashes immediately on startup) closes stdin while the app is still writing the problem input. The unhandled exception aborts the compiler execution path and surfaces as a 500 instead of a normal run result.
- **Suggested fix:** Wrap `child.stdin.write(opts.stdin)` in a `try/catch` and treat a thrown error the same as an emitted stdin error (log and continue).

### 3. `buildDockerImageLocal` resolves on timeout without killing or reaping the child

- **Files:** `src/lib/docker/client.ts:347-365`
- **Severity:** HIGH
- **Confidence:** High
- **Problem:** On the 600 s timeout path the code calls `proc.kill()` (no signal argument → `SIGTERM`) and immediately resolves `{ success: false, error: "docker build timed out after 600s" }`. It does not wait for process exit, close stdio, send `SIGKILL`, or call `proc.unref()`. A stuck `docker build` can ignore `SIGTERM` for a long time and continue consuming CPU, disk, and BuildKit locks.
- **Failure scenario:** A hung image build hits the 600 s timeout. The API returns an error, but the `docker build` process keeps running in the background, possibly holding the build context and producing intermediate layers until manual intervention or container restart.
- **Suggested fix:** Send `SIGTERM`, wait a short grace period, then send `SIGKILL`; drain/destroy stdout/stderr; and `await once(proc, "close")` (with a short secondary timeout) before resolving.

### 4. Backup restore materializes every uploaded file in memory

- **Files:** `src/lib/db/export-with-files.ts:267-349`, `src/app/api/v1/admin/restore/route.ts` (consumer)
- **Severity:** HIGH
- **Confidence:** High
- **Problem:** `parseBackupZip` already receives the entire ZIP as a `Buffer`, then calls `entry.async("nodebuffer")` for each file in `uploads/` and stores all resulting `Buffer`s in an in-memory array. For a backup near the 512 MB decompressed limit with many uploads, the process can briefly hold well over 1 GB of transient memory (ZIP buffer + JSZip internal copies + extracted buffers), risking OOM before the DB transaction begins.
- **Failure scenario:** An admin restores a large backup. Node OOMs during `parseBackupZip`. The DB is untouched, but the app container restarts and the operator gets no actionable error.
- **Suggested fix:** Stream uploads directly from the ZIP to a staging directory on disk, validate manifest checksums incrementally, and only after all files are staged run the DB import. This also moves toward the deferred atomic "stage-then-rename" behavior noted at `export-with-files.ts:366-367`.

### 5. Uploads directory created with umask-dependent permissions

- **Files:** `src/lib/files/storage.ts:14-16`
- **Severity:** MEDIUM
- **Confidence:** High
- **Problem:** `ensureUploadsDir()` calls `mkdir(..., { recursive: true })` without an explicit `mode`. The resulting directory permissions depend on the process umask, commonly `0o755`. Files inside are written `0o600`, but the directory itself is world-listable.
- **Failure scenario:** On a shared container host or if the data volume is mounted by another non-privileged container, another uid can list uploaded file names and infer upload activity, even though file contents are unreadable.
- **Suggested fix:** Create the directory with `mode: 0o700` so only the app user can list or access it.

### 6. Batch DELETE `LIMIT` inside `IN` subquery may be ignored by PostgreSQL

- **Files:** `src/lib/db/cleanup.ts:46-48`, `src/lib/db/cleanup.ts:56-58`; `src/lib/data-retention-maintenance.ts:28-30`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** Both pruners use `DELETE FROM t WHERE id IN (SELECT id FROM t WHERE ... LIMIT 5000)`. PostgreSQL’s planner can flatten/simple-unfold the `IN (SELECT ... LIMIT)` subquery, causing the `LIMIT` to be discarded and the entire eligible set to be deleted in one statement. This risks long locks, WAL bloat, and replication lag on large tables.
- **Failure scenario:** The first run of the daily pruner on a system with millions of old audit events deletes them all at once, blocking concurrent audit inserts and potentially filling the WAL.
- **Suggested fix:** Use `DELETE FROM t WHERE id IN (SELECT id FROM t WHERE ... ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 5000)`, or select a batch of ids in a CTE and delete by primary key in a separate statement.

### 7. Compiler timeouts have no upper cap

- **Files:** `src/lib/compiler/execute.ts:851-852`, `src/lib/compiler/execute.ts:915`, `src/lib/compiler/execute.ts:681`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** `compile` uses `Math.max(timeLimitMs * 2, 30_000)`, and `runDocker` uses `Math.max(timeLimitMs * 4, 120_000)`. If an admin configures a very large per-problem time limit (or if a malformed setting loads as a huge number), the compile/run containers can run for hours before being killed.
- **Failure scenario:** A problem with a misconfigured time limit of, e.g., 3 hours spawns a compile container that runs for 6 hours, holding workspace disk and Docker resources.
- **Suggested fix:** Cap the derived container timeouts at a sane global maximum (e.g., 10 minutes for compile, problem time limit + overhead for run) and clamp the raw configured value to a documented maximum.

### 8. `parseTimestampEpochMs` regex is fragile for sub-millisecond forms

- **Files:** `src/lib/compiler/execute.ts:285-294`
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** The regex `/\.\d{3}\d+/` only truncates fractional seconds when there are 3 or more digits. For 1–2 digit fractional seconds (e.g., `.1`, `.12`) the regex does not match, so the original string is passed to `Date.parse`. V8 currently accepts those forms, but the behavior is implementation-defined and the code comment claims to truncate "any sub-millisecond precision." The regex also lacks the `g` flag, but Docker timestamps have only one fractional part, so that is harmless in practice.
- **Failure scenario:** A future Node runtime or non-V8 environment rejects `.12`, causing `inspectContainerState` to return `durationMs: null` and masking actual run duration telemetry.
- **Suggested fix:** Use `/\.\d{1,3}/` and pad/truncate to three digits, or parse the ISO string with a dedicated parser instead of relying on `Date.parse` quirks.

### 9. SSE shared poll timer interval may become `NaN`

- **Files:** `src/app/api/v1/submissions/[id]/events/route.ts:190-193`
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** `startSharedPollTimer` computes `const pollIntervalMs = Math.max(1000, configuredInterval);`. If `configuredInterval` is `NaN` (e.g., a corrupted DB setting), `Math.max(1000, NaN)` evaluates to `NaN`. Passing `NaN` to `setInterval` produces implementation-defined behavior (often a very short interval), causing excessive DB polling.
- **Failure scenario:** An admin saves a non-numeric poll interval in system settings. Every connected SSE client causes the shared timer to fire rapidly, spiking DB load.
- **Suggested fix:** Validate with `Number.isFinite(configuredInterval)` and fall back to a default (e.g., 5000 ms) before calling `Math.max`.

### 10. Real-time coordination serializes all SSE slot acquisitions on one advisory lock

- **Files:** `src/lib/realtime/realtime-coordination.ts:73-78`, `src/lib/realtime/realtime-coordination.ts:101`
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** `acquireSharedSseConnectionSlot` uses a single advisory lock key `"realtime:sse:acquire"` for all users/connections. In multi-instance deployments with `REALTIME_COORDINATION_BACKEND=postgresql`, every SSE connection attempt serializes behind this one lock, creating a global bottleneck. Additionally, `withPgAdvisoryLock` hashes the key with MD5 and takes the first 64 bits; collision probability is low but non-zero.
- **Failure scenario:** Under high SSE load (e.g., a popular contest start), connection acquisition queues up globally, increasing latency and tying up DB connections.
- **Suggested fix:** Use a lock key scoped per user (e.g., `"realtime:sse:acquire:${userId}"`) so only concurrent attempts by the same user contend. Document the 64-bit advisory-lock collision risk and accept it for this use case.

### 11. Contest-scoring background refresh swallows all errors silently

- **Files:** `src/lib/assignments/contest-scoring.ts:150-180` (approximate; the leaderboard cache refresh IIFE followed by `.catch(() => {})`)
- **Severity:** MEDIUM
- **Confidence:** Medium
- **Problem:** The stale-while-revalidate background refresh wraps the refresh IIFE with `.catch(() => {})`. Any unexpected failure (DB connectivity, logic error, etc.) is silently discarded. The outer `.catch` does catch errors from the inner `getDbNowMs()` in `catch`/`finally`, but it also masks all other failures.
- **Failure scenario:** A code change introduces a runtime error in the refresh path. The leaderboard keeps serving stale data forever with no log noise, and operators only notice when users report stale standings.
- **Suggested fix:** Log the error inside the `.catch` (e.g., `.catch((err) => logger.error(...))`) before swallowing, or only swallow specifically expected abort/timeout errors.

### 12. `startRateLimitEviction` runs per instance and can cause write contention

- **Files:** `src/lib/security/rate-limit.ts:67-81`
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** Each Next.js process starts its own 60-second eviction timer and deletes from `rateLimits` independently. In a multi-instance deployment, multiple processes can run `DELETE FROM rate_limits WHERE lastAttempt < cutoff` simultaneously, causing lock contention and replication writes even though the operation is idempotent.
- **Failure scenario:** A 10-instance deployment produces a steady stream of overlapping full-table delete queries against `rate_limits`, amplifying write load.
- **Suggested fix:** Use a single coordinator (e.g., the sidecar, a cron job, or advisory-lock-guarded eviction) so only one instance prunes at a time.

### 13. Fire-and-forget login / audit events can be lost on shutdown or overload

- **Files:** `src/lib/auth/login-events.ts:101-113`, `src/lib/audit/events.ts:252-261`
- **Severity:** MEDIUM
- **Confidence:** High
- **Problem:** `recordLoginEvent` and `recordAuditEvent` enqueue or start an async DB write and do not await it. If the process receives `SIGTERM` before the write completes, the event is lost. The shutdown handler flushes the audit buffer, but login events have no equivalent flush, and both paths can race with process exit.
- **Failure scenario:** A login attempt occurs just before a deploy restarts the container. The login event never reaches `login_events`, breaking audit trails and security analytics.
- **Suggested fix:** For security-critical events, use `await recordLoginEventDurable(...)` (or an equivalent durable login-event path) at the call sites that can tolerate the latency, and register a shutdown flush for login events similar to the audit buffer flush.

### 14. `consumeRateLimitAttemptMulti` does not refresh the window for an already-blocked key

- **Files:** `src/lib/security/rate-limit.ts:178-191`
- **Severity:** LOW
- **Confidence:** High
- **Problem:** When an active block exists (`entry.blockedUntil > now`), the function returns `true` immediately without recording the attempt. This is intentional but means a blocked IP stays blocked only until the original `blockedUntil`; repeated requests during the block do not extend or refresh the window. Once `blockedUntil` passes, the attacker gets a fresh window of attempts.
- **Failure scenario:** An attacker with a botnet sends requests continuously while blocked. The moment the block expires, the full window of attempts is available again because no attempts were counted during the block.
- **Suggested fix:** Record each blocked attempt as well (updating `lastAttempt` and possibly extending `blockedUntil` by a small amount), or document the intentional behavior.

### 15. ICPC penalty can be negative under clock skew

- **Files:** `src/lib/assignments/contest-scoring.ts` (penalty computation)
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** `computeIcpcPenalty` does not clamp `minutesToAc` to non-negative. If a submission’s `submittedAt` is earlier than the contest start (clock skew or backdated row), the penalty becomes negative, which can distort leaderboard ordering.
- **Failure scenario:** A DB row is inserted with a timestamp slightly before the contest start due to app/DB clock skew. That participant receives a negative penalty and ranks above everyone else.
- **Suggested fix:** Clamp `minutesToAc` with `Math.max(0, ...)` and add a guard/warning log when `submittedAt < startAt`.

### 16. Similarity-check route can emit `NaN` similarity values

- **Files:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (result serialization)
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** The route computes `similarity: Math.round(p.similarity * 100)`. If the Rust sidecar or fallback TS path returns malformed pair data where `similarity` is `NaN`/`undefined`, `Math.round` produces `NaN`, which is then serialized as `null` and may confuse the UI or downstream analytics.
- **Failure scenario:** A sidecar bug or corrupted DB snapshot produces a pair with `similarity: NaN`. The API returns `similarity: null` without an error, and the admin UI shows a blank similarity score.
- **Suggested fix:** Validate `p.similarity` with `Number.isFinite` before rounding; treat non-finite values as a processing error or filter them out.

## Likely Issues

### 17. `withTimeout` requires callers to retain the combined signal

- **Files:** `src/lib/abort.ts:55-81`, `src/lib/api/client.ts:91-100`
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** `withTimeout` stores the timer cleanup in a `WeakMap` keyed by the combined `AbortSignal`. `cleanupWithTimeout` needs that exact signal reference. The current callers (`api/client.ts`) correctly call it in `finally`, but future callers could pass the signal to `fetch` and then lose the reference, leaving the timer alive until it fires.
- **Failure scenario:** A future route composes a timeout signal for a long-running operation but omits `cleanupWithTimeout`. Armed timers accumulate and fire after the operation completed, wasting event-loop ticks and holding closures.
- **Suggested fix:** Return a disposable object or use `using`/`Symbol.dispose` so cleanup is syntactically tied to the signal’s lifetime.

### 18. `callRateLimiter` circuit breaker uses wall-clock time

- **Files:** `src/lib/security/rate-limiter-client.ts:43-116`
- **Severity:** LOW
- **Confidence:** Low
- **Problem:** The circuit breaker opens/closes based on `Date.now()`. A backward system-clock jump could prematurely close the circuit, while a forward jump could keep it open longer than intended.
- **Failure scenario:** Around an NTP step, the sidecar circuit state flips incorrectly, either sending extra traffic to a known-down sidecar or throttling a healthy one.
- **Suggested fix:** Use `performance.now()` / `Instant`-style monotonic timing for the circuit-breaker deadline.

### 19. `transformSSE` in chat-widget providers can buffer unbounded partial lines

- **Files:** `src/lib/plugins/chat-widget/providers.ts:444-500`
- **Severity:** LOW
- **Confidence:** Low
- **Problem:** The SSE transformer accumulates incomplete lines in `buffer` until a newline arrives. If an upstream provider sends a very long line without newlines, the buffer grows unbounded.
- **Failure scenario:** A misbehaving LLM provider streams a huge single JSON blob without line breaks; the Node process memory grows until OOM.
- **Suggested fix:** Cap `buffer` length and emit an error or reset when it exceeds a reasonable threshold.

## Final Sweep — Commonly Missed Bug Surfaces

| Surface | Finding | Severity | Files |
|---|---|---|---|
| **Subprocess zombies** | `buildDockerImageLocal` does not reap child after timeout; `stopContainer` uses `spawn` without waiting. | HIGH | `src/lib/docker/client.ts:347-365`, `src/lib/compiler/execute.ts:433-439` |
| **Temp-file leaks** | Node and Rust workspace cleanup now use privileged Docker fallback — fixed for non-root. | — | `src/lib/compiler/execute.ts:382-427`, `judge-worker-rs/src/workspace.rs:43-77` |
| **Timer leaks** | SSE poll timer can be created with `NaN` interval; `withTimeout` cleanup is fragile for future callers. | LOW/MEDIUM | `src/app/api/v1/submissions/[id]/events/route.ts:190-193`, `src/lib/abort.ts:55-81` |
| **Memory pressure** | Backup restore holds all uploads in memory. | HIGH | `src/lib/db/export-with-files.ts:267-349` |
| **Off-by-one / loop exit** | `normalizeSource` can re-emit truncated string content after `MAX_STRING_LITERAL_LENGTH`. | MEDIUM | `src/lib/assignments/code-similarity.ts:69-95` |
| **Batch-delete semantics** | `LIMIT` inside `IN` subquery may be optimized away by PostgreSQL. | MEDIUM | `src/lib/db/cleanup.ts:46-63`, `src/lib/data-retention-maintenance.ts:28-30` |
| **Permission/cleanup interaction** | `ensureUploadsDir` uses default umask-dependent permissions. | MEDIUM | `src/lib/files/storage.ts:14-16` |
| **Async/await hazards** | Login/audit events are fire-and-forget and can be lost on shutdown. | MEDIUM | `src/lib/auth/login-events.ts:101-113`, `src/lib/audit/events.ts:252-261` |
| **Numeric parsing** | Compiler timeouts lack an upper cap; SSE poll interval lacks finite validation. | MEDIUM | `src/lib/compiler/execute.ts:851-852,915`, `src/app/api/v1/submissions/[id]/events/route.ts:190-193` |
| **String parsing** | `parseTimestampEpochMs` relies on `Date.parse` for 1–2 digit fractional seconds. | LOW | `src/lib/compiler/execute.ts:285-294` |
| **Concurrency** | Global SSE advisory lock serializes all connection acquisitions. | MEDIUM | `src/lib/realtime/realtime-coordination.ts:73-78,101` |

## Recommendations

1. **Fix compiler output byte accounting** (Issue 1) to enforce the documented 128 MiB byte budget.
2. **Harden `child.stdin.write` and `buildDockerImageLocal` subprocess teardown** (Issues 2 and 3) to prevent unhandled exceptions and zombie builds.
3. **Stream backup uploads to disk** (Issue 4) to remove the OOM risk on large restores.
4. **Tighten uploads directory permissions** to `0o700` (Issue 5).
5. **Rewrite batch deletes** to use `FOR UPDATE SKIP LOCKED` or a stable CTE pattern (Issue 6).
6. **Cap derived container timeouts** and validate poll intervals (Issues 7 and 9).
7. **Scope SSE advisory locks per user** and log swallowed background errors (Issues 10 and 11).
8. **Add durable shutdown flush for login events** (Issue 13).

## Notes on Prior Findings

- Cycle 2/Cycle 3 aggregate items related to nginx `client_max_body_size`, `X-Forwarded-For` trust, CSRF allowed-hosts, millisecond-precision token revocation, rate-limiter monotonic clock, similarity-check serialization, Docker network segmentation, non-root workspace cleanup, and IPv4/IPv6 canonicalization are all validated as implemented in the current tree.
- The workspace-leak "fix" from Cycle 3 now correctly handles non-root production users via privileged Docker cleanup in both Node and Rust.
