# Architecture & Design Review — judgekit @ HEAD `0b0ac198`

**Scope:** coupling/cohesion, layering, app↔worker↔DB boundary correctness, deploy topology vs CLAUDE.md, queue/transaction design, error contract, startup races, schema/index design, config sources of truth.
**Mode:** READ-ONLY (delivered inline by architect agent; persisted by orchestrator for provenance).

## Summary

The core architecture is sound: the judge-claim atomic SQL (`FOR UPDATE SKIP LOCKED` + per-worker capacity CTE + optimistic claim-token fence), per-worker secret hashing, the dockerfile/image validators mirrored across TS and Rust, and the destructive-migration guard are all well-engineered with documented invariants. The previously-fixed items I verified (startup sync, docker client fallback, destructive-push detection) are correctly in place. However, I found a **HIGH-severity inconsistency** in the runner-token contract between the two TS modules that import it, a **HIGH-severity deploy-defaults footgun** that contradicts CLAUDE.md, and several medium-severity items around migration-journal integrity, transaction semantics during build, and the trust boundary at the worker host's Docker socket.

## Previously-Flagged Items — Verification Status

| Item | Status | Evidence |
|---|---|---|
| Startup language-sync overwriting admin hotfixes | **FIXED** | `src/lib/judge/sync-language-configs.ts:46-63` only backfills when `!record.runCommand` or `record.compileCommand == null`. No overwrite path. `SKIP_INSTRUMENTATION_SYNC=1` opt-out at L83. |
| Docker client local fallback gated in prod | **FIXED** | `src/lib/docker/client.ts:49-50` — `ALLOW_LOCAL_DOCKER_ADMIN = NODE_ENV !== "production" || JUDGEKIT_ALLOW_LOCAL_DOCKER_ADMIN === "1"`. |
| Destructive migration detection | **FIXED** | `deploy-docker.sh:1078-1082` captures push output, greps for `data loss\|are you sure\|warning:.*destructive\|please confirm`, calls `die()`. |
| App-only deploy topology defaults | **PARTIALLY FIXED — see ARCH-2** | Per-target overrides exist in `.env.deploy.algo` but the script's own defaults invert CLAUDE.md and the per-target files are not auto-sourced. |

## Findings

### ARCH-1 — Import-time throw in compiler/execute.ts contradicts the explicit fix applied to its sibling module
**Severity: HIGH | Confidence: high**
**File:** `src/lib/compiler/execute.ts:64-69`

Commit `26cff8e4` ("fix(docker): replace import-time throw with logged error for missing runner token") replaced the import-time throw in `src/lib/docker/client.ts` with a logged error + generic `configError` API response, with an explicit rationale: production misconfiguration should not crash the process at import, and deployment details should not leak via the HTTP error. The fix was applied **only to `docker/client.ts`**. The structurally identical guard in `src/lib/compiler/execute.ts:64-69` was left as a hard `throw`:

```ts
if (!RUNNER_AUTH_TOKEN && COMPILER_RUNNER_URL && process.env.NODE_ENV === "production") {
  throw new Error("RUNNER_AUTH_TOKEN must be set in production when COMPILER_RUNNER_URL is configured. ...");
}
```

This is worse than the docker/client.ts case because `execute.ts` sits on the **hot judging path** — it is imported by the API route that runs on every compiler-run request, not only by an admin-only image-management route. A misconfigured `RUNNER_AUTH_TOKEN` in production would crash the Next.js server process at first import (or at module pre-evaluation) rather than degrade to a logged `configError`. The sibling module already proves the correct pattern (`emitConfigErrorLog` + `WORKER_DOCKER_API_CONFIG_ERROR_CODE`).

**Recommendation (low effort, high impact):** Mirror the `docker/client.ts:26-47` pattern here — log the error once at import, set a module-level `COMPILER_RUNNER_CONFIG_ERROR` constant (the variable already exists at L80-83 but is computed *after* the throw), and surface it via `tryRustRunner` / `executeCompilerRun`'s existing error-return contract (the `stderr: COMPILER_RUNNER_CONFIG_ERROR` path at L637-647 already handles this case — it just cannot be reached when the import-time throw fires first).

---

### ARCH-2 — Deploy topology defaults contradict CLAUDE.md; per-target env files not auto-sourced
**Severity: HIGH | Confidence: high**
**Files:** `deploy-docker.sh:184-187, 119-123`; `.env.deploy.algo`; `.env.deploy.worv`

CLAUDE.md mandates: *"When deploying to algo.xylolabs.com, always use `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, `INCLUDE_WORKER=false`."* The script-level defaults are the exact inverse:

```bash
SKIP_LANGUAGES="${SKIP_LANGUAGES:-false}"      # L184
INCLUDE_WORKER="${INCLUDE_WORKER:-true}"       # L186
BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-auto}" # L187 → resolves to INCLUDE_WORKER (= true)
```

The safety overrides live in **per-target files** (`.env.deploy.algo:17-19` correctly sets all three to the CLAUDE.md values). However `deploy-docker.sh:119-123` sources only the generic `.env.deploy` — it does NOT read `.env.deploy.algo`/`.env.deploy.worv`, and no wrapper script does either (`grep -l` for those filenames across `*.sh` and `scripts/*.sh` returns empty). Operators must manually copy the target file to `.env.deploy` before each run, or remember to export the vars inline.

This is a single-typo production footgun: a bare `./deploy-docker.sh` against `algo.xylolabs.com` will attempt to build language images and start a judge worker on the app-only host.

**Recommendation (medium effort, high impact):** Either (a) invert the script defaults to match CLAUDE.md (`INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `SKIP_LANGUAGES=true`) so the safe case is the default and integrated targets must opt in, or (b) accept a `--target=algo` flag that sources `.env.deploy.${target}` explicitly, failing if the file is missing. Option (a) is safer because it makes the CLAUDE.md rule the default and removes the silent-failure mode.

---

### ARCH-3 — Migration journal has duplicate-prefix files and a tag gap; `drizzle-kit migrate` escape hatch is broken
**Severity: MEDIUM | Confidence: high**
**Files:** `drizzle/pg/*.sql`; `drizzle/pg/meta/_journal.json`

The `drizzle/pg/` directory contains **four pairs of files sharing the same numeric prefix**: `0012_*`, `0016_*`, `0027_*`, `0028_*`. There is also a gap: prefixes `0029`–`0032` are absent from the filesystem while the journal jumps from `0028` to `0033`. The `_journal.json` (idx 0–36) lists a subset of these tags.

Production sidesteps this because `deploy-docker.sh:1050-1082` uses `drizzle-kit push` (live schema-vs-DB diff) rather than journal replay. However, the deploy comment block at L1042–1044 explicitly documents `drizzle-kit migrate` as a supported escape hatch ("For journal-driven migrations instead, change `drizzle-kit push` to `drizzle-kit migrate` here…"). An operator following that instruction today would either hit duplicate-prefix resolution errors or silently skip every unjournalled file — neither outcome is what the comment promises.

**Recommendation (medium effort, medium impact):** Either delete the duplicated files (after confirming neither variant carries schema state not already in `schema.pg.ts`), or regenerate the journal via `drizzle-kit generate` on a clean checkout. At minimum, add a CI check that fails when `drizzle/pg/*.sql` prefixes collide or when the file count diverges from `_journal.json` entries.

---

### ARCH-4 — `execTransaction` silently drops transaction semantics during the Next.js build phase
**Severity: MEDIUM | Confidence: high**
**File:** `src/lib/db/index.ts:90-98`

```ts
export function execTransaction<T>(fn: (tx: TransactionClient) => Promise<T> | T): Promise<T> {
  if (isBuildPhase) {
    return Promise.resolve(fn(db as unknown as TransactionClient));  // NO transaction
  }
  return db.transaction(async (tx) => transactionContext.run(true, () => fn(tx as TransactionClient)));
}
```

The comment warns that atomicity is unavailable during `phase-production-build`, but the function still **runs the callback** against the dummy build-phase drizzle instance instead of short-circuiting or throwing. The `rawQueryOne` guard at `src/lib/db/queries.ts:56` logs a warning if called inside a transaction (good), but `execTransaction` itself has no such tripwire — code that calls it during build silently executes non-atomically against what is effectively a stub connection. The risk is latent today because build phase doesn't serve HTTP, but any future code path that imports a rate-limit or advisory-lock helper at build time will fail invisibly.

**Recommendation (low effort, low impact today, high if violated):** In the build phase, either (a) make `execTransaction` a typed no-op that throws on invocation (`throw new Error("execTransaction unavailable during build phase")`) to fail loud, or (b) return a resolved dummy without calling `fn` (matches the pattern already used by other build-phase stubs). Document the chosen contract in the JSDoc.

---

### ARCH-5 — Startup awaits have no top-level deadline; instrumentation can hang ~5 minutes
**Severity: MEDIUM | Confidence: medium**
**File:** `src/instrumentation.ts:33-36`; `src/lib/judge/sync-language-configs.ts:90-107`

`register()` awaits `syncLanguageConfigsOnStartup()` (which itself has a 10-retry × 30s-backoff cap ≈ 5 min worst case) and `initializeSettings()` with no enclosing deadline. If the DB is slow or unreachable, the Next.js server stays in instrumentation and never begins serving health checks — the Docker healthcheck (`docker-compose.production.yml` app service) starts failing only after its own grace period, masking the real cause.

**Recommendation (low effort, medium impact):** Wrap the two awaits in a `Promise.race` against an overall deadline (e.g. 60s), and on timeout log a structured error and continue starting the server in a degraded mode (or exit nonzero so the orchestrator restarts). The individual retry caps are necessary but not sufficient — the instrumentation layer needs its own SLO.

---

### ARCH-6 — Worker-side Docker socket ACL lives in code, not in the proxy
**Severity: MEDIUM | Confidence: medium**
**Files:** `docker-compose.worker.yml:14-29`; `docker-compose.production.yml:50-66`; `judge-worker-rs/src/validation.rs:54-75`

Both compose files enable `POST=1`, `DELETE=1`, `ALLOW_START=1`, `ALLOW_STOP=1` on the `tecnativa/docker-socket-proxy`. The "only `judge-*` images" rule is enforced in worker Rust code (`validation.rs:25`) and again in the TS compiler path (`execute.ts:338`), but the docker-socket-proxy itself has no image-name ACL — it can't, the API surface doesn't support it. A worker binary compromise (RCE in the runner, memory corruption, supply-chain compromise of the image) bypasses the validator and gains near-arbitrary container-spawn capability on the host.

The historical impact is already documented in `docker-compose.worker.yml:18-25` (the 14h silent `compile_error` fleet sweep from 2026-05-17, caused merely by `POST=0` — a far more benign misconfiguration than a worker compromise). Mitigations today are: `--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534:65534`, seccomp profile, and the documented-but-disabled `JUDGE_OCI_RUNTIME=runsc` gVisor hardening.

**Recommendation (high effort, defense-in-depth impact):** Promote gVisor (`runsc`) from optional to recommended in production after the validation pass described in `docs/judge-worker-gvisor.md`. gVisor is the only control that contains a worker-compromise scenario at the OCI-runtime layer rather than relying on the worker's own input validation. Trade-off: gVisor adds ~10-20% syscall overhead and requires host install — not appropriate for the smallest targets, but appropriate for the multi-tenant `algo.xylolabs.com` fleet.

---

### ARCH-7 — `releaseClaimedSubmission` uses SELECT-then-UPDATE; pattern inconsistent with poll route
**Severity: LOW | Confidence: medium**
**File:** `src/app/api/v1/judge/claim/route.ts:71-102`

```ts
const [current] = await tx.select({ judgeClaimToken: submissions.judgeClaimToken })
  .from(submissions).where(eq(submissions.id, submissionId)).limit(1);
if (current?.judgeClaimToken !== claimToken) return;
await tx.update(submissions).set({ status: "pending", ... })
  .where(eq(submissions.id, submissionId));
```

Under Postgres' default READ COMMITTED, this SELECT-then-UPDATE inside one transaction is not a true compare-and-swap: a concurrent writer can modify `judgeClaimToken` between the SELECT and the UPDATE, and this UPDATE would clobber it. In practice the upstream `FOR UPDATE SKIP LOCKED` in `buildClaimSql` and the optimistic-lock fence in `poll/route.ts:164` (`WHERE id = ? AND judge_claim_token = ?`) make this safe — but the inconsistency is itself the smell. The poll route uses CAS; the claim-cleanup path does not.

**Recommendation (low effort, low impact):** Make the cleanup UPDATE conditional: `.where(and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken)))` and drop the SELECT. Behavior is preserved, the read round-trip is removed, and the contract matches the poll route.

---

### ARCH-8 — System settings cache is process-local with a 60s TTL; multi-instance drift
**Severity: LOW | Confidence: medium**
**File:** `src/lib/system-settings-config.ts:84-194`

The settings cache (`cached`, `cachedAt`) is module-level and process-local. `getConfiguredSettings()` returns the cached value for up to 60s, then triggers an async background reload. In a deployment with `APP_INSTANCE_COUNT > 1` (an architecture the codebase explicitly supports — see `realtime-coordination.ts:23-25`), an admin's settings update is visible to different instances on different schedules for up to 60s. The realtime module has multi-instance guards; the settings cache does not.

**Recommendation (medium effort, low-medium impact):** Either publish a settings invalidation event through the existing Postgres-backed coordination channel (`realtimeCoordination` table) so all instances invalidate on write, or shorten the TTL to a few seconds and accept the read amplification cost.

---

### ARCH-9 — `submissions.judgeClaimToken` lacks a uniqueness guarantee
**Severity: LOW | Confidence: high**
**File:** `src/lib/db/schema.pg.ts:485`

`judgeClaimToken` is `text` with no unique index and no NOT NULL constraint; `judgeWorkerId` carries no FK to `judge_workers`. Both are intentional given the transient claim lifecycle (NULL after finalize; worker rows may be reaped). However, the correctness of the optimistic-lock fence relies entirely on `nanoid()` collision resistance. A unique partial index (`create unique index on submissions (judge_claim_token) where judge_claim_token is not null`) would convert a hyperventilated-collision into a deterministic DB error rather than a silent double-finalize attempt.

The supporting indexes are well-designed: `submissions_queue_claim_idx` (status, submittedAt, id) at L511 directly serves the `buildClaimSql` `ORDER BY s.submitted_at ASC, s.id ASC` path, and `submissions_stale_claim_idx` (status, judgeClaimedAt, submittedAt, id) at L512 serves the stale-claim reaper. No query-pattern gaps there.

**Recommendation (low effort, low impact):** Add the partial unique index as a defense-in-depth measure; on collision, the claiming transaction fails and the worker retries on its next poll — already the documented self-healing behavior.

---

### ARCH-10 — Redundant `secret_token` drop logic across migration file and deploy script
**Severity: LOW | Confidence: high**
**Files:** `drizzle/pg/0020_drop_judge_workers_secret_token.sql`; `deploy-docker.sh:1003-1024`

The deprecated `judge_workers.secret_token` column is dropped by both the journal migration `0020_*` and the runtime backfill-then-drop block in the deploy script. On `drizzle-kit push`-deployed targets (production today) the SQL migration file is dead code — `push` doesn't replay it. On `drizzle-kit migrate`-deployed targets (the documented escape hatch), the runtime block runs as an idempotent no-op. Both code paths exist indefinitely; future maintainers must reason about which one is canonical.

**Recommendation (low effort, low impact):** Add a one-line comment in both files cross-referencing the other and noting which is authoritative under each deploy strategy; or consolidate into the deploy script only and delete the migration file (the runtime block is required regardless because `push` won't apply the migration).

## Final Verdict

The architecture's load-bearing invariants (claim atomicity, optimistic-lock fence, per-worker auth, deploy destructive-change guard) are correctly implemented and well-documented. **ARCH-1 and ARCH-2 should be treated as production-blocking** — both are silent-failure modes that contradict explicitly-stated design intent (commit `26cff8e4` for ARCH-1; CLAUDE.md for ARCH-2). ARCH-3 through ARCH-6 are correctness/debt issues with real but bounded blast radius. ARCH-7 through ARCH-10 are hardening items worth scheduling but not blocking.
