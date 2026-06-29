# Deployment / Storage Review - cycle 1/100

Scope: `deploy-docker.sh`, legacy/auxiliary deploy scripts, Docker compose files, target env files, Docker image management API paths, storage/backup/volume scripts, deployment docs, and tests. Lens: safe target-machine storage handling before builds/deploys, safe Docker cleanup, never deleting DB/user-data volumes, target resolution, per-target env correctness, deployment command safety, and docs/tests drift.

## Findings

### 1. High - bare `deploy-docker.sh` still resolves to a stale/unsafe target mix

**Citations:** `.env.deploy:1-13`, `deploy-docker.sh:119-136`, `deploy-docker.sh:195-199`, `deploy-docker.sh:239-240`, `deploy-docker.sh:753-817`, `CLAUDE.md:9-11`

The base `.env.deploy` says `oj-internal.maum.ai` but sets `REMOTE_HOST=algo.xylolabs.com` and `DOMAIN=oj-internal.maum.ai`, while leaving the integrated-worker defaults active. `deploy-docker.sh` sources `.env.deploy` unconditionally and only sources `.env.deploy.${DEPLOY_TARGET}` when `DEPLOY_TARGET` is set. With no target override, `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, and `BUILD_WORKER_IMAGE=auto -> true`, so the script can build the worker and the full language image set on `algo.xylolabs.com`, directly violating the repo rule that algo is app/DB/nginx only.

**Failure scenario:** an operator runs `./deploy-docker.sh` relying on the checked-in deploy env. The script connects to `algo.xylolabs.com`, configures nginx/AUTH_URL for `oj-internal.maum.ai`, and starts no-cache app/worker/language builds on the app server. This is exactly the storage class that previously filled algo's root filesystem before post-deploy pruning could run.

**Suggested fix:** make `.env.deploy` a non-target template with no `REMOTE_HOST`/`DOMAIN`, or fail closed unless `DEPLOY_TARGET` is one of `algo`, `worv`, `auraedu` or explicit `REMOTE_HOST`/`DOMAIN` are provided. Add a hard deploy-script validation: if `REMOTE_HOST=algo.xylolabs.com`, require `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, and `INCLUDE_WORKER=false` before any Docker build starts. Add a unit/static test that rejects `oj-internal.maum.ai` in active deploy env defaults and asserts the three allowed targets are the only shortcuts.

**Confidence:** High.

### 2. High - dedicated worker builds have no pre-build disk guard

**Citations:** `deploy-docker.sh:513-541`, `deploy-docker.sh:1156-1222`, `.env.deploy.algo:31-36`, `.env.deploy.worv:30-35`

The app host has a pre-build disk guard that prunes dangling images/build cache/history and aborts above the hard threshold. The dedicated worker path configured by `WORKER_HOSTS` does not run that guard before rsyncing, no-cache building `judgekit-judge-worker:latest`, and restarting the worker. Cleanup on the worker only runs after the new worker is proven up.

**Failure scenario:** `worker-0.algo.xylolabs.com` or `worker.test.worv.ai` is already near full from previous BuildKit cache or language-image rebuilds. The app deploy succeeds, then the worker no-cache build fills the worker disk and fails before the post-build prune. The app is now on new code, the worker remains stale or down, and judging fails until manual cleanup.

**Suggested fix:** factor the app-host disk preflight into a reusable function and run it for each `WORKER_HOSTS` entry before rsync/build/restart. It should check the worker's Docker storage filesystem, run only safe cleanup (`docker image prune -f`, `docker builder prune -af`, `docker buildx history rm --all`; no volume prune on worker hosts), and abort before building if still above `DEPLOY_DISK_HARD_PCT`. Add a static test that the `WORKER_HOSTS` loop invokes the same preflight before `docker build --no-cache`.

**Confidence:** High.

### 3. High - admin Docker image builds can start while the target disk is already unsafe

**Citations:** `src/app/api/v1/admin/docker/images/build/route.ts:119-141`, `src/lib/docker/client.ts:504-539`, `judge-worker-rs/src/runner.rs:375-395`, `judge-worker-rs/src/runner.rs:397-416`, `judge-worker-rs/src/runner.rs:659-694`, `judge-worker-rs/src/runner.rs:696-718`, `tests/unit/api/admin-docker-images-build.route.test.ts:224-253`

The language-management build endpoint validates the language/image/Dockerfile and then immediately calls `buildDockerImage`. The TypeScript client forwards to `/docker/build`, and the Rust worker runs `docker build` directly. The worker exposes `/docker/disk-usage`, and the admin image listing displays disk info, but there is no server-side threshold, safe cleanup, or fail-closed check before starting a build. The current tests cover validation and audit behavior, not disk-pressure behavior.

**Failure scenario:** an admin sees a language marked "Not built" and clicks Build while the worker/app host is at 90-95% disk. Building a large image such as Swift, Rust, R, or Haskell fills Docker storage. On an integrated host this can also affect PostgreSQL and app writes; on a dedicated worker it can take judging offline. Because the guard is not server-side, a direct worker API call with the runner token bypasses any UI warning.

**Suggested fix:** enforce disk policy in the build execution path, preferably in the Rust worker before `docker build` so all callers are covered. Use configurable warn/hard thresholds, run the same safe prune sequence once at warn level, then reject the build at hard level with a clear error. The Next.js route can preflight too for better UX, but the worker must be authoritative. Add tests for "build rejected at hard disk threshold" and "safe cleanup attempted once before build".

**Confidence:** High.

### 4. High - split-host runner URL from target env files is ignored on first deploy and never corrected

**Citations:** `.env.deploy.worv:19-21`, `.env.deploy.algo:21-22`, `deploy-docker.sh:722-727`, `deploy-docker.sh:731-736`, `docker-compose.production.yml:101-109`

The split-host target files declare `COMPILER_RUNNER_URL`, with `test.worv.ai` requiring the worker's VPC private IP. After syncing `.env.production`, `deploy-docker.sh` ignores the sourced `COMPILER_RUNNER_URL` and backfills a hardcoded `http://host.docker.internal:3001` whenever `INCLUDE_WORKER!=true`. If the key already exists, `ensure_env_literal` does nothing, so a stale or wrong remote value is only warned about when it equals the local default.

**Failure scenario:** a fresh `DEPLOY_TARGET=worv` app deploy creates a remote `.env.production` without `COMPILER_RUNNER_URL`; the script backfills `host.docker.internal` instead of `http://172.31.62.69:3001`. The app starts healthy but cannot reach the dedicated worker runner, so submissions and Docker image management fail despite the correct `.env.deploy.worv` file.

**Suggested fix:** use the target-provided value: `ensure_env_literal COMPILER_RUNNER_URL "${COMPILER_RUNNER_URL:-http://host.docker.internal:3001}"`. For split-host targets, fail if the resolved value is missing or still equals the local default unless the target explicitly opted into it. Consider updating mismatched remote values for known targets, or at least failing closed with a remediation command. If algo really depends on `host.docker.internal` from inside Linux Docker, add the required `extra_hosts: ["host.docker.internal:host-gateway"]` or switch to a routable worker address.

**Confidence:** High.

### 5. Medium - standalone worker/image rebuild scripts can fill target disks before their safe prune runs

**Citations:** `scripts/rebuild-worker-language-images.sh:92-118`, `docs/judge-worker-incident-runbook.md:106-122`, `scripts/deploy-worker.sh:87-93`, `scripts/deploy-worker.sh:154-161`, `deploy-test-backends.sh:139-142`

The incident runbook recommends `scripts/rebuild-worker-language-images.sh` for rebuilding the full worker language set, but that script pulls/builds each image and only prunes after all builds finish. `scripts/deploy-worker.sh` similarly streams `docker load` and optional language images to the worker before any disk check. `deploy-test-backends.sh` performs a remote app build without the hardened pre-build disk guard used in `deploy-docker.sh`.

**Failure scenario:** a recovery run on a half-full worker tries `LANGUAGE_FILTER=all`; the first large images consume the remaining Docker storage, causing later builds to fail and leaving the host in a worse state. The final prune never recovers enough because the script may exit or the disk may already be full.

**Suggested fix:** share a `safe_docker_disk_preflight` shell helper across these scripts. Run it before any `docker build`, `docker load`, or `--sync-images` loop, and optionally between very large language builds. Document the same thresholds as `deploy-docker.sh`. Add bash/static tests that each build/load entrypoint calls the helper before the first Docker write-heavy operation.

**Confidence:** High.

### 6. Medium - disk checks report `/`, not necessarily Docker's data-root filesystem

**Citations:** `deploy-docker.sh:524`, `scripts/docker-disk-cleanup.sh:30`, `src/lib/docker/client.ts:375-386`, `judge-worker-rs/src/runner.rs:397-416`

Every disk-usage implementation checks `df /`. That is accurate only when Docker's data root lives on the root filesystem. If a target moves Docker to a separate mount, for example `/var/lib/docker` or another `DockerRootDir`, the preflight can pass while the Docker filesystem is already full.

**Failure scenario:** `/` is 45% used but `/var/lib/docker` is 94% used. `deploy-docker.sh` reports the disk preflight as OK and starts a no-cache build, which fails mid-layer and leaves the Docker mount at 100%.

**Suggested fix:** resolve Docker's actual root with `docker info --format '{{.DockerRootDir}}'` and run `df` on that path. Keep `/` as a fallback if Docker info fails. Return both root and Docker-root usage in admin APIs/UI so operators can distinguish app filesystem pressure from Docker storage pressure.

**Confidence:** Medium.

## Verified protections

- Production and test PostgreSQL compose services pin `PGDATA=/var/lib/postgresql/data` on the named volume (`docker-compose.production.yml:44-55`, `docker-compose.test-backends.yml:24-33`), and CI checks that invariant (`.github/workflows/ci.yml:255-262`).
- The main cleanup helper uses dangling-only image prune and skips volume prune unless `judgekit-db` is running (`deploy-docker.sh:399-420`).
- The recurring Docker cleanup script never prunes volumes and uses `docker image prune -f`, not `-af` (`scripts/docker-disk-cleanup.sh:4-21`, `scripts/docker-disk-cleanup.sh:35-47`).
- I found no active `oj.worv.ai` references in code/docs/tests after excluding generated logs/artifacts. The remaining stale target drift is `oj-internal.maum.ai`, especially the active `.env.deploy` default and test-backends defaults.

## Final sweep note

Final sweep covered active deploy scripts, Docker compose files, target env files, backup/volume safety scripts, Docker image management API/worker endpoints, deployment docs, and CI/unit tests. The core data-volume safeguards are present, but build-time storage safety is inconsistent: app-host deploys are guarded, while worker-host builds, admin-triggered image builds, and auxiliary rebuild/load scripts can still start write-heavy Docker operations without a target-side disk preflight.
