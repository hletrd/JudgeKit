# Debugger Review - Cycle 2

Date: 2026-06-20

Scope: latent bug surfaces, edge cases, failure modes, regressions, exception handling, and operational failures in the current dirty worktree. No fixes were implemented.

## Instructions and Inventory

Instructions read before review:

- `AGENTS.md`
- `CLAUDE.md`
- `.context/development/problem-descriptions.md`
- `.context/reviews/_aggregate.md` and prior per-agent reviews for carryover context

Review-relevant inventory built from `rg --files`, `git status --short`, `git diff --stat`, and targeted reads. The dirty worktree is in-scope and was reviewed as part of the current change surface.

Primary failure-surface files reviewed:

- Root/config/deploy: `.gitignore`, `.dockerignore`, `.npmrc`, `Cargo.toml`, `Cargo.lock`, `Dockerfile`, `docker-compose*.yml`, `drizzle.config.ts`, `deploy-docker.sh`, `deploy.sh`, `scripts/load-env.ts`, deploy/backup/safety scripts.
- Submission/judge API: `src/app/api/v1/submissions/route.ts`, `src/app/api/v1/submissions/[id]/rejudge/route.ts`, `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`, `src/app/api/v1/problems/import/route.ts`, `src/app/api/v1/problems/[id]/compute-expected/route.ts`, `src/app/api/v1/compiler/playground/route.ts`.
- Judge domain logic: `src/lib/judge/claim-query.ts`, `src/lib/judge/verdict.ts`, `src/lib/judge/languages.ts`, `src/lib/judge/function-judging/**`, `src/lib/compiler/execute.ts`, `src/lib/submissions/status.ts`, `src/lib/security/constants.ts`.
- Rust worker: `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/comparator.rs`, `judge-worker-rs/src/languages.rs`, worker tests.
- Restore/import/export: `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/lib/db/import.ts`, `src/lib/db/export.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/pre-restore-snapshot.ts`, `src/lib/files/storage.ts`.
- Status/UI consumers: `src/lib/assignments/participant-status.ts`, submission status badge components, public/admin submission pages, contest/student detail pages.
- Test coverage reviewed for regression expectations: `tests/unit/**`, `tests/integration/**`, `tests/e2e/**`, Rust unit tests under `judge-worker-rs/src/**`.

## Findings

### DBG2-1 - Manual submissions are inserted as active `pending` rows that no worker can claim

Severity: High
Confidence: High
Type: confirmed regression

Evidence:

- `src/app/api/v1/submissions/route.ts:330-331` computes `isManualProblem` but then sets `const initialStatus = "pending";` for every problem type.
- `src/app/api/v1/submissions/route.ts:352-356` counts all user submissions with `status IN ('pending', 'judging', 'queued')` before allowing another submission.
- `src/app/api/v1/submissions/route.ts:367-382` skips judge-queue availability checks for manual problems, but does not assign a terminal/manual-review status.
- `src/app/api/v1/submissions/route.ts:405-416` inserts the submission with that active `pending` status.
- `src/lib/judge/claim-query.ts:46-49` and `src/lib/judge/claim-query.ts:140-143` explicitly exclude manual problems from both worker-backed and no-worker claim paths.
- `src/lib/submissions/status.ts:1-4` defines active statuses as `pending`, `queued`, and `judging`; the canonical `SubmissionStatus` union no longer includes a non-active `submitted` status.
- `src/lib/assignments/participant-status.ts:100-102` returns the latest active status directly for participant progress displays.

Failure scenario:

1. A student submits a manual problem.
2. The submission row is stored as `pending`.
3. The judge claim query excludes manual problems, so the row can never be claimed or completed.
4. The student and instructor views can show an indefinitely pending manual submission.
5. Because the pending-count throttle includes that row, repeated manual submissions can also block later normal submissions with `tooManyPendingSubmissions`.

Suggested fix:

- Restore an explicit non-active manual status, for example `submitted` or `manual_review`, and add it consistently to `SubmissionStatus`, status constants, labels, filters, and participant-status mapping.
- Alternatively, if the product intentionally wants `pending` for manual review, exclude manual-problem rows from judge pending quotas and active judging indicators. The explicit status is less error-prone.
- Add a regression test proving manual submissions are not claimable, not counted against the automatic-judge active queue, and render as awaiting/manual review rather than active judging.

### DBG2-2 - ZIP restore writes upload files before DB validation/import succeeds, leaving split-brain state on failure

Severity: High
Confidence: High
Type: confirmed operational failure

Evidence:

- `src/app/api/v1/admin/restore/route.ts:81-89` calls `restoreFilesFromZip(zipBuffer)` before validating the extracted database export.
- `src/app/api/v1/admin/restore/route.ts:119-130` performs `validateExport` and sanitized-export checks only after files have already been restored.
- `src/app/api/v1/admin/restore/route.ts:142-158` creates the DB snapshot and imports the database after file restoration.
- `src/app/api/v1/admin/restore/route.ts:160-166` reports import failure but has no rollback for files written earlier.
- `src/lib/db/export-with-files.ts:219-223` returns `{ dbExport, filesRestored }` from `restoreFilesFromZip`.
- `src/lib/db/export-with-files.ts:248-257` parses export metadata and creates the upload directory.
- `src/lib/db/export-with-files.ts:266-292` writes each ZIP upload entry through `writeUploadedFile` before the manifest completeness check at `src/lib/db/export-with-files.ts:295-297`.
- `src/lib/files/storage.ts:27-30` writes directly to the final upload path, overwriting any existing file with the same stored name.
- `src/lib/db/import.ts:121-225` now wraps database import in a transaction, but filesystem writes remain outside that transaction.

Failure scenario:

1. An admin uploads a ZIP backup containing upload files plus a database export that is invalid for the current schema, fails sanitized checks, or fails during import.
2. `restoreFilesFromZip` writes/overwrites the uploaded files on disk.
3. The route later rejects the database export or rolls back the database transaction.
4. The database remains on the old state while the upload directory contains files from the failed restore.
5. Existing problem attachments can point at overwritten, unrelated, or missing content.

Suggested fix:

- Split ZIP restore into parse/validate/stage/install phases.
- Extract uploads into a temporary staging directory, validate the database export, and complete the DB import before moving staged files into the final upload directory.
- If final file installation can fail after DB import, keep a rollback/backup strategy for overwritten files or use content-addressed file names plus a post-import reconcile.
- Add tests where `validateExport` or `importDatabase` fails and assert final upload files are unchanged.

### DBG2-3 - `drizzle.config.ts` imports a script that is absent from the production app image used by the legacy deploy path

Severity: Medium
Confidence: High
Type: confirmed deployment regression

Evidence:

- `drizzle.config.ts:1` imports `./scripts/load-env`.
- `scripts/load-env.ts:1-3` imports `loadEnvConfig` from `@next/env` and calls `loadEnvConfig(process.cwd())`.
- `Dockerfile:75-80` copies `drizzle.config.ts`, `tsconfig.json`, and a limited subset of `src/**` into the runner image, but does not copy `scripts/load-env.ts`.
- `deploy.sh:222-224` runs `docker exec judgekit-app npx drizzle-kit push` inside that app container.
- `deploy.sh:225` prints `Database migrated` after the command block, even though the error path only logs a warning and does not make the deployment fail.

Failure scenario:

1. An operator uses the legacy `deploy.sh` path documented in the repository.
2. The app container runs `npx drizzle-kit push`.
3. Drizzle loads `/app/drizzle.config.ts`, which imports `./scripts/load-env`.
4. The import fails because `/app/scripts/load-env.ts` was not copied into the runner image.
5. The deploy can continue with stale schema while logging a misleading migration success line.

Suggested fix:

- Either copy `scripts/load-env.ts` into the runner image, or make `drizzle.config.ts` self-contained in files that are shipped to every environment where Drizzle runs.
- Make the legacy deploy path fail hard when the migration command fails, or at minimum avoid printing success after the warning path.
- Add a Docker-image smoke test that runs `npx drizzle-kit --config drizzle.config.ts check` or an equivalent config-load command inside the production runner image.

### DBG2-4 - Judge claim schema parse failures still leak the SQL claim and worker active-task slot

Severity: Medium
Confidence: Medium
Type: likely failure mode

Evidence:

- `src/app/api/v1/judge/claim/route.ts:117-120` initializes cleanup state, but `claimedForCleanup` is only assigned after a full row parse succeeds.
- `src/app/api/v1/judge/claim/route.ts:211-228` creates a claim token and executes the raw claim SQL. The SQL path mutates submission status and, for worker-backed claims, increments `active_tasks`.
- `src/app/api/v1/judge/claim/route.ts:230-238` parses `claimedRaw`; on parse failure it logs and returns `invalidJudgeClaim` without cleanup.
- `src/app/api/v1/judge/claim/route.ts:403-415` has catch-path cleanup, but that cleanup is guarded by `claimedForCleanup && claimTokenForCleanup` and is not reached by the explicit parse-error return.
- `src/lib/judge/claim-query.ts:54-79` updates the submission to `queued`/`judging`.
- `src/lib/judge/claim-query.ts:111-127` increments the selected worker's `active_tasks`.

Failure scenario:

1. A valid claim candidate is selected and the SQL claim mutation succeeds.
2. The returned row fails Zod parsing because of migration drift, unexpected driver conversion, corrupt data, or a future column shape change.
3. The route returns `422 invalidJudgeClaim`.
4. The submission remains claimed/active and the worker `active_tasks` counter remains incremented until stale-claim cleanup or manual intervention.
5. With low worker concurrency, one malformed row can consume capacity and cause unrelated submissions to stop being claimed.

Suggested fix:

- After the SQL mutation, capture minimal cleanup-safe identifiers before full response parsing, especially `submissionId` and `claimToken`.
- On parse failure, release by claim token and decrement the worker active-task counter in the same way as post-claim assembly failures.
- Consider making the SQL claim return a smaller, stable shape for the claim mutation and loading the larger payload only after the claim row is safely parsed.
- Add a fault-injection test where `rawQueryOne` returns an invalid shape after mutating and assert cleanup runs.

### DBG2-5 - Root Cargo workspace creates a root `target/` tree that is not ignored

Severity: Low
Confidence: High
Type: confirmed operational/repository hygiene issue

Evidence:

- `Cargo.toml:1-7` introduces a root Cargo workspace for `code-similarity-rs`, `judge-worker-rs`, and `rate-limiter-rs`.
- `.gitignore:68-70` ignores `judge-worker-rs/target/` and `rate-limiter-rs/target/`, but not the new root `/target/`.
- Current worktree state includes untracked `target/**` entries and `._target`; the local root `target/` is approximately 471 MB.
- The individual Rust crate release profiles were moved into the new root workspace, so running Cargo from the workspace root is now a natural workflow that will continue to populate `/target`.

Failure scenario:

1. A developer or CI helper runs root-level `cargo test` or `cargo build`.
2. Cargo writes build outputs into `/target`.
3. `git status` is flooded with generated files, hiding real source changes.
4. A broad `git add .` can accidentally stage large artifacts or AppleDouble metadata.

Suggested fix:

- Add `/target/` and `._*` to `.gitignore`.
- Keep the root `Cargo.toml` and `Cargo.lock` only if the workspace is intentional, but never commit generated build output.
- Remove local generated artifacts after ignore rules are corrected.

### DBG2-6 - Problem import route rejects function-signature problems and allows time limits outside the normal editor contract

Severity: Medium
Confidence: Medium
Type: likely product/API regression

Evidence:

- `src/app/api/v1/problems/import/route.ts:8-34` defines its own import schema with `problemType: z.enum(["auto", "manual"]).default("auto")`; `function` is not accepted.
- `src/app/api/v1/problems/import/route.ts:14` allows `timeLimitMs` up to `30000`.
- `src/lib/validators/problem-management.ts:45-67` is the normal problem mutation contract and accepts `problemType` values `auto`, `manual`, and `function`, but caps `timeLimitMs` at `10000`.
- `src/lib/validators/problem-management.ts:85-116` contains the function-problem validation rules that the import route bypasses entirely.

Failure scenario:

1. An instructor exports or constructs a function-signature problem and imports it through `/api/v1/problems/import`.
2. The route rejects the payload because `problemType: "function"` is not allowed, or callers omit `problemType` and lose the function-specific fields.
3. Separately, this route can import a 30-second problem that cannot later be represented or edited through the normal problem-management form, creating inconsistent admin behavior.

Suggested fix:

- Reuse `problemMutationSchema` or a deliberate import wrapper around it instead of maintaining a separate divergent schema.
- If this route is intentionally legacy auto/manual-only, document that in the route/API and reject function payloads with a specific compatibility error.
- Align the time-limit cap with the normal problem editor or add a clear product rule explaining why imports can exceed the editor maximum.
- Add API tests for importing each supported problem type.

## Final Missed-Issues Sweep

Additional sweep areas:

- Rechecked the previous cycle blockers against current dirty changes. The Rust worker status strings and Docker stdin timeout appear addressed in `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/docker.rs`, and `judge-worker-rs/src/executor.rs`.
- Rechecked judge output-size handling. Current worker changes cap and drain stdout/stderr, and `src/lib/judge/verdict.ts` truncates stored verdict output. I did not find a new blocker there.
- Rechecked function-spec submission handling. The submission route now catches invalid `functionSpec` and returns a typed API error rather than a generic 500.
- Rechecked database import atomicity. `src/lib/db/import.ts` now uses a transaction for the database portion, but the ZIP filesystem restore in DBG2-2 remains outside that transaction.
- Rechecked Docker deploy failure handling. `deploy-docker.sh` now appears stricter on health/smoke failures, but the legacy `deploy.sh` migration path remains vulnerable to the Drizzle config packaging problem in DBG2-3.

Residual risk:

- I did not execute the full gate suite for this review-only prompt.
- The repository has a large dirty worktree with many independent edits. Findings above prioritize confirmed or high-probability failure modes from code inspection; additional lower-signal regressions may surface only under the full gate run and deployment smoke tests.
