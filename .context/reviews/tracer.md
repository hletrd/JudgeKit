# Cycle 2 — tracer

Repository: `/Users/hletrd/flash-shared/judgekit` (head `ad543e14`). Read-only pass. Method: observation-first, with competing hypotheses and disconfirmation per finding.

## REGRESSION TRACES (residual bugs the cycle-1 fixes missed)

### R1 — Restore audit fires post-commit but is buffered, and is recorded BEFORE the file-write step
- **Severity:** HIGH (audit integrity) · **Confidence:** MEDIUM-HIGH
- **Files:** `src/app/api/v1/admin/restore/route.ts:151,168,182-184`; `src/lib/audit/events.ts:252-262` (buffered) vs `:275-285` (durable)

**Trace (cause→effect):**
`importDatabase()` commits the truncate+insert transaction at `route.ts:151`. At `:168` the route calls `recordAuditEvent(...)` — the **buffered** variant that pushes into the in-memory `_auditBuffer` with a 5 s flush timer (`events.ts:164,252`). Only at `:182-184` does it `await restoreParsedBackupFiles(...)`. Two distinct residual gaps:

1. **Durability gap.** Because the import transaction TRUNCATED `auditEvents`, the in-memory buffer is the *only* place the new restore-audit row exists until the next 5 s flush. A SIGKILL/OOM/`docker kill` in that window replaces production data and leaves *no* integrity trail that a restore occurred. `events.ts:263-273` explicitly says durable (`recordAuditEventDurable`, immediate awaited insert) is for "low-frequency, high-stakes actions ... NOT for high-frequency events." A database restore is the canonical low-frequency high-stakes event. The plan A2 wording — "reuse the durable-audit helper used by user deletion" — implied durable; the user-delete mirror at `users/[id]/route.ts:506` also uses the buffered call, so the implementation is faithful to the *actual* mirror but not to the stated *intent*.
2. **Timing gap.** The audit is recorded with summary `"Restoring from ZIP backup (... ${pendingUploadedFiles.length} files pending ...)"` at `:175-177` **before** `restoreParsedBackupFiles` runs. If the file-write step throws, the audit row has already been buffered claiming the restore, while the response at `:193-195` returns `restoreFailed` with no snapshot path surfaced.

**Competing hypotheses:**
- H1 (leader): fix is incomplete — durable was intended but the wrong helper was used. Evidence: `events.ts` docstring directly contradicts using buffered for this class of event; timing-of-audit-before-files is a code smell.
- H2: team deliberately accepted buffered because the pre-restore snapshot on disk is the rollback artifact. Evidence against: the snapshot records state, not *who/when* restored — a crash also loses the audit but keeps the snapshot, defeating the integrity-trail purpose.
- Down-rank check: H2 cannot explain why `events.ts` exports `recordAuditEventDurable` at all if high-stakes actions intentionally avoid it.

**Fix:** Use `await recordAuditEventDurable(...)` at `route.ts:168`, and move the call to *after* `restoreParsedBackupFiles` succeeds (`:184`), reflecting actual completion. Adjust summary text to past tense.

### R2 — File-restore runs after DB commit via non-atomic writes; partial-failure leaves the DB claiming files that do not exist (AGG-1 window still open)
- **Severity:** HIGH (data integrity) · **Confidence:** HIGH
- **Files:** `src/app/api/v1/admin/restore/route.ts:182-184`; `src/lib/files/storage.ts:27-30`; `src/lib/db/export-with-files.ts:351-360`

**Trace:**
`writeUploadedFile` writes directly to the final path with `writeFile(..., { mode: 0o644 })` — no temp-file-then-rename. `restoreParsedBackupFiles` loops over every upload calling this sequentially. If any iteration throws (disk full mid-loop, EACCES, ENOSPC), the loop aborts, control jumps to the outer catch at `route.ts:193`, and the response is `500 restoreFailed`. By then:
- the DB transaction at `:151` has already committed (the `files` table now lists every uploaded file as if present);
- some files have been written, others have not;
- there is no automatic rollback — recovery requires the operator to notice and run `takePreRestoreSnapshot` output (which is *not* surfaced in the 500 response body at `:194-195`, only logged).

This is the still-open AGG-1 / TR-1 / DBG-1 window. A2 + snapshot do **not** close it: A2 is buffered (R1), the snapshot is manual-rollback-only, and the 500 path hides the snapshot path from the caller.

**Competing hypotheses:**
- H1 (leader): real open window — matches the plan's own Phase-B deferral text.
- H2: maybe `restoreParsedBackupFiles` catches and continues per-file. Evidence against: `export-with-files.ts:355-357` has no try/catch inside the loop — first failure propagates.
- H3: maybe the 500 path includes the snapshot path. It does *not* include `preRestoreSnapshotPath` — confirmed by reading.

**Fix (Phase B design):** stage every file to a temp dir first, then `rename` into place atomically after all writes succeed; only then commit the DB transaction (or use a directory-swap). Short-term: include `preRestoreSnapshotPath` in the 500 body so the operator has the rollback handle.

### R3 — A2 exit-criterion test ("truncate-survival") does not exist
- **Severity:** MEDIUM (verification gap) · **Confidence:** HIGH
- **Files:** `tests/unit/api/` (no `admin-restore*.test.ts`); closest: `tests/unit/api/admin-backup-security.route.test.ts`, `tests/unit/db/import-implementation.test.ts`

**Trace:**
Plan A2 exit: "extend `tests/unit/api/admin-restore*.test.ts` to assert audit survives a successful import." `find` returns no such file. `import-implementation.test.ts` exercises `importDatabase` rollback semantics but not the route handler's audit path. So the truncate-survival property — the exact regression A2 was meant to prevent — is unverified. A future refactor that moves `recordAuditEvent` back inside the transaction would pass the existing suite.

**Fix:** Add the route-level test the plan named, with a mocked `importDatabase` that truncates `auditEvents`, then assert the durable row is observable after the handler resolves.

---

## PHASE-B CONFIRMATION (cited flows re-traced this cycle)

| Phase-B item | Status | Evidence |
|---|---|---|
| **AGG-1 / TR-1** Restore DB-before-files atomicity | **REPRODUCES** (see R2) | `storage.ts:27-30` non-atomic; `export-with-files.ts:355-357` no per-file try/catch |
| **AGG-21** Backup memory stream | **REPRODUCES** | `export-with-files.ts:171` accumulates `dbChunks[]`; `:239` `zip.generateAsync({type:"uint8array"})` materializes the whole blob; `streamBackupWithFiles` does not actually stream |
| **AGG-22** Missing-file reporting | **REPRODUCES** | `export-with-files.ts:222-229`: missing file → `skipped++` and omitted from `manifestUploads`; DB row survives round trip but physical file is silently gone |
| **AGG-23** Concurrent-restore lock | **REPRODUCES** | no mutex or `pg_advisory_xact_lock` in restore route or `importDatabase` |
| **AGG-28 (sub-item)** SSE re-auth | **REPRODUCES** | `submissions/[id]/events/route.ts:466`: re-auth checks identity only, not `canAccessSubmission`; revoked group access continues until 30 s tick |

---

## NEW TRACES

### N1 — Phase A landing verification (positive trace)
All twelve Phase-A items confirmed present in code:
- **A1** `.env*` files all `-rw-------` (0600) except `.env.example` / `.env.production.example`; startup guard at `src/lib/security/env.ts:194-207`.
- **A5** `api-keys/[id]/route.ts:86-90`: `targetRole = body.role ?? existing.role` applies gate to all mutations.
- **A6** `chat-widget/chat/route.ts:375` and `:508`: `sanitizePromptInput` on both branches.
- **A7** `security/ip.ts:97`: `TRUSTED_PROXY_HOPS=0` skips XFF entirely.
- **A8** `compiler/execute.ts:64-83`: import-time throw replaced with logged error.
- **A9** `problems/[id]/export/route.ts:21-25`: three function fields selected.
- **A10** `validation.rs`: zero `set_var`/`remove_var` occurrences.
- **A11** Sibling-route trace clean. All three read paths serializing `referenceSolution` route through strict `canManageProblem`: `problems/[id]/route.ts:65` (GET), `problems/[id]/export/route.ts:38`, `problems/[id]/compute-expected/route.ts:54`. No leak path remains.
- **A12** `scripts/check-migration-drift.sh:79`: "Never `git clean -fd`".

### N2 — No wall-clock cap on total judging time; in-progress pings refresh the stale-claim timer indefinitely
- **Severity:** LOW-MEDIUM · **Confidence:** MEDIUM
- **Files:** `src/app/api/v1/judge/poll/route.ts:78-108` (in-progress branch); `src/lib/judge/claim-query.ts`

**Trace:**
The in-progress branch at `poll/route.ts:88` sets `judgeClaimedAt: dbNow` on every progress ping. The stale-claim reclaim CTE computes staleness against `judge_claimed_at`. So a worker that sends periodic in-progress updates — even if genuinely stuck in an infinite compile loop, retry storm, or buggy verifier — keeps `judge_claimed_at` fresh and is never reclaimable by another worker. `grep` for `maxJudgingMs` / `maxWallClock` / `MAX_JUDGING` returns nothing.

**Competing hypotheses:**
- H1 (leader): no total-wall-clock cap exists; in-progress pings reset the fence.
- H2: the heartbeat-staleness path catches this when the *worker* dies. Evidence against H2: a *live but looping* worker keeps heartbeating and pinging in-progress, so the staleness sweep never triggers — the submission is pinned in `judging` forever.

**Fix:** Track a separate immutable `judgeClaimStartedAt` (set once at claim, never refreshed) and have the stale-claim CTE compare against it with a `MAX_TOTAL_JUDGING_MS` ceiling, independent of progress pings.

---

## FINAL SWEEP (LOW, capped at 5)

- **L1** `src/lib/audit/events.ts:168-220` — module-level `_auditBuffer` is *not* cleared by the import transaction's TRUNCATE. After a restore commits, the next flush re-inserts pre-restore buffered events into the freshly-truncated table. Minor (the events really did happen) but the restored DB's audit log is not a clean "post-restore" view. **Confidence: MEDIUM.**
- **L2** `src/app/api/v1/judge/claim/route.ts:284-301` — `recordAuditEvent({action:"submission.claimed_for_judging"})` fires on *every* claim; on a busy judge this is the dominant audit volume. Consider sampling or a metric. **Confidence: HIGH.**
- **L3** `src/app/api/v1/admin/api-keys/[id]/route.ts:88` — `!canManage && user.role !== targetRole` permits lateral same-role mutations even when `canManageRoleAsync` returns false. Likely correct (intent = block upward only) but diverges from the literal return. **Confidence: MEDIUM.**
- **L4** `src/lib/db/export-with-files.ts:162` — `streamBackupWithFiles` does not stream. Rename or make it actually stream. **Confidence: HIGH.**
- **L5** `src/app/api/v1/groups/[id]/instructors/route.ts:97-103` — update-existing path lets any `co_instructor` change another co_instructor's link role to `ta` (peer demotion) without an owner/admin gate. Likely acceptable; confirm intent. **Confidence: MEDIUM.**

### Critical unknown
Whether the cycle-1 team's *intent* for A2 was "durable" (`recordAuditEventDurable`) or "buffered, matching user-delete" (what shipped). This determines whether R1 is a regression or an under-specified mirror.

### Discriminating probe
One-line edit test: in `route.ts:168`, swap `recordAuditEvent` → `await recordAuditEventDurable(...)`. If the existing suite still passes, the durable path was never exercised and the cycle-1 exit criterion was not actually guarded — confirming R1+R3.

### Uncertainty notes
- R1 severity hinges on the team's intent (above); rated HIGH on the assumption that "audit must survive" implies crash-survival for a restore event.
- N2 traced from code only, not reproduced at runtime; absence of any `MAX_TOTAL_JUDGING_MS` constant is strong but not conclusive.
- Phase-B items AGG-2, AGG-10, AGG-14..20, AGG-24..62 were not re-traced this cycle; their status is whatever the cycle-1 plan recorded.
