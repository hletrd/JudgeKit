# Cycle 3 — debugger

Scope: latent-bug / failure-mode / regression review of JudgeKit at head
`207623f9`. Three jobs: (1) REGRESSION-check the 14 cycle-2 Phase A fixes
against the specific edge cases the mission named; (2) FAILURE-MODE analysis
of the restore/import, judge-execution, and SSE pipelines; (3) hunt NET-NEW
latent bugs.

Evidence basis: full read of every cited file at the cited lines; cross-check
of the Rust worker (`docker.rs`, `executor.rs`, `main.rs`), the restore/import
routes, the import engine, the SSE events route, the judge `/claim` route, the
IP extraction + allowlist, the recruiting-token path, and the audit helpers.
The prior cycle-2 debugger review (`.context/reviews/debugger.md` at
`ad543e14`) is the baseline; items closed this cycle are marked, items that
still reproduce are re-confirmed.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: HIGH / MED / LOW.
Status tag: **REGRESSION** (introduced or left open by a cycle-2 fix),
**REPRODUCES** (Phase B item confirmed still real at head), **CONFIRMED-FIXED**
(closed by a cycle-2 change), **NET-NEW**.

---

## EXECUTIVE SUMMARY

The two highest-priority cycle-2 debugger items (R1/F2 durable restore audit,
DBG-2 cleanup timeouts) are **CONFIRMED-FIXED** — the restore audit is now
`await recordAuditEventDurable(...)`, moved to after `restoreParsedBackupFiles`,
with a dedicated `database_restore_files_failed` durable failure audit; and
`inspect_container_state`/`kill_container`/`remove_container` are all wrapped
in `tokio::time::timeout(Duration::from_secs(10))`.

The cycle-2 fixes, however, opened two **REGRESSION**-class residual leaks in
the Rust worker cleanup path that the mission specifically asked about, plus
the compiler 0o700 hardening is only half-applied. The restore/import
atomicity gap (F1) and the SSE re-auth hole (NEW-M2) still reproduce. No
CRITICAL data-loss regression was found in the cycle-2 surface.

**Top action items, ranked:**
1. **R2** (HIGH) — Rust orphan sweep only reaps `status=exited`; a running
   `oj-*` container whose `kill`/`rm` timed out is leaked indefinitely.
   Pair with R4 (`kill_on_drop`) for a complete fix.
2. **R1** (MEDIUM) — compiler `execute.ts` chown-FAILURE branch still
   `chmod 0o777/0o666`; A9 hardened only the success branch.
3. **F1** (MEDIUM, REPRODUCES) — `restoreParsedBackupFiles` non-atomic writes;
   partial uploads persist on failure after DB commit.
4. **F3** (MEDIUM, REPRODUCES) — SSE re-auth does not re-run
   `canAccessSubmission`; revoked group access keeps streaming.
5. **R3** (LOW/MED) — `inspect_container_state` timeout returns
   `oom_killed:false`, masking a real OOM in the verdict.

---

## REGRESSION — cycle-2 Phase A fixes (mission edge cases)

### R1 — A9 compiler 0o700 hardening ONLY covers the chown-success branch; chown-failure still world-writable (MEDIUM / confidence HIGH / REGRESSION)
- Fix commit: `594f89b0` · File: `src/lib/compiler/execute.ts:739-757`
- The mission asked: *"0o700: does chown still succeed before chmod? what if
  chown fails?"*
- A9 correctly hardens the **success** branch: after `chown(workspaceDir,
  SANDBOX_UID, SANDBOX_GID)` + `chown(sourcePath, …)` it sets `0o700`/`0o600`
  (L746-747). **But the `catch` fallback (L755-756) is unchanged at
  `chmod(workspaceDir, 0o777)` + `chmod(sourcePath, 0o666)`** — exactly the
  pre-A9 behavior. So the world-readable/writable window the fix targeted
  persists for every deployment where the compiler process lacks `CAP_CHOWN`
  (rootless dev containers, macOS local fallback, any non-root app server).
- Note the Rust mirror (`executor.rs:331-360`) behaves identically —
  `target_mode = if chown_ok { 0o700 } else { 0o777 }` — so the two are
  consistent and the broad fallback is intentional (without `CAP_CHOWN` there
  is no other way to grant uid-65534 write access). The residual risk is
  therefore **accepted by design**, not an oversight; it is restated here
  because the cycle-2 plan (A9) claimed to "mirror the Rust 0o700/0o600
  hardening" and DBG-4 was only partially closed.
- **Partial-failure sub-case (LOW/MED)**: if `chown(workspaceDir)` succeeds
  (L740) but `chown(sourcePath)` throws (L741), control enters the catch with
  `workspaceDir` already owned by 65534. The catch then runs
  `chmod(workspaceDir, 0o777)` on a dir the process no longer owns. If the
  compiler process is non-root with only `CAP_CHOWN` (no `CAP_FOWNER`), this
  `chmod` throws `EPERM`, which is **not** wrapped in a try/catch — it
  propagates to the outer `finally` (L841) and the whole compile attempt
  throws. Runs-as-root deployments (the Docker default) are unaffected; only
  the unusual non-root-with-CAP_CHOWN-only shape trips.
- Reproduction (chown-failure branch): run the app/worker as a non-root user
  without `CAP_CHOWN`, trigger any local-fallback compile; the workspace is
  created `0o777` for its lifetime.
- Fix (minimal): no code change required for the broad mode (it is
  load-bearing for CAP_CHOWN-less hosts); instead reclassify DBG-4 as
  "accepted fallback, documented" and add a best-effort guard so the
  partial-chown sub-case does not throw — wrap the catch's `chmod` calls in
  their own try/catch and proceed with whatever mode succeeded (or abort the
  compile with a clear configError rather than a raw EPERM).

### R2 — A10 cleanup timeouts + orphan sweep only reaps `status=exited` → timed-out kills leak running containers (HIGH / confidence HIGH / REGRESSION)
- Fix commits: `68dc2ad0` (timeouts) · Files: `judge-worker-rs/src/docker.rs:242-276`
  (kill/rm), `docker.rs:642-681` (orphan sweep), `judge-worker-rs/src/main.rs:492`
- The mission asked: *"timeout wrapper: does it leak the container if the
  timeout fires? does the orphan sweep reap it?"*
- The timeout wrappers themselves are correct (`inspect_container_state` L173,
  `kill_container` L243, `remove_container` L261 each wrap `Command::output()`
  in `tokio::time::timeout(Duration::from_secs(10))`). The regression is in the
  interaction with the orphan sweep: `cleanup_orphaned_containers` (L642-681)
  runs `docker ps -a --filter name=oj- --filter status=exited` (L647-651) —
  **it filters `status=exited` exclusively.** A container that is still
  `running` after `kill_container`/`remove_container` timed out is invisible
  to this sweep and is never reaped.
- Failure scenario (step-by-step):
  1. A submission times out (or the run completes) and control enters the
     error arm (`docker.rs:518-521`) or timeout arm (`523-540`).
  2. `kill_container` is invoked. The Docker daemon is momentarily wedged
     (e.g. dockerd under memory pressure, `docker kill` blocked on an
     unresponsive graphdriver). The 10s timeout fires; `kill_container`
     logs "docker kill timed out; orphan sweep will reap" (L255) and returns.
  3. `remove_container` (`docker rm -f`) is invoked next; if the daemon is
     still wedged it also times out (L270-274) and returns without removing.
  4. The container is still `running`. The orphan sweep on the next tick
     filters `status=exited` only → the container is not listed → not reaped.
  5. Repeat per wedged submission. The worker accumulates `oj-*` containers
     until dockerd recovers or an operator intervenes, consuming memory/pids
     quotas and eventually starving new runs.
- The misleading part: the timeout warning explicitly says *"orphan sweep
  will reap"* (L255, L273), but the sweep's filter contradicts that promise.
- Contrast: the **TS**-side `cleanupOrphanedContainers`
  (`src/lib/compiler/execute.ts:856-943`) does NOT have this gap — it queries
  `docker ps -a` without a status filter and explicitly reaps stale `Up`
  containers older than `MAX_CONTAINER_AGE_MS` (L897-928) via `docker rm -f`.
  But that function keys on the `compiler-` name prefix (L865) and only runs
  for the local compiler fallback; it does not touch `oj-*` judge containers,
  which are exclusively the Rust worker's responsibility.
- Fix (minimal): in `cleanup_orphaned_containers`, drop the `status=exited`
  filter and add a stale-`running` branch mirroring the TS logic — for any
  `oj-*` container whose `StartedAt` exceeds a sane bound (e.g.
  `MAX_TIME_LIMIT_MS + compile budget + generous slack`, or a flat
  `DOCKER_LEAK_REAP_MS`), emit `docker rm -f`. Exited/created/dead containers
  continue to be reaped unconditionally.

### R3 — `inspect_container_state` timeout masks OOM verdict (LOW→MED / confidence HIGH / REGRESSION)
- File: `judge-worker-rs/src/docker.rs:172-199`
- When the inspect timeout fires, the function returns a default
  `ContainerInspect { oom_killed: false, duration_ms: None, memory_peak_kb: None }`
  (L193-198). The caller in the success arm (L504-516) and timeout arm
  (L527-538) then reports `oom_killed: false` to the verdict logic.
- Failure scenario: a submission that legitimately OOM-killed inside its time
  budget, whose post-run `docker inspect` then stalls past 10s (wedged
  dockerd), is reported as a clean non-OOM exit with no memory peak. The
  student sees a misleading verdict (e.g. a generic runtime_error or a
  zero-exit "accepted" derived from the wrong state) instead of `oom_killed`.
  Duration also falls back to wall-clock (`state.duration_ms.unwrap_or(wall)`,
  L514/537) which is still correct, so only the OOM signal is lost.
- Severity is bounded: the inspect timeout only fires under a wedged daemon,
  which is itself the larger R2 problem. But it silently degrades verdict
  accuracy at exactly the moment an operator is most likely to be debugging.
- Fix (minimal): when the inspect timeout fires, emit a distinct
  `tracing::warn!` that says "OOM/peak status unknown due to inspect timeout"
  and have the caller treat `oom_killed` as `None` (unknown) rather than
  `false`, so the verdict path can choose a conservative label instead of
  asserting not-OOM. (Requires widening `ContainerInspect.oom_killed` to
  `Option<bool>`; if that ripple is too large, the logging-only mitigation
  still helps operators.)

### R4 — `tokio::process::Command` timeouts do not set `kill_on_drop` → orphaned `docker` CLI subprocesses (LOW / confidence HIGH / NET-NEW, exposed by A10)
- Files: `judge-worker-rs/src/docker.rs:173-199, 243-258, 261-276`
- `tokio::process::Command::output()` spawns a child. When
  `tokio::time::timeout` returns `Err(_elapsed)`, the `output()` future is
  dropped. tokio does **not** kill the child on drop unless `kill_on_drop(true)`
  is set, and none of the three cleanup sites set it. The orphaned `docker
  inspect/kill/rm` CLI process keeps running.
- In practice these CLI commands are short-lived and self-terminate once
  dockerd responds, so this is a transient process leak, not a permanent one.
  It matters only under the same wedged-dockerd condition as R2, where the
  orphaned CLI processes queue up against the unresponsive daemon.
- Fix (minimal): chain `.kill_on_drop(true)` on each cleanup `Command` so the
  CLI child is reaped when the timeout fires. Combined with R2's reap-stale-
  running fix, the cleanup path becomes leak-free.

### A1 / A7 / A10 / A11 — confirmed correct on the named edge cases
- **A1 import.ts skip-truncate** (`51af8537`, `src/lib/db/import.ts:142-161`)
  answers the mission's rowCount=0-vs-absent question correctly: the truncate
  loop (L143-161) keys on `!data.tables[tableName]` (absent → skip+preserve +
  pushed to `skippedTables`), while the import loop (L165-170) treats
  `rowCount === 0` as "truncate happened, nothing to insert". So a present
  empty table is emptied; an absent table is preserved. **Confirmed correct.**
  See N2 for the one residual (partial-export FK hazard).
- **A7 durable restore+migrate audit** (`a336de90`,
  `restore/route.ts:183-221`, `migrate/import/route.ts:123-133,233-243`) —
  confirmed: both routes `await recordAuditEventDurable(...)`, the restore
  success audit fires AFTER `restoreParsedBackupFiles` (L209), and a
  file-restore failure emits a separate `database_restore_files_failed`
  durable audit (L183-196) BEFORE returning 500. R1/R2/F2 from cycle 2 are
  **CLOSED**.
- **A11 code-similarity cap** (`d5b20d3d`, `code-similarity-rs/src/main.rs:29-35,
  96-104, 251-261`) — no off-by-one. `exceeds_submission_cap(count)` is
  `count > MAX_SUBMISSIONS` (500), so exactly 500 is allowed and 501 is
  rejected; the boundary test (L251-261) pins both edges plus the 5000-row DoS
  case. **Confirmed correct.** See N1 for the unrelated deserialization-order
  residual.
- **A8 X-Real-IP revert** (`23851d69`) — the revert restored the head behavior
  where `x-real-ip` is consulted whenever XFF is absent, independent of
  `TRUSTED_PROXY_HOPS` (`src/lib/security/ip.ts:113-117`). This is the
  documented C2-H7 deferral; restated in N3, not a new regression.

### A3 / A4 / A5 / A6 / A12 / A13 / A14 / A15 — re-confirmed clean (no new failure mode)
Spot-checked against the cycle-2 diff and current head:
- A3 snapshot-null abort (`3ed15bd6`): both restore (`route.ts:156-161`) and
  migrate-import multipart (`108-107`) + JSON-body (`215-220`) branches abort
  with `preRestoreSnapshotFailed` 500 unless `ALLOW_UNSNAPSHOTTED_RESTORE=1`.
- A4 language `dockerImage` allowlist, A5 accessCode projection, A6/A12
  community `PROBLEM_LINKED_SCOPES`, A13 edit-page strict gate: unchanged and
  sound at head.

---

## FAILURE-MODE ANALYSIS

### Restore / import pipeline

#### F1 — `restoreParsedBackupFiles` writes uploads non-atomically; partial writes persist after DB commit (MEDIUM / confidence HIGH / REPRODUCES)
- File: `src/lib/db/export-with-files.ts:351-360`
  ```ts
  for (const upload of uploads) {
    await writeUploadedFile(upload.storedName, upload.buffer);
  }
  ```
- Sequential direct writes to the uploads dir, no staging, no per-file atomic
  rename, no cleanup-on-failure. If write #3 of 10 throws (disk full /
  permission / EIO), writes #1-2 are persisted to disk while #4-10 are absent,
  and the function rejects.
- This runs AFTER `importDatabase` already committed (restore route L163 →
  L180), so the system is left split-state: the restored DB references uploads
  that are partly missing. The cycle-2 A7 fix correctly records a durable
  `database_restore_files_failed` audit and surfaces `preRestoreSnapshotPath`,
  so the operator now has a trail — but the atomicity gap itself is unchanged.
- This is the prior F1 / Phase B AGG-1; **re-confirmed reproduces at head**.
- Fix (minimal, aligned with AGG-1 staging design): write each upload to a
  staging path (`uploads/.staging/<restoreId>/<storedName>`), then `rename`
  into place only after all writes succeed; on any failure, `rm -rf` the
  staging dir and reject before any upload is visibly committed.

#### N2 — partial-export FK hazard when a parent is preserved but its child is replaced (LOW / confidence HIGH / NET-NEW, exposed by A1)
- File: `src/lib/db/import.ts:142-233`
- A1 made "table absent from export → preserve live rows" the behavior. The
  failure mode this opens: export omits parent table P (P preserved with live
  rows) but carries child table C. The truncate loop removes C's live rows
  (reverse FK order), then the import loop inserts export-C's rows (forward
  order) which reference export-P's primary keys. If export-P's keys differ
  from live-P's keys, the C inserts FK-violate at COMMIT and the whole
  transaction rolls back atomically.
- This is **safe** (no data corruption — the rollback restores the original
  state) but operator-facing: a "partial" backup from an older schema/version
  that drops a parent table while keeping its child will fail the restore with
  a generic `restoreFailed` + FK error in the log, with no message naming the
  skipped-tables-vs-FK root cause.
- Reproduction: export a DB, delete `data.tables["<parent>"]` from the JSON,
  keep a child table that FK-references it, attempt restore → FK violation at
  commit, transaction rolls back, restore fails.
- Fix (minimal): in `importDatabase`, when `skippedTables.length > 0`, emit a
  pre-flight notice (or augment `result.errors` with a non-fatal warning) so
  the operator sees "parent table X was absent while child Y was present — FK
  integrity cannot be guaranteed". Severity LOW because the failure is clean
  and atomic.

### Judge execution pipeline

#### DBG-2 follow-up — cleanup timeouts landed (R2/R3/R4 above document the residuals)
The headline hang (post-`wait` inspect/kill/rm without any timeout) is
**CLOSED** by A10. The residuals are R2 (orphan sweep does not reap running
leaks), R3 (inspect timeout masks OOM), R4 (no `kill_on_drop`). No NEW
unbounded-await site was found in the run path: the sandbox `wait` is timeout-
wrapped (`docker.rs:469`), stdout/stderr drain into a bounded `take()` +
`tokio::io::sink()` (`docker.rs:433-465`), and the `run_docker_once` arms all
resolve to one of the three cleanup calls. Temp-dir lifecycle is RAII-safe
(`tempfile::TempDir` in `executor.rs:301`, dropped on function exit including
`tokio::select!` cancellation).

#### R5 — `effective_time_limit_ms` clamps problem `time_limit_ms` to `MAX_TIME_LIMIT_MS` silently (LOW / confidence HIGH / NET-NEW, restated)
- File: `judge-worker-rs/src/executor.rs` (`effective_time_limit_ms =
  MIN_TIMEOUT_MS.max(submission.time_limit_ms.min(max_time_limit_ms()))`)
- A problem row whose `timeLimitMs` exceeds `MAX_TIME_LIMIT_MS` (default
  30_000) is silently clamped down; the student sees a TLE they cannot explain
  because the authored limit was higher. This is the prior AGG-17 / FDR-2 item;
  **still reproduces**, no clamp-warn/reject at authoring. Restated because it
  is a genuine failure mode on the judge path, not just a config nit.

### SSE submission pipeline

#### F3 — SSE re-auth does NOT re-run `canAccessSubmission`; revoked group access keeps streaming (MEDIUM / confidence HIGH / REPRODUCES)
- File: `src/app/api/v1/submissions/[id]/events/route.ts:459-501`
- The re-auth IIFE (L461-501) re-checks only `getApiUser(request)` and
  `reAuthUser.id !== viewerId` (L466-470). It does **not** re-run
  `canAccessSubmission`. Initial access is enforced once at stream setup
  (L334). Therefore: a user who is removed from a group (or whose assignment
  access is revoked) mid-stream continues to receive `status` heartbeats and
  the terminal `result` event for that submission until the 30s re-auth tick
  deactivates their *session*, which is a different gate.
- Failure scenario: enrolled student opens SSE on a group-owned submission;
  instructor removes them from the group; for the remainder of the
  `sseTimeoutMs` window (default 300s) the student keeps receiving status
  updates and the final result payload (which carries `results`, `testCase`
  metadata, etc. — sanitized, but still post-revocation data).
- This is the prior NEW-M2 / AGG-28 Phase B item; **confirmed reproduces**.
- Fix (minimal): in the IIFE, after the `getApiUser` re-check, re-fetch the
  submission row and re-await `canAccessSubmission(submission, reAuthUser.id,
  reAuthUser.role)`; on false, `close()`.

#### N4 — `onPollResult` re-auth branch can interleave with a synchronous terminal send (LOW / confidence MED / NET-NEW)
- File: `src/app/api/v1/submissions/[id]/events/route.ts:452-522`
- `onPollResult` decides per-tick whether to take the async re-auth IIFE path
  (L461, returns at L502) or the synchronous path (L505-521). Two ticks can
  fire close together: tick A enters the IIFE (awaiting `getApiUser`), tick B
  — under the 30s threshold — runs the synchronous path and calls
  `void sendTerminalResult()` (L512). sendTerminalResult awaits
  `queryFullSubmission`; meanwhile tick A's IIFE resolves and *also* calls
  `sendTerminalResult` (L487). Both then race to enqueue.
- This is bounded by the `closed` guard (L368-370, checked inside
  `sendTerminalResult` at L408/L412) and the `.catch(close)` wrappers, so the
  worst case is a duplicate `event: result` line on the wire (clients already
  dedupe on terminal event) — not a crash or a leak. The unhandled-rejection
  surface is fully covered (every async branch ends in `.catch(close)`).
- Severity LOW; confidence MED (requires a precise tick interleave within the
  30s re-auth window).

---

## NET-NEW latent bugs

### N1 — code-similarity cap is enforced AFTER full JSON deserialization; 16 MiB payload still parses before rejection (LOW / confidence HIGH / NET-NEW)
- File: `code-similarity-rs/src/main.rs:88-104`
- `Json<ComputeRequest>` (axum's body collector + serde) fully materializes
  `req.submissions` into a `Vec` BEFORE the handler runs `exceeds_submission_cap`
  (L96). The `DefaultBodyLimit::max(16 MiB)` (L221) bounds total RAM for a
  single request, but a 16 MiB JSON of tiny submissions can carry tens of
  thousands of rows — all parsed and held in memory — before the >500 check
  returns 413. The O(n²) similarity loop is correctly prevented from running,
  but the JSON-parse CPU/RAM spike per request is not bounded by the
  submission cap.
- Exploitability is gated behind the bearer token (which is now fail-closed
  at startup, L203-217), so this is a post-auth DoS surface only. Realistic
  severity LOW.
- Fix (minimal): either lower `MAX_COMPUTE_BODY_BYTES` to the smallest size
  that still fits 500 max-length submissions, or move the cap into a custom
  serde deserializer / `Bytes` extractor that aborts deserialization once the
  running submission count exceeds 500.

### N3 — `X-Real-IP` trusted whenever XFF is absent, regardless of `TRUSTED_PROXY_HOPS` (HIGH spoofing surface / confidence HIGH / REPRODUCES — the reverted A8 / C2-H7)
- File: `src/lib/security/ip.ts:113-117`
- At head, when a request carries no `x-forwarded-for` but does carry
  `x-real-ip`, `extractClientIp` trusts `x-real-ip` verbatim with no hop
  validation (L114-116). A8 tried to gate this on `trustedHops > 0` and was
  reverted (`23851d69`) because the deployed nginx sets `X-Real-IP
  $remote_addr`, overwriting any client value, and the judge `/claim`
  IP-allowlist (`isJudgeIpAllowed`) depends on it.
- The exit criterion recorded in the cycle-2 plan (verify every production
  nginx overwrites `X-Real-IP`) is the correct re-open condition. **It has
  not been verified this cycle**, so the spoofing surface is restated as
  still-open: any code path that forwards a client-controlled `X-Real-IP`
  without overwriting it (a misconfigured proxy, a direct-to-app request
  bypassing nginx, a future deployment without the `proxy_set_header` line)
  lets a client pick the IP that `isJudgeIpAllowed`,
  `consumeUserApiRateLimit`, and the audit trail all see.
- Downstream null-IP behavior is correct and fail-closed: when no IP can be
  determined in production (`extractClientIp` returns `null` at L128),
  `isJudgeIpAllowed` denies when an allowlist is configured (`ip-allowlist.ts:171`),
  and the `/claim` rate-limiter falls back to a hash of the Authorization
  header (`claim/route.ts:157-161`). No path where a null IP silently allows.
- Fix (re-open condition): keep the revert until the nginx-config audit is
  done; if any target forwards `X-Real-IP` client-controlled, gate it behind
  an explicit `TRUST_X_REAL_IP=1` flag rather than the unconditional trust.

### N5 — `recordAuditEventDurable` "never throws" contract does not extend to the buildAuditRow input shape (LOW / confidence MED / NET-NEW)
- File: `src/lib/audit/events.ts:275-296` (`recordAuditEventDurable`)
- The durable helper is documented and implemented as never-throwing (the
  insert is wrapped; on failure it pushes to the buffer). Good. However, the
  `buildAuditRow(input)` call (L277) runs BEFORE the try block and can throw
  on a malformed `input.details` (e.g. an object containing a non-serializable
  value such as a `BigInt`, a `Date` in a nested field that the column mapper
  does not expect, or a circular reference). A throw from `buildAuditRow`
  propagates out of `recordAuditEventDurable` to the caller.
- At the two current call sites (restore `route.ts:209`, migrate-import
  `route.ts:123/233`), the call is inside the route's outer `try` and a throw
  would land in the `catch` → 500 `restoreFailed`/`importFailed`. The audit
  row is lost AND the operator gets a generic error instead of the
  post-commit success response. Subtle, because the DB commit already
  happened.
- Fix (minimal): move `buildAuditRow(input)` inside the try block (or wrap
  the whole body in try/catch with a logger.warn fallback) so the
  "never throws" contract actually holds end-to-end.

### N6 — `importDatabase` response `partial: result.tableResults` is always `{}` on failure, masking per-table diagnostics (LOW / confidence HIGH / NET-NEW, cosmetic)
- Files: `src/lib/db/import.ts:236-247`; consumers `restore/route.ts:165-172`,
  `migrate/import/route.ts:110-117,223-230`
- On any in-transaction failure, the outer catch clears
  `result.tableResults = {}` (L243) — correct, since nothing committed. But
  the routes still surface it as `partial: result.tableResults` in the 500
  body. The field name implies per-table progress; the value is always empty.
  Operators debugging a failed restore see `partial: {}` and gain nothing.
- Not a correctness bug. Fix (cosmetic): rename the response field to
  `rolledBack: true` (or omit `partial` on failure) so the payload does not
  imply partial commit.

---

## FINAL SWEEP

- **Rust panics on the cleanup path**: the `child.stdout.take().expect(...)`
  sites (`docker.rs:434,451`) are safe (child is spawned with all three stdios
  piped, L407-409). No new `.unwrap()`/`.expect()` introduced by A10 in
  production code. The `parse_timestamp_epoch_ms` guards negative totals
  (L140-142) and the docker-zero-time `0001-01-01…` returns `None`
  (`tests:637-639`) — confirmed by the prior cycle, still correct.
- **Integer casts**: A10 introduced no new casts; the timeout is a flat
  `Duration::from_secs(10)` with no arithmetic. No overflow surface.
- **Cancellation safety**: `tempfile::TempDir` (Rust) and `finally { rm }`
  (TS compiler) both release on cancel/crash. The restore uploads path (F1)
  remains the only non-atomic FS write under cancellation pressure.
- **Unhandled rejections on the SSE path**: every async branch in
  `onPollResult` terminates in `.catch(close)` or is itself wrapped; the IIFE
  at L461-501 ends in `.catch((err) => { … close() })` (L492-501). No
  unhandled-rejection surface found. (The interleaving in N4 is duplicate-send
  only.)
- **Audit durability surface**: the cycle-2 A7 work closed the restore and
  migrate-import durability gap. The remaining ~107 non-awaited
  `recordAuditEvent` sites (AGG-41) are still buffered; none of the new
  cycle-2 code added to this set (the two new restore/migrate audits both use
  the awaited durable helper). N5 is the one new note on the durable helper's
  build-input edge.
- **No CRITICAL data-loss regression** was found in the cycle-2 surface. The
  A1 skip-truncate logic, A3 snapshot-null abort, A4 image allowlist, and A7
  durable-audit fixes all behave correctly on their named edge cases. The
  regressions found (R1, R2, R3, R4) are residuals and incompleteness in the
  A9/A10 hardening, not new destructive paths.

---

## References (all paths absolute)

- `/Users/hletrd/flash-shared/judgekit/src/lib/compiler/execute.ts:728-757` —
  R1 chown/chmod fallback still 0o777/0o666 (A9 partial).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/docker.rs:242-276` —
  R2/R4 timeout-wrapped kill/rm.
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/docker.rs:642-681` —
  R2 orphan sweep filters `status=exited` only; running `oj-*` leaks unreaped.
- `/Users/hletrd/flash-shared/judgekit/src/lib/compiler/execute.ts:856-943` —
  TS-side stale-running reaper (prefix `compiler-` only; does not cover `oj-*`).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/docker.rs:172-199` —
  R3 inspect timeout returns `oom_killed:false`, masking OOM.
- `/Users/hletrd/flash-shared/judgekit/src/lib/db/export-with-files.ts:351-360`
  — F1 non-atomic `restoreParsedBackupFiles` (REPRODUCES).
- `/Users/hletrd/flash-shared/judgekit/src/lib/db/import.ts:142-233` — A1
  confirmed correct; N2 partial-export FK hazard.
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/admin/restore/route.ts:163-221`
  — A7 confirmed (durable, post-file-restore, failure audit).
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/submissions/[id]/events/route.ts:459-522`
  — F3 SSE re-auth skips `canAccessSubmission` (REPRODUCES); N4 interleave.
- `/Users/hletrd/flash-shared/judgekit/src/lib/security/ip.ts:113-117` — N3
  X-Real-IP unconditional trust (reverted A8 / C2-H7).
- `/Users/hletrd/flash-shared/judgekit/code-similarity-rs/src/main.rs:88-104,221`
  — A11 cap confirmed correct; N1 post-deserialize cap.
- `/Users/hletrd/flash-shared/judgekit/src/lib/audit/events.ts:275-296` — N5
  `buildAuditRow` outside try; "never throws" contract gap.
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/executor.rs` — R5
  silent `MAX_TIME_LIMIT_MS` clamp (AGG-17, REPRODUCES).
