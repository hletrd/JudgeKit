# Architect Review - Cycle 2

Date: 2026-06-20

Scope: architecture/design review of the current dirty worktree in
`/Users/hletrd/flash-shared/judgekit`. I reviewed layering, deployment shape,
DB/runtime boundaries, cross-module contracts, and uncommitted changes. I did
not implement fixes or revert any existing work.

## Inventory

Governing instructions and policy read:

- `AGENTS.md`
- `CLAUDE.md`
- `.context/development/problem-descriptions.md`
- `.context/development/documentation-rules.md`
- `.context/development/open-workstreams.md`
- existing cycle-2 review files under `.context/reviews/*.md` for provenance

Repository inventory built with `git status --short`, `git diff --stat`,
`git diff --name-only`, `rg --files`, and targeted line-number reads.

Reviewed architecture-relevant surface:

- Next.js API and app runtime: 632 files under `src/`, with focus on
  submission creation, judge claim/poll, admin restore/import/export, admin
  language and Docker image management, auth host handling, compiler runner,
  problem file-link syncing, status labels, and validators.
- Rust services: `judge-worker-rs/src/{api,config,docker,executor,runner,types,validation}.rs`,
  `code-similarity-rs/src/**`, `rate-limiter-rs/src/main.rs`, plus Rust
  manifests/lockfiles and production Dockerfiles.
- Database/runtime boundary: `src/lib/db/{index,config,export,export-with-files,import,pre-restore-snapshot,schema.pg}.ts`,
  `drizzle.config.ts`, `drizzle/pg/**`, and `scripts/check-migration-drift.sh`.
- Deployment/ops: `deploy-docker.sh`, `docker-compose.production.yml`,
  `docker-compose.worker.yml`, `Dockerfile*`, `.dockerignore`, `.gitignore`,
  backup/safety scripts, and root/subcrate Cargo workspace files.
- Tests and gates: 508 files under `tests/`, with targeted checks of
  submission lifecycle, judge claim/reclaim, E2E status waiters, admin language
  tests, and migration/import tests.

Skipped as non-review source: `node_modules`, `.next`, coverage output, Rust
`target/` artifacts, generated build caches, and bulk `.context/solutions/**`
corpora except as policy/context references.

## Findings

### ARCH2-1 - Manual submissions use an auto-judge in-progress status and cannot complete

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `AGENTS.md:169-176`
- `src/app/api/v1/submissions/route.ts:330-331`
- `src/app/api/v1/submissions/route.ts:367-381`
- `src/lib/judge/claim-query.ts:43-50`
- `src/lib/submissions/status.ts:1-4`

Evidence:

`AGENTS.md` defines `manual` problems as judged outside the automatic pipeline.
The submission route detects manual problems, then unconditionally sets
`initialStatus = "pending"` for every submission. Queue limits are skipped for
manual problems because they need no worker, but the claim SQL explicitly filters
manual problems out with `COALESCE(p.problem_type, 'auto') != 'manual'`.
Elsewhere, `pending` is part of `ACTIVE_SUBMISSION_STATUSES`.

Failure scenario:

A student submits a manual problem. The row is inserted as `pending`, no worker
can claim it, and no manual-grade-ready terminal or review status is ever reached.
Dashboards and participant status can show the attempt as still processing, and
any code that counts active statuses can treat manual work as queue work.

Suggested fix:

Restore or introduce a first-class non-worker status for manual submissions,
such as `submitted` or `manual_pending`, and wire it through the TypeScript
status union, DB validation, labels, filters, leaderboard/participant logic, and
tests. Manual submissions should never enter statuses that mean "the worker must
eventually claim this row."

### ARCH2-2 - Submission status is a split protocol across Rust, TypeScript, DB text, tests, and deploy order

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `judge-worker-rs/src/types.rs:42-52`
- `src/types/index.ts:14-26`
- `src/lib/security/constants.ts:49-62`
- `src/app/api/v1/judge/poll/route.ts:34-54`
- `src/lib/db/schema.pg.ts:482-485`
- `deploy-docker.sh:1112-1171`

Evidence:

The worker now emits canonical names such as `time_limit_exceeded` and
`memory_limit_exceeded`. The TypeScript constants accept only the new names, and
the poll route rejects unknown top-level or per-test statuses before writing.
The database column remains unconstrained `text`, and app/worker deployment is
explicitly split: the app can deploy first and only later sync/rebuild dedicated
workers.

Failure scenario:

During a rolling deploy, an old worker reports `time_limit` or `memory_limit` to
a new app. `/api/v1/judge/poll` returns `400 invalidSubmissionStatus`, so the
claimed submission remains queued/judging until stale recovery and can repeat the
same failure. Conversely, raw SQL/imports/tests can still insert arbitrary DB
statuses because the database has no check constraint, leaving UI/reporting code
to guess.

Suggested fix:

Define the app/worker status protocol in one shared source of truth or generated
fixture. At API boundaries, accept and normalize legacy values for a documented
transition window. Add a DB check constraint or migration guard once the fleet is
fully migrated. Update tests and UI filters from the same canonical terminal and
filterable status sets.

### ARCH2-3 - ZIP restore is atomic for the DB but not for uploaded files

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `src/app/api/v1/admin/restore/route.ts:81-99`
- `src/app/api/v1/admin/restore/route.ts:119-142`
- `src/app/api/v1/admin/restore/route.ts:158-166`
- `src/lib/db/export-with-files.ts:248-292`
- `src/lib/db/import.ts:121-225`

Evidence:

`restoreFilesFromZip(zipBuffer)` is called before `validateExport(data)`, before
the sanitized-export rejection, before the pre-restore DB snapshot, and before
`importDatabase(data)`. `restoreFilesFromZip` writes each `uploads/` entry to the
live uploads directory. The DB import itself is transactional and rolls back on
failure, but file writes have already happened and are not rolled back.

Failure scenario:

An admin uploads a ZIP whose upload files and manifest are valid but whose
`database.json` is sanitized, wrong-version, or violates schema/foreign-key
constraints. The route overwrites files in `data/uploads`, then rejects or rolls
back the DB import. The database still points at the old file metadata, while
the filesystem now contains new or partially restored contents.

Suggested fix:

Split ZIP restore into parse/verify/stage/commit phases. Validate
`database.json`, redaction mode, manifest completeness, file names, entry count,
and decompressed sizes before touching live uploads. Extract uploads into a temp
directory, run the DB import, then atomically swap/copy staged files only after
the DB commit succeeds, with cleanup on failure.

### ARCH2-4 - Pre-restore snapshots are documented as full-fidelity but use the portable redaction pipeline

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `SECURITY.md:52-67`
- `src/lib/db/pre-restore-snapshot.ts:30-39`
- `src/lib/db/pre-restore-snapshot.ts:84-90`
- `src/lib/db/export.ts:103-105`
- `src/lib/security/secrets.ts:31-41`
- `src/lib/db/schema.pg.ts:462-485`

Evidence:

The security docs describe pre-restore snapshots as full-fidelity rollback
artifacts containing password hashes, JWT/session secrets, and other sensitive
stored fields. The implementation calls `streamDatabaseExport({ sanitize:
false })`, but the exporter still applies `EXPORT_ALWAYS_REDACT_COLUMNS` in
non-sanitized exports. That map includes primary/auth-sensitive fields such as
`sessions.sessionToken`.

Failure scenario:

An operator performs a destructive restore, then needs the automatic
pre-restore snapshot for rollback. The file is missing fields the docs promised
would be retained; at minimum sessions are nulled even though `sessionToken` is
the session primary key. The rollback artifact may fail to import or restore a
semantically incomplete system exactly when it is needed for disaster recovery.

Suggested fix:

Separate "portable export" from "local emergency snapshot." Either implement a
true local-only snapshot mode that bypasses all export redaction and protects the
artifact with filesystem permissions/encryption, or update docs/UI so operators
know the snapshot is partial and not a guaranteed rollback. Add a restore-test
fixture proving a pre-restore snapshot can be imported into an empty DB.

### ARCH2-5 - `INCLUDE_WORKER=false` still starts the production worker service before stopping it

Severity: Medium
Confidence: High
Status: Confirmed

Locations:

- `CLAUDE.md:7-11`
- `docker-compose.production.yml:118-153`
- `deploy-docker.sh:225-227`
- `deploy-docker.sh:1083-1098`

Evidence:

The repo rules state that `algo.xylolabs.com` is app/DB/nginx only and must use
`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`. The compose
file always contains an enabled `judge-worker` service with a `build:` context.
The deploy script runs `docker compose ... up -d` for all services, then stops
`judge-worker` afterward when `INCLUDE_WORKER != true`.

Failure scenario:

On an app-only host with no current worker image, `docker compose up -d` can try
to build or start the worker despite `BUILD_WORKER_IMAGE=false`, violating the
app-server deployment boundary. If an old image exists, it can briefly register
or expose runner/admin endpoints before the stop command runs. If the worker
image is missing or broken, the app-only deploy can fail because of a service the
target explicitly should not run.

Suggested fix:

Encode the topology in compose rather than after-the-fact shell cleanup. Restore
a safe profile/override model, generate an app-only compose file, or pass an
explicit service list to `docker compose up` when `INCLUDE_WORKER=false`
(`db app code-similarity rate-limiter`). Add a deploy-script test for the
CLAUDE.md app-server env that asserts the worker is neither built nor started.

### ARCH2-6 - Admin image-build UX is routed through a Docker path production disables

Severity: Medium
Confidence: High
Status: Confirmed

Locations:

- `docker-compose.production.yml:63-85`
- `src/app/api/v1/admin/docker/images/build/route.ts:19-62`
- `src/lib/docker/client.ts:419-452`
- `judge-worker-rs/src/runner.rs:590-623`
- `judge-worker-rs/src/runner.rs:919-928`

Evidence:

The production socket proxy has `BUILD=0`, and comments say image builds must
not flow through the worker path. The admin API exposes a build endpoint, derives
`docker/Dockerfile.judge-*`, and calls `buildDockerImage`. In worker-Docker-API
mode, that call goes to the worker's `/docker/build`, which executes Docker
build through the same proxy.

Failure scenario:

An admin sees a language image as "Not built" and clicks Build. The request is
valid at the Next.js/admin layer but fails at the worker/proxy layer with a
generic build error because the deployed Docker boundary intentionally forbids
builds. Operators get a control that cannot work in the canonical production
architecture.

Suggested fix:

Make Docker backend capabilities explicit. Disable or hide Build when the active
backend has no build permission, or route builds through the deploy/orchestrator
channel that already has BuildKit permissions. If worker-side builds remain
supported for a special topology, require an opt-in env and surface the security
tradeoff in the admin UI and docs.

### ARCH2-7 - Docker image trust validation is inconsistent at write and execution boundaries

Severity: Medium
Confidence: High
Status: Confirmed

Locations:

- `src/app/api/v1/admin/languages/route.ts:11-20`
- `src/app/api/v1/admin/languages/route.ts:64-78`
- `src/app/api/v1/admin/languages/[language]/route.ts:11-18`
- `src/app/api/v1/admin/languages/[language]/route.ts:46-57`
- `src/lib/judge/docker-image-validation.ts:1-51`
- `judge-worker-rs/src/validation.rs:1-49`

Evidence:

Language config create/update routes accept any non-empty Docker image string up
to length limits and store it directly. Runtime/build paths validate later, but
there are two validators. TypeScript enforces a trusted-registry delimiter
boundary; Rust accepts trusted registries with a raw `image.starts_with(prefix)`
check.

Failure scenario:

An admin import or UI edit persists `registry.example.com.evil/judge-python:tag`
while `TRUSTED_DOCKER_REGISTRIES=registry.example.com`. Some paths reject it,
some paths store it, and the Rust validator can accept it as a trusted prefix.
The result is either persistent broken language config or execution of a
registry image outside the intended trust boundary.

Suggested fix:

Validate `dockerImage` at every DB write boundary with the same contract used at
execution time. Port the TypeScript delimiter-boundary logic to Rust, add shared
golden fixtures for local, trusted-registry, namespace, and spoofed-prefix
images, and reject invalid imported configs before they reach `language_configs`.

### ARCH2-8 - Claim mutation and response validation are not in the same rollback boundary

Severity: Medium
Confidence: Medium
Status: Likely

Locations:

- `src/lib/judge/claim-query.ts:54-79`
- `src/lib/judge/claim-query.ts:111-128`
- `src/app/api/v1/judge/claim/route.ts:230-238`
- `src/app/api/v1/judge/claim/route.ts:403-415`

Evidence:

The raw claim SQL updates `submissions` to `queued`, writes a claim token, and
increments `judge_workers.active_tasks` before returning the claimed row. The
route then validates the returned shape with Zod. `claimedForCleanup` is assigned
only after parsing succeeds, and the parse-error branch returns
`invalidJudgeClaim` directly instead of throwing into the outer cleanup block.

Failure scenario:

A schema drift, driver type change, or corrupted row makes `claimedRaw` fail
`claimedSubmissionRowSchema.parse()` after the DB mutation has already committed.
The route returns a 422 while the submission remains claimed/queued and the
worker active task counter can remain consumed until stale-claim recovery. Under
capacity pressure, repeated schema parse failures can reduce worker availability.

Suggested fix:

Move claim and response validation into one transaction that can roll back, or
populate minimal cleanup state from `claimedRaw.id` and `claimToken` before full
schema parsing. Add a regression test that stubs an invalid claimed row and
asserts the submission claim and worker slot are released.

### ARCH2-9 - PostgreSQL migration replay is not authoritative because SQL files and journal metadata diverge

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `AGENTS.md:292-295`
- `package.json:15-24`
- `scripts/check-migration-drift.sh:13-24`
- `drizzle/pg/meta/_journal.json`
- `drizzle/pg/0011_home_page_content.sql`
- `drizzle/pg/0016_fat_loki.sql`
- `drizzle/pg/0027_upload_max_zip_setting.sql`
- `drizzle/pg/0028_platform_mode_restriction_overrides.sql`

Evidence:

The project documents PostgreSQL runtime migrations under `drizzle/pg`, and
operators can switch from `drizzle-kit push` to journal-driven migrate during
recovery. A local journal/file comparison found four SQL files present on disk
but absent from `drizzle/pg/meta/_journal.json`: `0011_home_page_content`,
`0016_fat_loki`, `0027_upload_max_zip_setting`, and
`0028_platform_mode_restriction_overrides`. The drift check runs
`drizzle-kit check` and generate-diff checks, but it does not enforce a bijection
between SQL basenames and journal tags.

Failure scenario:

A fresh DB or disaster-recovery environment is rebuilt from journaled migrations.
Drizzle skips the unjournaled SQL files, so the rebuilt schema lacks columns or
settings that production code expects. The live production path may still work
because deploys use `drizzle-kit push`, masking the fact that migration replay is
not a faithful recovery path.

Suggested fix:

Reconcile `drizzle/pg` so every committed SQL file has a matching journal entry
and snapshot, or move ad hoc SQL outside the migration replay directory with
explicit docs. Extend `scripts/check-migration-drift.sh` to compare
`drizzle/pg/*.sql` basenames against `_journal.json` tags and fail CI on either
side of the mismatch.

### ARCH2-10 - Rust workspace/profile changes do not match production Docker build boundaries

Severity: Medium
Confidence: High
Status: Confirmed

Locations:

- `Cargo.toml:1-12`
- `judge-worker-rs/Cargo.toml:1-21`
- `code-similarity-rs/Cargo.toml:1-15`
- `rate-limiter-rs/Cargo.toml:1-14`
- `Dockerfile.judge-worker:14-22`
- `Dockerfile.code-similarity:10-12`
- `Dockerfile.rate-limiter-rs:12-14`
- `.gitignore:68-70`
- `.dockerignore:15-20`
- `deploy-docker.sh:647-668`

Evidence:

The current worktree adds a root Cargo workspace with a root `[profile.release]`
and removes per-crate release profiles. Production Dockerfiles do not copy the
root workspace; each one copies only the subcrate directory into `/build` and
runs `cargo build --release` there. That means the root release profile is not
available in production image builds. Separately, root `target/` and `._target`
exist in the worktree and are not ignored by `.gitignore`, `.dockerignore`, or
deploy rsync excludes.

Failure scenario:

Local root-workspace builds use LTO/strip/codegen-units settings, while deployed
images silently fall back to Cargo defaults because the root manifest is outside
the Docker build context. This can increase binary/image size and change release
performance relative to local verification. Running root workspace gates also
creates a large `target/` directory that can be accidentally included in Docker
contexts or rsynced to production, consuming disk on hosts where deploys already
have tight disk budgets.

Suggested fix:

Either make Docker builds use the root workspace context (`cargo build -p ...`)
or keep release profiles in each subcrate that is built standalone. Add `/target/`,
`/._target`, and any missing subcrate target directories to `.gitignore`,
`.dockerignore`, and deploy rsync excludes. Clarify whether root or per-crate
lockfiles are the production dependency authority, then align Docker builds and
`cargo audit` gates with that choice.

## Final missed-issues sweep

- Rechecked the submission lifecycle across create, claim, poll, rejudge, status
  constants, DB schema, and Rust verdict serialization. The main architectural
  problems are the manual-status mismatch and the split status protocol above.
- Rechecked restore/import/export boundaries. `importDatabase` is transactionally
  sound for DB tables, but ZIP upload restoration and pre-restore snapshot
  fidelity are outside that DB transaction guarantee.
- Rechecked app/worker deployment shape against `CLAUDE.md`, production compose,
  worker compose, and `deploy-docker.sh`. The app-only host still starts the
  worker transiently, and admin image builds still route through a path the
  production proxy disables.
- Rechecked Docker sandbox/run boundaries and did not file a separate isolation
  finding in this architect pass beyond image trust validation and build-path
  capability routing.
- Rechecked language config layering. I did not duplicate the prior managed
  default versus admin override finding here, but it remains an architectural
  risk whenever deploy sync, admin edits, and runtime DB overrides diverge.
- Rechecked migration tooling after the main pass with an explicit SQL-vs-journal
  comparison; the four unjournaled PostgreSQL SQL files remain present.
- Limitations: this was a static architecture review. I did not run the full
  quality-gate suite, execute a restore in a disposable DB, or perform a live
  deployment.
