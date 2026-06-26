# Trace Report — judgekit suspicious-flow causal tracing (HEAD `0b0ac198`)

**Mode:** READ-ONLY (delivered inline by tracer agent; persisted by orchestrator for provenance).

## Coverage
All six mandated flows traced to source with file:line citations, plus two cross-cutting findings discovered during the sweep (TR-7, TR-8). For each: competing hypotheses, evidence for/against, rebuttal, conclusion, confidence. Evidence tier is primary artifact (code/logic at specific lines).

---

### TR-1 — ZIP restore: DB commits before files are restored

**Traced path** — `src/app/api/v1/admin/restore/route.ts`
- L82–90: ZIP path → `parseBackupZip` → `pendingUploadedFiles = result.uploads` (staged in memory only; comment at `export-with-files.ts:304-306` explicitly says files are "staged in memory" and "written only after DB validation/import succeeds").
- L149: `takePreRestoreSnapshot` (safety net taken before destructive work).
- L151–163: `recordAuditEvent` (audit; L159 now uses `pendingUploadedFiles.length` — the "pending file count" fix).
- **L165: `const result = await importDatabase(data);`** — DB import.
- L167–174: on failure, return 500 (snapshot path included).
- **L176–178: `if (isZipFile) filesRestored = await restoreParsedBackupFiles(pendingUploadedFiles);`** — disk restore runs only here.
- L180–186: success response.

DB import internals — `src/lib/db/import.ts:125-212`: the entire truncate+insert is wrapped in `await db.transaction(async (tx) => {...})` with the comment `// constraints checked at COMMIT` (L212). On thrown error the txn rolls back (L214–225 sets `result.success=false`). On resolve it **commits**.

Disk restore internals — `src/lib/db/export-with-files.ts:351-360` (`restoreParsedBackupFiles`): loops `writeUploadedFile(upload.storedName, upload.buffer)`. `writeUploadedFile` (`src/lib/files/storage.ts:27-30`) is a plain `writeFile` with no transactional tie to the DB.

**Hypotheses**
| Rank | Hypothesis | Confidence |
|---|---|---|
| 1 | A: DB commits before files restored → committed DB references files not yet on disk | High |
| 2 | B: files restored before DB commit (safe) | Contradicted |

**Evidence For A:** route L165 precedes L177; `importDatabase` commits at txn resolve (`import.ts:212`); files held in memory until after import (`export-with-files.ts:304-306`).
**Rebuttal round** — Best challenge to A: "The import is atomic and the snapshot exists, so failure rolls back cleanly." Rebuttal: the atomic rollback covers the **DB** only. The window of risk opens on the **success** path: between DB commit (L165 resolve) and the completion of `restoreParsedBackupFiles` (L177). If L177 throws (disk full, permission, partial write mid-loop), the catch at L187 returns 500 but the DB is **already committed** with `files` rows whose blobs are absent or partial. There is no compensating rollback of the DB, and `writeUploadedFile` silently overwrites/creates with no atomicity across the set. Hypothesis A stands.

**Conclusion — CONFIRMED BUG (Hypothesis A).** The prior cycle's "DB-first" reading is correct and **still true after the recent fix**. Commit `34d27adf` ("use pending file count in pre-restore ZIP audit summary") was **cosmetic only** — it corrected the audit summary text (L159). It did **not** touch the L165↔L177 ordering.

**Severity: Medium-High.** Data-integrity window on every ZIP restore; blast radius is all uploaded-file references if restore fails post-commit. Mitigated by: (a) pre-restore snapshot for manual recovery, (b) files staged in memory so parse-time integrity is already verified — only the disk write can fail.

**Fix (design)** — make the disk write precede/augment DB commit transactionally: stage files to a temp dir, run DB import in its transaction, and on commit move staged files into place (rename is atomic on same FS); on rollback delete staged files. Shorter-term: wrap `restoreParsedBackupFiles` to fail-fast and, on any write error, automatically replay the pre-restore snapshot before returning 500.

---

### TR-2 — Per-problem export: does `canManageProblem` hide hidden tests / expected outputs from students?

**Traced path** — `src/app/api/v1/problems/[id]/export/route.ts`
- L13–31: fetch problem (explicit column list — note: `problemType`, `functionSpec`, `referenceSolution` are **not** selected; see TR-3).
- L33: `if (!problem) return notFound`.
- **L35–36: `const hasAccess = await canManageProblem(...); if (!hasAccess) return forbidden();`** — gate.
- L38–47: test-case query (`input`, `expectedOutput`, `isVisible`, `sortOrder`) runs **only after** the gate passes.
- L55–62: serializes **all** cases (visible + hidden) including `expectedOutput`.

`canManageProblem` — `src/lib/auth/permissions.ts:186-217`: true only if (a) `groups.view_all` (org admin), (b) `authorId === userId`, or (c) problem linked to a group the user **teaches**. It deliberately does **not** check `enrollments` — a student enrolled in a group does **not** pass.

**Conclusion — NOT A BUG.** Gate is effective: students receive 403 before any test case (hidden or visible) or expected output is loaded or serialized. Instructors legitimately see hidden cases for problems in groups they teach — intended. Fix `6cc068f0` is intact and correct.

**Minor finding (low severity):** existence side-channel — the route fetches-then-403s, so an unauthorized caller can distinguish "no such problem" (404) from "exists but forbidden" (403). Low impact (problem IDs are not secret enumerators). Fix: return `forbidden()` for both missing and unauthorized when the caller lacks management rights.

---

### TR-3 — Per-problem export/import round-trip: function problems silently downgrade to "auto"

**Traced path**
- Export `src/app/api/v1/problems/[id]/export/route.ts:15-30` — explicit column list; **no** `problemType`, `functionSpec`, `referenceSolution`. The serialized `problem` object (L57-59) therefore has no `problemType` key.
- Import `src/app/api/v1/problems/import/route.ts:23` — `problemType: z.enum(["auto","manual","function"]).default("auto")`. Missing key → `"auto"`.
- Import L89–90 — `functionSpec: problem.problemType === "function" ? problem.functionSpec ?? null : null` and identical for `referenceSolution`. With `problemType==="auto"`, both forced to `null` even if a caller supplied them.
- Sink `src/lib/problem-management.ts:309-310` and `357-358` — same conditional; confirms the create/update path nulls these for non-`function` types.
- Schema `src/lib/db/schema.pg.ts:261,271,273` — `problem_type` default `"auto"`; `function_spec`/`reference_solution` are nullable jsonb.

**Scope check:** the full-DB export (`src/lib/db/export.ts`) serializes columns generically (L108–117 uses `TABLE_ORDER` + `Object.keys(columnsChunk[0])`), so a full backup/restore **does** preserve `problemType` and function judging. The downgrade is **isolated to per-problem export→import** (the "share a single problem" path).

**Conclusion — CONFIRMED BUG.** Silent downgrade of function-judging problems to standard judging on per-problem export/import round-trip. Loss of `functionSpec` and `referenceSolution` is unrecoverable from the export file.

**Severity: Medium.** Silent data loss scoped to the per-problem portability path; function problems re-imported as ordinary problems will be judged by stdout comparison instead of the function harness, likely producing wrong verdicts. Not a full-DB restore risk.

**Fix** — add `problemType`, `functionSpec`, `referenceSolution` to the export SELECT (`export/route.ts:15-30`) and include them in the serialized `problem` object. No import change needed (schema already accepts them).

---

### TR-4 — User deletion: is audit recorded after the transaction commits?

**Traced path** — `src/app/api/v1/users/[id]/route.ts` (DELETE handler, L420-530)
- L472–484: `auditContext` captured **before** deletion (actorId FK cascades to null on delete) — comment L469-471 explains rationale.
- **L491–503: `await execTransaction(async (tx) => {... scrub ... await tx.delete(users)...})`** — destructive work.
- **L506: `recordAuditEvent(auditContext);`** — called **after** the `await` resolves, i.e. post-commit.

`execTransaction` — `src/lib/db/index.ts:90-98`: `return db.transaction(async (tx) => ...)`. Drizzle's `db.transaction` commits when the callback resolves successfully and rolls back on throw. Therefore L506 runs only after a successful commit.

**Conclusion — CONFIRMED CORRECT (ordering).** Commit `76e27d31`'s claim holds: audit is recorded after the transaction commits. Residual weakness: unawaited audit call (TR-7).

---

### TR-5 — Startup language sync: does boot overwrite admin-managed command overrides?

**Traced path** — `src/instrumentation.ts:33`; `src/lib/judge/sync-language-configs.ts:10` (`doSync`):
- L11-19: load existing rows.
- L28-43: **missing** record → INSERT defaults.
- **L46-52: existing record → update ONLY if field is empty/null**: `if (!record.runCommand && runCmd)` and `if (record.compileCommand == null && compileCmd)`.
- L54-63: apply backfill update; never overwrites a non-empty value.

**Conclusion — NOT A BUG.** Boot sync is additive/least-authoritative: it seeds missing languages and backfills missing commands, never overwriting admin-configured overrides.

---

### TR-6 — Docker client: silent local-Docker fallback when worker URL/token missing?

**Traced path** — `src/lib/docker/client.ts`
- L13 `JUDGE_WORKER_URL = JUDGE_WORKER_URL || COMPILER_RUNNER_URL || ""`.
- L21 `RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || ""`.
- L26-33: missing token in prod → **logged** (not thrown) — commit `26cff8e4`.
- L48 `USE_WORKER_DOCKER_API = Boolean(URL && token)`.
- L49-50 `ALLOW_LOCAL_DOCKER_ADMIN = NODE_ENV !== "production" || JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN === "1"`.
- `getDockerManagementCapabilities` L108-148: (1) if `WORKER_DOCKER_API_CONFIG_DETAIL` → **unavailable**; (2) else if `USE_WORKER_DOCKER_API` → worker; (3) else if `ALLOW_LOCAL_DOCKER_ADMIN` → local; (4) else → unavailable.

Production matrix: in every production misconfiguration, `WORKER_DOCKER_API_CONFIG_DETAIL` is non-null, forcing `unavailable` before the `ALLOW_LOCAL_DOCKER_ADMIN` branch is reached. Local mode requires non-production OR explicit `JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN=1`.

**Conclusion — NOT A BUG.** No silent local-Docker fallback in production on missing worker URL/token. Mode resolves to `unavailable`/`configError`. Token-domain separation from `JUDGE_AUTH_TOKEN` is also correct (L14-21).

---

### TR-7 (bonus, cross-cutting) — Fire-and-forget `recordAuditEvent` across the codebase

Sweep found `recordAuditEvent` invoked without `await` in multiple security-relevant files (e.g. `src/app/api/v1/users/[id]/route.ts:506`, `src/lib/actions/user-management.ts`, `src/lib/actions/change-password.ts`, `src/lib/actions/system-settings.ts`, `src/lib/actions/language-configs.ts`, `src/proxy.ts`).

**Traced implication:** `recordAuditEvent` returns a promise that, if unawaited, can be lost on event-loop turn-over or process shutdown. Combined with TR-4's post-commit ordering this means: a committed deletion whose audit insert throws (DB blip, constraint) leaves **no audit trail** with no error surfaced. `registerAuditFlushOnShutdown` (started in `instrumentation.ts:45`) mitigates shutdown loss but not mid-flight rejection.

**Conclusion — Low-Medium severity.** Not a correctness bug in the audited flows' ordering, but a reliability gap in audit completeness precisely where audit matters most (deletions, role changes, password resets). Recommend: `await recordAuditEvent(...)` at security-critical call sites, or have the helper schedule a retry/queue on failure.

---

### TR-8 (bonus, supports TR-1) — `writeUploadedFile` silently overwrites

`src/lib/files/storage.ts:27-30` — `writeUploadedFile` calls `writeFile(resolveStoredPath(...), data, {mode:0o644})` with no existence check, no versioning, no error on collision.

**Implication:** On restore, a partial/failed run leaves a mix of old + new files on disk with the same `storedName`; subsequent reads return whichever bytes landed last. This compounds TR-1: there is no atomic boundary between DB commit and file replacement, and a re-run after a partial failure does not detect leftover inconsistency.

**Conclusion — Low severity on its own; raises the cost of TR-1's recovery.** Recommend staging-then-rename (see TR-1 fix).

---

### Hypothesis summary

| ID | Flow | Verdict | Confidence | Severity |
|---|---|---|---|---|
| TR-1 | Restore DB-before-files ordering | **BUG** (DB-first; "pending count" fix was cosmetic) | High | Medium-High |
| TR-2 | Per-problem export gate hides tests from students | **OK** (gate effective; minor existence side-channel) | High | Low (side-channel) |
| TR-3 | Function problems downgrade on per-problem round-trip | **BUG** (silent loss of problemType/functionSpec/referenceSolution) | High | Medium |
| TR-4 | User-deletion audit after commit | **OK** (post-commit; unawaited — see TR-7) | High | — |
| TR-5 | Boot language sync overwrites admin overrides | **OK** (backfill-only) | High | — |
| TR-6 | Silent local-Docker fallback in prod | **OK** (unavailable/configError; explicit opt-in only) | High | — |
| TR-7 | Unawaited `recordAuditEvent` (cross-cutting) | **Reliability gap** | Medium | Low-Medium |
| TR-8 | `writeUploadedFile` silent overwrite | **Compounds TR-1** | High | Low |

## Relevant file paths (all absolute)
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/admin/restore/route.ts` (TR-1: L165, L177)
- `/Users/hletrd/flash-shared/judgekit/src/lib/db/import.ts` (TR-1: L125, L212)
- `/Users/hletrd/flash-shared/judgekit/src/lib/db/export-with-files.ts` (TR-1: L304-306, L351-360)
- `/Users/hletrd/flash-shared/judgekit/src/lib/files/storage.ts` (TR-8: L27-30)
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/problems/[id]/export/route.ts` (TR-2, TR-3: L15-30, L35-36, L55)
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/problems/import/route.ts` (TR-3: L23, L89-90)
- `/Users/hletrd/flash-shared/judgekit/src/lib/problem-management.ts` (TR-3: L309-310, L357-358)
- `/Users/hletrd/flash-shared/judgekit/src/lib/auth/permissions.ts` (TR-2: L186-217)
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/users/[id]/route.ts` (TR-4: L491-506)
- `/Users/hletrd/flash-shared/judgekit/src/lib/db/index.ts` (TR-4: L90-98)
- `/Users/hletrd/flash-shared/judgekit/src/instrumentation.ts` (TR-5: L33)
- `/Users/hletrd/flash-shared/judgekit/src/lib/judge/sync-language-configs.ts` (TR-5: L46-52)
- `/Users/hletrd/flash-shared/judgekit/src/lib/docker/client.ts` (TR-6: L38-50, L108-148)
