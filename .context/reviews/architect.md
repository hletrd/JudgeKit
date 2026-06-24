# Architect Review - 2026-06-22

Scope: architecture/design review for Prompt 1 of the review-plan-fix cycle in
`/Users/hletrd/flash-shared/judgekit`. I reviewed layering and boundary risks
between the Next.js app, PostgreSQL/Drizzle schema and migrations, Rust judge
workers, Docker socket proxy, deployment scripts, and docs. I did not edit source
code or run fix-up commands.

## Inventory

Read governing and context material:

- `AGENTS.md`
- `CLAUDE.md`
- `.context/README.md`
- `.context/development/conventions.md`
- `.context/development/documentation-rules.md`
- `.context/development/problem-descriptions.md`
- `.context/development/open-workstreams.md`
- `.context/project/current-state.md`
- `.context/plans/README.md`
- `.context/plans/2026-06-20-cycle-1-review-remediation.md`
- Relevant prior/current review artifacts under `.context/reviews/`

Read architecture/ops docs:

- `README.md`
- `docs/deployment.md`
- `docs/deployment-automation.md`
- `docs/judge-workers.md`
- `docs/function-judging.md`
- `docs/judge-worker-incident-runbook.md`
- `docs/operator-incident-runbook.md`
- `docs/judge-worker-gvisor.md`
- `docs/admin-security-operations.md`
- `docs/monitoring.md`
- `docs/threat-model.md`
- `docs/api.md`
- `docs/languages.md`

Systematically inspected review-relevant implementation files:

- Next/API/runtime: `src/app/api/v1/judge/claim/route.ts`,
  `src/app/api/v1/admin/docker/images*/route.ts`, `src/lib/api/handler.ts`,
  `src/lib/security/production-config.ts`, `src/lib/docker/client.ts`,
  `src/lib/compiler/execute.ts`, `src/lib/judge/sync-language-configs.ts`,
  `src/lib/actions/language-configs.ts`, `src/lib/capabilities/*`,
  `src/instrumentation.ts`.
- DB/migration surface: `src/lib/db/schema.pg.ts`, `drizzle/pg/**`,
  `drizzle/pg/meta/_journal.json`, `scripts/check-migration-drift.sh`.
- Rust worker/proxy boundary: `judge-worker-rs/src/{config,runner,validation}.rs`,
  with targeted reads of Docker admin handlers and runner auth validation.
- Deploy/ops: `deploy-docker.sh`, `deploy.sh`, `scripts/deploy-worker.sh`,
  `docker-compose.production.yml`, `docker-compose.worker.yml`,
  `scripts/docker-disk-cleanup.sh`.
- Tests used as contract evidence: targeted `tests/unit/**` files around
  language config actions, API handler capabilities, Docker client, worker
  runtime, and deployment infra.

Current worktree note: before this artifact, unrelated review files were already
dirty (`.context/reviews/code-reviewer.md`, `critic.md`, `perf-reviewer.md`,
`test-engineer.md`, `verifier.md`). I did not modify them.

## Confirmed Issues

### ARCH-1 - Startup language sync overwrites admin-managed command overrides

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `src/lib/judge/sync-language-configs.ts:10-17`
- `src/lib/judge/sync-language-configs.ts:23-57`
- `src/lib/actions/language-configs.ts:88-119`
- `src/instrumentation.ts:32-36`
- `src/lib/db/schema.pg.ts:516-539`
- `AGENTS.md:161`
- `AGENTS.md:194-204`

Evidence:

`syncLanguageConfigsOnStartup()` runs during every app boot from
`src/instrumentation.ts:32-36`. The sync code loads existing
`language_configs.language`, `run_command`, and `compile_command`, then for every
default language updates existing rows when either command differs from
`src/lib/judge/languages.ts` defaults (`sync-language-configs.ts:46-54`). The
admin action explicitly lets operators update `dockerImage`, `compileCommand`,
`runCommand`, and `dockerfile` in the DB (`language-configs.ts:88-119`). The
schema has no "source-managed vs operator override" marker
(`schema.pg.ts:516-539`). The project guide states the worker reads
`dockerImage`, `compileCommand`, and `runCommand` from the DB at runtime and that
admin language settings can be overridden without redeploying the worker
(`AGENTS.md:161`, `AGENTS.md:194-204`).

Concrete failure scenario:

An admin hotfixes `zig` or `groovy` commands in `/dashboard/admin/languages`
after a toolchain/image issue. New submissions use the fixed DB command until
the Next app restarts or redeploys. On boot, the startup sync sees the command
diff and silently writes the static default back. The worker keeps reading from
the DB, so the same language starts failing again after an unrelated app restart.

Suggested fix:

Make the sync insert-only for existing language rows unless a row is explicitly
marked source-managed. Add one of:

- a `language_configs.command_source` / `is_customized` / `last_synced_hash`
  field and only overwrite rows whose prior value matches the last synced
  default;
- an explicit admin "reset to defaults" action;
- a migration that records current rows as customized before changing sync
  behavior.

Add a unit/integration test that updates a command through
`updateLanguageConfig`, runs `syncLanguageConfigsOnStartup`, and proves the admin
override survives.

### ARCH-2 - Destructive migration detection warns but still proceeds to start new code

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `deploy-docker.sh:82-90`
- `deploy-docker.sh:1011-1030`
- `deploy-docker.sh:1040-1064`
- `deploy-docker.sh:1066-1096`
- `AGENTS.md:377-390`

Evidence:

The deploy header says destructive `drizzle-kit push` diffs halt the deploy and
escalate (`deploy-docker.sh:82-90`). The migration block explains that
non-interactive `drizzle-kit push` prints destructive/data-loss prompts but does
not apply the destructive change (`deploy-docker.sh:1011-1019`). The actual code
captures output and, on matching destructive markers, only logs `warn` at
`deploy-docker.sh:1060-1061`; it does not `die`. The script then applies additive
repairs and starts containers at `deploy-docker.sh:1066-1096`.

Concrete failure scenario:

A deploy removes or renames a column from `schema.pg.ts`. `drizzle-kit push`
prints a destructive prompt, exits successfully without applying it, the script
logs a warning, and then starts the new app image against the old schema. The
app can now 500 on queries or writes that assume the new schema, while the deploy
appears to have reached the normal container start path.

Suggested fix:

Fail closed when destructive prompt markers are detected unless
`DRIZZLE_PUSH_FORCE=1` is set after explicit operator approval. Replace the warn
branch with `die`, or require a deliberately named escape hatch such as
`ALLOW_UNAPPLIED_DESTRUCTIVE_DIFF=1` that also skips app restart. Add a
`npm run lint:bash` or shell-test fixture that stubs push output with
"data loss" and asserts the script exits before the container start step.

### ARCH-3 - Docker image admin falls back to local Docker from the Next app

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `AGENTS.md:303-309`
- `README.md:237-239`
- `src/lib/docker/client.ts:13-22`
- `src/lib/docker/client.ts:40`
- `src/lib/docker/client.ts:342-350`
- `src/lib/docker/client.ts:369-377`
- `src/lib/docker/client.ts:419-430`
- `src/lib/docker/client.ts:455-463`
- `src/lib/docker/client.ts:483-490`
- `src/lib/security/production-config.ts:11-35`

Evidence:

The documented architecture says the Docker socket proxy is the only direct
daemon holder, the judge worker talks to it via `DOCKER_HOST`, and the Next app
uses the worker's authenticated internal API instead of direct daemon access
(`AGENTS.md:303-309`, `README.md:237-239`). `src/lib/docker/client.ts` selects
the worker path only when both `JUDGE_WORKER_URL`/`COMPILER_RUNNER_URL` and
`RUNNER_AUTH_TOKEN` are set (`client.ts:13-22`, `client.ts:40`). If not, the
Docker admin functions run local `docker` CLI operations from the Next process:
list, pull, build, disk usage, and remove (`client.ts:342-350`,
`client.ts:369-377`, `client.ts:419-430`, `client.ts:455-463`,
`client.ts:483-490`). Production startup validation does not require either
runner URL or `RUNNER_AUTH_TOKEN` (`production-config.ts:11-35`).

Concrete failure scenario:

An operator runs the Next app under systemd or an ad-hoc production container
with Docker CLI/socket access but forgets `COMPILER_RUNNER_URL` or
`RUNNER_AUTH_TOKEN`. The admin language/Docker page still works by controlling
the local daemon from the app process. That bypasses the intended worker-only
Docker boundary and increases the blast radius of an app/admin compromise.

Suggested fix:

Make Docker image management fail closed in production unless a worker Docker
API is configured and authenticated. Keep local Docker fallback behind an
explicit development-only flag such as `ENABLE_DOCKER_ADMIN_LOCAL_FALLBACK=1`,
and have `assertProductionConfig()` reject production deployments where Docker
admin is enabled but the worker URL/token pair is absent. Align docs/tests with
that policy.

### ARCH-4 - App-only deploy topology is still opt-in shell discipline, not encoded in the deploy system

Severity: High
Confidence: High
Status: Confirmed

Locations:

- `CLAUDE.md:7-12`
- `deploy-docker.sh:22-28`
- `deploy-docker.sh:181-186`
- `deploy-docker.sh:225-227`
- `deploy-docker.sh:739-750`
- `deploy-docker.sh:763-802`
- `deploy-docker.sh:1096-1111`
- `docker-compose.production.yml:120-145`

Evidence:

The repo rule says `algo.xylolabs.com` is app/DB/nginx only, worker and language
images must be built on `worker-0`, and deploys to algo must set
`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`
(`CLAUDE.md:7-12`). The deploy header says `BUILD_WORKER_IMAGE` and
`INCLUDE_WORKER` default false on the app server (`deploy-docker.sh:22-28`), but
the script actually defaults `INCLUDE_WORKER=true`, `SKIP_LANGUAGES=false`, and
`BUILD_WORKER_IMAGE=auto`, which becomes `true` when `INCLUDE_WORKER` is true
(`deploy-docker.sh:181-186`, `deploy-docker.sh:225-227`). The build phase then
builds the worker image and all language images on `REMOTE_HOST`
(`deploy-docker.sh:739-750`, `deploy-docker.sh:763-802`). Even with
`INCLUDE_WORKER=false`, compose still starts the worker service and stops it
afterward (`deploy-docker.sh:1096-1111`, `docker-compose.production.yml:120-145`).

Concrete failure scenario:

An app-host deploy omits one of the three required env flags. The script builds
dozens of language images or a worker image on the app server, consuming disk and
violating the production topology. If `INCLUDE_WORKER=false` is set but the
worker service is missing/broken, `docker compose up -d` can still fail because
of a service that should not be part of the app-host deployment.

Suggested fix:

Encode target topology in the deploy system instead of relying on remembered env
triples. Options:

- add a required `DEPLOY_TOPOLOGY=integrated|app-only|worker-only` and derive
  `SKIP_LANGUAGES`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`, service lists, and
  compose overrides from it;
- for app-only deploys, call `docker compose up -d db app code-similarity rate-limiter`
  or use an app-only compose override that removes `judge-worker`;
- make `INCLUDE_WORKER=false` imply `SKIP_LANGUAGES=true` and
  `BUILD_WORKER_IMAGE=false` unless an explicit unsafe override is set.

Add a shell regression test that runs the script in dry-run/stub mode for the
algo topology and asserts no worker/language build or worker service start is
attempted.

## Likely Issues

### ARCH-5 - Dedicated-worker Docker admin API and proxy ACLs are not one contract

Severity: Medium
Confidence: Medium
Status: Likely issue

Locations:

- `judge-worker-rs/src/runner.rs:241-333`
- `judge-worker-rs/src/runner.rs:442-475`
- `judge-worker-rs/src/runner.rs:590-623`
- `judge-worker-rs/src/runner.rs:919-928`
- `docker-compose.worker.yml:25-41`
- `docs/judge-workers.md:93-102`
- `scripts/deploy-worker.sh:139-148`

Evidence:

The Rust runner always exposes Docker image/admin routes (`runner.rs:919-928`)
and implements them with local `docker images`, `inspect`, `pull`, `rmi`, and
`build` commands (`runner.rs:241-333`). The dedicated worker compose proxy
defaults `IMAGES=0` and hardcodes `BUILD=0` (`docker-compose.worker.yml:25-41`).
The docs say operators can opt into image/build management with
`WORKER_DOCKER_PROXY_IMAGES=1` and `WORKER_DOCKER_PROXY_BUILD=1`
(`docs/judge-workers.md:93-102`), but `docker-compose.worker.yml` does not read
`WORKER_DOCKER_PROXY_BUILD`, and `scripts/deploy-worker.sh` never sets the image
ACLs when creating `.env` (`scripts/deploy-worker.sh:139-148`).

Concrete failure scenario:

In the split app/worker topology, the admin Docker image UI points at the remote
runner. Listing images or building a missing language image fails at runtime
because the runner route exists, but the proxy denies the underlying Docker
image/build API. Operators see a generic admin UI failure during an incident
instead of a clear "image management disabled on this worker" state.

Suggested fix:

Make image-management capability explicit and consistent across layers. Either
hide/disable admin Docker image operations when the worker reports
image-management disabled, or wire documented proxy envs through compose and
deploy helpers. If build must stay off by default, expose a `/capabilities`
runner endpoint and have the Next admin API return a clear configuration error
before invoking Docker.

### ARCH-6 - Function harness assembly failure is converted into a student compile failure

Severity: Medium
Confidence: High
Status: Likely issue

Locations:

- `AGENTS.md:176-192`
- `src/app/api/v1/judge/claim/route.ts:374-401`
- `src/app/api/v1/judge/claim/route.ts:404-418`

Evidence:

Function problems are app-assembled into `prelude + studentCode + generatedMain`
before being sent to the unchanged worker (`AGENTS.md:176-192`). In the claim
route, if parsing or assembly throws, the code logs the error and falls back to
the student's verbatim source (`claim/route.ts:374-401`), then returns a normal
claim payload to the worker (`claim/route.ts:404-418`).

Concrete failure scenario:

A problem's stored `functionSpec` is malformed after an author edit or migration
bug. Every student submission is sent to the worker without the generated
harness and fails as a compile error against the student's original function
body. The platform configuration fault is surfaced as student failure, making it
hard for instructors/operators to distinguish bad problem setup from bad code.

Suggested fix:

Treat function assembly failure as a platform/problem configuration error, not a
student compile result. Release or mark the claimed submission with a
non-student-fault status, emit an audit/alert entry with the `problemId`, and
show instructors that the problem needs repair. Keep queue health by releasing
the claim or moving affected submissions to a retryable/internal-error state
rather than sending verbatim source to the worker.

## Manual-Validation Risks

### ARCH-MV-1 - Synthesized app-only runner URL depends on undocumented host bridge/tunnel state

Severity: Medium
Confidence: Medium
Status: Manual validation risk

Locations:

- `deploy-docker.sh:710-722`
- `docs/deployment.md:180-187`
- `docs/judge-workers.md:104-112`
- `.context/plans/2026-06-20-cycle-1-review-remediation.md:73-86`

Risk:

When `INCLUDE_WORKER=false`, the deploy script backfills
`COMPILER_RUNNER_URL=http://host.docker.internal:3001` if the key is missing
(`deploy-docker.sh:710-722`). The docs describe an SSH tunnel / host bridge path
for split app/worker topologies (`docs/deployment.md:180-187`,
`docs/judge-workers.md:104-112`), but compose does not show a host-gateway
mapping and the open plan already tracks replacing the synthesized URL with an
explicit external runner requirement (`.context/plans/2026-06-20...:73-86`).

Manual validation:

For every app-only target, verify from inside the app container that
`COMPILER_RUNNER_URL` resolves and reaches `/health` and authenticated runner
routes. If it relies on `host.docker.internal`, document the host-gateway or SSH
tunnel unit that makes it true. Prefer requiring an explicit per-target runner
URL and smoke-checking it during deploy.

### ARCH-MV-2 - Docker image API authorization docs do not match the route capability model

Severity: Low
Confidence: High
Status: Manual validation risk

Locations:

- `docs/api.md:1566-1618`
- `src/app/api/v1/admin/docker/images/route.ts:48-76`
- `src/app/api/v1/admin/docker/images/route.ts:129-130`
- `src/app/api/v1/admin/docker/images/build/route.ts:19-20`
- `src/app/api/v1/admin/docker/images/prune/route.ts:11-12`
- `src/lib/capabilities/defaults.ts:82-101`
- `src/lib/capabilities/types.ts:65-71`

Risk:

`docs/api.md` says Docker image pull, remove, and prune are "Super Admin only"
(`docs/api.md:1580-1618`). The routes actually require the broad
`system.settings` capability (`images/route.ts:48-76`,
`images/route.ts:129-130`, `build/route.ts:19-20`, `prune/route.ts:11-12`).
Default admins have `system.settings` (`defaults.ts:82-101`), and custom roles
can be granted it as a general system capability (`types.ts:65-71`).

Manual validation:

Decide whether Docker daemon/image control is intentionally part of
`system.settings` or should be a narrower capability such as `docker.manage`.
Then align docs, tests, navigation, and route guards. If custom roles with
`system.settings` are expected to control Docker, document that operational
blast radius explicitly.

### ARCH-MV-3 - Migration journal drift remains an operational gate, not enforced here

Severity: Low
Confidence: Medium
Status: Manual validation risk

Locations:

- `deploy-docker.sh:1011-1026`
- `scripts/check-migration-drift.sh:1-80`
- `drizzle/pg/meta/_journal.json`

Risk:

Production deploys use `drizzle-kit push`, while the repository still carries
numbered journal SQL under `drizzle/pg/`. The script comments acknowledge the
push-vs-journal split (`deploy-docker.sh:1011-1026`). I inspected the migration
surface but did not execute drift checks in this review.

Manual validation:

Run the existing migration drift check before any schema-affecting deploy, and
keep destructive journal SQL safety steps mirrored in `deploy-docker.sh` until
the deploy strategy switches to journal-driven migrations.

## Missed-Issues Sweep

Final searches covered:

- direct Docker socket and `DOCKER_HOST` references;
- Docker build/remove/prune paths and `docker system prune --volumes` risks;
- `COMPILER_RUNNER_URL`, `RUNNER_AUTH_TOKEN`, `INCLUDE_WORKER`,
  `SKIP_LANGUAGES`, and worker proxy envs;
- `drizzle-kit push`, `DRIZZLE_PUSH_FORCE`, migration journal references, and
  drift-check scripts;
- admin Docker/image routes, capability gates, and API docs;
- function judging claim-time assembly and worker handoff;
- language-config DB writes, startup sync, and admin action tests.

Coverage limits:

- I did not run the test suite, Docker builds, deploy scripts, or live remote
  probes; this was a static architecture review.
- I did not perform a full line-by-line audit of every route under `src/app`;
  focus stayed on architecture boundaries named in the prompt.
- Several risks overlap with existing open plans; I still recorded them where
  the current source remains vulnerable or requires manual validation.
