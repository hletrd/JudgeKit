# Critic Review — judgekit HEAD 0b0ac198

**Date**: 2026-06-26
**Reviewer**: Critic (structured multi-perspective, ADVERSARIAL mode escalated after CRIT-1)
**Scope**: Full change surface — src/lib/{judge,security,api,db,docker,compiler,actions,auth,anti-cheat,submissions,problems,contests,assignments,recruiting,plugins,realtime,data-retention,files}, src/app/api/v1, judge-worker-rs/src, rate-limiter-rs/src, code-similarity-rs/src, deploy-docker.sh, docs/

**VERDICT: REVISE**

---

## Overall Assessment

The codebase is well-engineered in several critical areas (DB import atomicity, submission state machine, Docker sandboxing, ZIP slip defense, CSV injection mitigation). The recently-fixed items from the prior cycle are genuinely resolved. However, a single CRITICAL finding undermines the entire disaster-recovery story: the pre-restore snapshot — the ONLY rollback mechanism for the most destructive operation in the system — silently strips authentication fields, making it incapable of restoring login state. This is compounded by a chain of MAJOR data-integrity gaps in the backup/restore pipeline.

## Pre-commitment Predictions vs Actuals

| Prediction | Result |
|---|---|
| Fixed items would be partial fixes | Mostly FALSE — prior-cycle fixes are solid; 3 of 7 doc contradictions genuinely resolved |
| Doc-fidelity issues persist | PARTIALLY TRUE — CSRF/auth/privacy docs fixed, but full-fidelity backup doc still contradicts code |
| Security gating inconsistent across admin endpoints | TRUE — Pattern C inconsistency, migrate/validate missing rate limit, audit-logs discriminator mismatch |
| Backup/restore transaction ordering still broken | TRUE — DB still commits before files restored; additionally discovered snapshot strips auth fields |
| Resource cleanup leaks on error paths | FALSE — Rust TempDir Drop is correct; TS compiler cleanup adequate |

---

## Critical Findings (blocks execution / data loss)

### CRIT-1: Pre-restore snapshot silently strips all authentication fields — DR rollback is broken

**Confidence**: HIGH
**Evidence**:
- `src/lib/db/pre-restore-snapshot.ts:84-86` calls `streamDatabaseExport({ sanitize: false })`.
- `src/lib/db/export.ts:104-106`: when `sanitize=false`, `activeRedactionMap = EXPORT_ALWAYS_REDACT_COLUMNS`.
- `src/lib/security/secrets.ts:36-42`: `EXPORT_ALWAYS_REDACT_COLUMNS` includes `users.passwordHash`, `sessions.sessionToken`, `accounts.{refresh_token,access_token,id_token}`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}`.
- `src/lib/db/export.ts:139-143`: redacted columns are set to `null` in the output.
- `src/lib/db/pre-restore-snapshot.ts:34-38` comment claims: `"The snapshot is full-fidelity (sanitize=false) — it is the operator's own emergency rollback artifact... Because it contains password hashes, encrypted column ciphertexts, and JWT secrets in their stored form"` — **this claim is FALSE**.

**Why this matters**: The pre-restore snapshot is the safety net for `importDatabase()`, which truncates and replaces every table. If a restore goes wrong and the operator rolls back using the snapshot:
- Every user's `passwordHash` is `null` → **nobody can log in**
- All `sessions.sessionToken` are `null` → all sessions invalidated
- All OAuth `accounts` tokens are `null` → social login broken
- All `apiKeys.encryptedKey` are `null` → all API integrations broken
- `systemSettings.hcaptchaSecret` and `smtpPass` are `null` → registration and email broken

The snapshot exists specifically to enable rollback, but it cannot restore the authentication subsystem. Password hashes are permanently lost — there is no way to recover them from the null'd export.

**Realist Check**: Survives at CRITICAL. Realistic worst case: operator restores from a bad backup, attempts rollback, entire user base is locked out. Detection is immediate (first login attempt fails) but fix requires database surgery (manual password resets for every user). No mitigating factors — the snapshot never leaves the system, so applying `ALWAYS_REDACT` to it serves no security purpose. This involves permanent data loss (password hashes cannot be reconstructed).

**Fix**: The pre-restore snapshot must bypass redaction entirely. Add a `redactionOverride` option to `streamDatabaseExport`:
```typescript
export function streamDatabaseExport(options: {
  signal?: AbortSignal;
  sanitize?: boolean;
  dbNow?: Date;
  redactSecrets?: boolean; // default true; false for internal snapshots
} = {}): ReadableStream<Uint8Array>
```
When `redactSecrets === false`, set `activeRedactionMap = {}` (no redaction). Then call `streamDatabaseExport({ sanitize: false, redactSecrets: false })` from `takePreRestoreSnapshot`. The snapshot file is already mode 0o600 in a 0o700 directory — the file-system permissions are the correct defense for an on-disk artifact that never leaves the host.

---

## Major Findings (causes significant rework)

### CRIT-2: Restore commits DB transaction before files are written to disk

**Confidence**: HIGH
**Evidence**:
- `src/app/api/v1/admin/restore/route.ts:165`: `const result = await importDatabase(data);` — DB transaction commits here.
- `src/app/api/v1/admin/restore/route.ts:177`: `filesRestored = await restoreParsedBackupFiles(pendingUploadedFiles);` — files written AFTER DB commit.
- `src/lib/db/export-with-files.ts:351-360`: `restoreParsedBackupFiles` loops through uploads calling `writeUploadedFile` one at a time. If any write fails (disk full, EACCES, I/O error), the function throws and the loop stops. The DB is already committed.

**Why this matters**: If `writeUploadedFile` fails partway (e.g., disk full at file N of M), the system is left in a state where:
- The DB is fully replaced and references all M files.
- Files 1..N-1 are on disk.
- Files N..M are missing.
- There is no automatic recovery — the route returns 500 but leaves the system half-restored.
- The pre-restore snapshot (CRIT-1) cannot help because it's DB-only (no file snapshot) AND strips auth fields.

**Fix**: Write files BEFORE committing the DB transaction, or use a two-phase approach: (1) write all files to a staging directory, (2) commit DB, (3) atomically move files into place. At minimum, surface a detailed error listing which files failed so the operator can recover manually.

### CRIT-3: Pre-restore snapshot failure is silently ignored

**Confidence**: HIGH
**Evidence**:
- `src/lib/db/pre-restore-snapshot.ts:122-124`: on failure, returns `null`.
- `src/app/api/v1/admin/restore/route.ts:149`: `const preSnapshotPath = await takePreRestoreSnapshot(user.id);` — return value is used only in the audit log summary, never checked.
- The destructive `importDatabase(data)` at line 165 proceeds regardless of whether the snapshot succeeded.

**Why this matters**: If the snapshot fails (disk full, permission denied, export-stream error), the operator's only rollback artifact is gone, but the most destructive operation in the system proceeds anyway. The safety net vanishes silently — the operator sees `preRestoreSnapshotPath: null` in the audit log, but the restore has already completed by the time anyone checks.

**Fix**: Abort the restore if `takePreRestoreSnapshot` returns `null`:
```typescript
const preSnapshotPath = await takePreRestoreSnapshot(user.id);
if (!preSnapshotPath) {
  return NextResponse.json(
    { error: "snapshotFailedRestoreAborted" },
    { status: 503 }
  );
}
```

### CRIT-4: Backup silently omits files missing from disk

**Confidence**: HIGH
**Evidence**:
- `src/lib/db/export-with-files.ts:222-229`: if `access(resolveStoredPath(record.storedName))` or `readUploadedFile()` throws for a DB-referenced file, the catch only increments `skipped++` and continues. The manifest only includes successfully-read files (line 215-220).
- `src/lib/db/export-with-files.ts:232`: `skipped` count is logged server-side only.
- `src/app/api/v1/admin/backup/route.ts:90-100`: the route returns the ZIP as a binary stream. There is no JSON metadata channel — the `skipped` count is NOT surfaced to the operator downloading the backup.

**Why this matters**: A backup that looks successful can be missing files. The backup ZIP is internally consistent (manifest matches ZIP contents), but the DB export references files that aren't in the ZIP. On restore:
- `importDatabase` inserts DB rows referencing the missing files.
- `restoreParsedBackupFiles` only restores files that were in the ZIP.
- The system ends up with DB rows pointing to non-existent files (broken images, broken attachments).

**Fix**: Either (a) fail the backup if any DB-referenced file is missing from disk (`if (skipped > 0) throw new Error("backupIncomplete")`), or (b) include a `skipped` manifest entry and surface it in the API response. Option (a) is safer — a backup with missing files is a signal of data integrity problems that should be investigated, not silently shipped.

### CRIT-5: Non-atomic file writes — crash leaves truncated file under valid name

**Confidence**: HIGH
**Evidence**:
- `src/lib/files/storage.ts:27-29`: `writeUploadedFile` calls `await writeFile(resolveStoredPath(storedName), data, { mode: 0o644 })` directly.
- No temp-file + rename pattern. No `fsync`.
- `restoreParsedBackupFiles` (export-with-files.ts:355-356) calls `writeUploadedFile` which overwrites existing files. Prior bytes are destroyed before the new write is known to be durable.

**Why this matters**: A process crash or power loss mid-write leaves a truncated file under a valid `storedName`. A later read returns truncated bytes with no error. For file uploads and restores, this is silent data corruption. The lack of `fsync` means the OS write buffer may not be flushed even if the `writeFile` promise resolves.

**Fix**: Use write-to-temp-then-rename:
```typescript
export async function writeUploadedFile(storedName: string, data: Buffer): Promise<void> {
  await ensureUploadsDir();
  const finalPath = resolveStoredPath(storedName);
  const tmpPath = finalPath + ".tmp-" + randomBytes(8).toString("hex");
  await writeFile(tmpPath, data, { mode: 0o644 });
  await rename(tmpPath, finalPath); // atomic on POSIX
}
```

### CRIT-6: Docs claim full-fidelity backup includes "all fields" — code redacts auth fields

**Confidence**: HIGH
**Evidence**:
- `docs/data-retention-policy.md:48`: `"**Full-fidelity** ('?full=true') — all fields included."`
- `src/lib/db/export.ts:104-106`: full-fidelity mode (`sanitize: false`) still applies `EXPORT_ALWAYS_REDACT_COLUMNS`, which nullifies `users.passwordHash`, `sessions.sessionToken`, `accounts` OAuth tokens, `apiKeys.encryptedKey`, and `systemSettings.{hcaptchaSecret,smtpPass}`.
- `src/lib/security/secrets.ts:33-34`: comment says these are `"most sensitive fields that must never leave the system"` — intentional redaction, but contradicts the doc claim.

**Why this matters**: An operator relying on a full-fidelity backup for disaster recovery will discover at restore time that all passwords, sessions, API keys, and SMTP/hCaptcha secrets are gone. The docs promise "all fields included"; the code delivers a partial export. This is the same root cause as CRIT-1, but affects the portable export/backup path, not just the internal snapshot.

**Fix**: Either (a) update `docs/data-retention-policy.md:48` to accurately state which fields are always redacted (e.g., `"Full-fidelity ('?full=true') — all fields except auth credentials (passwordHash, session tokens, OAuth tokens, API key material, SMTP/hCaptcha secrets), which are always redacted for security."`), or (b) if the intent is truly "all fields" for DR backups, introduce a separate export mode that bypasses `ALWAYS_REDACT` for operator-initiated local backups (with appropriate warnings and file permissions). Option (a) is the minimal fix; option (b) is the functional fix.

---

## Minor Findings (suboptimal but functional)

### CRIT-7: Compiler workspace chmod 0o777 — overly broad permissions

**Evidence**: `src/lib/compiler/execute.ts:738,745` (TS) and `judge-worker-rs/src/runner.rs:800-803` (Rust) both set the workspace to `0o777`. Source files are set to `0o666`.
**Why it's minor**: The Docker sandbox (`--user 65534:65534`, `--network=none`, `--cap-drop=ALL`, seccomp) contains the blast radius. The 0o777 is needed so the `nobody` user inside the container can write to the bind-mounted workspace. But 0o755 (after `chown` to 65534) would suffice and prevent any co-located non-root process from tampering.
**Fix**: After successful `chown` to `SANDBOX_UID:SANDBOX_GID`, use `chmod(workspaceDir, 0o755)` instead of `0o777`. The chown already ran, so the owner (65534) has rwx. Only fall back to 0o777 if chown fails (the current fallback path).

### CRIT-8: releaseClaimedSubmission read-then-write race

**Evidence**: `src/app/api/v1/judge/claim/route.ts:71-102`: SELECTs `judgeClaimToken` (line 77-81), checks it (line 83-85), then UPDATEs without re-checking the token in the WHERE clause (lines 87-94). Under READ COMMITTED, a concurrent re-claim can commit between SELECT and UPDATE, and this UPDATE overwrites the new claim with `status=pending`.
**Why it's minor**: Self-heals when the new worker reports (the claim token still matches on poll). Produces transient wrong state but no data loss.
**Fix**: Add `WHERE judge_claim_token = claimToken` to the UPDATE and check rowCount.

### CRIT-9: migrate/validate missing rate limit

**Evidence**: `src/app/api/v1/admin/migrate/validate/route.ts:10-23` performs auth, CSRF, and capability checks but has no `consumeApiRateLimit` call. All four sibling routes (backup, migrate/export, migrate/import, restore) have rate limits.
**Why it's minor**: The endpoint parses uploaded JSON/multipart up to `MAX_IMPORT_BYTES`, which is a CPU/memory surface. But it requires `system.backup` capability (admin-only), limiting exposure.
**Fix**: Add `consumeApiRateLimit(request, "admin:migrate-validate")` after the capability check.

### CRIT-10: Deploy INCLUDE_WORKER defaults to true — app-server footgun

**Evidence**: `deploy-docker.sh:186`: `INCLUDE_WORKER="${INCLUDE_WORKER:-true}"`. The CLAUDE.md mandates `INCLUDE_WORKER=false` for algo.xylolabs.com, but the script default is the opposite. No host-based auto-detection.
**Why it's minor**: Documented in CLAUDE.md and the script's own comments reference the June 2026 algo.xylolabs.com incident caused by building judge images on the app server. But the default is still the dangerous option.
**Fix**: Either default to `false` (safer; dedicated-worker hosts set `INCLUDE_WORKER=true` explicitly), or add hostname-based detection.

### CRIT-11: audit-logs admin/instructor discriminator uses wrong capability

**Evidence**: `src/app/api/v1/admin/audit-logs/route.ts:51` declares entry capability `system.audit_logs`, but line 70 uses `caps.has("users.edit")` to decide admin vs instructor view scope. A custom role with `system.audit_logs` but not `users.edit` is silently treated as an instructor (scoped view).
**Why it's minor**: Fails closed (more restrictive, not less). No privilege escalation.
**Fix**: Use a dedicated capability (e.g., `audit_logs.view_all`) as the discriminator, matching the declared entry capability.

### CRIT-12: Pattern C inline capability checks — fragile and inconsistent

**Evidence**: 6 route files (roles, workers, workers/stats, chat-logs) use `createApiHandler` without the declarative `auth: { capabilities: [...] }` block, instead performing `caps.has(...)` manually inside the handler body. The capability gate is correct today but easy to forget when adding new handlers.
**Fix**: Migrate to declarative `auth: { capabilities: [...] }` in the handler config.

---

## What's Missing (gaps, unhandled edge cases)

- **No file-level snapshot in pre-restore**: The snapshot only captures DB state. If a restore overwrites or deletes uploaded files, there is no file-level rollback. Combined with CRIT-1 (snapshot strips auth) and CRIT-2 (DB commits before files), the restore path has no reliable rollback for either DB auth state or file state.
- **No backup completeness verification**: There is no post-backup check that verifies all DB-referenced files are present in the ZIP. The manifest validates integrity of included files but not completeness against the DB export.
- **User deletion hard-deletes submission source code**: `src/lib/actions/user-management.ts:212` + `schema.pg.ts:470` cascade-deletes all submissions. No soft-delete for academic-integrity evidence retention. If an instructor needs to investigate plagiarism after deleting a user, the evidence is gone.
- **Orphaned file bytes on disk after user deletion**: `schema.pg.ts:1229` sets `files.uploadedBy` to null via cascade, but nothing cleans up the bytes in `uploads/`. Combined with no unreferenced-upload sweep, disk slowly leaks.
- **Lazy realtime-slot cleanup**: `src/lib/realtime/realtime-coordination.ts:104-109` only sweeps expired SSE slots on new acquisitions. Idle deployments accumulate rows.
- **Rate limiter is single-instance only**: `rate-limiter-rs/src/main.rs` uses in-memory `DashMap`. Multiple replicas would each enforce limits independently, effectively multiplying the allowed rate. Documented in `docs/deployment.md` but worth flagging.
- **No circuit breaker for code-similarity service**: If the similarity service is unavailable, anti-cheat similarity checks either fail silently or block. Need to verify the degraded-mode behavior.

---

## Ambiguity Risks

- `docs/data-retention-policy.md:48` says `"all fields included"` for full-fidelity — Interpretation A: every column including passwordHash/sessionToken/etc. / Interpretation B: all fields except those in ALWAYS_REDACT. Code implements B; docs imply A. Risk: operator assumes a DR backup contains auth state and discovers otherwise at restore time.

---

## Multi-Perspective Notes

- **Security**: Docker sandboxing is strong (network=none, cap-drop=ALL, seccomp, no-new-privileges, read-only rootfs, uid 65534). Worker token comparison is timing-safe (HMAC + timingSafeEqual). CSRF protection is multi-layered (X-Requested-With + sec-fetch-site + origin). File uploads validate magic bytes. CSV injection is mitigated. Plugin configs use AES-256-GCM. These are genuinely well done. The main security concern is CRIT-1: the ALWAYS_REDACT policy, while well-intentioned, is applied to an internal on-disk artifact where it serves no purpose and breaks DR.

- **Executor (plan implementation perspective)**: The fix for CRIT-1 is small and well-contained — add a `redactSecrets` parameter to `streamDatabaseExport` and pass `false` from `takePreRestoreSnapshot`. CRIT-3 is a one-line guard. CRIT-4 and CRIT-5 are moderate refactors of the file I/O layer.

- **Stakeholder**: The DR story is the weakest link. An operator following the docs will believe full-fidelity backups and pre-restore snapshots can restore the full system. They cannot restore auth state. This is the highest-priority fix.

- **Skeptic**: The strongest argument that CRIT-1 is not a real problem: "passwordHash should never be in any file, even a local snapshot — if the snapshot file is stolen, passwordHash could be cracked." Counter: the snapshot is mode 0o600 in a 0o700 directory on the same host that runs the DB with the raw passwordHash. The file-system permissions are equivalent to the DB access controls. Refusing to write passwordHash to the snapshot does not improve security — it only breaks the rollback capability.

---

## Verified Fixed (prior cycle — confirmed resolved)

| Item | Status | Evidence |
|---|---|---|
| CSRF doc mechanism | FIXED | `docs/api.md:78-83` now documents `X-Requested-With: XMLHttpRequest`, matching `csrf.ts:40` |
| Auth bearer doc | FIXED | `docs/authentication.md:12-15` documents `Authorization: Bearer jk_...`, matching `api/auth.ts:66` |
| Privacy retention doc | FIXED | `docs/privacy-retention.md:24-28` periods match `data-retention.ts:1-16` |
| Language sync overwrites admin overrides | FIXED | `sync-language-configs.ts:46-63` only backfills empty/null fields |
| Per-problem export canManageProblem gate | VERIFIED | `submissions/export/route.ts:45-72` uses row-level scoping via review groups |
| Restore ZIP audit pending count | VERIFIED | `restore/route.ts:159` uses `pendingUploadedFiles.length` |
| Docker import-time throw | VERIFIED | `docker/client.ts:22-29` logs error instead of throwing |
| User deletion audit post-commit | VERIFIED | `user-management.ts:214` records audit after `db.delete` succeeds |

---

## Verified Solid (no issues found)

- **DB import atomicity** (`import.ts:125-212`): genuine single-transaction with clean rollback, schema-drift defense.
- **Submission state machine** (`judge/claim-query.ts`, `worker-staleness-sweep.ts`): stale-claim reclaim, background sweep, optimistic-lock fence on report. No stuck-in-judging path.
- **Rust executor cleanup** (`runner.rs:794`): `tempfile::TempDir` with Drop cleanup on all paths.
- **ZIP slip defense** (`export-with-files.ts:318-323`): path normalization, traversal rejection, manifest integrity (sha256 + byteLength).
- **CSV injection** (`csv/escape-field.ts:9-14`): prefixes dangerous leading chars with tab.
- **Test/seed endpoint** (`test/seed/route.ts`): hard-gated by env var, 404 in production, timing-safe token comparison.

---

## Verdict Justification

**REVISE**. The review escalated to ADVERSARIAL mode after discovering CRIT-1 (pre-restore snapshot strips auth fields), which indicated a systemic issue in the backup/restore pipeline. The adversarial sweep then surfaced CRIT-2 through CRIT-6, confirming a pattern: the DR path was designed with good individual components (atomic DB import, streaming export, manifest verification) but the integration has critical gaps around the DB-vs-files boundary and the redaction policy's over-application to internal artifacts.

CRIT-1 alone justifies REVISE because it means the system's only rollback mechanism for its most destructive operation cannot restore authentication — defeating its entire purpose. The fix is small and well-scoped.

The prior-cycle fixes are genuinely solid (3 of 7 doc contradictions resolved, language sync fixed, recently-fixed items verified). The codebase's sandboxing, import atomicity, and submission state machine are well-engineered. The issues are concentrated in the backup/restore pipeline and doc-fidelity around export modes.

**To upgrade to ACCEPT**: fix CRIT-1 (snapshot must bypass redaction), CRIT-3 (abort on snapshot failure), and CRIT-6 (doc accuracy). CRIT-2, CRIT-4, CRIT-5 can be addressed in a follow-up as they require moderate refactoring.

---

## Coverage

| Area | Examined | Method |
|---|---|---|
| src/lib/db/export.ts, export-with-files.ts, import.ts, pre-restore-snapshot.ts | Full read | Direct |
| src/app/api/v1/admin/ (28 route files) | Full audit | Parallel agent + direct verify |
| src/lib/security/ (csrf, secrets, timing, api-rate-limit) | Full read | Direct |
| src/lib/compiler/execute.ts | Targeted read | Direct |
| judge-worker-rs/src/ (runner.rs, docker.rs, config.rs) | Targeted grep + read | Direct |
| rate-limiter-rs/src/main.rs | Full read | Direct |
| code-similarity-rs/src/ | Targeted grep | Direct |
| src/lib/judge/ (claim-query, sync-language-configs, worker-staleness) | Full read | Direct + agent |
| src/lib/realtime/realtime-coordination.ts | Targeted grep | Agent |
| src/lib/files/ (storage, validation) | Full read | Direct |
| src/lib/plugins/secrets.ts | Targeted read | Direct |
| src/lib/csv/escape-field.ts | Full read | Direct |
| deploy-docker.sh | Targeted sections | Direct |
| docs/ (api, authentication, privacy-retention, data-retention-policy, deployment) | Targeted sections | Direct + agent |
| src/app/api/v1/judge/ (claim, poll, heartbeat, deregister, register) | Targeted read | Direct |
| src/lib/actions/user-management.ts | Targeted grep | Agent |
| src/lib/db/schema.pg.ts (FK cascade rules) | Targeted grep | Agent |
| Rust rate-limiter concurrency (DashMap) | Full read | Direct |
| Docker sandbox flags | Full grep | Direct |
