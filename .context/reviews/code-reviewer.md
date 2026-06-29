# Code Review - Cycle 1/100

Repo: `/Users/hletrd/flash-shared/judgekit`
Reviewer: code-reviewer
Scope: code quality, logic, SOLID, maintainability, with emphasis on `deploy-docker.sh` storage safeguards, target mapping for `algo` / `worv` / `auraedu`, safe stale Docker cleanup, and the corrected `worv` target (`test.worv.ai`, not `oj.worv.ai`).

## Inventory

Primary deploy and storage files examined:

- `deploy-docker.sh` - target env sourcing, app/worker/image build flow, disk preflight, post-deploy cleanup, dedicated worker host loop.
- `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`, `.env.deploy.auraedu` - target shortcut data and per-target safety flags.
- `CLAUDE.md`, `AGENTS.md` - project-level deploy guardrails, especially algo app-only rules and no unsafe volume pruning.
- `docs/deployment.md`, `docs/deployment-automation.md`, `docs/operator-incident-runbook.md` - operator-facing target mapping and cleanup/runbook semantics.
- `docker-compose.production.yml`, `docker-compose.worker.yml` - DB/user-data volume attachment, app-only worker separation, worker host topology.
- `scripts/docker-disk-cleanup.sh`, `scripts/install-docker-disk-cleanup.sh` - recurring safe cleanup baseline.
- `scripts/pg-volume-safety-check.sh` - anonymous Postgres volume safety detector and its assumptions.
- `scripts/rebuild-worker-language-images.sh`, `scripts/deploy-worker.sh` - worker-side build/deploy paths that can consume Docker storage.
- `tests/unit/infra/deploy-security.test.ts`, `tests/unit/infra/env-generation.test.ts`, `tests/unit/infra/language-inventory.test.ts`, `package.json` - current static deploy invariants and gaps.

Cross-file interactions examined:

- `DEPLOY_TARGET` -> `.env.deploy.${DEPLOY_TARGET}` -> defaults in `deploy-docker.sh` -> actual build behavior.
- `.env.deploy.worv` runner URL -> `ensure_env_literal` -> `docker-compose.production.yml` `COMPILER_RUNNER_URL`.
- `deploy-docker.sh` post-deploy cleanup -> `docs/deployment.md` safe/dangerous operations -> `scripts/docker-disk-cleanup.sh` recurring cleanup -> `scripts/pg-volume-safety-check.sh` orphan-volume assumptions.
- App-host disk preflight -> app image/language image builds -> dedicated `WORKER_HOSTS` rebuild loop.
- Production compose named volumes -> DB backup/safety check -> cleanup behavior.

Verified target mapping note:

- The corrected `worv` target is present in the checked shortcut files: `.env.deploy.worv:8-10`, `docs/deployment.md:151-153`, and `docs/deployment-automation.md:17-19` all point `worv` at `test.worv.ai`. I did not find an active `oj.worv.ai` mapping in the deploy shortcuts.

## Findings

### HIGH - Post-deploy `docker volume prune -f` can delete detached DB/user data volumes

Files/lines:

- `deploy-docker.sh:375-417` documents and runs post-deploy cleanup; `deploy-docker.sh:414-415` invokes `docker volume prune -f` when `judgekit-db` is running.
- `docs/deployment.md:244-246` calls `docker volume prune -f` safe while DB is running; `docs/deployment.md:274-277` documents that deploy cleanup does it.
- `scripts/docker-disk-cleanup.sh:4-7` says the recurring cleanup never prunes volumes.
- `scripts/pg-volume-safety-check.sh:195-199` explicitly notes orphaned real data can later be garbage-collected by `docker volume prune`.
- `AGENTS.md:435` says the deploy preflight and recurring cleanup paths never prune volumes, which is not true for `prune_old_docker_artifacts()`.

Confidence: High.

Why this is a problem:

The guard only proves the currently running `judgekit-db` container has its currently attached volume protected. It does not prove every detached Docker volume is disposable. That distinction matters in this repo because the documented April 2026 failure class involved real Postgres data sitting in an anonymous volume. If the old container is already gone, renamed, or stopped before this script can inspect it, `scripts/pg-volume-safety-check.sh` cannot identify the attachment, but `docker volume prune -f` can still delete the detached volume once the new DB container is running.

Failure scenario:

A failed or manual recovery deploy leaves the old anonymous Postgres data volume detached but still recoverable. The next deploy starts a fresh `judgekit-db`, sees `db_running` as non-empty, then runs `docker volume prune -f`. Docker removes the detached anonymous volume containing the only recoverable copy of users/problems/submissions. The same risk applies to user-upload or app-data volumes detached by a compose/project rename.

Suggested fix:

Remove `docker volume prune -f` from `prune_old_docker_artifacts()` entirely. Keep deploy cleanup to stopped containers, dangling images, BuildKit cache, and BuildKit history metadata. If volume cleanup is ever needed, make it a separate manual operator command with explicit volume names, dry-run output, and a backup/confirmation checklist. Update `docs/deployment.md`, `docs/deployment-automation.md`, and `AGENTS.md` to match the recurring cleanup rule: no automatic volume pruning. Add a static test that rejects `docker volume prune` and `docker system prune --volumes` in deploy/cleanup automation.

### HIGH - `worv` app-only deploy ignores its target-specific runner URL

Files/lines:

- `.env.deploy.worv:19-21` declares `COMPILER_RUNNER_URL=http://172.31.62.69:3001`.
- `deploy-docker.sh:724-726` ignores that variable and always uses `http://host.docker.internal:3001` for app-only targets.
- `deploy-docker.sh:636-647` only appends a literal if the key is missing; it does not correct an existing stale or wrong value.
- `deploy-docker.sh:731-735` only warns for the local `http://judge-worker:3001` default, not for the wrong `host.docker.internal` value on `worv`.
- `.env.deploy.algo:21-22` is the target where `host.docker.internal` is intentional.

Confidence: High.

Why this is a problem:

The target file says the `worv` app reaches the worker over the VPC private IP, but the deploy script backfills the algo-style host bridge URL for every `INCLUDE_WORKER=false` target. On a fresh `DEPLOY_TARGET=worv` deploy, the remote `.env.production` will get the wrong runner URL unless it already had a manually corrected value. If it already has a stale wrong value, the helper will preserve it.

Failure scenario:

An operator deploys `DEPLOY_TARGET=worv ./deploy-docker.sh` to the corrected `test.worv.ai` host. The app starts successfully, but submissions fail because the app container calls `http://host.docker.internal:3001` instead of `http://172.31.62.69:3001`. The warning does not fire because the value is not `http://judge-worker:3001`.

Suggested fix:

Use the sourced target value: `COMPILER_RUNNER_DEFAULT="${COMPILER_RUNNER_URL:-http://host.docker.internal:3001}"`. For app-only targets, update `COMPILER_RUNNER_URL` when the target profile provides an explicit value, or at least replace known defaults (`http://judge-worker:3001`, `http://host.docker.internal:3001`) when they conflict with the target file. Consider failing closed when `INCLUDE_WORKER=false` and no explicit `COMPILER_RUNNER_URL` is present for non-algo targets. Add a test that parses `.env.deploy.worv` and asserts deploy backfill uses the private-IP value.

### HIGH - Unknown or missing `DEPLOY_TARGET` can silently deploy with unsafe algo defaults

Files/lines:

- `deploy-docker.sh:119-135` sources `.env.deploy` first, then sources `.env.deploy.${DEPLOY_TARGET}` only if that file exists; there is no failure for an unknown target.
- `.env.deploy:1-13` points at `REMOTE_HOST=algo.xylolabs.com` and `DOMAIN=oj-internal.maum.ai` but does not set `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, or `SKIP_LANGUAGES=true`.
- `deploy-docker.sh:196-199` defaults `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, and `BUILD_WORKER_IMAGE=auto`.
- `deploy-docker.sh:758-816` builds the worker image and language images when those defaults remain active.
- `CLAUDE.md:9-11` explicitly says `algo.xylolabs.com` must be app/DB/nginx only and must not build judge/worker images.
- `.env.deploy.algo:15-19` has the correct algo app-only safeguards.
- `docs/deployment.md:147-153` and `docs/deployment-automation.md:15-19` advertise target shortcuts including `oj` / AuraEdu, `algo`, and `worv`; the repository has `.env.deploy.auraedu` but no `.env.deploy.oj` alias.

Confidence: High.

Why this is a problem:

The script has two footguns in the target selection path: a bare deploy uses `.env.deploy`, and an unknown `DEPLOY_TARGET` is silently ignored. Because `.env.deploy` currently points at `algo.xylolabs.com` without algo's safety flags, either mistake can run a full integrated build on the app server. That violates the architecture rule and directly risks filling target storage before the operator realizes the wrong target profile was used.

Failure scenario:

An operator types `DEPLOY_TARGET=oj ./deploy-docker.sh` after reading the docs table, or mistypes `DEPLOY_TARGET=wrvo`. No matching `.env.deploy.<target>` file is loaded. The script falls back to `.env.deploy`, reaches `algo.xylolabs.com`, and starts building `judgekit-judge-worker` plus the all-language image set on the app host.

Suggested fix:

Make target resolution explicit and fail closed. If `DEPLOY_TARGET` is set and `.env.deploy.${DEPLOY_TARGET}` does not exist, abort before SSH. Add either `.env.deploy.oj` as an alias to AuraEdu or normalize `DEPLOY_TARGET=oj` to `auraedu`. Consider making `.env.deploy` a non-host placeholder, or require either a known `DEPLOY_TARGET` or explicit `REMOTE_HOST`/`DOMAIN` without loading live defaults. Add a host-level guard: if `REMOTE_HOST=algo.xylolabs.com`, enforce or abort unless `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, and `INCLUDE_WORKER=false`.

### HIGH - Dedicated worker builds do not get the pre-build disk guard

Files/lines:

- `deploy-docker.sh:513-541` runs the disk preflight only on the app/primary remote host.
- `deploy-docker.sh:1156-1201` rsyncs to each `WORKER_HOSTS` entry and runs a no-cache worker image build without a prior disk check.
- `deploy-docker.sh:1213-1222` cleans the worker only after the worker build/restart succeeds; a failed build exits before this cleanup path.
- `scripts/rebuild-worker-language-images.sh:53` defaults to the full `all` language set; `scripts/rebuild-worker-language-images.sh:94-118` builds every language and only prunes after the loop.

Confidence: High.

Why this is a problem:

The hosts most likely to run out of Docker storage are the dedicated workers, because they hold language images and receive no-cache worker rebuilds. The app host gets a pre-build cleanup and hard-stop threshold, but the worker host loop starts building first and only prunes after success. If a worker is already near full, the deploy can fill it further, fail before cleanup, and leave the worker host in a worse state.

Failure scenario:

`worker.test.worv.ai` is at 90 percent because language image layers and BuildKit cache accumulated. The app deploy passes its disk preflight. The `WORKER_HOSTS` step starts `docker build --no-cache` on the worker, fills `/var/lib/docker`, fails, and aborts before `prune_old_docker_artifacts "worker ..."` runs. Judging capacity is degraded and manual cleanup is required.

Suggested fix:

Factor the app-host disk guard into a reusable `preflight_docker_storage <host_label> <runner>` helper and call it before every worker build. It should run the same safe cleanup set (dangling images, builder cache, BuildKit history; no volumes), then abort before build if still over threshold or below required free bytes. Add a failure trap around worker builds that attempts the same safe cleanup before `die`. Apply the same guard to `scripts/rebuild-worker-language-images.sh`, where the default `all` build is much larger than a worker image rebuild.

### MEDIUM - Storage guard checks root percentage only, not Docker's actual data root or required free bytes

Files/lines:

- `deploy-docker.sh:522-536` calculates disk usage with `df --output=pcent /` only.
- `deploy-docker.sh:777-816` can build selected or all language images, but the guard does not scale required free space to the selected build scope.
- `scripts/docker-disk-cleanup.sh:30-49` uses the same root-only percentage check for recurring cleanup.

Confidence: Medium.

Why this is a problem:

Docker storage is not guaranteed to live on `/`, and percentage-only thresholds do not answer whether the selected build can fit. A 40 GB host at 84 percent has only about 6 GB free but skips cleanup because it is below the default 85 percent warning threshold. Conversely, a host can have `/` mostly empty while `/var/lib/docker` or a custom Docker root is nearly full.

Failure scenario:

Docker's root dir is mounted separately at `/mnt/docker` and is 91 percent full, while `/` is 40 percent full. The deploy preflight reports OK and starts a language build, which fails mid-layer after filling Docker's data mount. Or an integrated AuraEdu all-language build starts on a small root filesystem at 84 percent and exhausts the remaining space.

Suggested fix:

Query Docker's root with `docker info --format '{{.DockerRootDir}}'` and run `df` against that path, plus any build workspace paths that matter (`REMOTE_DIR`, `/tmp` if BuildKit uses it). Add a minimum available-bytes check keyed to build scope: app-only, worker image, selected languages, all languages, and `everything`. The recurring cleanup script should use the Docker root filesystem for its threshold, not only `/`.

## Test Gaps

- No static test rejects `docker volume prune` in `deploy-docker.sh`; current tests only guard some security defaults in `tests/unit/infra/deploy-security.test.ts`.
- No test exercises `DEPLOY_TARGET` resolution or unknown-target failure.
- No test asserts `.env.deploy.worv`'s `COMPILER_RUNNER_URL` is propagated into remote `.env.production`.
- No test checks that worker-host builds receive the same disk preflight as the app host.
- No test checks DockerRootDir-aware disk accounting or free-byte thresholds.

## Overall Recommendation

Fix the volume-prune issue first because it is the only finding with a direct data-loss path. Then fix target resolution and target-specific runner URL propagation before the next `worv` or `algo` deploy. The worker-host and DockerRootDir storage guards should be handled in the same deploy-script pass so every build path gets the same safe cleanup and fail-closed behavior.
