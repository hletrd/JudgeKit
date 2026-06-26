# Cycle 4 — debugger

Scope: latent-bug / failure-mode / regression review of JudgeKit at head
`edd45cc5`. Cycle 4 of 100. The cycle-3 surface is `207623f9` + 8 cycle-3
fixes (43 commits green, converging — do not inflate). Three jobs, exactly as
mission-scoped: (a) REGRESSION-check the 5 named cycle-3 fixes against their
edge cases; (b) CLOSE or RE-CONFIRM the cycle-3 debugger residuals **R1..R4**;
(c) hunt NET-NEW latent bugs (error/edge paths, async cleanup, signal
handling, leaks).

Evidence basis: full read of every cited file at the cited lines —
`judge-worker-rs/src/main.rs` (spawn body + shutdown + heartbeat),
`executor.rs` (report_panic / report_with_retry / dead-letter / chown-chmod),
`runner.rs` (execute_run chown+0o700), `docker.rs` (cleanup sweep / inspect /
kill / rm), `src/lib/assignments/recruiting-invitations.ts` (tx + FOR UPDATE),
`src/app/api/v1/admin/settings/route.ts` (password reconfirm),
`src/app/api/v1/submissions/[id]/events/route.ts` (SSE re-auth IIFE),
`src/lib/auth/permissions.ts` (`canAccessSubmission` field shape),
`src/lib/security/password-hash.ts` (`verifyAndRehashPassword`), and
`src/lib/compiler/execute.ts` (R1). The cycle-3 debugger review
(`.context/reviews/debugger.md` at `207623f9`) is the baseline.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: HIGH / MED / LOW.
Validation tag: **confirmed** (read + logically proven at head),
**likely** (read + strong inference), **needs-manual-validation** (requires
runtime/docker to nail down).

---

## EXECUTIVE SUMMARY

All 5 cycle-3 fixes are **CONFIRMED correct** on the mission's named edge
cases — no regression introduced. Each carries at most a LOW-severity residual
that is either a pre-existing shared limitation (runner mirrors executor) or a
theoretical cancel-path fragility with no trigger today.

**R1..R4 all STILL OPEN at head** — none were touched by the cycle-3 commits
(the cycle-3 LOW batch `6ec17d6e` only added the AGG-17 clamp `warn!`, PB-1,
and the freezeLeaderboardAt/count fixes). They are re-confirmed below at the
same severity, not inflated, not dropped.

One **NET-NEW MEDIUM** found: the periodic orphan sweep runs un-timeout'd
`docker ps`/`docker rm` directly in the worker main loop, so a wedged dockerd
hangs the entire loop (no polling, no shutdown). This is the symmetric gap the
cycle-3 R2/R4 per-submission hardening left un-guarded — highest-ROI worker
item this cycle.

**Top action items, ranked:**
1. **N1** (MEDIUM) — `cleanup_orphaned_containers` has no timeout on its
   `docker ps`/`docker rm`; awaited inline in the main loop → wedged dockerd
   freezes the worker. Pair with R2/R4 for a complete cleanup-hardening pass.
2. **R2** (HIGH) — orphan sweep filters `status=exited` only; running `oj-*`
   leaked by a timed-out kill/rm is never reaped, contradicting the
   "orphan sweep will reap" log promise (docker.rs:255,273).
3. **R3** (LOW/MED) — inspect timeout returns `oom_killed:false`, masking a
   real OOM in the verdict.
4. **R4** (LOW) — no `kill_on_drop(true)` on the cleanup Commands → orphaned
   `docker` CLI children under wedged dockerd.
5. **R1** (LOW) — compiler chown-failure catch still 0o777/0o666 (intentional
   CAP_CHOWN-less fallback; partial-chown EPERM sub-case still present).

No CRITICAL data-loss / capacity-wedge regression was found in the cycle-3
surface. The catch_unwind, recruiting-tx, settings-reconfirm, and SSE re-auth
fixes all behave correctly under their named failure paths.

---

## (a) REGRESSION — cycle-3 fixes vs. mission edge cases

### A — `catch_unwind` executor panic recovery: CONFIRMED on Ok + panic; dead-letter survives DB outage; _permit always dropped (LOW residuals noted)
- Commit `45473b20` · Files: `judge-worker-rs/src/main.rs:559-591`, `executor.rs:899-928` (`report_panic`), `executor.rs:971-1066` (`report_with_retry` + dead-letter)
- Mission questions, answered:
  - **`active_tasks` decremented exactly once on every path?** On the **Ok**
    path `catch_unwind` returns `Ok`, the `if let Err` arm is skipped, and
    `active_tasks.fetch_sub(1, Relaxed)` (main.rs:589) runs **exactly once**.
    On the **caught-panic** path `catch_unwind` returns `Err`, `report_panic`
    is awaited, control falls through to the same single `fetch_sub` —
    **exactly once**. There is only one `fetch_sub` call site in the task, so
    double-decrement is structurally impossible. ✓
  - **Dead-letter survives a DB outage?** **Yes.** `report_panic` →
    `report_with_retry` (executor.rs:971) retries the HTTP `report_result` 3×
    (1s, 2s backoff, L1003), then on exhaustion writes a `DeadLetterEntry`
    JSON file to `config.dead_letter_dir` via `fs::write` (L1046). A DB
    outage manifests as the app server's `/report` returning 5xx → retries
    exhaust → **local filesystem** dead-letter. The dead-letter fails only on
    a *filesystem* fault (disk full / EIO / perms), logged "Result is lost"
    (L1035/1043/1052). The DB layer is not on this path. ✓
  - **Outer task still drops `_permit`?** **Yes.** `_permit` (main.rs:562) is
    the first binding in the `async move` block; a `Semaphore::OwnedSemaphorePermit`
    releases on `Drop`. On Ok, caught panic, double-panic (unwind), or task
    cancellation, the permit is dropped → semaphore slot released. ✓
- **Residual A1 (LOW / HIGH confidence / likely):** `report_panic` is NOT
  wrapped in `catch_unwind`. If it itself panics (a "double panic"), the
  unwind skips `fetch_sub` (main.rs:589) → `active_tasks` drifts up by 1 per
  occurrence. Narrow: `report_panic` is a thin wrapper over `report_with_retry`
  (network + fs I/O, no `.unwrap()`), and `format!("executor panicked: {msg}")`
  on a `String` cannot panic. The drift is also self-bounded because the task's
  `JoinHandle.await` surfaces the JoinError at shutdown (main.rs:633-634) and
  the semaphore slot still releases via `_permit` drop. Cosmetic capacity
  over-report to the heartbeat only.
- **Residual A2 (LOW / HIGH confidence / confirmed):** `active_tasks` is a
  manual `fetch_add`/`fetch_sub`, NOT RAII like `_permit`. On any future task
  `abort()` or cancel-mid-await, `fetch_sub` is skipped while `_permit` still
  releases → the two capacity views diverge (`active_tasks` over-counts,
  reported to the server as `available = concurrency.saturating_sub(active)`
  at main.rs:364-365, heartbeated at L369). **No `abort()` exists for executor
  tasks today** (task_handles are awaited gracefully at L632, never aborted;
  only `runner_handle` is aborted at L651), so this is a footgun for future
  maintainers, not a current drift. Fix (cheap, future-proof): replace the
  manual counter with a `struct ActiveTaskGuard(AtomicUsize)` that increments
  on creation and decrements on `Drop`, mirroring the permit — then every path
  including cancel is correct by construction.
- **Idempotency check (no double-report):** `executor::execute` reports
  exactly once — every `report_error`/`report_result` site is followed by
  `return` (executor.rs:314, 359, …; final `report_result` is last). A panic
  therefore always occurs *before* any report, so `report_panic` cannot
  produce a second verdict for a submission that already received one. ✓
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### B — `runner.rs` chown + 0o700: CONFIRMED mirrors executor; same shared chmod-after-chown EPERM limitation (LOW, not a new regression)
- Commit `527a9d60` · File: `judge-worker-rs/src/runner.rs:837-881`
- Mission questions, answered:
  - **TOCTOU between chown and chmod?** `tempfile::TempDir` creates the dir at
    `0o700` (Unix default). `chown` does not change mode, so between `chown`
    (L837) and `set_permissions(0o700)` (L849) the mode is `0o700` throughout
    — **no world-writable window** exists. The post-chown owner is 65534; only
    65534/root (i.e. the sandbox) can access, which is the intent. ✓
  - **Failure mode if 65534 (nobody) doesn't exist in the container?**
    **Non-issue.** `chown` and file-access checks operate on the **numeric
    uid**, not `/etc/passwd`. The container runs `--user 65534:65534`
    (numeric); the kernel matches uid, not a name. No name lookup is involved
    in the access path. ✓
  - **chown succeeds but chmod fails — does the 0o777/0o666 fallback let the
    container run?** **No fallback for this case, by design — and executor.rs
    behaves identically.** The fallback mode (`0o777`/`0o666`) is selected
    only when `chown` *fails* (`chown_ok`/`source_chown_ok` false). If chown
    *succeeds* the selected mode is `0o700`/`0o600`, and a subsequent
    `set_permissions` failure returns via `?` (runner.rs:854,881) →
    `execute_run` returns `Err(String)` → the `/run` HTTP handler surfaces an
    error (no container spawned). executor.rs (executor.rs:343-360) is the
    same shape: chmod failure → `report_error` (runtime_error verdict) +
    `return`. The narrow trigger — a non-root worker with **CAP_CHOWN but not
    CAP_FOWNER**, so `chown` to 65534 succeeds and the now-non-owner `chmod`
    EPERMs — is a **pre-existing shared limitation** of both files; runner.rs
    now mirrors executor.rs rather than introducing a new divergence.
    Common deployments (root worker; or no-caps dev worker where chown fails →
    `0o777` fallback) are unaffected.
- **Status: REGRESSION-CHECK PASSED (consistent with executor).** Verdict:
  **confirmed**. The chmod-after-chown EPERM edge is restated as N3 (LOW),
  not a regression.

### C — recruiting metadata tx + FOR UPDATE: CONFIRMED — no deadlock, no lock upgrade, no serialization_failure at default isolation
- Commit `ec48f84c` · File: `src/lib/assignments/recruiting-invitations.ts:386-448`
- Mission questions, answered:
  - **Deadlock with the atomic `jsonb_set` path?** **No.** Both the new tx
    (`SELECT … FOR UPDATE` + `UPDATE`, L395-447) and the atomic counter
    (`incrementFailedRedeemAttempt`, a single `UPDATE … WHERE id`) lock exactly
    **one row** — the invitation row by `id`. A deadlock requires a circular
    wait across ≥2 resources; with a single-row lock on both paths there is no
    cycle. The tx locks the row at the `FOR UPDATE` read and holds it through
    its own `UPDATE`; the atomic path locks it at its single `UPDATE`. They
    purely serialize. ✓
  - **Lock upgrade?** **No.** `SELECT … FOR UPDATE` already acquires the
    strongest row-level lock (row-exclusive). The subsequent `UPDATE` on the
    same row needs no upgrade — it re-acquires the same lock class on a row it
    already holds. No lock-upgrade deadlock surface. ✓
  - **Behavior under `serialization_failure`?** **Non-issue at deployed
    isolation.** A repo-wide grep for `isolation|serializable|isolationLevel`
    over `src/lib/db*` and `src/lib/db/` returned **zero hits** — drizzle
    therefore runs the transaction at PostgreSQL's default **READ COMMITTED**,
    under which `FOR UPDATE` does not raise `serialization_failure`. (Under a
    future SERIALIZABLE flip, the tx would need retry-on-40001; not present
    today.)
- **Drizzle SQL-order sanity:** the chain `.where(eq(id)).for("update").limit(1)`
    (L394-396) is reordered by drizzle's builder to emit `FOR UPDATE` *after*
    `LIMIT` (valid PostgreSQL: `SELECT … LIMIT 1 FOR UPDATE`). No syntax-error
    risk. ✓
- **Semantic-preservation check:** when both `metadata` and `status` are set,
    the status update now runs inside the tx with `WHERE status='pending'`
    (L420-428) and throws `invitationCannotBeRevoked` (rowCount 0) → tx
    rollback, which also rolls back the metadata merge. The legacy single-row
    `UPDATE` had the same atomic semantics; behavior is preserved *plus* the
    row lock. The non-metadata `status`-only path keeps the legacy plain
    `UPDATE` (L441-453) — correct, since no read-modify-write needs
    serialization there. ✓
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### D — settings PUT password reconfirm: CONFIRMED — throw path is a clean pre-mutation 500, no partial update
- Commit `50af8196` · File: `src/app/api/v1/admin/settings/route.ts:85-112`
  (gate), `src/lib/security/password-hash.ts:63-83`
- Mission questions, answered:
  - **Error path when `verifyAndRehashPassword` throws (not returns false)?**
    The gate (L97-110) runs **before any settings mutation** — after
    destructuring `body` (L78-82) and *before* `hasNewKeys` (L112) and the
    `db.update(systemSettings)` write. So a throw from `verifyAndRehashPassword`
    propagates to `createApiHandler`'s outer try/catch → **clean 500, no
    settings row touched**. `verifyAndRehashPassword` itself wraps its only
    side-effect (the rehash write) in try/catch (password-hash.ts:70-80) and
    returns `{ valid }` — it does not throw on a rehash failure, only
    potentially on a malformed `storedHash` inside `verifyPassword`. Either
    way the gate is pre-mutation → no partial state. ✓
  - **Partial-update rollback?** The settings write is a single
    `db.update(systemSettings).set(...)` (one row, atomic). The only
    preceding mutation is the optional rehash-on-valid (`users` row), an
    intended transparent side-effect shared with restore/backup/migrate — if
    the subsequent settings `UPDATE` fails, the rehash remains applied
    (benign; re-hash-on-success pattern). No multi-row non-atomic mutation was
    introduced. ✓
- **Coverage check:** `SENSITIVE_SETTINGS_KEYS` (L24-44) covers the
  privilege-affecting surface (`platformMode`, `allowedHosts`,
  `publicSignupEnabled`, `emailVerificationRequired`, hCaptcha keys, SMTP
  pass, all rate-limit ceilings, `sessionMaxAgeSeconds`). A `touchesSensitiveKey`
  body scan (L92-94) triggers the gate whenever any is `!== undefined`, so
  omitting `currentPassword` → 401 `passwordReconfirmRequired` (L96-98);
  missing hash → 403 `authenticationFailed` (L103-105); wrong password → 403
  `invalidPassword` (L107-109). Cosmetic keys (`siteTitle` etc.) remain
  editable without reconfirm. ✓
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### E — SSE re-auth re-runs `canAccessSubmission`: CONFIRMED — deleted-row and throw both close cleanly; projection is exact
- Commit `96105df5` · File: `src/app/api/v1/submissions/[id]/events/route.ts:471-487`
- Mission questions, answered:
  - **Submission row deleted mid-stream?** The re-fetch
    `db.query.submissions.findFirst({ where: eq(id), columns:{userId,assignmentId} })`
    (L475-478) returns `undefined` → `!refreshedReader` short-circuits to
    `close()` (L479-482). Stream closes cleanly, no exception. ✓
  - **`canAccessSubmission` throws?** The re-fetch + `canAccessSubmission`
    call (L475-479) is inside the IIFE's `try { … } catch { close() }`
    (L465-487), and the whole IIFE is terminated by `.catch(err => { logger.error; close() })`
    (L504-513). A throw from either `findFirst` or `canAccessSubmission` →
    `close()`. No unhandled rejection reaches the runtime. ✓
  - **Projection sufficiency (the subtle one):** `canAccessSubmission`
    (`src/lib/auth/permissions.ts:292-320`) declares
    `submission: { userId: string; assignmentId: string | null }` and reads
    **only** `submission.userId` (L307) and `submission.assignmentId` (L319).
    The re-auth projects exactly `{ userId: true, assignmentId: true }`
    (L477) — **no field is missing**, so the re-authorization decision is
    identical to the stream-open gate (which passes the full row but only
    consumes these two fields). No false-allow/false-deny from a partial
    shape. ✓
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**. (The cycle-3
  N4 interleave note — duplicate `event: result` under a precise tick race —
  is still bounded by the `closed` guard + `.catch(close)` wrappers; not a
  crash/leak. Unchanged, not restated.)

---

## (b) R1..R4 — status at head (`edd45cc5`)

All four residuals **REPRODUCES / still open**. None were modified by any
cycle-3 commit (verified by reading current head; the cycle-3 LOW batch
`6ec17d6e` touched only AGG-17 clamp-warn, freezeLeaderboardAt, the
accepted-solutions count filter, and PB-1 test rename). Severities unchanged
from cycle 3 — not inflated, not dropped.

### R1 — STILL OPEN (LOW / accepted fallback, HIGH confidence / confirmed)
- `src/lib/compiler/execute.ts:748-757`. The chown-failure `catch` still sets
  `chmod(workspaceDir, 0o777)` + `chmod(sourcePath, 0o666)` (L755-756). This
  is the **intentional mirror** of the Rust fallback
  (`executor.rs:342` `target_mode = if chown_ok { 0o700 } else { 0o777 }`) —
  on a host without `CAP_CHOWN` there is no other way to grant uid-65534
  write access. **DBG-4 remains accepted-by-design, documented.**
- **Partial-chown sub-case still present (LOW/MED):** if
  `chown(workspaceDir)` (L740) succeeds but `chown(sourcePath)` (L741)
  throws, the `catch` runs `chmod(workspaceDir, 0o777)` on a dir now owned by
  65534. On a non-root worker with CAP_CHOWN but not CAP_FOWNER this inner
  `chmod` throws EPERM, is **not** wrapped, and propagates to the outer
  `finally` (L841) — the compile attempt throws a raw EPERM. Runs-as-root
  deployments unaffected. Same shared limitation class as B/N3.

### R2 — STILL OPEN (HIGH / HIGH confidence / confirmed)
- `judge-worker-rs/src/docker.rs:642-681`. `cleanup_orphaned_containers` runs
  `docker ps -a --filter name=oj- --filter status=exited -q` (L647-651) — it
  filters `status=exited` **exclusively**. A container that is still
  `running` after `kill_container`/`remove_container` timed out is invisible
  to this sweep and is never reaped. The timeout warnings at `docker.rs:255`
  and `docker.rs:273` say *"orphan sweep will reap"* — a **false promise**
  given the filter.
- Failure scenario unchanged from cycle 3: wedged dockerd → `kill`/`rm` time
  out (10s) and return → container stays `running` → sweep filters it out →
  leaks indefinitely, accumulating `oj-*` until memory/pid starvation.
- Fix (minimal): drop the `status=exited` filter and add a stale-`running`
  branch mirroring the TS reaper (`execute.ts:897-928`) — `docker rm -f` any
  `oj-*` whose `StartedAt` exceeds `MAX_TIME_LIMIT_MS + compile budget + slack`.

### R3 — STILL OPEN (LOW→MED / HIGH confidence / confirmed)
- `judge-worker-rs/src/docker.rs:187-198`. On inspect timeout the function
  returns `ContainerInspect { oom_killed: false, duration_ms: None, memory_peak_kb: None }`
  (L193-197). The success-arm (L504-516) and timeout-arm (L527-538) callers
  then report `oom_killed: false`, masking a genuine OOM whose post-run
  `docker inspect` stalled past 10s. Duration falls back to wall-clock
  (`unwrap_or(wall)`) which is still correct; only the OOM signal is lost.
- Fix (minimal): emit a distinct `warn!` ("oom/peak unknown: inspect
  timeout") and treat `oom_killed` as unknown (`Option<bool>`) so the verdict
  can pick a conservative label instead of asserting not-OOM.

### R4 — STILL OPEN (LOW / HIGH confidence / confirmed)
- `judge-worker-rs/src/docker.rs:175` (inspect), `:245` (kill), `:263` (rm).
  None of the three cleanup `tokio::process::Command`s chain
  `.kill_on_drop(true)`. On `tokio::time::timeout` `Err`, the `output()`
  future is dropped and tokio does **not** kill the child without
  `kill_on_drop` — the orphaned `docker inspect/kill/rm` CLI keeps queuing
  against the unresponsive daemon. Transient (CLI self-terminates once dockerd
  recovers), but compounds R2/N1 under a wedge.
- Fix (minimal): `.kill_on_drop(true)` on each cleanup `Command`. Combined
  with the N1 timeout and the R2 reap-stale-running branch, the cleanup path
  becomes leak-free.

---

## (c) NET-NEW latent bugs

### N1 — periodic orphan sweep has NO timeout on `docker ps`/`docker rm`; awaited inline in the main loop → wedged dockerd freezes the worker (MEDIUM / HIGH confidence / confirmed)
- Files: `judge-worker-rs/src/docker.rs:642-681` (sweep body),
  `judge-worker-rs/src/main.rs:505-508` (call site)
- The cycle-3 R2/R4 hardening wrapped the **per-submission** `inspect` /
  `kill` / `rm` in `tokio::time::timeout(10s)` (docker.rs:173, 243, 261) —
  but the **periodic** `cleanup_orphaned_containers` sweep was left
  un-guarded. Its `docker ps -a …` (docker.rs:643-654) and the batched
  `docker rm` (docker.rs:665-668) are bare `Command::new("docker").output().await`
  with **no timeout wrapper**.
- Critically, the sweep is awaited **inline in the main loop**:
  ```
  if last_cleanup_at.elapsed() >= cleanup_interval {   // 300s
      docker::cleanup_orphaned_containers().await;     // main.rs:506 — blocks here
      last_cleanup_at = …;
  }
  ```
  The shutdown `tokio::select!`s (permit acquire main.rs:512, poll
  main.rs:529) are **below** this point and are never reached while the sweep
  is pending. So when the 300s tick fires against a wedged dockerd:
  1. `docker ps -a …` blocks indefinitely (no timeout, dockerd unresponsive).
  2. The main loop stalls at main.rs:506 — no new polls, **no shutdown
     response** (SIGTERM/SIGINT select is unreachable).
  3. The heartbeat task (separate `tokio::spawn`, main.rs:353) keeps beating,
     so the server still considers the worker alive — but it processes zero
     submissions and cannot be drained gracefully. Operators must SIGKILL,
     which leaves in-flight claims stuck until `staleClaimTimeoutMs`.
- This is the **symmetric gap** to R2/R4: per-call cleanup is hardened,
  periodic cleanup is not, and the periodic one runs on the hot loop. It is
  the single highest-ROI worker-latent item this cycle.
- Fix (minimal): wrap both Commands in `tokio::time::timeout(Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS))`
  (reuse the existing constant), chain `.kill_on_drop(true)` (also closes R4
  for these two sites), and ideally move the sweep into its own
  `tokio::spawn` (or wrap the call in `tokio::select!` with `&mut shutdown`)
  so a hung sweep cannot block polling or shutdown. Verdict: **confirmed**.

### N2 — `active_tasks` is manual `fetch_sub`, not RAII; `report_panic` is outside `catch_unwind` (LOW / HIGH confidence / likely)
- Files: `judge-worker-rs/src/main.rs:557, 579-589`
- See residual A1/A2 in §A. The permit is RAII (releases on every path); the
  `active_tasks` counter is not. On a double-panic (`report_panic` panics)
  `fetch_sub` is skipped; on any future task `abort()`/cancel, `fetch_sub` is
  skipped while the permit releases → `active_tasks` over-counts, heartbeated
  as reduced `available` capacity (main.rs:364-365,369). No `abort()` exists
  for executor tasks today, so drift is latent-only.
- Fix (cheap, defensive): a `struct ActiveTaskGuard(&AtomicUsize)` that
  increments on `new()` and decrements on `Drop`, held alongside `_permit` in
  the task body — makes every path (Ok, panic, double-panic, cancel) correct
  by construction. Verdict: **likely**.

### N3 — `runner.rs` chmod-after-chown EPERM (shared with `executor.rs`); fallback only on chown-FAILURE, not chmod-FAILURE (LOW / HIGH confidence / confirmed)
- Files: `judge-worker-rs/src/runner.rs:837-881, 874-881`;
  `judge-worker-rs/src/executor.rs:331-360`
- Detailed in §B. The `0o777`/`0o666` fallback is selected only when `chown`
  fails. If `chown` succeeds (mode → `0o700`/`0o600`) and the subsequent
  `set_permissions` EPERMs (non-root worker with CAP_CHOWN but not
  CAP_FOWNER, having just chowned the file away from itself), `runner.rs`
  returns `Err` via `?` (no container spawned) and `executor.rs` reports
  `runtime_error` + returns. Neither falls back to broad mode on a chmod
  failure. Common deployments unaffected; narrow config-only trigger. Not a
  cycle-3 regression — runner now mirrors executor. Verdict: **confirmed**.

---

## FINAL SWEEP

- **Rust panics on the recovery path:** `panic_payload_message`
  (main.rs:21-29) handles `String`, `&'static str`, and falls back to
  `"<non-string panic>"` for any other `Box<dyn Any + Send>` — it cannot
  itself panic (no unwrap). The three unit tests (main.rs:658-693) pin all
  three branches. The `child.stdout.take().expect(...)` sites (docker.rs:434,451)
  remain safe (child spawned with all three stdios piped). No new
  `.unwrap()`/`.expect()` in production code from the cycle-3 commits.
- **Integer / shift arithmetic:** main-loop backoff
  `1u64 << (consecutive_empty_polls-1).min(BACKOFF_SHIFT_LIMIT)` (main.rs:602)
  is shift-capped at 5 and `saturating_mul` + `.min(MAX_BACKOFF_MS)` — no
  overflow. rate-limiter-rs `2u64.pow(exp)` (main.rs:262) with
  `exp = consecutive_blocks.min(MAX_CONSECUTIVE_BLOCKS_EXP)` (L261) → max ×16,
  then `.min(MAX_BLOCK_MS)`; `block_ms * multiplier` is config-sourced
  (seconds-level), well within u64 — consistent with the AGG-44 non-issue.
- **Cancellation / FS safety:** `tempfile::TempDir` (executor.rs:301,
  runner.rs:827) releases on every exit including `?` and unwind. The
  recruiting tx rolls back on any throw inside the callback (incl.
  `invitationCannotBeRevoked`). The restore uploads path (cycle-3 F1)
  remains the only non-atomic FS write under cancellation pressure — not
  touched this cycle, still deferred (AGG-1).
- **Unhandled rejections on the SSE path:** every async branch in
  `onPollResult` ends in `.catch(close)` (events/route.ts:504-513, 524-529);
  the new re-auth re-fetch sits inside the existing `try/catch{close}`. No
  unhandled-rejection surface introduced. (The server-side empty-catch grep
  returned only client-side fire-and-forget UI actions — localStorage, theme,
  lecture-mode, recruit signOut — all acceptable.)
- **Signal handling / shutdown:** SIGTERM/SIGINT cancel the polling selects
  (main.rs:512-526, 529-546). Graceful shutdown awaits in-flight tasks
  (main.rs:632-636) with **no overall timeout** — bounded in practice because
  every docker op is 10s-timeout-wrapped and `report_with_retry` is ≤~3s +
  one fs write, but a tightly-serialized slow network can stretch shutdown by
  ~3s × in-flight count. The one true shutdown hazard is N1 (a hung sweep
  blocks the select from ever being reached). Heartbeat is independently
  spawned (main.rs:353) and cancelled via `CancellationToken` (L621).
- **No CRITICAL data-loss / capacity-wedge regression** was found in the
  cycle-3 surface. The 5 fixes are correct on their named edge cases; the
  worker-cleanup residuals (R2/R3/R4 + N1) are the incompleteness left by
  the per-submission hardening, not new destructive paths.

---

## References (all paths absolute)

- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/main.rs:559-591` —
  §A catch_unwind spawn body (active_tasks/permit/report_panic).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/executor.rs:899-928`
  — §A `report_panic`; `:971-1066` `report_with_retry` + dead-letter (DB-outage survival).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/runner.rs:837-881`
  — §B/N3 runner chown+0o700 (chmod-after-chown EPERM shared with executor).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/executor.rs:331-360`
  — §B/N3 executor chown+0o700 (fatal-on-chmod-fail, same shape).
- `/Users/hletrd/flash-shared/judgekit/src/lib/assignments/recruiting-invitations.ts:386-448`
  — §C tx + FOR UPDATE (single-row lock, READ COMMITTED).
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/admin/settings/route.ts:85-112`
  — §D password-reconfirm gate (pre-mutation).
- `/Users/hletrd/flash-shared/judgekit/src/lib/security/password-hash.ts:63-83`
  — §D `verifyAndRehashPassword` (rehash in try/catch, returns `{valid}`).
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/submissions/[id]/events/route.ts:471-513`
  — §E SSE re-auth re-fetch + `canAccessSubmission` (inside try, `.catch(close)`).
- `/Users/hletrd/flash-shared/judgekit/src/lib/auth/permissions.ts:292-320`
  — §E `canAccessSubmission` reads only `{userId, assignmentId}` (projection exact).
- `/Users/hletrd/flash-shared/judgekit/src/lib/compiler/execute.ts:748-757` —
  R1 chown-failure catch still 0o777/0o666 (accepted fallback).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/docker.rs:642-681`
  — R2 orphan sweep `status=exited` filter; **N1** un-timeout'd `docker ps`/`rm`.
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/main.rs:505-508`
  — **N1** sweep awaited inline in main loop (blocks shutdown select).
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/docker.rs:187-198`
  — R3 inspect timeout returns `oom_killed:false`.
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/docker.rs:175,245,263`
  — R4 no `kill_on_drop(true)` on cleanup Commands.
