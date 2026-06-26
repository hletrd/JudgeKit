# Debugger Review — Latent Bugs & Failure Modes

**Scope:** judgekit @ HEAD `0b0ac198`
**Reviewer:** debugger agent (root-cause, failure-mode, race, panic, resource-leak lens)
**Method:** direct read of all bug-prone files named in the briefing + two parallel subagent audits (db subsystem, compiler/docker/realtime) + targeted grep sweeps. Two planned subagents (judge-queue, rust-worker) hit transient 429s and were rolled into direct reading of `claim-query.ts`, `worker-staleness.ts`, `docker.rs`, `executor.rs`, `main.rs`, `validation.rs`, `api.rs`, `runner.rs`.
**Output convention:** each finding has `file:line`, failure scenario, severity, confidence, root cause, minimal fix. Findings are root-cause, not symptom-level.

---

## Coverage

Files examined directly (root-cause level):
- `src/app/api/v1/admin/restore/route.ts` (full)
- `src/app/api/v1/users/[id]/route.ts:440-530` (deletion + audit ordering)
- `src/lib/docker/client.ts` (full)
- `src/lib/judge/claim-query.ts` (full)
- `src/lib/judge/worker-staleness.ts` (full)
- `src/lib/judge/sync-language-configs.ts` (full)
- `src/lib/db/cleanup.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts:80-230` (timers, cleanup)
- `judge-worker-rs/src/executor.rs` (full)
- `judge-worker-rs/src/docker.rs` (full)
- `judge-worker-rs/src/api.rs` (full)
- `judge-worker-rs/src/main.rs` (full)
- `judge-worker-rs/src/validation.rs` (full)
- `judge-worker-rs/src/runner.ts:1-100`

Subagent audits (parallelized):
- DB export/import/migrate subsystem (12 findings, all reviewed and rebased below)
- Compiler / docker / submissions / realtime (8 findings, all reviewed and rebased below)

Targeted sweeps:
- `setInterval` / `setTimeout` across realtime / data-retention / events (verified HMR guards)
- `.unwrap()` / `.expect()` across all Rust crates (no unsafe production hits beyond those listed)
- `rate-limiter-rs/src/main.rs:462` `usize::MAX` body bound — confirmed inside `#[cfg(test)]` only, not a production bug

---

## Verification of Prior-Cycle Fixes (residuals)

| Prior fix | Status | Evidence |
|---|---|---|
| `restore/route.ts:159` audit uses pending file count | **OK, intact** | `pendingUploadedFiles.length` is read from the in-memory array populated by `parseBackupZip` (line 90) before any disk write. Count semantics are correct. |
| `users/[id]/route.ts:469-501` deletion audit after commit | **OK, intact** | `auditContext` captured at lines 472-484 (post-confirm, pre-delete); `execTransaction` runs the cascade scrub + delete at 491-503; `recordAuditEvent(auditContext)` fires at line 506 only after the transaction resolves. No phantom-audit window. |
| `docker/client.ts` import-time throw → logged error | **OK, intact** | Lines 26-33 emit a server-side `logger.error` and continue; `getWorkerDockerApiConfigError()` (line 206) returns a generic `configError` code to API callers without leaking env-var names. No throw at import time. |
| `executor.rs` chrono dead-letter timestamp | **OK, intact** | Line 972 `chrono::Utc::now().format("%Y%m%dT%H%M%SZ")`. `prune_dead_letter_dir` (lines 163-200) enforces the 1000-file cap with proper `metadata().modified()` fallback to `UNIX_EPOCH`. |
| `data-retention-maintenance.ts` `var` → `let` | **OK, intentional `var`** | Lines 167-169 use `var __sensitiveDataPruneTimer` inside `declare global`. TypeScript requires `var` for ambient global declarations; the revert (commit `c6d17e21`) was correct. Not a bug. |
| `parse_timestamp_epoch_ms` bounds | **OK, intact** | `docker.rs:131-136` rejects `total_ms < 0` (pre-epoch / Docker zero-time `0001-01-01T00:00:00Z` → `None`). Test at line 589 confirms. |

**No residuals.** All prior-cycle fixes are correctly in place.

---

## Findings

### DBG-1 — DB replace commits; uploaded-file restore is non-atomic with no rollback path  [CRITICAL]

**File:** `src/app/api/v1/admin/restore/route.ts:165-178`
**Also:** `src/lib/db/export-with-files.ts:351-360` (`restoreParsedBackupFiles`)

**Failure scenario:**
1. Admin uploads a ZIP backup. `parseBackupZip` validates it; `takePreRestoreSnapshot` succeeds; `importDatabase(data)` commits — every `files` row now points at the backup's `storedName`s.
2. `restoreParsedBackupFiles(pendingUploadedFiles)` iterates and calls `writeUploadedFile` per file. `writeFile` is not atomic and can throw mid-loop on `EACCES`, `ENOSPC`, `EIO`, or a transient FS error.
3. If the throw happens on file N of M, the DB already references all M files but only files `0..N-1` exist on disk. The catch at `route.ts:187-190` returns `{ error: "restoreFailed" }` 500 with `preRestoreSnapshotPath`, but no automatic restore happens, and the route never re-imports the snapshot. Production is left with broken file links — every `files`-joined query 404s on its `storedName`.

**Root cause:** Two separate "transactions" (DB inside `db.transaction`; files as a sequential loop) with no compensating action. No stage-new-files-to-tmp-then-rename, no DB rollback from the snapshot, no record of which files were written.

**Minimal fix:** Stage the file writes to a temp directory (`uploads/.restore-staging/<uuid>/`); after all writes succeed, atomically `rename` into place, then commit the DB transaction. Or: on `restoreParsedBackupFiles` failure, automatically re-import the snapshot JSON at `preSnapshotPath` before returning 500.

**Confidence:** 0.95

---

### DBG-2 — `docker inspect` has no timeout; a hung daemon blocks a worker slot indefinitely  [HIGH]

**File:** `judge-worker-rs/src/docker.rs:456` and `:479` (also `remove_container` at line 457 / 480)

**Failure scenario:**
1. `docker::run_docker_once` wraps the child spawn + wait in `tokio::time::timeout(timeout_duration, …)` at line 421.
2. The `Ok(Ok(exit_status))` branch (line 452) calls `inspect_container_state(&container_name).await` (line 456) and `remove_container(&container_name).await` (line 457) — **both outside the timeout**. Same on the timeout branch at lines 479-480.
3. If the Docker daemon is hung (e.g. deadlocked with `containerd`, slow registry auth, IO stall on `/var/lib/docker`), `docker inspect` blocks indefinitely.
4. The whole `run_docker` future stalls, the parent `executor::execute` future never returns, the `tokio::task::spawn` JoinHandle in `main.rs:545` never completes, the semaphore permit (`main.rs:548`) is never released, and `active_tasks` (`main.rs:550`) is never decremented.
5. After `concurrency` such stalls, the worker stops claiming new work. Server-side staleness sweep eventually re-queues the submission to another worker, but this worker remains wedged until restarted — and the operator sees no error in the logs (the call simply never returns).

**Root cause:** The timeout envelope only covers `child.wait()`. Post-wait docker calls (`inspect`, `rm`) inherited no deadline.

**Minimal fix:** Wrap each post-wait `tokio::process::Command` in `tokio::time::timeout(Duration::from_secs(15), …)` inside `inspect_container_state`, `kill_container`, and `remove_container`. On timeout, log and proceed (kill/remove are best-effort anyway).

**Confidence:** 0.9

---

### DBG-3 — Dropped `JoinHandle` in `retain` silently swallows task panics  [MEDIUM]

**File:** `judge-worker-rs/src/main.rs:489`

**Failure scenario:**
1. Main loop calls `task_handles.retain(|h| !h.is_finished())` each iteration to reap finished tasks.
2. When a task finishes — including panicking — `is_finished()` returns `true` and `retain` drops the `JoinHandle` without ever `await`-ing it.
3. A panic payload is silently lost (no log line, no metric). `executor::execute` is panic-resistant (every fallible call goes through `report_error` / `report_with_retry`), but a panic in `tokio::spawn` itself, in `report_with_retry`'s serde_json path, or in the safe-id closure at `executor.rs:981-985` would propagate unnoticed.
4. Compare with the shutdown path at lines 593-597, which properly `await`s each handle and logs `Task panicked during shutdown`. The hot-path retain does not.

**Root cause:** Reaping optimization drops the handle without observing its result.

**Minimal fix:** Before dropping finished handles, poll them once and log panics. E.g.:
```rust
let mut panicked = 0;
task_handles.retain(|h| {
    if h.is_finished() {
        // SAFETY: is_finished() is true, so await resolves immediately
        // Use try_join-like pattern or extract via a separate pass
        false
    } else { true }
});
```
Concretely: collect finished handles, `await` each inside a `for` loop with `if let Err(e) = handle.await { tracing::error!(error=%e, "Submission task panicked") }`, then push still-live handles back.

**Confidence:** 0.8

---

### DBG-4 — chmod `0o777` runs unconditionally on chown-success path, exposing workspace to all host users  [MEDIUM, security]

**File:** `src/lib/compiler/execute.ts:735-747` (analogous Rust code at `judge-worker-rs/src/executor.rs:331-360` was verified *correct* — uses `0o700` on success, `0o777` only in the fallback)

**Failure scenario:**
1. `COMPILER_WORKSPACE_DIR` is a host-mounted bind path (DinD prod topology).
2. `chown` to `65534:65534` succeeds (lines 736-737). Workspace now owned by the sandbox uid.
3. The success path then calls `chmod(workspaceDir, 0o777)` and `chmod(sourcePath, 0o666)` (lines 738-739), making both world-readable/writable/traversable for the entire compile/run window.
4. Any unprivileged host process can read candidate source (IP-sensitive exam answers) or tamper mid-execution.

**Root cause:** The TS success branch copies the chown-failed fallback's broad mask. The Rust side already does the right thing (use `0o700` on success, `0o777` only in the `catch`); the TS path was not updated to match.

**Minimal fix:** On the success branch, use `0o755` for the workspace and `0o644` for the source. Keep `0o777`/`0o666` inside the `catch`.

**Confidence:** 0.75

---

### DBG-5 — `tryRustRunner` fetch body not drained on non-OK; undici socket leak under load  [MEDIUM]

**File:** `src/lib/compiler/execute.ts:565-571`

**Failure scenario:**
1. Rust runner returns `502`/`503`/`500` (transient overload, restart, OOM).
2. The `!response.ok` branch at line 565 logs and returns `null` without reading `response.body`.
3. The undici socket cannot return to the keepalive pool until the body is consumed or GC'd.
4. Under judge load (many parallel claims via `executionLimiter`), transient runner errors exhaust the Node fetch connection pool, surfacing as `UND_ERR_SOCKET` / `ETIMEDOUT` cascades that look like runner outages but are client-side leaks.

**Root cause:** Body never read on the error branch. (The invalid-shape branch at 590-595 already consumes via `response.json()`.)

**Minimal fix:** Insert `await response.text().catch(() => {});` before `return null;` on the non-OK branch.

**Confidence:** 0.7

---

### DBG-6 — Temp workspace leaks if pre-`try` `lstat`/`chmod(0o700)` throws  [MEDIUM]

**File:** `src/lib/compiler/execute.ts:718-724`

**Failure scenario:**
1. `mkdtemp(join(WORKSPACE_BASE, "compiler-"))` succeeds — directory now exists.
2. Either `lstat` returns a non-directory/symlink (line 720-722 throws "Compiler workspace path is invalid"), or `chmod(workspaceDir, 0o700)` (line 724) throws EPERM on a host-mounted volume.
3. The throw escapes BEFORE the `try { … } finally { rm(...) }` block (starts at line 726).
4. The created temp directory is orphaned indefinitely. Repeated failures accumulate on the host bind mount until the FS fills.

**Root cause:** `mkdtemp`, `lstat`, and `chmod(0o700)` sit outside the protected region.

**Minimal fix:** Wrap from `mkdtemp` onward in `try { … } finally { await rm(workspaceDir, { recursive: true, force: true }).catch(…) }`.

**Confidence:** 0.85

---

### DBG-7 — Stream limit rejects upload but never cancels the request body (bandwidth DoS)  [MEDIUM]

**File:** `src/lib/db/import-transfer.ts:21-33`

**Failure scenario:**
1. Client POSTs a 10 GB body to `/api/v1/admin/restore`. `readStreamBytesWithLimit` accumulates chunks; after `MAX_IMPORT_BYTES` (100 MB) it throws `fileTooLarge`.
2. The `finally` calls `reader.releaseLock()` only. The underlying `request.body` `ReadableStream` is not cancelled.
3. The network layer keeps accepting the remaining ~9.9 GB into the server's kernel buffer until the client stops sending. Repeat with concurrent sockets to saturate inbound bandwidth — a single authenticated admin session can starve the app server's NIC.

**Root cause:** `releaseLock()` detaches the reader but does not signal the producer. The Web Streams contract requires `reader.cancel()` to propagate backpressure.

**Minimal fix:** `await reader.cancel().catch(() => {})` in the `finally` before `releaseLock()`.

**Confidence:** 0.85

---

### DBG-8 — `streamBackupWithFiles` silently skips missing files; resulting ZIP has DB rows pointing at absent uploads  [MEDIUM]

**File:** `src/lib/db/export-with-files.ts:209-230`

**Failure scenario:**
1. A `files` row exists whose underlying blob was deleted from disk (operator cleanup, failed mount).
2. During backup, `access(resolveStoredPath(...))` rejects → the file is skipped (`skipped++`).
3. The ZIP is written with the full `database.json` (containing the row) but without the blob. The integrity manifest records only included files, so the manifest check on restore passes.
4. Restoring this ZIP imports the DB row, but the blob is absent from the ZIP — `pendingUploadedFiles` simply lacks that entry, and `restoreParsedBackupFiles` returns success with `filesRestored = N-1`.
5. The production server now has a DB row pointing at a non-existent file, with no warning to the operator.

**Root cause:** Skipped files are logged as info but never fail the backup nor flag the manifest as partial. There is no post-collection invariant "every `files.storedName` in the export must appear in `manifestUploads`".

**Minimal fix:** After the file-collection loop, diff `files.storedName` values against `manifestUploads.map(u => u.storedName)`. If any are missing, `throw new Error("backupIncompleteFiles")` (matches existing fail-closed posture for integrity mismatches), or add a `"partial": true` field to the manifest so restore can warn/refuse.

**Confidence:** 0.8

---

### DBG-9 — No mutual exclusion between concurrent restore / import invocations  [MEDIUM]

**File:** `src/app/api/v1/admin/restore/route.ts:20`, `src/app/api/v1/admin/migrate/import/route.ts:25`

**Failure scenario:**
1. Two admin sessions (or one double-clicking admin) issue restore concurrently. Both pass the password gate. Both call `takePreRestoreSnapshot`, then both call `importDatabase`.
2. Each opens its own `db.transaction` and issues `tx.delete(table)` on every table in parallel. Postgres grants row-level exclusive locks to whichever transaction locks first; the second transaction's DELETEs block, then both attempt INSERTs that conflict on PKs/uniques. One deadlocks (Postgres picks a victim) and rolls back with HTTP 500.
3. The same applies to a restore racing an in-flight user submission: user INSERTs a `submissions` row, restore's `tx.delete(submissions)` blocks on the row lock, user's transaction commits, restore then deletes the just-created row inside its transaction → user-visible data loss even though restore "succeeded."

**Root cause:** No advisory lock (`pg_advisory_xact_lock`) on a restore/import key, no in-process mutex. The rate limiter bounds requests per actor per window but does not serialize destructive operations.

**Minimal fix:** Wrap the destructive section (`takePreRestoreSnapshot` → `importDatabase` → `restoreParsedBackupFiles`) in a Postgres advisory lock acquired inside the import transaction; reject with HTTP 409 if already held.

**Confidence:** 0.75

---

### DBG-10 — Docker pull remote timeout (60 s) is asymmetric with local (300 s)  [MEDIUM]

**File:** `src/lib/docker/client.ts:212-236` (also `:270-282` local path)

**Failure scenario:**
1. Admin pulls a large judge base image (1+ GB) via the worker.
2. Remote path calls `callWorkerNoContent("/docker/pull", …)` with a hardcoded `60_000` ms timeout (line 219).
3. Pull legitimately takes 90 s on a slow link. The fetch aborts; admin sees "Failed to pull Docker image", but the worker's `docker pull` subprocess keeps running to completion — the registry layer and worker disk are now inconsistent (layers pulled but image not tagged; subsequent pulls hit cache partials).
4. Local-only path uses `300_000` ms; issue only manifests in the prod remote-worker topology.

**Root cause:** `callWorkerNoContent` hardcodes 60 s. `callWorkerJson` already accepts a `timeoutMs` parameter; the no-content variant was never given the same flexibility.

**Minimal fix:** Add `timeoutMs = 60_000` parameter to `callWorkerNoContent`; pass `300_000` from `pullDockerImage` (line 462).

**Confidence:** 0.7

---

### DBG-11 — `streamBackupWithFiles` materializes the entire ZIP into memory  [MEDIUM]

**File:** `src/lib/db/export-with-files.ts:239-249`

**Failure scenario:**
1. `zip.generateAsync({ type: "uint8array" }, …)` builds the entire archive as a single in-memory `Uint8Array`, then wraps it in a `ReadableStream` that enqueues the whole blob in one chunk.
2. For a backup bundling hundreds of MB of uploads, peak memory ≈ 2× archive size (JSZip internal buffer + enqueued Uint8Array).
3. With `MAX_BACKUP_ZIP_DECOMPRESSED_BYTES = 512 MB`, a single backup request can OOM a small app server; two concurrent ones (both pass `system.backup`) almost certainly will. The streaming contract that `streamDatabaseExport` carefully maintains on the JSON path is defeated by the ZIP bundling step.

**Root cause:** JSZip is not a streaming generator; the architecture holds the entire ZIP in RAM. The `ReadableStream` wrapper is cosmetic.

**Minimal fix:** Switch to a streaming ZIP writer (`archiver`, `yazl`, or `concat-stream` with chunked `generateAsync` + `{ streamFiles: true }`). Short of that, reduce `MAX_BACKUP_ZIP_DECOMPRESSED_BYTES` to leave headroom for 2× materialization under the smallest deploy footprint, or add a server-wide concurrency limit on `admin:backup` with `includeFiles=true`.

**Confidence:** 0.7

---

### DBG-12 — `sanitizeSubmissionForViewer` hidden DB query — N+1 in bulk contexts  [MEDIUM, perf]

**File:** `src/lib/submissions/visibility.ts:125-141`

**Failure scenario:**
1. A caller iterates a list of submissions (admin dashboard, contest leaderboard refresh) and calls `sanitizeSubmissionForViewer(sub, viewerId, caps)` per row without passing `assignmentVisibility`.
2. Each call hits the `else` branch at line 130 and runs `db.query.assignments.findFirst({ where: eq(assignments.id, submission.assignmentId), … })` — one round-trip per submission.
3. For a 200-row listing this is 200 sequential queries; on Postgres with default pool the listing serializes from 50 ms to multi-seconds.

**Root cause:** The hidden query is documented (lines 100-108) but the signature does not force callers to opt in. The default branch is the silent N+1 path.

**Minimal fix:** For bulk callers, require a batch pre-fetch of assignment visibility and pass it explicitly. (No change in this file — change is at the call sites. Flagging because the API surface invites the bug.)

**Confidence:** 0.6

---

### DBG-13 — `doSync` is non-atomic across languages; partial state on mid-loop failure  [MEDIUM]

**File:** `src/lib/judge/sync-language-configs.ts:23-64`

**Failure scenario:**
1. `doSync` iterates `DEFAULT_JUDGE_LANGUAGES` and issues a separate `db.insert` (line 29) or `db.update` (line 55) per language — each is its own implicit transaction.
2. If language N fails (DB connection drop, unique-constraint violation, transient `getDbNowUncached` timeout), languages `0..N-1` are persisted while `N..M` are not.
3. The outer retry loop (lines 94-107) re-runs the WHOLE `doSync` on the next attempt. Re-runs are idempotent for already-persisted rows (the backfill branch at line 50 skips rows whose `runCommand` is already set), so the fleet eventually converges — but during a multi-replica rolling deploy with DB flapping, different replicas can briefly observe different sets of configured languages, and an admin watching the language list mid-deploy sees a non-deterministic subset.

**Root cause:** Per-iteration DML with no encompassing transaction.

**Minimal fix:** Wrap the loop body in `db.transaction(async (tx) => { … })` so all inserts/updates for one sync attempt succeed or fail together.

**Confidence:** 0.7

---

### DBG-14 — Manifest omitted ⇒ integrity checks silently bypassed  [LOW-MEDIUM]

**File:** `src/lib/db/export-with-files.ts:282-295`

**Failure scenario:**
1. `parseBackupZip` looks up `backup-manifest.json`. If absent, every downstream guard keyed on `if (manifest)` is skipped — sha256 verification of `database.json`, per-file sha256/byteLength checks, and the "manifest referenced uploads not present in ZIP" check.
2. Path-traversal and per-entry size limits still apply, but an attacker (or a corrupted/partial archive) can swap `database.json` for arbitrary content and add bogus `uploads/` entries without detection.

**Root cause:** The manifest is treated as optional. New backups always write one, but restore accepts manifest-less ZIPs without pinning trust level.

**Minimal fix:** For any ZIP whose `database.json` exists, require `backup-manifest.json` to also exist (treat absence as `invalidBackupManifest`). If legacy manifest-less archives must be supported, gate them behind an explicit `?legacy=1` flag.

**Confidence:** 0.7

---

### DBG-15 — `restoreParsedBackupFiles` writes files but never cleans up orphans from prior state  [LOW]

**File:** `src/lib/db/export-with-files.ts:351-360`

**Failure scenario:**
1. Run restore twice from different backups. After the first restore, disk has `{A, B, C}`. After the second (from a backup containing `{D, E}`), disk has `{A, B, C, D, E}` — but the DB only references `{D, E}`.
2. Orphans accumulate on every restore, consuming disk with no GC path.

**Root cause:** Only `writeUploadedFile` is called. No pre-restore `readdir(uploadsDir)` + diff + `unlink`, no post-restore sweep keyed off the freshly-imported `files` table.

**Minimal fix:** After `importDatabase` succeeds, list `uploadsDir`, compute the set of `storedName`s now in the `files` table, and `unlink` anything not in that set (best-effort, log skips). Or document that disk hygiene is operator-driven and add a `reconcileUploads()` admin endpoint.

**Confidence:** 0.8

---

### DBG-16 — `validateExport` accepts non-array rows; import crashes deeper  [LOW]

**File:** `src/lib/db/export.ts:343-361`

**Failure scenario:**
1. A hand-edited or partially-corrupted JSON export where `tables.submissions.rows = {"foo": "bar"}` passes `validateExport` (only `Array.isArray(td.rows)` is checked, not element shape).
2. The error surfaces later inside `import.ts:185-193` where `row[j]` on a non-indexable value throws a confusing `TypeError` instead of a structured validation error.

**Root cause:** Validation does not recurse into row shape.

**Minimal fix:** Add a check in `validateExport`'s table loop: `for (const row of td.rows) if (!Array.isArray(row)) { errors.push("Table X: each row must be an array"); break; }`. Bound the loop to first 1000 rows.

**Confidence:** 0.55

---

### DBG-17 — Pre-restore snapshot filename collides on millisecond + 8-char actor prefix  [LOW]

**File:** `src/lib/db/pre-restore-snapshot.ts:75-77`

**Failure scenario:**
1. Filename is `pre-restore-${stamp}-${actorId.slice(0, 8)}.json` where `stamp = new Date().toISOString().replace(/[:.]/g, "-")`.
2. If two snapshots are taken within the same millisecond (or two actors share an 8-char id prefix — unlikely but possible), both writes target the same path. `createWriteStream` truncates by default — the first snapshot is silently overwritten.
3. Plausible during incident-response double-click, especially combined with DBG-9 (no restore mutex).

**Root cause:** Filename uniqueness assumes millisecond granularity plus 8 chars of actor id.

**Minimal fix:** Append a short random suffix (`-${randomBytes(4).toString("hex")}`) or use `crypto.randomUUID()`. The prune logic already keys off the filename prefix.

**Confidence:** 0.6

---

### DBG-18 — `importDatabase` issues one unbatched `DELETE FROM table` per table inside the transaction  [LOW]

**File:** `src/lib/db/import.ts:133`

**Failure scenario:**
1. For high-volume tables (auditEvents, loginEvents, codeSnapshots — routinely millions of rows in production), `await tx.delete(table)` issues a single unbatched `DELETE FROM …` with no `WHERE`.
2. All rows are locked exclusively and WAL is generated for each deletion, all inside one transaction that does not commit until every INSERT has also finished.
3. During this window (tens of seconds on large tables), user writes to those tables block. `cleanup.ts` deliberately batches deletes (`LIMIT ${BATCH_SIZE}`) for this exact reason — `importDatabase` does not.

**Root cause:** Unbatched table wipe.

**Minimal fix:** Switch to `TRUNCATE … RESTART IDENTITY CASCADE` for tables that are about to be fully replaced. TRUNCATE inside the same transaction is allowed in PostgreSQL and shrinks the lock window dramatically.

**Confidence:** 0.6

---

### DBG-19 — Cleanup cron cutoff computed once across restore boundary  [LOW]

**File:** `src/lib/db/cleanup.ts:37-63`

**Failure scenario:**
1. The `/api/internal/cleanup` cron fires `cleanupOldEvents`. It fetches `nowMs` once (line 37), then loops batched DELETEs against that fixed cutoff.
2. If a restore commits between the audit and login loops (or between batches), the new DB's rows are evaluated against the *pre-restore* cutoff. Not corruption — the cutoff is a wall-clock threshold — but the cleanup may delete newly-imported historical rows (e.g. an imported auditEvents row from 90 days ago that the operator wanted preserved). The restore's snapshot doesn't help because it was taken before import.

**Root cause:** No coordination between long-running cleanup and restore/import.

**Minimal fix:** Skip cleanup while a restore is in flight (requires the DBG-9 advisory-lock primitive), or recompute the cutoff inside each batch loop iteration.

**Confidence:** 0.5

---

### DBG-20 — `buildDockerImageLocal` kills proc on timeout but never awaits exit  [LOW]

**File:** `src/lib/docker/client.ts:347-372`

**Failure scenario:**
1. `docker build` exceeds the 600 s timeout. `proc.kill()` fires SIGTERM and `resolve({ success: false, … })` fires immediately.
2. The actual `docker build` subprocess (and its BuildKit daemon) doesn't die instantly — it can take 10-30 s to tear down. During that window the admin UI has already shown "timed out" but the build is still consuming CPU/memory on the worker.
3. The `proc.on("close", …)` handler fires later and resolves again (silently ignored — Promise already resolved). The un-awaited exit means the function's "done" signal lies about resource release.

**Root cause:** Timeout handler resolves without waiting for child exit.

**Minimal fix:** On timeout, `proc.kill("SIGKILL")` and gate the resolve inside the `close` handler on a `killed` flag.

**Confidence:** 0.55

---

### DBG-21 — SSE shared poll timer is module-level with no HMR guard  [LOW, dev-only]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:179-221`

**Failure scenario:**
1. In Next.js dev mode, the route module is hot-reloaded. The old module's `sharedPollTimer` is replaced by a new one, but `clearInterval` is never called on the old timer.
2. The orphaned interval keeps firing `sharedPollTick()` against the stale module's (empty) `submissionSubscribers` Map — so it returns early at line 225. Each HMR cycle accumulates one orphan timer that fires once per `ssePollIntervalMs`.
3. Non-issue in production (no HMR). The `unref` at line 219 prevents the timer from blocking process exit.

**Root cause:** Unlike `data-retention-maintenance.ts` (which uses `globalThis.__sensitiveDataPruneTimer`) and the SSE cleanup timer (which uses `globalThis.__sseCleanupTimer` + `__sseCleanupInitialized` guard at lines 122-141), the SSE poll timer uses a plain module-level `let` with no `globalThis` indirection and no double-register guard.

**Minimal fix:** Mirror the `globalThis.__pollTimer` pattern with a guard flag; check/clear it in `startSharedPollTimer`.

**Confidence:** 0.5

---

### DBG-22 — Per-key advisory lock but partition-wide cleanup in `shouldRecordSharedHeartbeat`  [LOW, perf]

**File:** `src/lib/realtime/realtime-coordination.ts:163-203`

**Failure scenario:**
1. `withPgAdvisoryLock(key, …)` at line 163 acquires `pg_advisory_xact_lock(md5(key))` — keyed on the specific `(assignmentId, userId)` heartbeat.
2. Inside the lock, the cleanup `tx.delete(realtimeCoordination).where(... LIKE heartbeat:% ...)` at line 194 scans and deletes rows for **all** heartbeats, not just the lock holder's.
3. Two concurrent heartbeats for different (assignment, user) pairs each hold their own advisory lock and both issue the same broad scan+delete against the heartbeat partition. They serialize on row-level locks but each transaction redundantly re-scans rows the other is deleting.
4. The just-inserted row is safe (expiresAt = nowMs + minIntervalMs, far from the cutoff), so this is perf/lock-contention only — not data loss.

**Root cause:** Per-key advisory lock + partition-wide cleanup. The cleanup would be better as a periodic sweep outside the per-heartbeat critical path.

**Minimal fix:** Move the stale-heartbeat cleanup to a separate periodic maintenance job (like `cleanup_orphaned_containers` for the compiler).

**Confidence:** 0.55

---

### DBG-23 — `parseBackupZip` path-traversal guard has false positives on names starting with `..`  [LOW]

**File:** `src/lib/db/export-with-files.ts:320-324`

**Failure scenario:**
1. The guard rejects entries whose `normalized.startsWith("..")`. A future storedName scheme beginning with `..` (or a migration from a system that allowed it) would be rejected as traversal even when it isn't.
2. Today `SAFE_STORED_NAME_RE` in `storage.ts` (`/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/`) prevents such names from being written, so this is latent only. But the guard's intent is to catch traversal, not enforce the storage regex. `..hidden.txt` is treated as traversal when it is not.

**Root cause:** The check conflates "starts with `..`" with "is exactly `..` or starts with `../`".

**Minimal fix:** Replace the four-clause condition with the standard: `if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("..\\") || normalized.includes("/") || normalized.includes("\\"))`. Drop the `startsWith("..")` case.

**Confidence:** 0.6

---

## Items checked and found NOT to be bugs

- **`claim-query.ts` SELECT-then-UPDATE race:** The whole claim flow is a single atomic CTE chain (`worker_slot → candidate → claimed → prev_worker_release → worker_bump`) using `FOR UPDATE SKIP LOCKED` on `candidate`. The optimistic `claimToken` fence prevents a zombie worker from double-writing a reclaimed row (poll route verifies token equality). No race.
- **`claim-query.ts` self-reclaim double-counting:** Documented invariant at lines 87-118. The `prev_worker_release` CTE excludes `previous_worker_id = @workerId`; the `worker_bump` SET expression subtracts the self-reclaim count. Net change is 0 for self-reclaims. Tests cover this.
- **`worker-staleness.ts` sweep stealing live work:** Two-threshold design (90 s status flip, 300 s `active_tasks` reset / reap) is correctly conservative. Status flip leaves `active_tasks` untouched; reset and reap share the same predicate so they cannot drift. Returning worker's heartbeat unconditionally sets `online`.
- **`claim-query.ts` deadlock between reciprocal reclaims:** Explicitly documented at lines 95-101 as self-recovering (Postgres aborts one txn, worker retries next poll). Accepted trade-off.
- **`executor.rs` `tempfile::TempDir` cleanup:** Auto-drops on scope exit (line 662 comment confirms). No leak in the Rust path.
- **`docker.rs` stdout/stderr drain on cap:** `tokio::io::copy(&mut inner, &mut tokio::io::sink())` at lines 397 and 414 keeps draining after the cap to prevent EPIPE-masking runtime errors. Correct.
- **`docker.rs` `parse_timestamp_epoch_ms` bounds:** Rejects pre-epoch / Docker zero-time; char-boundary-safe arithmetic. Correct.
- **`validation.rs` trusted-registry bypass:** `is_trusted_registry_image` correctly handles prefix-boundary cases (`registry.example.com.evil.com` rejected; `registry.example.com/team/…` accepted). Tests at lines 139-146 confirm.
- **`api.rs` auth header fallback:** Worker-secret fallback to shared token is logged once via `AtomicBool`; documented behavior. Not a bypass.
- **`main.rs` `usize` overflow on `active_tasks`:** `fetch_add`/`fetch_sub` on `AtomicUsize` is wrapping-free in practice (counts bounded by `concurrency` semaphore). No overflow.
- **`main.rs` `consecutive_empty_polls` shift overflow:** Capped at `BACKOFF_SHIFT_LIMIT = 5` via `.min()`. `saturating_mul` on the result. Safe.
- **`data-retention-maintenance.ts` `var` in `declare global`:** Required by TypeScript for ambient global declarations. Not a bug (commit `c6d17e21` correctly reverted an erroneous `let` change).
- **`rate-limiter-rs/src/main.rs:462` `usize::MAX` body bound:** Confirmed inside `#[cfg(test)] mod tests` only (test helper `decode_json`). Not production code.
- **`cleanup.ts` FK violations on `submissions` cascade:** Not applicable — cleanup only touches `auditEvents` and `loginEvents`, both of which are independent of `submissions`. Batched with `LIMIT BATCH_SIZE` to bound locks.
- **Docker image validation prefix spoofing:** `hasValidJudgeImageName` + `isTrustedRegistryImage` boundary checks (last segment must start with `judge-`, registry prefix must be in trusted list) are sound.

---

## Severity Summary

| ID | File (short) | Severity | Confidence | One-liner |
|---|---|---|---|---|
| DBG-1 | restore/route.ts:165-178 | Critical | 0.95 | DB replace commits; file restore non-atomic, no rollback path |
| DBG-2 | docker.rs:456,479 | High | 0.90 | `docker inspect`/`rm` no timeout; hung daemon wedges worker slot |
| DBG-3 | main.rs:489 | Medium | 0.80 | `retain` drops panicked JoinHandles silently |
| DBG-4 | compiler/execute.ts:735-747 | Medium | 0.75 | chmod 0o777 on chown-success path (security regression vs Rust) |
| DBG-5 | compiler/execute.ts:565-571 | Medium | 0.70 | Undici socket leak — body not drained on non-OK |
| DBG-6 | compiler/execute.ts:718-724 | Medium | 0.85 | Temp dir orphaned if pre-try lstat/chmod throws |
| DBG-7 | db/import-transfer.ts:21-33 | Medium | 0.85 | Stream limit doesn't cancel request body — bandwidth DoS |
| DBG-8 | db/export-with-files.ts:209-230 | Medium | 0.80 | Backup silently skips missing files; restore inherits dead links |
| DBG-9 | restore/route.ts:20 | Medium | 0.75 | No mutual exclusion between concurrent restores |
| DBG-10 | docker/client.ts:212-236 | Medium | 0.70 | Remote pull timeout 60s vs local 300s — asymmetric |
| DBG-11 | db/export-with-files.ts:239-249 | Medium | 0.70 | Full-ZIP materialization — OOM under concurrent backups |
| DBG-12 | submissions/visibility.ts:125-141 | Medium | 0.60 | Hidden per-row assignment query — N+1 in bulk paths |
| DBG-13 | judge/sync-language-configs.ts:23-64 | Medium | 0.70 | doSync non-atomic; partial state on mid-loop failure |
| DBG-14 | db/export-with-files.ts:282-295 | Low-Med | 0.70 | Optional manifest bypasses integrity checks |
| DBG-15 | db/export-with-files.ts:351-360 | Low | 0.80 | Orphaned uploads accumulate across restores |
| DBG-16 | db/export.ts:343-361 | Low | 0.55 | validateExport doesn't validate row shape |
| DBG-17 | db/pre-restore-snapshot.ts:75-77 | Low | 0.60 | Snapshot filename collision on ms + 8-char actor prefix |
| DBG-18 | db/import.ts:133 | Low | 0.60 | Unbatched DELETE in import transaction |
| DBG-19 | db/cleanup.ts:37-63 | Low | 0.50 | Cleanup cutoff reused across restore boundary |
| DBG-20 | docker/client.ts:347-372 | Low | 0.55 | buildDockerImageLocal resolves on timeout without awaiting exit |
| DBG-21 | submissions/[id]/events/route.ts:179-221 | Low | 0.50 | Module-level sharedPollTimer has no HMR guard (dev-only) |
| DBG-22 | realtime/realtime-coordination.ts:163-203 | Low | 0.55 | Per-key advisory lock + partition-wide cleanup |
| DBG-23 | db/export-with-files.ts:320-324 | Low | 0.60 | Traversal guard false positive on `..`-prefixed names |

## Recommended fix priority

1. **DBG-1** (Critical) — restore consistency. Single-step fix: stage-then-rename files, or auto-rollback from snapshot on file-restore failure.
2. **DBG-2** (High) — worker wedge. Wrap `inspect`/`kill`/`rm` in 15 s timeouts.
3. **DBG-6, DBG-7, DBG-3** — easy, high-leak-impact, minimal diff.
4. **DBG-4** — security regression; mirror the Rust fix.
5. **DBG-9, DBG-13** — transaction atomicity / advisory lock.
6. **DBG-5, DBG-10** — throughput/UX leaks.
7. Everything else — schedule into normal hardening.
