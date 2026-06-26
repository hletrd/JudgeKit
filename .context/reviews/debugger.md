# Cycle 2 — debugger

Scope: latent-bug / failure-mode review of JudgeKit at head `ad543e14`. Three jobs:
(1) REGRESSION-check the 12 cycle-1 Phase A fixes; (2) confirm Phase B items still
reproduce; (3) hunt NEW latent bugs across the TS app and the Rust worker.

Evidence basis: full diffs of all 12 Phase A commits + downstream consumers read at
the cited line numbers. `cargo check` on `judge-worker-rs` exits 0.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: HIGH/MED/LOW.

---

## REGRESSION — cycle-1 Phase A fixes

### R1 — A2 restore audit uses the NON-durable buffered audit path (HIGH / confidence HIGH)
- Fix commit: `7548c7a6` · File: `src/app/api/v1/admin/restore/route.ts:168`
- The fix correctly moves `recordAuditEvent(...)` to AFTER `importDatabase` commits
  (so it survives the TRUNCATE that the import transaction applies to `auditEvents`).
  This is a strict improvement over the pre-fix behavior (where the audit was always
  wiped). **But the plan (A2) explicitly required reusing the *durable*-audit helper.**
- The call uses `recordAuditEvent` (`src/lib/audit/events.ts:252`), which only PUSHES
  to `_auditBuffer` and arms a ~5s flush timer — it is **not** `await`-ed and **not**
  `recordAuditEventDurable` (`events.ts:275`, which does an immediate awaited insert).
- Failure mode: on a serverless / short-lived process that exits within the 5s flush
  window (SIGTERM drain, lambda freeze, OOM kill, `docker stop`), the buffered
  `system_settings.database_restored` row is LOST. This is the single most
  safety-relevant audit event in the system (destructive DB replacement), yet it is
  the least crash-safe.
- Note on the plan's premise: the "durable-audit helper used by user deletion" does
  not exist — the user-deletion mirror at `src/app/api/v1/users/[id]/route.ts:506`
  ALSO calls non-durable `recordAuditEvent`. So A2 copied a pattern that is itself
  broken (that is the separate AGG-41 Phase B item).
- Trigger: any DB restore followed by process exit within ~5s.
- Fix (minimal): replace the L168 call with `await recordAuditEventDurable({...})`
  (same input shape). One-line change. The function falls back to the buffer on
  insert failure and never throws, so it is a safe drop-in.

### R2 — A2 audit fires before file restore; file-restore failure yields a false-success audit (MEDIUM / confidence HIGH)
- File: `src/app/api/v1/admin/restore/route.ts:168-184`
- Sequence post-fix: `importDatabase` (L151) → audit recorded (L168) →
  `restoreParsedBackupFiles` (L183). If the file restore throws, control lands in
  the outer `catch` (L193) and the HTTP response is `{error:"restoreFailed"}` 500 —
  but the audit row already says `database_restored`. The audit summary also only
  records "N files pending", never "files restored"; the trail cannot distinguish a
  full success from a DB-replaced-but-files-lost outcome.
- This is the DBG-1 / AGG-1 atomicity gap restated through the audit lens; it is NOT
  fixed by A2. Combined with R1 (non-durable), a restore that crashes the process
  mid-file-restore leaves NO reliable trail and a split-state filesystem.
- Fix belongs to the Phase B full staging-then-rename design; in the interim the
  audit `details` should include the final `filesRestored` count (move the audit to
  AFTER `restoreParsedBackupFiles`, or emit a second `database_files_restored`
  audit after the file phase).

### R3 — A12 drift cleanup set-diff can mask drift and leave probe residue (LOW / confidence MED)
- Fix commit: `b860f53a` · File: `scripts/check-migration-drift.sh:81-105`
- The cleanup keys its set-difference on the FULL porcelain v1 line
  (`after.filter((entry) => !before.has(entry))`, L90), and the drift trigger itself
  is a string compare of the two porcelain snapshots. Consequence when a developer
  has a pre-existing local modification to a TRACKED migration file (` M path` in
  `before`) AND the drizzle-kit probe modifies that same file: the status line is
  identical in both snapshots, so (a) the diff skips it → the probe's edits are left
  mixed into the developer's file (dirty workspace, not data loss), and (b) if that
  was the only touched file, `$before == $after` → drift goes UNDETECTED.
- The new test (`tests/unit/infra/migration-drift-cleanup.test.ts`) only exercises
  the no-drift path; the drift/cleanup branch (L81-105) is not covered.
- Fix: diff on PATH only (strip the 2-char status), and for any tracked entry present
  in `after`, `git checkout --` it unconditionally (the probe's job is to leave no
  trace, so reverting a probe-touched tracked file is always correct even if the dev
  also had pending edits — those edits are recoverable from reflog/HEAD only if
  committed, which is the CI contract).

### A8 — compiler import-time throw → logged error: CONFIRMED CLEAN (no latent bug)
- Fix commit: `dcaf9109` · File: `src/lib/compiler/execute.ts:64-87`
- User asked specifically whether the downstream `configError` path handles the new
  no-throw correctly. It does. `tryRustRunner` early-returns `null` when the token
  is missing (`execute.ts:537`: `if (!COMPILER_RUNNER_URL || !RUNNER_AUTH_TOKEN)
  return null`), so `executeCompilerRun` reaches the explicit configError branch at
  `execute.ts:641` (`if (COMPILER_RUNNER_CONFIG_ERROR && !SHOULD_ALLOW_LOCAL_FALLBACK)`)
  and returns a `configError`-shaped `CompilerRunResult`. The constant
  `COMPILER_RUNNER_CONFIG_ERROR` (L84-87) is set exactly when URL is configured but
  token is missing and `RUNNER_AUTH_DISABLED` is unset — matching the L64 condition.
  The comment at L67-68 is accurate. No new failure mode.

### A10 — Rust validation test env-race fix: CONFIRMED CLEAN (no residual unsafe env mutation)
- Fix commit: `1f6d15d4` · File: `judge-worker-rs/src/validation.rs`
- Grep across `judge-worker-rs/src/*.rs` for `set_var|remove_var|unsafe` returns
  ZERO hits. Production env reads are centralized in `parse_trusted_registries()` /
  `is_production_mode()` (single boundary), and tests inject config via the new
  `validate_docker_image_with_config` / `validate_admin_image_tag_with_config`
  pure variants. Race eliminated; `cargo check` clean.

### Other Phase A fixes — confirmed correct on review
- **A1** (`40250e63`) env 0600 + startup guard: sound. `assertLoadedEnvFilePermissions`
  is wired in `src/instrumentation.ts:29`; mode check `(stats.mode & 0o077) !== 0`
  is correct. (See F4 for a LOW note on the candidate-file list.)
- **A3** (`f9d72920`) group DELETE IDOR: correct; `instructorId` fetched inside the
  `for("update")` tx, `canManageGroupResourcesAsync` + `groups.view_all` gate applied;
  `forbidden` branch mapped.
- **A4** (`b10e5216`) co_instructor escalation: correct; `getRoleLevel` returns -1
  for unknown roles (`capabilities/cache.ts:123`) so unknown-role targets are blocked
  (`<= 0`), not escalated.
- **A5** (`08ac027a`) api-keys PATCH: correct. `apiKeys.role` is
  `.notNull().default("admin")` (`schema.pg.ts:161`), so `body.role ?? existing.role`
  is never null and `canManageRoleAsync` receives a real role string. The gate now
  covers `isActive`/`name`/`expiryDays` mutations on higher-privilege keys.
- **A6** (`35d08f2a`) chat-widget sanitize: correct; both branches route through
  `sanitizedMessages`, tool results sanitized at `route.ts:499-505`, threat-surface
  comment added at `tools.ts:65-71`.
- **A7** (`ac5289f3`) XFF `TRUSTED_PROXY_HOPS=0`: correct; `trustedHops > 0 && …`
  short-circuits the XFF path cleanly.
- **A9** (`4b93c5ff`) function export fields: correct; the three fields are SELECTed
  (`export/route.ts:21-23`) and flow into the response via `...problem` spread (L61).
- **A11** (`d4efb27b`) problem GET strict: correct; routes hidden-data decision
  through `canManageProblem(id, user.id, user.role)`.

---

## PHASE-B CONFIRMATION (still reproduce at head)

### DBG-1 — restore DB-before-files atomicity: REPRODUCES
- `src/app/api/v1/admin/restore/route.ts:151-184`. `importDatabase` replaces every
  table inside one transaction, THEN `restoreParsedBackupFiles` writes uploads.
  A failure during the file phase leaves the DB already replaced with no automatic
  rollback; only the manual `preSnapshotPath` snapshot remains. A2 moved the audit
  earlier but did not change this ordering. Confirmed.

### DBG-2 — docker inspect / kill / rm without timeout wrapping: REPRODUCES (highest-priority hang)
- `judge-worker-rs/src/docker.rs`: `inspect_container_state` (L164-214),
  `kill_container` (L216-221), `remove_container` (L223-228) each `await`
  `tokio::process::Command::output()` with NO `tokio::time::timeout`. They are
  invoked on EVERY run path AFTER the sandbox future resolves: success arm L456-457,
  error arm L471-472, timeout arm L479-480.
- The sandbox `wait` IS timeout-wrapped (L421), but the post-wait inspect/remove/kill
  are not. A wedged Docker daemon (e.g., `docker inspect` blocked on an unresponsive
  dockerd) holds the judge task indefinitely — the worker's configured time limit is
  silently exceeded by the cleanup phase. A submission that COMPLETED inside its time
  budget can still stall the worker.
- Confirmed reproduces; unchanged by cycle-1.

### DBG-4 — TS compiler workspace 0777: REPRODUCES
- `src/lib/compiler/execute.ts:742-743` (chown-success branch) and `749-750`
  (chown-failure branch): `chmod(workspaceDir, 0o777)` + `chmod(sourcePath, 0o666)`.
  The initial `0o700` (L728) is overwritten to `0o777` before container spawn on
  both branches, world-readable/writable for the temp dir's lifetime. Confirmed.

### DBG-6 — temp-dir orphan: PARTIALLY (the headline orphan risks are already closed; residual is the restore path)
- TS compiler workspace: NOT an orphan — cleaned in `finally` at
  `execute.ts:838` (`rm(workspaceDir, {recursive:true, force:true})`).
- Rust executor: NOT an orphan — `tempfile::TempDir::new()` (`executor.rs:301`) is
  RAII and dropped at function end (L662); Drop runs even on `tokio::select!`
  cancellation / `handle.abort()` (`main.rs:612`) because Rust runs destructors for
  owned locals when a future is dropped.
- Residual orphan/split-state risk is `restoreParsedBackupFiles`
  (`src/lib/db/export-with-files.ts:351-360`) — see F1. Confirmed the
  compiler/executor temp-dirs themselves are not orphaned.

---

## FINDINGS — new latent bugs

### F1 — `restoreParsedBackupFiles` writes uploads non-atomically with no rollback (MEDIUM / confidence HIGH)
- File: `src/lib/db/export-with-files.ts:355-357`
- `for (const upload of uploads) { await writeUploadedFile(upload.storedName,
  upload.buffer); }` — sequential direct writes to the uploads dir, no staging, no
  per-file atomic rename, no cleanup-on-failure. If write #3 of 10 throws, writes
  #1-2 are persisted to disk while #4-10 are gone, and the function rejects.
- Because this runs AFTER `importDatabase` already committed (DB fully replaced),
  the system is left in a split state: the restored DB references uploads that are
  partly missing, with no automatic recovery beyond the manual pre-restore snapshot.
- Trigger: a restore ZIP whose uploads include a file that fails `writeUploadedFile`
  (disk full, permission, path-traversal guard, EIO).
- Fix (minimal, aligned with Phase B AGG-1 staging design): write each upload to a
  staging temp path (`uploads/.staging/<id>/<storedName>`) then `rename` into place
  after all writes succeed; on any failure, `rm -rf` the staging dir and reject
  before any upload is visibly committed.

### F2 — restore audit is buffered, not durable (HIGH / confidence HIGH)
- See R1. Restated here as a finding because it is the top latent issue in the
  remediation: the integrity-trail entry for a destructive, whole-DB replace is
  crash-unsafe (5s in-memory buffer). Fix: `await recordAuditEventDurable(...)`.

### F3 — A12 drift-detection masking via porcelain status-line stability (LOW / confidence MED)
- See R3. A probe that only touches already-dirty tracked files is invisible to the
  `$before != $after` string compare (identical porcelain lines), so drift can go
  undetected; probe residue can be left in a developer's pre-modified tracked file.

### F4 — A1 env-file guard only probes four candidate filenames (LOW / confidence HIGH)
- File: `src/lib/security/env.ts:148-156` (`resolveLoadedEnvFilePath`)
- Candidate list is `.env.production.local`, `.env.local`, `.env.production`, `.env`.
  The repo actually ships `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`,
  `.env.worv`, `.env.auraedu` — deploy variants that are typically copied/renamed to
  `.env` at runtime. If an operator runs the app with one of these loaded directly
  (e.g., via a wrapper that points Next at it), the permission guard silently skips
  (returns `null` → no check). The guard is a no-op whenever the loaded file is not
  one of the four hardcoded names.
- Fix: also accept an explicit `ENV_FILE` override, or scan all `.env*` files in
  `cwd()` and assert 0600 on every one that exists in production (defense-in-depth).

### F5 — A12 porcelain quoting strips outer quotes but does not unescape C-escapes (LOW / confidence MED)
- File: `scripts/check-migration-drift.sh:93` — `.replace(/^"|"$/g, "")`.
- Porcelain v1 quotes paths containing spaces/special chars and C-escapes internal
  characters (e.g., a literal `"` → `\"`, backslash → `\\`). The cleanup only strips
  the outer quotes, so a path with internal escapes is passed mangled to `rmSync` /
  `git checkout`, which then target the wrong path. The probe artifact fails to be
  cleaned (best-effort, non-fatal) — or worse, `git checkout -- <mangled>` could
  target an unrelated tracked path.
- Trigger requires a drizzle-kit-generated filename containing shell/JSON-special
  characters (unusual for migrations). Low real-world likelihood.

### F6 — `recordAuditEvent` fire-and-forget across ~107 sites; loss-window on every security-sensitive action (MEDIUM / confidence HIGH, known as AGG-41)
- `grep -rn "recordAuditEvent(" src/ --include="*.ts" | grep -v "await "` returns 107
  non-awaited call sites. Each pushes to the 5s buffer. This is the bucket already
  tracked as AGG-41 in Phase B; restated here because R1/F2 make it concrete: the
  restore and user-deletion audits are both in this set. The durable helper exists
  (`recordAuditEventDurable`) and should be used for the low-frequency,
  high-stakes actions (role/perm/system-settings/restore/delete).

### F7 — env-file guard does not cover the containerized production deployment shape (LOW / confidence MED)
- File: `src/instrumentation.ts:29` + `src/lib/security/env.ts:185-217`
- When secrets are injected via process env (Docker/K8s secrets, no `.env` file on
  disk), `resolveLoadedEnvFilePath` returns `null` and the guard returns early. That
  is by design, but it means the guard provides zero assurance for the
  containerized production deployments (which is most of them per
  `docker-compose.production.yml`). The file-permission control does not cover the
  primary production deployment shape.
- Fix: defer to orchestrator secret-permission checks (Docker secrets are 0400 by
  default) and document the gap, rather than implying the startup guard covers prod.

### F8 — `tryRustRunner` timeout arithmetic assumes bounded `timeLimitMs` (LOW / confidence LOW)
- Files: `src/lib/compiler/execute.ts:542, 566`
- `AbortSignal.timeout(Math.max(timeLimitMs * 4, 120_000))` and the
  `timeLimitMs ?? settings.compilerTimeLimitMs` path. If a DB row or request ever
  supplies an absurd `timeLimitMs` (e.g., `1e15`), `* 4` stays within JS safe-int but
  produces an effectively-unbounded abort deadline. The downstream
  `MAX_TIME_LIMIT_MS` clamp (AGG-17, Phase B) is the intended fence; until it lands,
  a bad row can pin a compiler fetch. Low likelihood (admin-configured values).

---

## FINAL SWEEP

- **Rust panics in production paths**: reviewed every `.expect(`/`.unwrap()` in
  `judge-worker-rs/src` (non-test). `docker.rs:386,403` (`child.stdout/stderr.take()
  .expect(...)`) are safe — the child is spawned unconditionally with
  `Stdio::piped()` for all three stdios (`docker.rs:357-362`). `main.rs:465`
  (SIGTERM handler) and `api.rs:278` (client) are startup fail-fast, acceptable.
  `languages.rs:2179`, `executor.rs:852+`, `config.rs:407+` are inside `#[cfg(test)]`.
  No production panic on an externally-triggerable input found.
- **Integer casts**: `docker.rs:131-136` timestamp `total_ms as u64` is guarded by
  `if total_ms < 0 { None }` and bounded to 2000-2100 by the calendar comment; safe.
  Output-size and duration casts use `try_from(...).unwrap_or(u64::MAX)` /
  `saturating_*` throughout (`docker.rs:391,393,408,453,477`;
  `executor.rs:63,542`). No overflow found.
- **Cancellation/temp-dir**: Rust `tempfile::TempDir` + TS `finally { rm }` both
  release on cancel/crash; no fd/temp-dir leak on the judge path (DBG-6 residual is
  the restore uploads path, F1).
- **Error-swallowing**: the two intentional silent catches in A12
  (`check-migration-drift.sh:100-102`) are best-effort cleanup behind a hard `exit 1`
  signal — acceptable. No new swallow-on-a-hot-path introduced by cycle-1.

**Top action items, ranked:**
1. **R1/F2** (HIGH) — make the restore audit durable: `await recordAuditEventDurable(...)`.
2. **DBG-2** (HIGH) — wrap `inspect_container_state`/`kill_container`/`remove_container` in `tokio::time::timeout`.
3. **F1** (MEDIUM) — stage uploads before commit in `restoreParsedBackupFiles`.
4. **DBG-4** (MEDIUM) — drop the post-chown `0o777` on the compiler workspace.
5. **R3/F3** (LOW) — diff A12 on path-only and cover the drift branch.
