# Cycle 3 — architect

**Scope:** regression-check the cycle-1+2 changes for coupling/layering quality (audit durable helper, discussion scope centralization, proxy-trust model); design sketches for the Phase B medium items that need architectural thought before code (AGG-1, AGG-2, AGG-10, AGG-14, NEW-M2, NEW-M7, NEW-M8, C2-H7); re-confirm the PERF lane (AGG-36..40, F-1); net-new architectural risks. READ-ONLY. Every finding cites file:line. Head: `207623f9`.

---

## 1. REGRESSION — architectural quality of cycle-1+2 changes

### REG-1 — Audit durable/buffered split (AGG-41): consistent and correctly scoped (CLEAN)

**Files:** `src/lib/audit/events.ts:252-262` (buffered `recordAuditEvent`), `:275-285` (`recordAuditEventDurable`); 8 durable call sites vs 104 buffered call sites.

The cycle-2 REG-1 fix landed correctly. `recordAuditEventDurable` at `events.ts:275-285` has a clean contract (awaited `db.insert`, falls back to buffer on failure — never throws, so the swap is safe at any call site). The 8 durable sites are the right ones — the low-frequency, high-stakes, post-commit-ordered writes where a SIGKILL/OOM in the 5s buffer window (events.ts:164 `FLUSH_INTERVAL_MS`) would lose the row:

- `src/app/api/v1/admin/restore/route.ts:183` (file-restore failure path), `:209` (success path) — both `await recordAuditEventDurable`. **Both moved to AFTER `restoreParsedBackupFiles`** so a file-write crash still leaves a durable restore audit. Correct ordering.
- `src/app/api/v1/admin/migrate/import/route.ts:123` (post-commit), `:233` (success).
- `src/app/api/v1/admin/roles/route.ts:126`, `roles/[id]/route.ts:118,189` (role mutations).
- `src/app/api/v1/admin/settings/route.ts:119` (system settings).
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts:65` (exam session termination — security-relevant).

The 104 buffered sites are all high-frequency or recoverable (judge claims, post/vote/reply, file ops, language/docker/build) where the 5s window is an acceptable trade for batch insert throughput. **No layering regression. The helper is used consistently.** The remaining AGG-41 "bulk conversion" item should NOT convert all 104 — the durable helper has a real cost (one DB round-trip per call); the split as it stands is the right equilibrium.

**One low-severity metric quirk (NEW-A, LOW):** `events.ts:194` — on flush failure, `auditEventWriteFailures += batch.length` counts every event in the failed batch as a "failed write" even though `:202-203` re-buffers them (they are NOT dropped). `getAuditEventHealthSnapshot()` at `:287-294` then reports `degraded` for what is really a transient retry. Cosmetic; `droppedAuditEvents` (the real loss metric, :208) is the one operators should alert on.

### REG-2 — Discussion scope centralization: partial drift (MEDIUM — coupling regression)

**Files:** `src/lib/discussions/permissions.ts:17-37` (the centralized helper); call sites at `community/threads/route.ts:18-31`, `community/threads/[id]/posts/route.ts:40-47`, `community/votes/route.ts:62-76`.

The helper's docstring at `permissions.ts:11-16` claims "the SINGLE source of truth — previously the page, posts, votes, and create routes each enumerated their own (drifted) subset." That claim is only half-true after the cycle-2 fix:

- **`posts/route.ts:40-47`** — correctly calls `canAccessProblemScopedThread(thread.scopeType, thread.problemId, { userId, role })`. ✓
- **`threads/route.ts:18-31`** (create) — inlines `isProblemLinkedScope(body.scopeType)` then calls `canAccessProblem(problem.id, user.id, user.role)` directly. Does NOT route through `canAccessProblemScopedThread`. ✗
- **`votes/route.ts:62-76`** — inlines `isProblemLinkedScope(target.scopeType)` then calls `canAccessProblem(problemId, user.id, user.role)` directly. Does NOT route through the helper. ✗

Functionally equivalent **today** (the helper at `permissions.ts:34-36` is just `isProblemLinkedScope` + null-problem guard + `canAccessProblem`). But the helper exists precisely to keep the null-problem guard and any future scope-additions in one place. Two of three write-path callers bypassing it is the drift surface the helper was supposed to eliminate — exactly the failure mode that caused C2-H5 (editorial was missing from the inline enumerations).

**Fix (small):** replace the inline `isProblemLinkedScope + canAccessProblem` pairs at `threads/route.ts:18-31` and `votes/route.ts:62-76` with `!(await canAccessProblemScopedThread(...))`. No behavior change; closes the drift surface. Note `votes/route.ts` also has an extra subtlety: the helper should be called for BOTH the `targetType === "thread"` and `targetType === "post"` branches — currently both branches compute `problemId` then run the same `canAccessProblem` gate, so the consolidation is mechanical.

**No regression in `community/threads/[id]/route.ts` (PATCH/DELETE):** correctly gated entirely on `canModerateDiscussions` (the moderation capability), not the problem-scope check — that's correct because lock/pin/delete are moderator actions, not problem-access actions.

### REG-3 — X-Real-IP / proxy-trust model: revert was correct, underlying issue still open (C2-H7 — see §2.8 for design)

**Files:** `src/lib/security/ip.ts:91-117`; reverted commit `23851d69` ("back out X-Real-IP hops=0 gate (breaks deployed judge IP allowlist)").

The cycle-2 fix (gate `x-real-ip` on `trustedHops > 0`) was reverted because it broke the deployed judge IP allowlist. The current state at `ip.ts:113-117` is: X-Real-IP is trusted unconditionally whenever XFF is absent. The revert was the right operational call — production was relying on Nginx setting X-Real-IP and the allowlist matching against it. But the underlying architectural incoherence (SEC-8 says `TRUSTED_PROXY_HOPS=0` means "no trusted proxies" yet X-Real-IP is still trusted) is unresolved. See §2.8 for the design that doesn't break the deployed allowlist.

**Layering note (positive):** the rest of `ip.ts` is coherent — `getTrustedProxyHops()` at `:11-16` is call-time-resolved so `vi.stubEnv` works in tests without module reloads; the `parts.length >= trustedHops + 1` hop-count gate at `:97` correctly refuses XFF when the chain is shorter than expected; `unwrapMappedIpv4` at `:36-40` keeps the canonical form consistent with the allowlist matcher. Only the X-Real-IP fall-through is inconsistent with the documented threat model.

### REG-4 — Other cycle-1+2 fixes: no layering/coupling regression (CLEAN)

Verified in passing during the §2 investigation:

- **A2 restore audit ordering** (`restore/route.ts:178-221`): file-restore failure path now writes its own durable audit (`:183`) with the snapshot path in `details`, THEN the success path writes `system_settings.database_restored` (`:209`). The two-audit structure correctly captures the three possible end-states (success, files-failed-after-db-commit, import-failed). The `preRestoreSnapshotPath` is included in both the failure details (`:192`) and the success details (`:219`), so the operator's rollback artifact is in the audit trail either way.
- **`isSanitizedExport` rejection** (`restore/route.ts:131-138`): correctly refuses sanitized exports before truncation, paired with `validateExport` at `:126`. The two checks compose cleanly.
- **Pre-restore snapshot hard-gate** (`restore/route.ts:149-161`): `ALLOW_UNSNAPSHOTTED_RESTORE=1` break-glass is documented in a comment at `:154-155`; `null` is a hard 500 otherwise. Correct ordering (snapshot before destructive import).
- **C2-C1 skip-truncate** (`import.ts:142-153`): the cycle-2 "preserve tables absent from import" fix is structurally correct — the truncate loop skips and records `result.skippedTables` BEFORE the insert loop iterates the same `data.tables` map. The two loops cannot disagree because both branch on `data.tables[tableName]`.

---

## 2. PHASE B — design sketches (architecture-lens)

Each item gets: current-state citation, design sketch (files/pattern), tradeoffs, risk.

### 2.1 AGG-1 — Restore DB↔files atomicity gap (HIGH leverage, needs design)

**Current state:** `restore/route.ts:163` (`await importDatabase(data)`) commits the DB transaction, THEN `:178-202` calls `restoreParsedBackupFiles(pendingUploadedFiles)` which at `export-with-files.ts:351-360` is a plain `for` loop calling `writeUploadedFile(upload.storedName, upload.buffer)` one file at a time (`storage.ts:27-30` is a bare `writeFile(..., { mode: 0o644 })`). If the loop crashes or the process is OOM-killed mid-loop:
1. The DB already references the new backup's `files` rows (committed at `:163`).
2. Half the uploaded files on disk belong to the OLD DB; half belong to the NEW DB.
3. There is no compensating action. The catch at `restore/route.ts:193` returns 500 but cannot roll back the DB (already committed) and cannot finish the file writes.

The pre-restore snapshot (`takePreRestoreSnapshot` at `:149`) is the operator's only rollback artifact — correct as a safety net, but it does not give the *system* an atomic restore.

**Design sketch — staging-then-rename:**
```
// export-with-files.ts — new function, replaces restoreParsedBackupFiles
export async function restoreParsedBackupFilesAtomic(
  uploads: Array<{ storedName: string; buffer: Buffer }>,
): Promise<number> {
  const uploadsDir = getUploadsDir();
  const stagingDir = join(getDataDir(), `uploads.restore-staging.${process.pid}.${Date.now()}`);
  await mkdir(stagingDir, { recursive: true, mode: 0o700 });
  try {
    // 1. Stage ALL files to a sibling staging dir (never touch live uploads yet).
    for (const upload of uploads) {
      // Reuse resolveStoredPath's name validation; write into stagingDir.
      await writeFile(join(stagingDir, upload.storedName), upload.buffer);
    }
    // 2. Once staged, atomic-rename each into place. rename() is atomic on the
    //    same filesystem; if the loop crashes, the DB-referenced files that
    //    were already renamed are correct, and the ones not yet renamed are
    //    still the pre-restore versions (live, valid for the OLD DB).
    let count = 0;
    for (const upload of uploads) {
      await rename(join(stagingDir, upload.storedName), resolveStoredPath(upload.storedName));
      count++;
    }
    // 3. Sweep: delete any file in uploads/ that is referenced by the OLD DB
    //    but not the NEW DB. Requires diffing the pre-restore files table
    //    against the post-restore files table. Optional hardening — defer if
    //    disk is not a concern; the staging dir cleanup below covers orphans.
    return count;
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }
}
```
- **Files to change:** `src/lib/db/export-with-files.ts` (new function), `src/app/api/v1/admin/restore/route.ts:180` (swap the call), `src/app/api/v1/admin/migrate/import/route.ts` (same swap if it restores files).
- **Tradeoffs:** staging doubles peak disk use during restore (old uploads + staging dir + new uploads briefly coexist). For a multi-GB uploads dir this matters. Mitigation: document the disk requirement in the restore API response and in AGENTS.md; the pre-restore snapshot already needs similar headroom. The `rename` approach is still strictly better than the current bare `writeFile` loop because a crash leaves a *consistent* (if old) state instead of a torn one.
- **Risk:** the orphan-sweep step (3) is the dangerous one — a wrong predicate deletes legitimate uploads. Ship steps 1-2 first (crash-consistency); add the sweep as a follow-up with a dry-run flag.

**Anti-pattern to avoid:** do NOT attempt to wrap `importDatabase` + file restore in one transaction. The filesystem is not transactional and Postgres cannot roll back `writeFile`. The DB tx at `import.ts:134` should stay scoped to DB rows only.

### 2.2 AGG-2 — Snapshot redaction bypass: needs auth-model design (HIGH leverage)

**Current state:** `src/lib/db/export.ts:104-106` unconditionally merges `EXPORT_ALWAYS_REDACT_COLUMNS` into the active redaction map. `EXPORT_ALWAYS_REDACT_COLUMNS` (`secrets.ts:36-42`) redacts `users.passwordHash`, `sessions.sessionToken`, `accounts.{refresh,access,id}_token`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}`. The export schema already carries `redactionMode: "full-fidelity" | "sanitized"` (`export.ts:48`), and `isSanitizedExport` at `:366-368` blocks sanitized restores. The restore route at `restore/route.ts:131-138` rejects sanitized exports.

The "snapshot mode" request is: produce a restorable backup that does NOT redact the auth columns, so an operator can restore users/sessions/keys after a disaster. The architectural trap is that this is also exactly the shape of a secret-exfiltration path — anyone with `system.backup` would suddenly be able to pull live password hashes and refresh tokens.

**Design sketch — capability-gated snapshot mode + at-rest encryption:**
1. **New redaction mode:** `"snapshot"` alongside `"full-fidelity"` and `"sanitized"` (`export.ts:20`). The export side bypasses `EXPORT_ALWAYS_REDACT_COLUMNS` only when `mode === "snapshot"` is explicitly requested.
2. **Distinct capability:** snapshot export/restore requires a capability STRICTER than `system.backup` — e.g. `system.snapshot` — granted only to break-glass admin roles. The backup route (`src/app/api/v1/admin/backup/route.ts`) and restore route (`restore/route.ts:33`) both check this capability when the snapshot flag is set.
3. **At-rest encryption of the archive:** the snapshot archive is encrypted with a key the running app does NOT hold at request time — e.g. an operator-supplied public key or a KMS-managed key the API cannot read directly. `parseBackupZip` (`export-with-files.ts:267`) and the manifest hash check (`:287-295`) gain a `decryptStream` step. The threat model: even if the `system.snapshot` holder's session is hijacked, the exfiltrated bytes are useless without the offline key.
4. **Audit differentiation:** the durable audit (`recordAuditEventDurable`) records `action: "system_settings.database_snapshot_export"` (distinct from `database_backup`), with a one-shot summary of the encryption-key fingerprint (not the key itself).
5. **Retention/auto-prune:** snapshot archives are tagged in the backup dir with a separate retention window (e.g. 90 days) and a separate prune job; regular full-fidelity backups keep their own window.

**Files to change:** `src/lib/security/secrets.ts` (document the always/snapshot/sanitized three-tier split), `src/lib/db/export.ts` (`mode` plumbing through `streamDatabaseExport`), `src/lib/db/export-with-files.ts` (encryption wrapper around `streamBackupWithFiles`), `src/app/api/v1/admin/backup/route.ts` (capability + audit), `src/lib/capabilities/*` (new `system.snapshot` capability), `src/lib/db/schema.pg.ts` (capability seed).

**Tradeoffs:** the at-rest-encryption step is the load-bearing one — without it, this is purely a privilege-escalation accelerator. With it, the operator UX gets harder (must manage an offline key). The capability split means existing `system.backup` holders (typically site admins) cannot produce snapshots by default, which may surprise operators — document this in AGENTS.md.

**Risk:** the restore side must decrypt; if the offline key is lost, snapshots are unrecoverable. Mirror the `ALLOW_UNSNAPSHOTTED_RESTORE` break-glass pattern: keep the plaintext-pre-restore snapshot as the always-available rollback, and treat the encrypted snapshot as the offsite/cold-storage artifact.

### 2.3 AGG-10 — Plaintext-decryption fallback (MEDIUM — partially done)

**Current state:** `src/lib/security/encryption.ts:98-117`. The default-flip half is **already done** — `allowPlaintext = options?.allowPlaintextFallback ?? false` at `:99` defaults to false in all environments, and production emits a warn-log at `:109-114` when the fallback is explicitly used. What remains is the migration half.

**Still-open call sites that pass `{ allowPlaintextFallback: true }`:**
- `src/lib/plugins/secrets.ts:59-67` — `decryptPluginSecret` **defaults to `true`** (`options?.allowPlaintextFallback ?? true`). This is the most dangerous site: plugin configs are user-writeable via the plugin API, so an attacker who can write plaintext to a plugin config column bypasses GCM authenticity.
- `src/lib/email/providers/smtp.ts:54` — smtpPass.
- `src/lib/security/hcaptcha.ts:23` — hcaptchaSecret.

**Design sketch — one-shot re-encryption migration:**
1. **Migration script** (`scripts/reencrypt-secrets.ts`): scans the four tables/columns (`plugins.config`, `systemSettings.smtpPass`, `systemSettings.hcaptchaSecret`, plus any other `decrypt(... allowPlaintextFallback: true)` callers) and re-writes each row where `value NOT LIKE 'enc:%'` as `encrypt(plaintext_value)`. Idempotent (re-running is a no-op because every value now starts with `enc:`).
2. **Read-path flip:** after the migration ships and a verify-query confirms zero non-`enc:` rows in those columns, drop the explicit `allowPlaintextFallback: true` from the three callers (and change `plugins/secrets.ts:61` default to `false`). The encryption module's default then governs everywhere.
3. **Verify gate:** the migration script prints a pre-flight count of plaintext rows and refuses to flip the read paths unless that count is zero. The warn-log audit trail (encryption.ts:109-114) is the signal — one full warn-log cycle with zero entries is the exit criterion.

**Files to change:** new `scripts/reencrypt-secrets.ts`; the three call sites above; deployment runbook note in AGENTS.md.

**Tradeoffs:** the migration is irreversible (re-encrypted with the current `NODE_ENCRYPTION_KEY`); if the key was rotated between when plaintext was written and when the migration runs, old `enc:` values would have been re-encrypted with the rotated key already. Verify the key hasn't rotated, or add a key-version prefix (deferred — the current `enc:` format has no key version, which is a separate net-new risk: see §4).

**Risk:** the plugin-config path is the highest-risk one because plugin configs are JSON blobs with potentially nested secret fields. `encryptPluginConfigSecrets` (`export.ts:268-283` calls it) must round-trip every nested secret field; a migration that misses a field breaks that plugin on read. Test the migration against every shipped plugin's config schema before deploying.

### 2.4 AGG-14 — Deploy topology defaults (LOW effort, candidate this cycle)

**Current state:** `deploy-docker.sh:184-187` defaults remain `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto` (= `INCLUDE_WORKER`). The script sources ONLY `.env.deploy` at `:119-123` — never `.env.deploy.algo` / `.env.deploy.worv`, even though those files exist with the correct safe values (`INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `SKIP_LANGUAGES=true`).

The post-deploy worker-host sync at `deploy-docker.sh:1129-1145` mitigates the STALE-WORKER problem (the `WORKER_HOSTS` sync rebuilds the worker image on the dedicated host). It does **not** mitigate the WRONG-HOST-BUILDS problem: a bare `./deploy-docker.sh` against algo with no env exports builds all language images on the app server, violating CLAUDE.md's mandatory app-only rule.

**Design sketch — `--target=` flag (3-line, lowest risk):**
```bash
# deploy-docker.sh, near line 119
DEPLOY_TARGET="${DEPLOY_TARGET:-}"
if [[ -z "$DEPLOY_TARGET" && -f "${SCRIPT_DIR}/.env.deploy.target" ]]; then
  DEPLOY_TARGET="$(cat "${SCRIPT_DIR}/.env.deploy.target")"
fi
if [[ -n "$DEPLOY_TARGET" && -f "${SCRIPT_DIR}/.env.deploy.${DEPLOY_TARGET}" ]]; then
  source "${SCRIPT_DIR}/.env.deploy.${DEPLOY_TARGET}"
fi
```
Plus a `--target=algo` CLI flag that sets `DEPLOY_TARGET=algo`. The per-target files already exist and already hold the right values — the script just needs to read them.

**Tradeoffs:** `--target=` requires the operator to opt in, so it doesn't protect against a bare `./deploy-docker.sh` either. The stronger alternative is to invert the *default* (`INCLUDE_WORKER=false` etc.) and require explicit opt-in to build locally — but that breaks every non-algo deployment's muscle memory. The flag is the right balance: documented in `--help`, sourced alongside `.env.deploy`, and CLAUDE.md can mandate `--target=algo` for the algo server.

**Risk:** none material. The per-target files already exist and are already correct; this is purely a sourcing fix.

### 2.5 NEW-M2 — SSE re-auth: ALREADY IMPLEMENTED, design needed only for hardening (CLOSED-pending-verify)

**Current state:** `src/app/api/v1/submissions/[id]/events/route.ts:33,452-522`. Re-auth is already in place:
- `AUTH_RECHECK_INTERVAL_MS = 30_000` at `:33`.
- Inside the shared-poll callback (`:452`), when `now - lastAuthCheck >= AUTH_RECHECK_INTERVAL_MS`, the handler runs an awaited IIFE (`:461-501`) that calls `getApiUser(request)` again (`:466`), checks `reAuthUser.id !== viewerId` (`:467`), and `close()`s on mismatch (`:468-469`). The IIFE is awaited before `emitStatusHeartbeat` runs, so a revoked user does not receive one more event.
- The fast-path (terminal state detected on poll) at `:511-518` does NOT re-auth before `sendTerminalResult` — but `sendTerminalResult` itself is also called from the re-auth IIFE (`:487`), so a deactivated user hitting the terminal path mid-window still gets one terminal event. Acceptable: the result event is the natural close.

**Architectural verdict:** NEW-M2 as stated is **resolved**. What remains is hardening (not part of NEW-M2 as scoped):
- The 30s window is configurable only by editing the constant. If a threat model requires sub-second revocation, the SSE endpoint would need to subscribe to a revocation broadcast (e.g. a `realtimeCoordination` row written on session invalidation that the poll tick checks). Defer unless required.
- The re-auth calls the full `getApiUser` (which resolves capabilities etc.) on every 30s tick per active connection — for 500 connections that is 500 auth resolutions every 30s, ~17/s. Cheap, but a `getDbNowUncached`-style cached `isActive`-only check would be lighter.

**Recommendation:** mark NEW-M2 closed in the plan; track the sub-second-revocation hardening as a separate deferred item if the threat model demands it.

### 2.6 NEW-M7 — Recruiting token race: ALREADY ATOMIC (CLOSED)

**Current state:** `src/lib/assignments/recruiting-invitations.ts:741-758`. The claim step is a single conditional UPDATE:
```sql
UPDATE recruitingInvitations
SET status='redeemed', userId=?, redeemedAt=?, ipAddress=?, updatedAt=?
WHERE id=? AND status='pending'
  AND (expiresAt IS NULL OR expiresAt > NOW())
RETURNING id
```
with `NOW()` evaluated by the DB (not the app clock), inside the same `db.transaction` (`:527`) that creates the user/enrollment/access-token. If a concurrent redeem wins, `updated` is null and the tx throws `alreadyRedeemed` (`:772`), which the catch at `:788-795` maps to a clean error WITHOUT incrementing the brute-force counter (comment at `:790-794` — concurrent claim is not a brute-force attempt).

The brute-force counter itself uses an atomic `jsonb_set` UPDATE outside the tx (`incrementFailedRedeemAttempt` at `:96-115`, comment `:81-94` explicitly addresses the prior TOCTOU). Reset on success at `:128-144`.

**Architectural verdict:** NEW-M7 as stated is **resolved**. The atomic conditional UPDATE + SQL-NOW() expiry check is the textbook fix. The remaining race surface is the `void incrementFailedRedeemAttempt(token)` fire-and-forget at `:619` — if the DB write fails, the counter is under-counted (comment at `:110-114` acknowledges this and logs at error level). That is a deliberate tradeoff, not an open issue. **CLOSE.**

### 2.7 NEW-M8 — Zip-bomb streaming decompression cap (MEDIUM)

**Current state:** `src/lib/db/export-with-files.ts:33-35,131-149` already enforces `MAX_BACKUP_ZIP_ENTRIES=10_000`, `MAX_BACKUP_ZIP_ENTRY_BYTES=100 MB`, `MAX_BACKUP_ZIP_DECOMPRESSED_BYTES=512 MB` against the BACKUP restore path (`enforceBackupZipSizeLimits` at `:131`, called from `parseBackupZip` at `:273`). `src/lib/files/validation.ts:39-49` enforces a separate 50 MB per-entry / total-decompressed cap for general upload ZIPs. `MAX_IMPORT_BYTES = 100 MB` (`import-transfer.ts:3`) caps the plain-JSON restore path.

The gap is in the **mechanism**, not the policy: `JSZip.loadAsync(zipBuffer)` at `export-with-files.ts:272` and `:167` (`generateAsync`) materialize the whole archive in memory before the size checks run. `enforceBackupZipSizeLimits` reads `entry._data.uncompressedSize` (the *declared* size from the ZIP central directory), which an attacker can set to a small value while the actual decompressed bytes balloon (zip-bomb). The declared-size check at `:140-148` catches naive bombs but a crafted archive that lies about its uncompressed size can bypass it.

**Design sketch — streaming decompression with hard byte cap:**
1. **Switch from `JSZip.loadAsync` to a streaming reader** (e.g. `yauzl` or `unzipper`) that emits entry-data events instead of materializing the whole archive. For each entry, accumulate decompressed bytes and abort with `backupZipTooLarge` the moment the running total exceeds `MAX_BACKUP_ZIP_DECOMPRESSED_BYTES`.
2. **Per-entry hash verification stays** but is computed incrementally (`createHash("sha256")` updated as each chunk arrives) instead of on the in-memory buffer.
3. **Keep `MAX_BACKUP_ZIP_ENTRIES` enforcement** at the central-directory read (still cheap, still pre-decompression).

**Files to change:** `src/lib/db/export-with-files.ts` (`parseBackupZip`, `streamBackupWithFiles`); add a streaming-zip dependency to `package.json`.

**Tradeoffs:** streaming APIs are more code than `JSZip.loadAsync`. The current in-memory approach is simple and the declared-size check catches naive bombs. The streaming rewrite is justified only if the threat model includes a motivated attacker with upload access to a backup path — which it does, because `system.backup` holders are exactly the high-value targets.

**Risk:** the manifest integrity check at `export-with-files.ts:287-295` runs after the full dbJson is in memory; with streaming, the hash check moves to a post-stream verify phase. Keep the existing `backupIntegrityMismatch` error path; just compute the hash incrementally.

**Lower-effort alternative if streaming is too much this cycle:** keep `JSZip.loadAsync` but add a hard cap on the *compressed* size and a runtime check on the ratio (`uncompressed/compressed > 100` → reject). Catches the classic zip-bomb ratio without a streaming rewrite; documented as defense-in-depth, not a complete fix.

### 2.8 C2-H7 — X-Real-IP proxy-trust model design (HIGH — design before any code)

**Current state:** `src/lib/security/ip.ts:113-117`. X-Real-IP is trusted unconditionally whenever XFF is absent, regardless of `TRUSTED_PROXY_HOPS`. The deployed allowlist (`src/lib/judge/ip-allowlist.ts` and the rate-limit key derivation) relies on this — that is why the cycle-2 `trustedHops > 0` gate was reverted.

**The architectural incoherence:** `TRUSTED_PROXY_HOPS=0` is documented as "no trusted proxies" (ip.ts:14, :92-96), but the X-Real-IP fall-through at `:113-117` treats whoever set that header as trusted. So `=0` does not actually mean "no trust" — it means "no trust via XFF, but full trust via X-Real-IP." That is the worst of both: the operator sets `=0` thinking they have locked down trust, while an attacker can spoof any IP via X-Real-IP.

**Design sketch — explicit proxy-trust flag, decoupled from XFF hop count:**

Introduce a separate, opt-in flag that controls ALL client-header trust (XFF + X-Real-IP together), leaving `TRUSTED_PROXY_HOPS` to govern only the XFF hop-count arithmetic when proxy trust is enabled:

```ts
// ip.ts — new resolver
function getProxyTrustMode(): "none" | "nginx-realip" | "xff-hops" {
  // Explicit opt-in. Default "none" means: ignore XFF and X-Real-IP entirely,
  // fall through to the socket remote address (the connecting peer's IP).
  const mode = (process.env.PROXY_TRUST_MODE ?? "").trim().toLowerCase();
  if (mode === "nginx-realip" || mode === "xff-hops") return mode;
  // Backward-compat: if TRUSTED_PROXY_HOPS > 0 and PROXY_TRUST_MODE is unset,
  // infer "xff-hops" so existing deployments keep working.
  if (getTrustedProxyHops() > 0) return "xff-hops";
  return "none";
}
```
Then in `extractClientIp`:
- `"none"`: skip XFF and X-Real-IP entirely; return the socket remote address (passed in by the caller — this requires plumbing `request.signal`'s peer or a Next.js header the proxy cannot set). For the deployed allowlist this means: the judge worker sees the proxy's IP, not the client's. **This is the safe default for new deployments.**
- `"nginx-realip"`: trust X-Real-IP only (the deployed allowlist's current effective behavior). Document that this requires Nginx `set_real_ip_from` + `real_ip_recursive on` to be safe, because X-Real-IP is a single value with no chain to validate.
- `"xff-hops"`: the existing XFF hop-count path at `ip.ts:73-110`, plus X-Real-IP only as a fallback when XFF is absent AND `trustedHops > 0`.

**Migration path for the deployed allowlist (the part that broke cycle-2):**
1. Document `PROXY_TRUST_MODE=nginx-realip` as the required setting for the current algo/worv deployments (their Nginx sets X-Real-IP and the judge allowlist matches against it).
2. Default behavior when `PROXY_TRUST_MODE` is unset: derive from `TRUSTED_PROXY_HOPS` (`>0` → `xff-hops`, `=0` → `none`). **The critical change from cycle-2:** in the `=0` case, fall through to the socket address, NOT to X-Real-IP. The deployed allowlist works because those deployments have `TRUSTED_PROXY_HOPS=1` (or will set `PROXY_TRUST_MODE=nginx-realip` explicitly).
3. Per-route opt-out is NOT needed if the flag is global — the judge-allowlist route and the public-API routes share the same proxy-trust assumption.

**Files to change:** `src/lib/security/ip.ts` (new resolver + extractClientIp branches); `.env.example` and `.env.production.example` (document `PROXY_TRUST_MODE`); `AGENTS.md` (deployment topology section); tests that currently stub `TRUSTED_PROXY_HOPS` (they keep working via the inference rule).

**Tradeoffs:** introducing a new env var is a documentation burden. The inference rule (`TRUSTED_PROXY_HOPS>0 → xff-hops`) keeps existing deployments working without action, but it means the new flag is "soft" — operators who want the strict `none` mode MUST set `PROXY_TRUST_MODE=none` explicitly even if `TRUSTED_PROXY_HOPS=0`. That is acceptable because the strict mode is the security-conscious choice and should be opt-in, not silent.

**Risk:** the cycle-2 revert happened because the gate broke the deployed allowlist. The migration path above preserves the deployed behavior (X-Real-IP trusted) for any deployment that sets `TRUSTED_PROXY_HOPS>0` OR explicitly sets `PROXY_TRUST_MODE=nginx-realip`. Verify the algo/worv `.env.production` values before deploying; if either runs with `TRUSTED_PROXY_HOPS=0` AND no `PROXY_TRUST_MODE`, the judge allowlist will break and must be updated first.

### 2.9 AGG-36..40 + F-1 — see §3 (PERF lane).

---

## 3. PERFORMANCE lane (perf-reviewer not registered — architecture lens)

All seven cycle-1+2 perf items re-confirmed still real by direct Read of the cited lines.

| ID | File:line (re-confirmed) | Class | Arch note |
|---|---|---|---|
| AGG-36 / PERF-3 | `src/lib/realtime/realtime-coordination.ts:101` (`withPgAdvisoryLock("realtime:sse:acquire", ...)` single global lock) | lock contention | Every SSE admission globally serializes through one transaction-scoped advisory lock. The work inside (`:104-138`) does a stale-row delete, a `count(*)` with two filter branches, and an insert — all under the lock. At 500 max global connections with churn, this is the SSE-scaling ceiling. |
| AGG-37 / PERF-4 | `src/app/(public)/rankings/page.tsx` (no `revalidate`, no `dynamic` export — grep returned zero matches) | repeated CTE | Public + unauthenticated + no ISR. Three CTEs re-run per request. `export const revalidate = 60` is still the cheap win. |
| AGG-38 / PERF-5 | `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:50-51` (`where: eq(assignmentId)`, `orderBy`, no `limit`) | unbounded query | No pagination; entire announcements list returned per request. |
| AGG-39 / PERF-6 | `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:50-51` (same shape) | unbounded query | Same shape as AGG-38. SQL predicate + limit/offset. |
| AGG-40 / PERF-7 | `src/app/api/v1/submissions/route.ts:345-393` (`pg_advisory_xact_lock(hashtextextended(user.id))` at `:349`, then global `COUNT(*)` at `:385-388` inside that lock) | global work under per-user lock | The global queue-cap check is fleet-wide but runs inside the per-user serialized section, so concurrent users block each other on a global concern. |
| AGG-41 / PERF-9 | `src/app/api/v1/admin/audit-logs/route.ts:73-105` (precompute groupIds/assignmentIds/submissionIds/problemIds, then `inArray(resourceId, ...)`) | IN-array balloon | For an instructor with many groups/assignments/submissions, the `IN(...)` array can balloon to thousands of entries, repeated per page load. `EXISTS` subqueries let the planner use indexes. |
| F-1 | `src/lib/auth/permissions.ts:186-217` (`canManageProblem`); also `canAccessProblem:108-171` | per-request DB hit | No memoization; every call runs ≥2 DB queries. Fast-path for the common case (student) is missing. |

### Design notes per perf item

**AGG-36 (SSE sharded lock) — design:** the global cap check at `realtime-coordination.ts:111-122` is the blocker — it counts ALL entries (`count(*)` plus a per-user filter branch), so a per-user lock cannot elide it. Three options, in increasing complexity:
1. **Tolerate approximate global cap:** check the global count OUTSIDE the lock (`:111-122` as a plain query), accept small over-admission under contention, and only acquire a per-user lock for the per-user cap check + insert. Cheapest; admits a few extra connections under race, which the existing `MAX_GLOBAL_SSE_CONNECTIONS=500` headroom absorbs.
2. **Maintain a counter row:** add a `realtimeCoordination`-style counter row (or a `realtimeCounters` table) incremented/decremented atomically with `INSERT ... RETURNING` and an `UPDATE ... SET count = count + 1 WHERE count < cap`. Per-user lock only for the per-user check.
3. **Sharded counter (the cycle-1 note):** shard the global count across N buckets keyed by `hash(userId) % N`; each bucket admits ≤ `cap/N` connections under its own lock. Approximate but bounded; no global serialization.

Recommendation: option 1 this cycle (smallest change, the over-admission is bounded and harmless), option 2 if a precise cap matters.

**AGG-37 (rankings ISR):** `export const revalidate = 60;` at the top of `rankings/page.tsx`. One line. Ensure the page does not depend on per-request auth (it's public/unauthenticated per the grep — no `dynamic = "force-dynamic"` either).

**AGG-38/39 (announcements/clarifications pagination + SQL predicate):** add `.limit(N).offset(M)` driven by query params, and push any JS-side filter (currently the route returns the full list and filters client-side) into the SQL `where`. The `orderBy` at `:51` already uses DB columns; just add the limit/offset and a `count(*)` total for the pager.

**AGG-40 (global-cap placement):** move the `globalRow` query at `submissions/route.ts:385-388` to BEFORE the `pg_advisory_xact_lock` at `:349`. The global queue state is not user-specific, so reading it outside the per-user lock is correct; the insert still happens inside the lock. The user-specific checks (recent count at `:351-359`, pending count at `:369-378`) stay inside the lock.

**AGG-41 (audit IN → EXISTS):** replace `inArray(auditEvents.resourceId, groupIds)` etc. with `EXISTS (SELECT 1 FROM groups g WHERE g.id = audit_events.resource_id AND g.instructor_id = $user)`. Lets the planner use the `groups.instructor_id` index instead of shipping a thousand-id IN list. The precompute queries at `:74-105` go away — the EXISTS subquery does the scoping inline.

**F-1 (canManageProblem / canAccessProblem memoization):** the common case (student viewing a problem they're enrolled in) hits `canAccessProblem:157-168` — an `enrollments` JOIN. For a single page render that calls `canAccessProblem` multiple times (list + detail + discussion thread + vote), this is 4+ queries for the same yes/no. Two-layer fix:
1. **Per-request cache:** memoize the yes/no result in an AsyncLocalStorage-scoped Map keyed by `${userId}:${problemId}` (or use the existing `recruiting/request-cache.ts` pattern if it generalizes).
2. **Student fast-path:** students have a small, enumerable set of accessible problems (`getAccessibleProblemIds` at `permissions.ts:219+` already exists). For list views, call that ONCE and do an in-memory set lookup per item, instead of `canAccessProblem` per item.

---

## 4. NET-NEW architectural risks

### NEW-A — Audit flush-failure metric overcounts re-buffered events (LOW)
`src/lib/audit/events.ts:194`. On flush failure, `auditEventWriteFailures += batch.length` counts every event in the failed batch even though `:202-203` re-buffers them (not dropped). `getAuditEventHealthSnapshot()` then reports `degraded` for transient retries. **Fix:** only increment `auditEventWriteFailures` when the batch is actually dropped (the `else` branch at `:204-213`). Confidence: high.

### NEW-B — `enc:` format has no key-version prefix (MEDIUM, latent)
`src/lib/security/encryption.ts:67-79`. The ciphertext format is `enc:iv:ciphertext:authTag` with no key-version byte. If `NODE_ENCRYPTION_KEY` is ever rotated, every `enc:` value encrypted with the old key fails `decrypt()` with a GCM auth-tag error and there is no way to know which key to try. The current mitigation is "never rotate the key" (implicit). This becomes load-bearing if AGG-10's re-encryption migration ships (the migration is the natural moment to introduce a key-version prefix) and is critical if AGG-2's snapshot-mode at-rest encryption reuses the same format. **Fix direction:** extend the format to `enc2:keyId:iv:ciphertext:authTag` (or `enc:v1:...`), keep `decrypt()` accepting the unprefixed `enc:` form as v1 for backward compat. Confidence: high that the gap exists; medium that it bites soon.

### NEW-C — `execTransaction` build-phase stub runs the callback instead of short-circuiting (LOW, latent — re-confirmed from cycle 2)
`src/lib/db/index.ts:90-98`. The build-phase branch still runs the callback against a drizzle stub instead of throwing. Cycle-2 NEW-5; still open. Future code that imports an advisory-lock or rate-limit helper at module top-level during build will execute non-atomically and invisibly. **Fix:** make the build-phase branch `throw new Error("execTransaction called during build")` so the failure is loud.

### NEW-D — SSE re-auth IIFE swallows per-connection cost on every 30s tick (LOW)
`src/app/api/v1/submissions/[id]/events/route.ts:466`. Every 30s, every active connection calls full `getApiUser(request)` (which resolves capabilities etc.). At the 500-connection cap that is ~17 auth resolutions/sec sustained. Cheap today; if auth resolution gets heavier (e.g. a DB-backed capability refresh), this scales linearly with connection count. **Fix direction:** a lighter-weight `getUserActiveStatus(userId)` check that only verifies `users.isActive` and the session row, skipping capability resolution. Confidence: medium.

### NEW-E — Per-target deploy env files are documentation, not configuration (HIGH, re-confirmed — same root as AGG-14)
`.env.deploy.algo` / `.env.deploy.worv` / `.env.deploy.auraedu` hold correct safety values for their targets, but no script reads them. `deploy-docker.sh:120` sources only `.env.deploy`. This is the structural form of AGG-14's footgun — the per-target files exist *as if* they were configuration but are treated *as* documentation by the code. The fix in §2.4 makes them actually-sourced; tracking here because the root issue is the documentation/configuration ambiguity, which the fix resolves structurally rather than one-off. Confidence: high.

---

## 5. FINAL SWEEP — priorities for the next cycle, in order

1. **REG-2** (discussion scope centralization drift) — smallest fix, closes the drift surface that caused C2-H5. Two call sites.
2. **AGG-14 / NEW-E** (deploy `--target=` sourcing) — lowest effort, highest risk reduction; structural fix for the documentation/config ambiguity.
3. **C2-H7** (`PROXY_TRUST_MODE` design, §2.8) — design is ready; implementation is gated on verifying the algo/worv `TRUSTED_PROXY_HOPS` values first to avoid re-triggering the cycle-2 revert.
4. **AGG-1** (restore staging-then-rename, §2.1) — ship steps 1-2 (crash-consistency) this cycle; defer the orphan sweep.
5. **AGG-37** (rankings ISR) — one-line `revalidate = 60`.
6. **AGG-40** (move global-cap check outside the per-user lock) — small, mechanical.
7. **F-1** (canAccessProblem memoization) — medium effort, high traffic-path leverage.
8. **AGG-2 / AGG-10 / NEW-M8** (snapshot mode, plaintext migration, zip-bomb streaming) — design-heavy, defer to a dedicated cycle; the design sketches above are the starting point.

**Items to CLOSE as already-resolved:**
- **NEW-M2** (SSE re-auth) — implemented at `events/route.ts:452-522`. Mark closed.
- **NEW-M7** (recruiting token race) — atomic at `recruiting-invitations.ts:741-758`. Mark closed.

**Capped LOW findings:** NEW-A, NEW-C, NEW-D. All have concrete exit criteria; none are security/correctness/data-loss.

---

## References

- `src/lib/audit/events.ts:252-285` — buffered vs durable audit helpers (REG-1)
- `src/app/api/v1/admin/restore/route.ts:163,178-221` — restore DB commit then file-restore + dual durable audit (REG-1, REG-4)
- `src/lib/discussions/permissions.ts:17-37` — centralized scope helper (REG-2)
- `src/app/api/v1/community/threads/route.ts:18-31` — create route inlines the check (REG-2 drift)
- `src/app/api/v1/community/votes/route.ts:62-76` — vote route inlines the check (REG-2 drift)
- `src/app/api/v1/community/threads/[id]/posts/route.ts:40-47` — reply route uses the helper correctly (REG-2)
- `src/lib/security/ip.ts:91-117` — XFF hop-count gate + unconditional X-Real-IP fall-through (REG-3, §2.8)
- `src/lib/db/export-with-files.ts:351-360` — `restoreParsedBackupFiles` plain write loop, no staging (AGG-1)
- `src/lib/files/storage.ts:27-30` — bare `writeFile` (AGG-1)
- `src/lib/db/export.ts:104-106,366-368` — unconditional ALWAYS_REDACT merge + sanitized-restore rejection (AGG-2)
- `src/lib/security/secrets.ts:21-42` — ALWAYS vs SANITIZED redaction maps (AGG-2)
- `src/lib/security/encryption.ts:67-79,98-117` — `enc:` format + plaintext fallback default (AGG-10, NEW-B)
- `src/lib/plugins/secrets.ts:59-67` — `decryptPluginSecret` defaults plaintext-fallback to `true` (AGG-10)
- `deploy-docker.sh:119-123,184-187` — sources only `.env.deploy`; defaults contradict CLAUDE.md (AGG-14, NEW-E)
- `.env.deploy.algo` / `.env.deploy.worv` — safe values never sourced (AGG-14, NEW-E)
- `src/app/api/v1/submissions/[id]/events/route.ts:33,452-522` — SSE re-auth already implemented (NEW-M2 closed)
- `src/lib/assignments/recruiting-invitations.ts:741-758,88-115` — atomic claim + atomic brute-force counter (NEW-M7 closed)
- `src/lib/db/export-with-files.ts:33-35,131-149,272` — declared-size zip caps, `JSZip.loadAsync` materializes in memory (NEW-M8)
- `src/lib/realtime/realtime-coordination.ts:101-140` — single global SSE admission advisory lock (AGG-36)
- `src/app/(public)/rankings/page.tsx` — no `revalidate` export (AGG-37)
- `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:50-51` and `.../clarifications/route.ts:50-51` — unbounded queries (AGG-38/39)
- `src/app/api/v1/submissions/route.ts:345-393` — global-cap COUNT inside per-user advisory lock (AGG-40)
- `src/app/api/v1/admin/audit-logs/route.ts:73-105` — precomputed IN-array scope filter (AGG-41)
- `src/lib/auth/permissions.ts:108-217` — canAccessProblem / canManageProblem, no memoization (F-1)
- `src/lib/db/index.ts:90-98` — build-phase execTransaction stub runs callback (NEW-C)
