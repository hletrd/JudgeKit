# Cycle 1/100 Test Engineer Review - Deploy Safety

Date: 2026-06-30
Repository: `/Users/hletrd/flash-shared/judgekit`
Role: test-engineer
Scope: missing tests, flaky gates, and testable deploy safety contracts around `deploy-docker.sh`.

## Inventory

- Repo inventory first: `rg --files` returned 1,965 paths. Relevant deploy artifacts include `deploy-docker.sh`, `deploy.sh`, `deploy-test-backends.sh`, `docker-compose.production.yml`, `docker-compose.worker.yml`, `scripts/pg-volume-safety-check.sh`, `scripts/docker-disk-cleanup.sh`, `scripts/deploy-worker.sh`, `.github/workflows/ci.yml`, and `docs/deployment.md`.
- Existing deploy/infra tests found:
  - `tests/unit/infra/deploy-security.test.ts:9-225` source-grep checks SSH, fail-closed migration/worker/nginx paths, app-only compose overrides, Docker daemon access, sidecar tokens, and worker compose capabilities.
  - `tests/unit/infra/pgdata-pinning.test.ts:105-144` parses compose YAML and asserts every Postgres service pins `PGDATA` to `/var/lib/postgresql/data` and mounts a volume there.
  - `tests/unit/infra/env-generation.test.ts:33-88` checks deploy scripts emit and backfill required env keys.
  - `tests/unit/infra/playwright-remote-safety.test.ts:5-32` and `tests/unit/infra/playwright-profiles.test.ts:9-72` pin remote smoke profile allowlists.
  - `tests/unit/infra/source-grep-inventory.test.ts:54-69` documents infra/deploy source-grep tests; `tests/unit/infra/source-grep-inventory.test.ts:234-240` pins the global source-grep baseline.
- Existing gates found:
  - `package.json:9-12` runs eslint and Vitest unit tests; `package.json:10` defines `lint:bash` as only `bash -n deploy-docker.sh && bash -n deploy.sh`.
  - `.github/workflows/ci.yml:225-250` syntax-checks deploy scripts in CI, including `deploy-test-backends.sh` and `scripts/pg-volume-safety-check.sh`.
  - `.github/workflows/ci.yml:255-262` runs the PGDATA compose pinning script.
- Test posture: deploy safety is mostly pinned with syntax checks and source-grep contracts. There is no behavioral shell harness for `deploy-docker.sh`, so ordering, target-env precedence, disk-threshold decisions, and failure cleanup can regress while syntax and broad grep tests stay green.

## Findings

### TE-1 - Per-target env sourcing precedence is untested and likely wrong

Severity: High
Confidence: High

Evidence:
- `deploy-docker.sh:110-117` saves caller-provided overrides only for `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN`, `SSH_PASSWORD`, `SUDO_PASSWORD`, `SSH_KEY`, and `AUTH_URL_OVERRIDE`.
- `deploy-docker.sh:119-137` sources `.env.deploy` and then `.env.deploy.${DEPLOY_TARGET}`.
- `deploy-docker.sh:139-146` restores only the same host/auth fields, while the comment at `deploy-docker.sh:127-131` says explicit caller env vars still win after per-target sourcing.
- `deploy-docker.sh:194-240` then treats `SKIP_BUILD`, `SKIP_LANGUAGES`, `INCLUDE_WORKER`, and `BUILD_WORKER_IMAGE` as env-configurable deploy controls.
- Target files set those exact safety controls: `.env.deploy.algo:15-19` and `.env.deploy.worv:13-17` set `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, and `SKIP_LANGUAGES=true`.

Failure scenario:
`DEPLOY_TARGET=algo SKIP_LANGUAGES=false ./deploy-docker.sh` should either honor the caller override or the script comment should explicitly say target files win. Today the target source overwrites `SKIP_LANGUAGES`, `INCLUDE_WORKER`, and `BUILD_WORKER_IMAGE`, and no test catches the mismatch. The reverse is also risky: an operator trying to force `INCLUDE_WORKER=true` via env will silently get the app-only target default unless they know to use the CLI flag.

Concrete tests:
- Add `tests/unit/infra/deploy-target-env.test.ts` around an extracted `load_deploy_config` helper, or add a small Bats/shell harness that sources only the env-loading helper.
- Test cases:
  - `DEPLOY_TARGET=algo` loads app-only defaults: `SKIP_LANGUAGES=true`, `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `WORKER_HOSTS` present.
  - Caller env overrides every target-defined key, including `SKIP_BUILD`, `SKIP_LANGUAGES`, `LANGUAGE_FILTER`, `INCLUDE_WORKER`, `BUILD_WORKER_IMAGE`, `WORKER_HOSTS`, `COMPILER_RUNNER_URL`, and `E2E_HOME_HEADING`.
  - CLI flags override both target files and caller env, matching `deploy-docker.sh:200-237`.

### TE-2 - The corrected `test.worv.ai` target is not protected by a tracked regression test

Severity: High
Confidence: High

Evidence:
- The current local target file points at the corrected host: `.env.deploy.worv:1-11` uses `REMOTE_HOST=test.worv.ai` and `DOMAIN=test.worv.ai`.
- The docs table matches: `docs/deployment.md:147-153` lists target `worv` with domain `test.worv.ai` and worker `worker.test.worv.ai`.
- But `.gitignore:41-44` ignores `.env.*`, so `.env.deploy.worv` is not a CI-stable fixture. `git ls-files .env.deploy.worv` returns no tracked file.

Failure scenario:
A future local target edit can drift back to the wrong Worv host while all CI remains green, because the actual deploy target file is ignored. Conversely, docs can remain correct while the operator's target file is wrong.

Concrete tests:
- Move non-secret deploy target defaults into a tracked fixture, for example `deploy-targets/worv.env.example` or `deploy-targets.json`, and keep secrets in ignored overlays.
- Add `tests/unit/infra/deploy-targets.test.ts` that asserts:
  - `worv.REMOTE_HOST === "test.worv.ai"`
  - `worv.DOMAIN === "test.worv.ai"`
  - `worv.WORKER_HOSTS` contains `worker.test.worv.ai` and `linux/arm64`
  - `algo` and `worv` are app-only (`INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `SKIP_LANGUAGES=true`)
  - `docs/deployment.md` target table agrees with the tracked target fixture.

### TE-3 - Disk preflight cleanup is untested and only checks `/`, not DockerRootDir

Severity: High
Confidence: High

Evidence:
- `deploy-docker.sh:513-541` implements the app-host pre-build disk guard.
- `deploy-docker.sh:524` defines `_remote_disk_pct()` as `df --output=pcent /`, so only the root filesystem is checked.
- `deploy-docker.sh:526-531` prunes dangling images, builder cache, and BuildKit history when root usage crosses the warning threshold.
- `deploy-docker.sh:535-540` aborts or warns at the hard threshold depending on `SKIP_BUILD`.
- There is no `DockerRootDir` or `docker info --format '{{.DockerRootDir}}'` reference in `deploy-docker.sh` or the tests.

Failure scenario:
On a host where Docker stores layers under a separate mount, `/` can be 50 percent full while DockerRootDir is 95 percent full. The deploy starts no-cache builds, then fails mid-layer and leaves more partial cache. Syntax tests and current source-grep tests do not model this.

Concrete tests:
- Extract the disk guard into a function, for example `preflight_docker_disk_guard <runner> <host-label>`, then add Bats tests with a fake `remote` command log.
- Test cases:
  - Root below threshold and DockerRootDir below threshold: no cleanup.
  - Root below threshold but DockerRootDir above warn: cleanup runs before build.
  - DockerRootDir still above hard and `SKIP_BUILD=false`: function exits nonzero with the "Refusing to build" message.
  - DockerRootDir still above hard and `SKIP_BUILD=true`: warns and continues.
  - Cleanup never calls `docker volume prune`.
- Add a source contract in `tests/unit/infra/deploy-disk-preflight.test.ts` that requires `docker info --format '{{.DockerRootDir}}'` or equivalent, so the Docker storage mount cannot be dropped silently.

### TE-4 - Dedicated worker hosts have no pre-build disk cleanup contract

Severity: High
Confidence: High

Evidence:
- App host disk preflight exists at `deploy-docker.sh:513-541`.
- Dedicated worker deployment starts at `deploy-docker.sh:1146-1158`.
- The worker host build is invoked at `deploy-docker.sh:1199-1201`.
- The only worker-host cleanup is after a successful restart: `deploy-docker.sh:1213-1222`.

Failure scenario:
Worker hosts are the machines most likely to accumulate language and worker image layers. If a worker host is already near-full, `docker build --no-cache` at `deploy-docker.sh:1199-1201` can fail before the post-success cleanup at `deploy-docker.sh:1219-1222` ever runs.

Concrete tests:
- Reuse the disk guard from TE-3 for worker hosts before `run_remote_build "worker ${WHOST}"`.
- Add a Bats test that records fake SSH commands for a worker host and asserts ordering:
  1. worker disk guard queries root and DockerRootDir usage,
  2. safe cleanup runs if usage is high,
  3. `docker build --no-cache` runs only after the guard passes,
  4. hard-threshold failure aborts before rsync/build restart,
  5. no `docker volume prune` runs during pre-build cleanup.
- Add a source-order regression test if a full shell harness is deferred: `worker prebuild cleanup` text must occur before the first `run_remote_build "worker ${WHOST}"`.

### TE-5 - Failed-build cleanup is not tested and is not guaranteed

Severity: High
Confidence: High

Evidence:
- `run_remote_build` captures output and retries only the BuildKit history corruption signature at `deploy-docker.sh:444-469`.
- Generic build failures return `1` at `deploy-docker.sh:468-469`.
- App and language build callers immediately `die` on failure: `deploy-docker.sh:753-774`, `deploy-docker.sh:777-817`.
- Worker build failure also immediately dies: `deploy-docker.sh:1199-1201`.
- The comment at `deploy-docker.sh:822-824` says dangling build images are cleaned after compose up, but that path is not reached when a build fails.

Failure scenario:
A failed PowerShell or language-image build can fill the Docker storage area, then the script aborts before `prune_old_docker_artifacts "app ${REMOTE_HOST}" remote` at `deploy-docker.sh:1230-1237`. The next deploy starts from an even worse disk state.

Concrete tests:
- Extend `run_remote_build` or wrap build callers with `cleanup_after_failed_build <runner> <host-label>`.
- Add tests for:
  - generic build failure calls dangling-only image prune, builder prune, and BuildKit history cleanup before returning nonzero;
  - BuildKit history corruption still runs `docker buildx history rm --all` and retries exactly once;
  - cleanup failure does not mask the original build failure;
  - cleanup does not call `docker volume prune` and does not use `docker image prune -af`.

### TE-6 - Unsafe prune commands are not pinned by tests

Severity: High
Confidence: High

Evidence:
- The safe cleanup helper explicitly documents the May 2026 image-wipe risk at `deploy-docker.sh:375-390`.
- The implementation uses dangling-only image prune at `deploy-docker.sh:409-413`.
- Volume prune is guarded by `db_running` at `deploy-docker.sh:407-418`.
- Existing `deploy-security.test.ts:9-225` does not assert the prune contract. `rg` over tests found no deploy test for `docker image prune -f`, `docker image prune -af`, `docker system prune`, or guarded `docker volume prune`.

Failure scenario:
A future "cleanup improvement" changes `docker image prune -f` to `docker image prune -af` or adds `docker system prune -a --volumes`. The script can wipe every tagged `judge-*` language image or delete the DB volume if containers are stopped, while current tests still pass.

Concrete tests:
- Add `tests/unit/infra/deploy-prune-safety.test.ts`.
- Test cases:
  - `deploy-docker.sh` must not contain `docker image prune -af`.
  - deploy and cleanup scripts must not contain `docker system prune` or `--volumes`.
  - `docker builder prune -af` is explicitly allowlisted because it targets BuildKit cache, not images/volumes.
  - every `docker volume prune -f` in `deploy-docker.sh` appears inside the `if [[ -n "$db_running" ]]` branch of `prune_old_docker_artifacts`.
  - pre-build cleanup blocks may use `docker image prune -f`, `docker builder prune -af`, and `docker buildx history rm --all`, but never volume prune.

### TE-7 - DB/user-data volume safety is partly tested, but deploy ordering is not

Severity: High
Confidence: High

Evidence:
- `tests/unit/infra/pgdata-pinning.test.ts:105-144` protects the compose-level `PGDATA` mount invariant.
- `deploy-docker.sh:848-876` performs the pre-deploy DB backup.
- `deploy-docker.sh:878-916` runs `scripts/pg-volume-safety-check.sh` and fails closed for exit code `1`.
- `deploy-docker.sh:927-928` stops containers only after the safety check block.

Failure scenario:
The compose invariant can remain correct while deploy ordering regresses. If a future edit moves `docker compose down` before `scripts/pg-volume-safety-check.sh`, the script can stop the DB before detecting the anonymous-volume hazard. The existing YAML parser test will stay green because it does not inspect deploy order.

Concrete tests:
- Add `tests/unit/infra/deploy-db-safety-order.test.ts` as a source-order contract:
  - the pre-deploy backup block must appear before `docker compose ... down`;
  - the `pg-volume-safety-check.sh` invocation must appear before `docker compose ... down`;
  - exit code `1` must route to `die`, not `warn`;
  - `AUTO_MIGRATE_ORPHANED_PGDATA=1` must append `--auto-migrate`;
  - `SKIP_PG_VOLUME_CHECK=1` must emit a warning containing "bypass" or "risk".
- If helper extraction is accepted, replace the source-order test with a shell harness that stubs `remote` returning safety exit codes `0`, `1`, `2`, and `64`, then asserts control-flow outcomes.

### TE-8 - Local and CI gates do not expose deploy safety as a named contract

Severity: Medium
Confidence: High

Evidence:
- `package.json:10` defines `lint:bash` as a syntax-only check over `deploy-docker.sh` and `deploy.sh`.
- CI has stronger script syntax coverage at `.github/workflows/ci.yml:234-250`, but still no deploy behavior harness.
- The existing source-grep inventory at `tests/unit/infra/source-grep-inventory.test.ts:54-69` treats deploy tests as intentional, but no named deploy-safety suite tells maintainers what contracts must stay green before deploy-script edits.

Failure scenario:
Deploy-script changes can pass `npm run lint:bash` and broad unit tests while breaking the target-env, disk, prune, or DB-safety contracts above. Because these contracts are spread across general infra tests, reviewers have no obvious "run this before touching deploy-docker.sh" command.

Concrete tests/gates:
- Add a package script:
  - `"test:deploy": "vitest run tests/unit/infra/deploy-*.test.ts"`
- Expand `lint:bash` to include the deployment support scripts checked in CI:
  - `bash -n deploy-docker.sh && bash -n deploy.sh && bash -n deploy-test-backends.sh && bash -n scripts/pg-volume-safety-check.sh && bash -n scripts/docker-disk-cleanup.sh`
- Document in `deploy-docker.sh` or `docs/deployment.md` that deploy-script edits require `npm run lint:bash` and `npm run test:deploy`.

## Highest-ROI Test Plan

1. Extract the target-env and disk/prebuild cleanup decisions from `deploy-docker.sh` into sourceable shell helpers with no SSH side effects.
2. Add Bats or shell-harness tests for env precedence, app-host disk guard, worker-host disk guard, failed-build cleanup, and BuildKit corruption retry.
3. Add lightweight Vitest source-order tests for the DB safety check before compose down, and for forbidden prune commands.
4. Add a tracked deploy target fixture for `worv` so CI can pin `test.worv.ai` and app-only flags.
5. Add `npm run test:deploy` and make deploy-script review plans call it explicitly.

## Verification

No tests were run for this review. This was a static inventory and test-gap review using `rg`, `nl`, and targeted source reads.
