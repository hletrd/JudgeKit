# Architect review - cycle 1/100

Scope: architectural and deployment-design review for JudgeKit. Focus areas:
monolithic deploy-script maintainability, target-specific behavior, app/worker
split, Docker cleanup abstractions, and safe data-volume boundaries.

Confidence legend:
- High: directly supported by cited code/docs.
- Medium: directly supported by code, but final impact depends on host/runtime configuration.
- Low: plausible risk needing manual validation.

## Inventory

Reviewed deployment and topology entrypoints:
- `deploy-docker.sh`
- `deploy.sh`
- `deploy-test-backends.sh`
- `docker-compose.production.yml`
- `docker-compose.worker.yml`
- `.env.deploy.algo`, `.env.deploy.worv`, `.env.deploy.auraedu`
- `scripts/deploy-worker.sh`
- `scripts/rebuild-worker-language-images.sh`
- `scripts/docker-disk-cleanup.sh`
- `scripts/pg-volume-safety-check.sh`
- `Dockerfile`, `Dockerfile.judge-worker`

Reviewed app/worker Docker-management path:
- `src/lib/docker/client.ts`
- `src/app/api/v1/admin/docker/images/route.ts`
- `src/app/api/v1/admin/docker/images/build/route.ts`
- `src/app/api/v1/admin/docker/images/prune/route.ts`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`
- `judge-worker-rs/src/main.rs`
- `judge-worker-rs/src/runner.rs`
- `judge-worker-rs/src/validation.rs`

Reviewed persistent-data and backup path:
- `src/lib/files/storage.ts`
- `src/lib/db/export-with-files.ts`
- `src/app/api/v1/admin/backup/route.ts`
- `scripts/backup-db.sh`
- `docs/deployment.md`
- `docs/deployment-automation.md`
- `docs/judge-workers.md`
- `docs/judge-worker-incident-runbook.md`
- `CLAUDE.md`
- `tests/unit/infra/deploy-security.test.ts`
- `tests/unit/infra/env-generation.test.ts`
- `tests/unit/infra/language-inventory.test.ts`

## Findings

### ARCH-1 - High - Monolithic deploy target contracts are optional env state, so known app-only hosts can still take worker/language builds

Evidence:
- The repo rule says `algo.xylolabs.com` is app/DB/nginx only, and worker/language images must be built on `worker-0.algo.xylolabs.com`: `CLAUDE.md:7-11`.
- The correct `algo` profile exists and sets `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, and `SKIP_LANGUAGES=true`: `.env.deploy.algo:15-19`.
- `deploy-docker.sh` loads per-target overrides only when `DEPLOY_TARGET` is set: `deploy-docker.sh:127-136`.
- Caller-provided `REMOTE_HOST` then overrides whatever the target file loaded: `deploy-docker.sh:139-148`.
- The script defaults to `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, and `BUILD_WORKER_IMAGE=auto`, then resolves `auto` to `INCLUDE_WORKER`: `deploy-docker.sh:195-199`, `deploy-docker.sh:239-240`.
- Those defaults build the worker image and language images on `REMOTE_HOST`: `deploy-docker.sh:753-817`.
- The app-only compose override is generated only when `INCLUDE_WORKER != true`: `deploy-docker.sh:831-842`.
- The deployment automation doc still presents direct `REMOTE_HOST=... REMOTE_USER=... DOMAIN=... SSH_KEY=... ./deploy-docker.sh` as the current production baseline: `docs/deployment-automation.md:7-11`.

Risk:
The target architecture is encoded as a convention, not as an enforced contract.
An operator can deploy to `REMOTE_HOST=algo.xylolabs.com` without
`DEPLOY_TARGET=algo`, or with caller env that accidentally overrides the profile.
The script then follows integrated-host defaults and builds/starts worker pieces
and the language-image set on the app server, violating the documented split and
recreating the exact disk-pressure class the hardening notes are trying to avoid.

Scenario:
During an incident, an operator copies the baseline command from
`docs/deployment-automation.md` and sets `REMOTE_HOST=algo.xylolabs.com` directly.
No `.env.deploy.algo` profile is loaded. The deploy builds `judgekit-judge-worker`
and all default language images on the ARM app host, fills Docker storage, and may
also start a local worker path that should not exist on that target.

Fix:
Make production targets first-class and fail closed. At minimum:
- Require `DEPLOY_TARGET` for any known production host.
- Add a host/profile assertion after flag resolution: if `REMOTE_HOST` is
  `algo.xylolabs.com`, hard-fail unless `SKIP_LANGUAGES=true`,
  `BUILD_WORKER_IMAGE=false`, and `INCLUDE_WORKER=false`.
- Emit a dry-run deployment plan showing target, app/worker mode, language build
  scope, worker hosts, and cleanup policy before any build starts.
- Add shell/unit tests that simulate `DEPLOY_TARGET=algo`, direct
  `REMOTE_HOST=algo.xylolabs.com`, typoed `DEPLOY_TARGET`, and caller override
  precedence. Current configured bash lint is syntax-only:
  `package.json:9-10`, while existing tests mostly string-match invariants such
  as the generated app-only override: `tests/unit/infra/deploy-security.test.ts:134-143`.

Confidence: High.

### ARCH-2 - High - Dedicated `WORKER_HOSTS` deploys refresh worker code but leave language images out-of-band

Evidence:
- The app-only `algo` profile skips language builds on the app server:
  `.env.deploy.algo:15-19`.
- The same profile configures `WORKER_HOSTS` for the dedicated worker:
  `.env.deploy.algo:31-36`.
- The `WORKER_HOSTS` loop rsyncs source and builds only
  `judgekit-judge-worker:latest`: `deploy-docker.sh:1156-1204`.
- A nearby cleanup comment says worker hosts accumulate stale images because
  "judge-worker + every language image is rebuilt --no-cache here", but the code
  does not build language images in that block: `deploy-docker.sh:1213-1216`.
- The dedicated worker compose file requires judge language images to be
  available locally or via registry: `docker-compose.worker.yml:10-15`.
- The recovery script documents the same gap explicitly:
  `deploy-docker.sh WORKER_HOSTS step only rebuilds judge-worker:latest; it never
  builds the language images`: `scripts/rebuild-worker-language-images.sh:5-9`.

Risk:
The app deploy, DB language configuration, worker binary, and actual language
container fleet can drift independently. For split topology, the app is the place
where language configs are synchronized, but the worker host is where `judge-*`
images must exist and be fresh.

Scenario:
A commit changes `docker/Dockerfile.judge-python` or a compile/run contract in
`src/lib/judge/languages.ts`. An `algo` deploy correctly skips language builds on
the app host and refreshes only `judgekit-judge-worker` on `worker-0`. New
submissions are claimed by a worker whose `judge-python:latest` is stale or
missing, so students see compile/runtime failures even though the app-side
language config is current.

Fix:
Promote language-image rollout into the worker-host deployment contract. Options:
- Add `WORKER_LANGUAGE_FILTER=none|core|popular|all|everything|<list>` and run the
  same sequential build loop on each `WORKER_HOSTS` entry before restart.
- Or fail loudly when any `docker/Dockerfile.judge-*` or language config changed
  and no worker language rebuild was requested.
- Longer term, publish versioned/digest-pinned `judge-*` images to a registry and
  have workers pull the exact release image set instead of relying on local
  mutable `:latest` images.
- Remove or correct the false cleanup comment at `deploy-docker.sh:1213-1216`.

Confidence: High.

### ARCH-3 - Medium/High - Docker build-management capability is advertised through the app/worker API but blocked by the socket-proxy contract

Evidence:
- Worker-backed Docker management reports `canBuild: true` whenever
  `COMPILER_RUNNER_URL`/`RUNNER_AUTH_TOKEN` are configured:
  `src/lib/docker/client.ts:120-126`.
- The admin language table fetches `/api/v1/admin/docker/images` but ignores the
  returned `capabilities` object: `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:123-142`.
- The Build button is rendered enabled for every row except while that row is
  already building: `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:505-516`.
- The build route calls `buildDockerImage(...)`:
  `src/app/api/v1/admin/docker/images/build/route.ts:119-141`.
- The worker client forwards this to `/docker/build`:
  `src/lib/docker/client.ts:532-540`.
- The Rust worker build handler shells out to `docker build`:
  `judge-worker-rs/src/runner.rs:375-385`, `judge-worker-rs/src/runner.rs:659-687`.
- Production integrated compose explicitly sets `BUILD=0` and says builds must
  not flow through the worker path: `docker-compose.production.yml:70-79`.
- Dedicated worker compose also hardcodes `BUILD=0`:
  `docker-compose.worker.yml:37-39`.
- Docs say operators can opt into build management with
  `WORKER_DOCKER_PROXY_BUILD=1`, but the compose file does not consume that
  variable: `docs/judge-workers.md:95-102`, `docker-compose.worker.yml:37-39`.
- Tests currently codify the hardcoded `BUILD=0` expectation rather than the
  documented opt-in path: `tests/unit/infra/deploy-security.test.ts:175-183`.

Risk:
The app, UI, docs, worker API, and socket-proxy permissions disagree about the
same capability. This is a layering violation: the UI trusts a static app-side
capability model, while the real enforcement point is the worker host's Docker
socket proxy.

Scenario:
An admin sees a stale or missing language image and clicks Build in
`/dashboard/admin/languages`. The app reports build capability as available and
calls the runner. The runner executes `docker build` through `DOCKER_HOST`, but
the socket proxy rejects BuildKit/build endpoints because `BUILD=0`. The UI shows
a generic build error, and the operator must discover that the documented
`WORKER_DOCKER_PROXY_BUILD=1` opt-in is not wired.

Fix:
Use one source of truth for Docker-management capabilities:
- Add a worker `/docker/capabilities` endpoint that actively probes or reads the
  proxy permission model for list/build/remove.
- Make `getDockerManagementCapabilities()` consume that worker capability result
  instead of assuming `canBuild=true` for every worker-backed deployment.
- Have the language admin UI store and honor capabilities, disabling Build/Remove
  with an operator-facing reason when unavailable.
- Either wire `WORKER_DOCKER_PROXY_BUILD=${WORKER_DOCKER_PROXY_BUILD:-0}` into
  `docker-compose.worker.yml` with explicit docs about temporary use, or remove
  the build endpoint/UI from worker-backed production and route builds through a
  separate release/build pipeline.

Confidence: High.

### ARCH-4 - Medium - App-only runner URL depends on `host.docker.internal` without compose-level host-gateway wiring

Evidence:
- When `INCLUDE_WORKER=false`, deploy defaults `COMPILER_RUNNER_URL` to
  `http://host.docker.internal:3001`: `deploy-docker.sh:724-726`.
- The post-sync check only warns when the URL is still the local worker default
  `http://judge-worker:3001`, not when the URL is the host bridge default:
  `deploy-docker.sh:731-736`.
- The `algo` profile uses that host bridge value:
  `.env.deploy.algo:21-22`.
- The production app service consumes `COMPILER_RUNNER_URL` but the cited app
  service block has no `extra_hosts` / `host-gateway` mapping:
  `docker-compose.production.yml:88-109`.
- Dedicated worker compose publishes the runner on worker-host loopback:
  `docker-compose.worker.yml:52-53`.
- The worker docs describe loopback as useful for split topologies through an SSH
  tunnel or host bridge path: `docs/judge-workers.md:104-112`.

Risk:
On standard Linux Docker, `host.docker.internal` is not guaranteed to resolve
inside containers unless `host-gateway` is explicitly configured. The deployment
contract assumes a host bridge exists, but compose does not create it and deploy
does not validate it from inside the app container.

Scenario:
The app host maintains an SSH tunnel from app-host port 3001 to
`worker-0:127.0.0.1:3001`. The app container starts with
`COMPILER_RUNNER_URL=http://host.docker.internal:3001`, but Docker DNS inside the
container cannot resolve that name. Submissions fail at runner delegation even
though the worker container itself is healthy.

Fix:
Make the split-runner network path explicit and testable:
- Add `extra_hosts: ["host.docker.internal:host-gateway"]` to the app service or
  to the generated app-only compose override when the URL uses that hostname.
- Add a deploy preflight after app startup that runs a small in-container request
  from `judgekit-app` to `${COMPILER_RUNNER_URL}/health` with the runner auth
  setup expected in production.
- Prefer a concrete worker private IP/DNS name when no SSH tunnel is required,
  as `.env.deploy.worv` already does with an IP-style runner URL.

Confidence: Medium.

### ARCH-5 - Medium - The deploy safety backup is DB-only, but production has a persistent app data volume for uploads

Evidence:
- The runtime image creates `/app/data` for uploads/logs:
  `Dockerfile:105-106`.
- Production compose mounts a named volume at `/app/data`:
  `docker-compose.production.yml:99-100`, `docker-compose.production.yml:195-200`.
- File storage resolves uploads under the app data directory:
  `src/lib/files/storage.ts:4-12`.
- The deploy script describes its safety net as a pre-deploy database backup and
  runs only `pg_dump`: `deploy-docker.sh:848-865`.
- The scheduled backup script is also database-only:
  `scripts/backup-db.sh:1-16`, `scripts/backup-db.sh:41-48`.
- A full app-level backup path with uploaded files exists, but only behind the
  admin backup route when `includeFiles=true`: `src/app/api/v1/admin/backup/route.ts:1-3`,
  `src/app/api/v1/admin/backup/route.ts:71-90`.
- The ZIP implementation explicitly includes `database.json` plus `uploads/`:
  `src/lib/db/export-with-files.ts:151-156`.

Risk:
The deployment safety model treats PostgreSQL as the only durable state, while
the runtime also stores uploaded files in `judgekit-app-data`. A DB-only dump can
restore rows that reference files without restoring the files themselves.

Scenario:
A deploy, restore, or host migration uses the automatic pre-deploy dump as the
rollback artifact after an incident. Problems, discussions, or admin files that
reference uploaded assets are restored in PostgreSQL, but `/app/data/uploads`
was never captured. Pages now contain broken file links and the operator has no
deploy-time artifact for the missing volume contents.

Fix:
Make app data a first-class production volume:
- Add an optional deploy-time `judgekit-app-data` tar/snapshot backup next to the
  `pg_dump`, or call a server-side full backup flow that includes uploads.
- Document pre-deploy dumps as "DB-only" until this exists.
- Add a restore runbook that pairs a DB dump with the corresponding app-data
  artifact.
- Add retention and disk-budget controls so upload backups do not silently fill
  the same host storage the Docker cleanup is trying to protect.

Confidence: High.

### ARCH-6 - Medium - Docker cleanup policy is duplicated and volume pruning is not behind a single audited boundary

Evidence:
- `deploy-docker.sh` defines its own cleanup helper and runs
  `docker volume prune -f` when any `judgekit-db` container is running:
  `deploy-docker.sh:399-421`.
- The recurring cleanup script has a different invariant: it never prunes
  volumes, explicitly because production volumes can hold PostgreSQL data:
  `scripts/docker-disk-cleanup.sh:4-7`.
- The deployment docs warn that `docker volume prune -f` is unsafe while the DB
  container is stopped, but also document the deploy helper's conditional volume
  prune: `docs/deployment.md:250-260`, `docs/deployment.md:262-277`.
- The PG safety check detects one specific anonymous-PGDATA incident shape:
  `scripts/pg-volume-safety-check.sh:25-39`.
- The deploy can bypass that safety check with `SKIP_PG_VOLUME_CHECK=1`:
  `deploy-docker.sh:888-910`.
- Pre-build disk cleanup deliberately never touches volumes:
  `deploy-docker.sh:512-531`.
- Deployment automation docs describe post-deploy pruning of orphan volumes on
  every touched host: `docs/deployment-automation.md:27-30`.

Risk:
There are now multiple "safe Docker cleanup" definitions in the repo. One never
prunes volumes; one prunes every Docker volume considered unused by the daemon
after checking only that `judgekit-db` is currently running. That guard protects
the current attached DB volume, but it does not express a project-level data
allowlist/denylist for other durable volumes such as `judgekit-app-data`, old
compose-project volumes during a rename/migration, or orphaned PG volumes outside
the exact safety-check pattern.

Scenario:
A host migration or compose project-name change creates a new
`judgekit-app-data` volume while the old upload volume is no longer attached to a
running container. The deploy reaches post-deploy cleanup, sees `judgekit-db`
running, and `docker volume prune -f` deletes the old upload volume before the
operator has copied its contents. The recurring cleanup script would not have
done this, but the deploy helper has a broader policy.

Fix:
Centralize Docker cleanup into one audited script/library with explicit modes:
`pre-build`, `post-deploy`, and `recurring`.
- Default all modes to no volume pruning.
- If volume pruning remains necessary, use a dry-run listing plus explicit
  allowlist/denylist rules that preserve `*pgdata*`, `*app-data*`, and any
  labelled JudgeKit data volumes.
- Make `deploy-docker.sh` call the shared cleanup entrypoint instead of embedding
  another policy.
- Add tests around cleanup command generation for app host, worker host, DB down,
  app-only target, and compose-project rename cases.

Confidence: Medium.

## Cross-cutting recommendation

The recurring pattern is that deployment knowledge is spread across shell flags,
hidden target env files, compose comments, app-side static capabilities, worker
HTTP routes, and operator docs. The safest next architectural step is not a full
rewrite; it is a typed deployment contract layer:

1. Resolve a `DeployPlan` before doing work: target, app/worker mode, platform,
   language image policy, worker hosts, runner URL, cleanup mode, backup mode.
2. Print and optionally test that plan with no remote side effects.
3. Hard-fail when known production targets violate their contract.
4. Drive compose overrides, worker image builds, language image builds, Docker
   management capabilities, and cleanup from that same plan.

That would reduce the current "remember the right env vars" coupling without
discarding the hardening already present in `deploy-docker.sh`.
