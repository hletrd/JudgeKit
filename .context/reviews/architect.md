# Cycle 2 — architect

**Scope:** regression-check the 12 cycle-1 Phase A fixes (head `ad543e14`); architecture-lens evaluation of the Phase B backlog plus the performance lane (no perf-reviewer registered); new arch/design risks across app/worker/schema/deploy. READ-ONLY. Every finding cites file:line.

---

## REGRESSION — Phase A (12 fixes)

Verified all 12 against code. **11 match existing patterns cleanly with no layering/coupling regression. 1 (A2) inherited a weaker helper than the plan intended.**

| ID | Status | Evidence | Pattern-match |
|---|---|---|---|
| A1 env 0600 + guard | CLEAN | `src/lib/security/env.ts:182-211` (`assertLoadedEnvFilePermissions`), `:150-169` (resolver) | Production-only, no-op when env injected via process env. Correct threat model. |
| A2 restore audit post-commit | **PARTIAL — see REG-1** | `src/app/api/v1/admin/restore/route.ts:168-180` | Post-commit placement correct; **wrong helper chosen**. |
| A3 group DELETE IDOR | CLEAN | `src/app/api/v1/groups/[id]/route.ts:198-231` | Fetches `instructorId` inside tx under `for("update")`, then `canManageGroupResourcesAsync` + `caps.has("groups.view_all")`. Mirrors PATCH (`:127-134`) and GET (`:64-69`) exactly. |
| A4 instructors POST target-role | CLEAN | `src/app/api/v1/groups/[id]/instructors/route.ts:87-89` | `getRoleLevel(targetUser.role) <= 0` gate mirrors PATCH ownership-transfer at `groups/[id]/route.ts:160`. |
| A5 api-keys PATCH escalation | CLEAN | `src/app/api/v1/admin/api-keys/[id]/route.ts:51,86-90` | `targetRole = body.role ?? existing.role` applies `canManageRoleAsync` to ALL mutations (name/isActive/expiryDays), not only role. Correct generalization. |
| A6 chat-widget sanitize | CLEAN | `src/app/api/v1/plugins/chat-widget/chat/route.ts:373-376` (no-tools), `:508` (tool-result); threat-surface comment at `src/lib/plugins/chat-widget/tools.ts:68-71` | `sanitizePromptInput` on both branches; per-tool Zod-validation contract documented in `executeTool`. |
| A7 XFF `=0` | CLEAN | `src/lib/security/ip.ts:91-97` | `if (trustedHops > 0 && parts.length >= trustedHops + 1)` — `=0` skips XFF entirely, falls through to X-Real-IP/socket. |
| A8 compiler logged-error | CLEAN | `src/lib/compiler/execute.ts:64-87` | Mirrors `src/lib/docker/client.ts` (commit `26cff8e4`) verbatim: log-once + `COMPILER_RUNNER_CONFIG_ERROR` constant consumed downstream. ARCH-1 recommendation followed precisely. |
| A9 function export fields | CLEAN | `src/app/api/v1/problems/[id]/export/route.ts:13-65` | `problemType`/`functionSpec`/`referenceSolution` added to SELECT and serialized object; export gated behind `canManageProblem` (`:38`). |
| A10 Rust validation env-race | CLEAN | `judge-worker-rs/src/validation.rs:55-95` (pure `validate_docker_image_with_config`), `:137-260` (tests inject config) | No `unsafe set_var/remove_var` in tests; env-reading boundary isolated at `:91-95`/`:107-111`. Parallel-safe. |
| A11 problems GET strict | CLEAN + generalized — see REG-2 | `src/app/api/v1/problems/[id]/route.ts:65` | Routed through strict `canManageProblem`; local boolean removed from GET. |
| A12 migration-drift git clean | CLEAN | `scripts/check-migration-drift.sh:77-105` | Replaced `git clean -fd` with targeted `rmSync` (untracked) + `git checkout --` (tracked) of probe footprint only, diffed against pre-probe porcelain state. |

### REG-1 — A2 used the buffered audit helper; restore audit has a residual ~5s crash-loss window
**Severity: MEDIUM | Confidence: high**
**File:** `src/app/api/v1/admin/restore/route.ts:168` (uses `recordAuditEvent`); cf. `src/lib/audit/events.ts:252-262` (buffered) vs `:275-285` (`recordAuditEventDurable`)

The plan (A2) said "reuse the durable-audit helper used by user deletion." That premise was inaccurate: user deletion at `src/app/api/v1/users/[id]/route.ts:506` also uses the **buffered** `recordAuditEvent`, not `recordAuditEventDurable`. The implementer faithfully mirrored the user-deletion pattern, so the fix is correct *re: the transaction-truncation issue* (the audit is now post-`importDatabase` commit at `:168`, so it survives the TRUNCATE inside the import tx at `src/lib/db/import.ts:125-139`).

However, a DB restore is the single most destructive admin action in the system, and its audit is the one an operator most needs to survive a hard crash. The buffered helper pushes to `_auditBuffer` and flushes on a 5s timer / threshold (`events.ts:255-261`). If the process is OOM-killed or `docker kill`ed in that window — or during the subsequent `restoreParsedBackupFiles` call at `restore/route.ts:182-184` which runs *after* the audit is buffered — the restore audit is lost. `recordAuditEventDurable` (which `await`s the insert) is already used for lower-stakes actions: `admin/settings/route.ts:119`, `admin/roles/route.ts:126`, `admin/roles/[id]/route.ts:118,189`.

**Fix direction:** swap `recordAuditEvent({...})` → `await recordAuditEventDurable({...})` at `restore/route.ts:168`, and add it before the file-restore step (so a file-restore crash still leaves a durable restore audit). The user-deletion pattern should arguably be upgraded the same way, but restore is the priority.

### REG-2 — A11 generalization: no sibling GET reads hidden problem data without the strict gate
**Severity: NONE (informational) | Confidence: high**
**Files:** `src/app/api/v1/problems/[id]/route.ts:45-87` (GET, fixed); `src/app/api/v1/problems/[id]/compute-expected/route.ts:52-54`; PATCH/DELETE at `route.ts:98-106,222-227`

The local-boolean author check (`isAuthor = problem.authorId === user.id`) survives only on **PATCH, DELETE, and compute-expected POST** — and all three *chain* it with a strict `canManageProblem` gate afterward (`route.ts:106,227`; `compute-expected/route.ts:54`). The local boolean there is a deliberate cheap pre-filter before the expensive strict gate; it is not the authorization decision. **GET was the only route that used the local boolean as the actual hidden-data gate, and A11 fixed it.** No further generalization is required for correctness.

---

## PHASE-B ARCHITECTURE

### High-leverage items (data-integrity / coupling reduction)

**PHB-1 / AGG-1 — Restore DB↔files atomicity gap is real and well-bounded (HIGH leverage, needs design before code)**
`src/app/api/v1/admin/restore/route.ts:151` (DB import commits) then `:182-184` (`restoreParsedBackupFiles`) — files restore *after* the DB transaction commits with no compensating action on failure. If `restoreParsedBackupFiles` throws, the catch at `:193` returns 500 but the DB is already fully replaced and references uploads that are absent from disk. The pre-restore snapshot (`takePreRestoreSnapshot` at `:149`) is the right mitigation and is correctly in place. **Design note for the full fix:** stage files to a sibling dir; DB import in one tx; atomic rename only after commit; a sweep that deletes uploads referenced by the old DB but not the new. Do NOT scope this as "wrap import+files in one transaction" — the filesystem is not transactional.

**PHB-2 / AGG-2 — Snapshot export mode needs an auth-model design, not just a redaction flag (HIGH leverage, needs design)**
`src/lib/db/export.ts:48,74,105-106` — `EXPORT_ALWAYS_REDACT_COLUMNS` is unconditionally merged. A `mode: "snapshot"` that bypasses it is architecturally correct *only if* the snapshot path is gated separately (at-rest encryption; a distinct capability stricter than `system.backup`; audit differentiation; retention/auto-prune). Without these, flipping the bypass creates a secret-exfiltration path.

### Mis-scoped / under-scoped Phase B items

**PHB-3 / AGG-18 + PERF-2 — The Rust similarity sidecar cap is mis-scoped as a perf item; it is a DoS-boundary item (HIGH)**
`code-similarity-rs/src/main.rs:23,196` — the sidecar's only guard is `MAX_COMPUTE_BODY_BYTES = 16 MB`. There is **no `submissions.len()` cap**. The TS caller caps at 500 (`src/lib/assignments/code-similarity.ts:236,379`), but the sidecar is reachable from the docker bridge; a leaked/bruteable sidecar token turns into fleet CPU/OOM exhaustion via the O(n²) loop. **Fix is small:** add `const MAX_SUBMISSIONS: usize = 500; if submissions.len() > MAX_SUBMISSIONS { return StatusCode::PAYLOAD_TOO_LARGE }` at the sidecar boundary.

**PHB-4 / AGG-14 + ARCH-2 — Deploy defaults still contradict CLAUDE.md; misclassified as Phase B backlog (should be HIGH, low-effort)**
`deploy-docker.sh:184-187` — script defaults remain `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`. `deploy-docker.sh:119-123` sources only `.env.deploy`, never `.env.deploy.algo`/`.env.deploy.worv` (the per-target files exist with correct safe values but no wrapper sources them). A bare `./deploy-docker.sh` against `algo.xylolabs.com` violates CLAUDE.md's mandatory app-only rule. Fix is a 3-line default inversion OR a `--target=` flag. See NEW-1.

### AGG-36..40 (realtime/perf) — architecture-lens triage
- **SSE advisory lock (PERF-3):** `src/lib/realtime/realtime-coordination.ts` global lock is the most leverage-worthy; sharded counter design. Schema: add a `category` column derived from the key prefix.
- **Rankings CTE ×3 (PERF-4):** `src/app/(public)/rankings/page.tsx` — public + unauthenticated + no `revalidate`. `export const revalidate = 60` is the cheap win.
- **Backup memory (PERF-1):** `src/lib/db/export-with-files.ts:162-250` — streaming rewrite. Admin-only, infrequent → MEDIUM urgency.

---

## PERFORMANCE (covering the absent perf-reviewer lane)

| ID | File:line | Class | Arch note |
|---|---|---|---|
| PERF-1 | `src/lib/db/export-with-files.ts:162-250` | memory | Structural — needs streaming rewrite. |
| PERF-2 | `code-similarity-rs/src/main.rs:23` | DoS/CPU | See PHB-3 — reclassified as boundary. |
| PERF-3 | `src/lib/realtime/realtime-coordination.ts:73-140` | lock contention | Structural — sharded design. |
| PERF-4 | `src/app/(public)/rankings/page.tsx:59-198` | repeated CTE | Cheap ISR win first. |
| PERF-5/6 | `contests/.../announcements/route.ts:49`; `.../clarifications/route.ts:49-58` | unbounded query + JS filter | Push predicate to SQL. |
| PERF-7 | `src/app/api/v1/submissions/route.ts:345-393` | global count under per-user lock | Move global-cap check outside the per-user advisory lock. |
| PERF-9 | `src/app/api/v1/admin/audit-logs/route.ts:73-105` | IN-array balloon | Replace precomputed `IN(...)` with `EXISTS` subqueries. |

**No NEW perf issues beyond the cycle-1 set.**

---

## NEW RISKS

### NEW-1 — Deploy topology: per-target env files are documentation, not configuration (HIGH)
**Confidence: high** | `deploy-docker.sh:119-123` (sources only `.env.deploy`); `.env.deploy.algo`, `.env.deploy.worv` (never sourced by any script)

The safety overrides mandated by CLAUDE.md live in per-target files that no shell script reads. CLAUDE.md states the algo deploy rule in imperative, mandatory terms ("always use"), but the code's default is the exact inverse. Single-typo production footgun. Same root issue as cycle-1 ARCH-2; top new-risk item. See PHB-4.

### NEW-2 — Worker cleanup ops (`docker inspect`/`kill`/`rm`) have no timeout (MEDIUM)
**Confidence: high** | `judge-worker-rs/src/docker.rs:164` (`inspect_container_state`), `:216` (`kill_container`), `:223` (`remove_container`)

The container `wait` is correctly wrapped in `tokio::time::timeout` (`:421`), but the three cleanup helpers all `await` with **no timeout** and discard errors. If the Docker daemon wedges, these hang indefinitely, leaking the executor's concurrency slot. AGG-16/DBG-2 (Phase B) — still open. **Fix:** wrap each in `tokio::time::timeout(Duration::from_secs(10), ...)`; a leaked container name is recoverable on the next orphan sweep (`:614`), a hung `await` is not.

### NEW-3 — No `catch_unwind` in the worker executor hot path (MEDIUM)
**Confidence: medium** | `judge-worker-rs/src/executor.rs` (no `catch_unwind` outside `#[cfg(test)]`)

A panic in `spawn_blocking` judge work propagates uncaught and tears down the task without a final status report — submission stays in `judge_claimed` until the staleness reaper eventually requeues it. AGG-15/FDR-1 (Phase B). Defense-in-depth (won't catch aborts/signal kills).

### NEW-4 — Migration journal: 4 duplicate-prefix SQL file pairs remain (MEDIUM)
**Confidence: high** | `drizzle/pg/0012_*`, `0016_*`, `0027_*`, `0028_*` (each prefix appears twice)

File count equals journal-entry count, so the bijection guard added in `scripts/check-migration-drift.sh:34-59` passes. But `drizzle-kit migrate` (the documented escape hatch) would still hit prefix-collision ambiguity. Production sidesteps via `drizzle-kit push`, but the escape hatch is silently broken. Cycle-1 ARCH-3, still open.

### NEW-5 — `execTransaction` silently no-ops transaction semantics during build (LOW)
**Confidence: high** | `src/lib/db/index.ts:90-98`

The build-phase branch still *runs the callback* against the build-phase drizzle stub instead of short-circuiting. Latent today; future code that imports a rate-limit/advisory-lock helper at build time will execute non-atomically and invisibly. **Fix:** make the build-phase branch `throw` on invocation (fail loud).

### NEW-6 — App↔worker token distinctness parity (LOW)
**Confidence: high** | `judge-worker-rs/src/config.rs:133-163` (worker rejects `RUNNER_AUTH_TOKEN === JUDGE_AUTH_TOKEN`); `src/lib/compiler/execute.ts:59-87` (TS side has no equivalent distinctness check)

An operator who reuses one token for both purposes gets a hard failure on the worker but only a silent accept on the app's local-fallback path. One-line parity check.

---

## FINAL SWEEP

The 12 Phase A fixes are architecturally sound. 11 faithfully matched existing patterns. Only A2 carried forward a suboptimal helper choice (REG-1, MEDIUM) traceable to an inaccurate premise in the plan itself. No layering or coupling regressions; A11 generalization question resolved cleanly.

**Top priorities for the next cycle, in order:**
1. **NEW-1 / PHB-4** (deploy defaults invert CLAUDE.md) — lowest effort, highest risk reduction.
2. **PHB-3 / PERF-2** (similarity sidecar has no submission cap) — small fix, reclassify as DoS-boundary.
3. **REG-1** (restore audit durability) — one-line `recordAuditEventDurable` swap.
4. **NEW-2 / AGG-16** (worker cleanup timeouts).
5. **PHB-1 / AGG-1** (restore atomicity) — needs staging-then-rename design first.

**Capped LOW findings (6):** REG-2 (informational), NEW-5, NEW-6, ARCH-8, ARCH-9, ARCH-10. All have concrete exit criteria; none are security/correctness/data-loss.
