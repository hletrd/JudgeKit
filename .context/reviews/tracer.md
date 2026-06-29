# Tracer Review - Deploy Causal Flow

Scope: review-plan-fix cycle 1/100 tracer pass for the Docker deploy path in
`/Users/hletrd/flash-shared/judgekit`.

Special user TODO: safe disk cleanup before builds on target machines, with no
user data or database loss.

Pre-existing dirty worktree note: this pass did not touch the already-modified
review files, `plan/cycle-7-2026-06-28-review-remediation.md`, or
`src/app/api/v1/admin/restore/route.ts`.

## Inventory

Reviewed as authoritative for the requested causal flow:

- `deploy-docker.sh` - main production deploy orchestrator:
  env sourcing, SSH helpers, disk guard, rsync, image builds, compose lifecycle,
  pre-deploy backup, PG volume safety, migrations, worker-host rebuilds,
  cleanup, nginx, and smoke checks.
- `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`,
  `.env.deploy.auraedu` - target defaults and worker-host routing.
- `scripts/docker-disk-cleanup.sh`,
  `scripts/install-docker-disk-cleanup.sh`,
  `scripts/docker-disk-cleanup.service`,
  `scripts/docker-disk-cleanup.timer` - recurring host cleanup.
- `scripts/pg-volume-safety-check.sh` - PostgreSQL anonymous-volume data-loss
  guard and optional migration helper.
- `scripts/backup-db.sh`, `scripts/verify-db-backup.sh` - scheduled backup and
  backup verification behavior.
- `scripts/rebuild-worker-language-images.sh`,
  `scripts/deploy-worker.sh` - dedicated worker operational scripts.
- `docker-compose.production.yml`, `docker-compose.worker.yml` - runtime
  topology, volumes, health checks, and worker Docker access.
- `CLAUDE.md`, `AGENTS.md` - deploy invariants, especially no production
  `docker system prune --volumes` and app/worker split rules.

Relevant but not individually audited in this tracer pass:

- `docker/Dockerfile.judge-*` - inventoried as build inputs for language images.
  Individual language image correctness was outside this requested flow.
- `Dockerfile`, `Dockerfile.judge-worker`, `Dockerfile.code-similarity`,
  `Dockerfile.rate-limiter-rs` - referenced as build targets through
  `deploy-docker.sh`.

## End-to-End Trace

1. Target env sourcing and flag setup:
   - The script snapshots a limited set of caller-provided variables at
     `deploy-docker.sh:110-117`.
   - It sources `.env.deploy` at `deploy-docker.sh:119-125`.
   - It sources `.env.deploy.$DEPLOY_TARGET` at `deploy-docker.sh:127-136`.
   - It restores only `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN`, SSH credentials,
     and `AUTH_URL_OVERRIDE` at `deploy-docker.sh:139-146`.
   - Deploy behavior flags are then initialized from the current environment at
     `deploy-docker.sh:194-199` and overridden by CLI args at
     `deploy-docker.sh:200-237`.

2. SSH preflight:
   - SSH multiplexing is configured through a private `/tmp` control directory
     at `deploy-docker.sh:267-287`.
   - `_initial_ssh_check` retries only the primary app target at
     `deploy-docker.sh:299-336`.
   - `remote`, `remote_copy`, and `remote_rsync` wrap app-host operations at
     `deploy-docker.sh:338-373`.
   - The preflight verifies local `sshpass` or key presence, local `rsync`,
     primary SSH, and remote Docker at `deploy-docker.sh:493-511`.

3. App-host disk guard:
   - The pre-build guard runs immediately after primary Docker verification at
     `deploy-docker.sh:513-541`.
   - It checks root filesystem usage with `df` at `deploy-docker.sh:522-525`.
   - At or above the warn threshold it runs `docker image prune -f`,
     `docker builder prune -af`, and `docker buildx history rm --all` at
     `deploy-docker.sh:526-531`.
   - It hard-aborts before app-host builds if still at or above the hard
     threshold and `SKIP_BUILD=false` at `deploy-docker.sh:535-536`.
   - This guard is DB-safe because it never prunes volumes and never uses
     `docker image prune -a`.

4. Source sync:
   - The remote app directory is created at `deploy-docker.sh:671-672`.
   - `rsync -az --delete` copies source and excludes local/env/data/test/build
     artifacts at `deploy-docker.sh:674-695`.
   - Legacy escaped route-group directories are removed at
     `deploy-docker.sh:697-710`.
   - Remote `.env.production` is preserved if present and copied only on first
     deploy at `deploy-docker.sh:712-720`.

5. Builds:
   - App-host builds are gated by `SKIP_BUILD` at `deploy-docker.sh:742-819`.
   - The app image uses `docker build --no-cache` at `deploy-docker.sh:753-755`.
   - The local worker image, when enabled, also uses `--no-cache` at
     `deploy-docker.sh:758-762`.
   - Code similarity and rate limiter images are built at
     `deploy-docker.sh:767-775`.
   - Language builds are selected by `LANGUAGE_FILTER` or sequential all-language
     mode at `deploy-docker.sh:777-817`.
   - All remote build commands go through `run_remote_build`, which detects the
     BuildKit "unknown blob ... in history" signature and retries once after
     `docker buildx history rm --all` at `deploy-docker.sh:444-470`.

6. DB backup and safety:
   - Compose config/overrides are prepared at `deploy-docker.sh:829-845`.
   - If `judgekit-db` is running, a pre-deploy custom-format `pg_dump` is
     captured to `~/backups` at `deploy-docker.sh:855-867`; failure aborts
     unless `SKIP_PREDEPLOY_BACKUP=1` at `deploy-docker.sh:868-872`.
   - The anonymous-PGDATA safety check runs before container shutdown at
     `deploy-docker.sh:888-915`.
   - The safety checker detects the old anonymous-volume cluster pattern at
     `scripts/pg-volume-safety-check.sh:112-183` and refuses to migrate without
     filesystem backup at `scripts/pg-volume-safety-check.sh:266-268`.

7. Compose lifecycle and migrations:
   - Existing containers are stopped with `down --remove-orphans` at
     `deploy-docker.sh:927-928`.
   - The DB starts first at `deploy-docker.sh:934-936` and must become healthy
     within 30 seconds at `deploy-docker.sh:938-950`.
   - The idempotent `judge_workers.secret_token` backfill/drop runs directly
     inside `judgekit-db` at `deploy-docker.sh:991-1036`.
   - `drizzle-kit push` runs in a temporary Node container at
     `deploy-docker.sh:1062-1085`; destructive prompt markers abort at
     `deploy-docker.sh:1088-1094`.
   - Additive PostgreSQL repairs and `ANALYZE` run at
     `deploy-docker.sh:1096-1124`.
   - Remaining containers start and app health is checked at
     `deploy-docker.sh:1126-1144`.

8. Dedicated worker-host rebuilds:
   - Worker host entries are processed only after the app is already healthy at
     `deploy-docker.sh:1147-1159`.
   - Each entry is parsed as `host:ssh_key_path:platform` at
     `deploy-docker.sh:1162-1165`.
   - Source is rsynced to each worker at `deploy-docker.sh:1167-1191`.
   - The dedicated worker image is rebuilt with `docker build --no-cache` at
     `deploy-docker.sh:1192-1201`.
   - Worker compose restarts at `deploy-docker.sh:1202-1205`.
   - Worker cleanup runs only after the worker is confirmed up at
     `deploy-docker.sh:1210-1222`.

9. Cleanup:
   - `prune_old_docker_artifacts` prunes stopped containers, dangling images,
     builder cache, and conditionally orphan volumes at `deploy-docker.sh:399-421`.
   - It uses dangling-only `docker image prune -f` at `deploy-docker.sh:409-413`.
   - It runs `docker volume prune -f` only if `judgekit-db` is currently running
     at `deploy-docker.sh:407-417`.
   - App-host post-deploy cleanup is unconditional unless
     `SKIP_POST_DEPLOY_PRUNE` is set at `deploy-docker.sh:1230-1237`.
   - The standalone recurring cleanup script never prunes volumes by design at
     `scripts/docker-disk-cleanup.sh:4-7`; it prunes stopped containers, dangling
     images, and builder cache at `scripts/docker-disk-cleanup.sh:35-47`.
   - The systemd timer runs every six hours with jitter at
     `scripts/docker-disk-cleanup.timer:4-7`.

10. Nginx and smoke:
    - Nginx config generation/installation runs at `deploy-docker.sh:1242-1426`.
    - Local app HTTP verification runs at `deploy-docker.sh:1431-1439`.
    - External HTTPS verification runs when TLS exists at
      `deploy-docker.sh:1441-1448`.
    - Playwright smoke runs against the deployed URL when TLS and local `npx`
      are available at `deploy-docker.sh:1462-1487`.

## Findings

### T1 - High - Dedicated worker hosts have no pre-build disk guard

Evidence:

- The app host has a safe pre-build disk guard at `deploy-docker.sh:513-541`.
- Dedicated worker hosts perform `docker build --no-cache` at
  `deploy-docker.sh:1192-1201`.
- Worker-host cleanup happens only after the worker has restarted and is up at
  `deploy-docker.sh:1210-1222`.

Failure mode:

If a dedicated worker host is already near-full, the no-cache worker build can
fail mid-layer, leave more BuildKit/cache debris behind, and abort at
`deploy-docker.sh:1201` before `prune_old_docker_artifacts` is reached. This is
the same class of failure the app-host guard was added to prevent. It also
directly misses the user TODO: safe disk cleanup before builds on target
machines.

Fix:

Extract a `safe_prebuild_disk_guard <host_label> <runner> <will_build>` helper
from `deploy-docker.sh:513-541` and call it for every worker host before
`deploy-docker.sh:1199-1201`. The helper must:

- Use `docker image prune -f`, never `docker image prune -af`.
- Use `docker builder prune -af` and `docker buildx history rm --all`.
- Never run `docker volume prune` or `docker system prune --volumes`.
- Abort before the no-cache build if root disk remains above the hard threshold.
- Log `df -h /` before and after cleanup.

Do not reuse `prune_old_docker_artifacts` for this pre-build path unless its
volume-prune behavior is disabled; pre-build cleanup must be image/cache only.

Confidence: High.

### T2 - High - `SKIP_BUILD=true` does not skip dedicated worker no-cache builds

Evidence:

- The primary build block is gated by `if [[ "$SKIP_BUILD" == false ]]` at
  `deploy-docker.sh:742-819`.
- The hard-disk warning says `SKIP_BUILD=true` means "no no-cache Docker build
  will start" at `deploy-docker.sh:538-539`.
- The worker-host block is gated only by `WORKER_HOSTS` at
  `deploy-docker.sh:1156`, and still runs `docker build --no-cache` at
  `deploy-docker.sh:1199-1201`.

Failure mode:

An operator can set `SKIP_BUILD=true` specifically to avoid building on a
near-full target. The script may still rebuild every dedicated worker with
`--no-cache`, which can fill a worker host and abort after the app host already
deployed. The log at `deploy-docker.sh:538-539` is therefore false whenever
`WORKER_HOSTS` is non-empty.

Fix:

Gate the worker-host no-cache build behind the same `SKIP_BUILD` contract, or
introduce an explicit `SKIP_WORKER_REBUILD` / `FORCE_WORKER_REBUILD` contract and
update the hard-disk warning. If source sync/restart should still happen when
builds are skipped, split Step 6c into sync, optional build, and restart phases.

Confidence: High.

### T3 - High - No per-target deploy lock allows destructive interleavings

Evidence:

- Source sync deletes and rewrites the shared remote tree at
  `deploy-docker.sh:674-695`.
- Builds tag shared image names such as `judgekit-app:latest` and `judge-*` at
  `deploy-docker.sh:753-813`.
- Compose `down`, DB-only `up`, migrations, and full `up` run at
  `deploy-docker.sh:927-936` and `deploy-docker.sh:1062-1132`.
- Post-deploy cleanup and nginx reload mutate shared host state at
  `deploy-docker.sh:1237` and `deploy-docker.sh:1414-1426`.
- No `flock`, lock directory, or remote deployment mutex exists in the helper or
  preflight section at `deploy-docker.sh:267-511`.

Failure mode:

Two deploys to the same app host can interleave: deploy A syncs code, deploy B
overwrites it, deploy A builds or migrates against B's tree, one deploy runs
`down` while the other is waiting for health, and both race on `:latest` tags and
nginx config. The same issue exists for worker hosts, where concurrent runs can
rsync, build, restart, and prune the same Docker state.

Fix:

Acquire a remote lock before any mutable host operation, for example with
`flock -n /tmp/judgekit-deploy.lock`. Hold it for the whole app-host deploy.
Acquire per-worker locks before worker rsync/build/restart/cleanup. If a lock is
held, fail fast with the owning host label rather than waiting silently.

Confidence: High.

### T4 - Medium - Worker-host preflight is late and key-only

Evidence:

- The normal SSH/Docker preflight validates only `REMOTE_HOST` at
  `deploy-docker.sh:493-511`.
- Worker hosts are not contacted until after app containers are healthy at
  `deploy-docker.sh:1134-1159`.
- Worker SSH commands use `ssh -i "${WKEY}"` at `deploy-docker.sh:1196-1204`;
  rsync uses `-e "ssh -i ${WKEY} ${SSH_OPTS}"` at `deploy-docker.sh:1188`.
- `WKEY` defaults from `SSH_KEY` at `deploy-docker.sh:1163`, but there is no
  fallback for app deployments authenticated only by `SSH_PASSWORD`.

Failure mode:

If `WORKER_HOSTS` contains an unreachable host, a bad key path, an empty key path
from password-auth deployment, or a host without working Docker, the deploy
fails after the app has already been rebuilt, migrated, and restarted. That
creates a split-brain rollout: app code is current, but one or more dedicated
workers are stale or down.

Fix:

Parse and preflight `WORKER_HOSTS` before app builds or before app container
shutdown. Validate the credential mode, run `ssh ... echo ok`, run
`docker info`, check `/home/$WUSER/judgekit` parent and `/judge-workspaces`, and
run the same safe disk guard proposed in T1. Either support `SSH_PASSWORD` for
worker hosts or fail early with a clear "worker key required" message.

Confidence: High.

### T5 - Medium - Caller env override precedence is incomplete

Evidence:

- The script claims target env files are defaults and explicit caller env vars
  win at `deploy-docker.sh:127-131`.
- It snapshots only connection/auth variables at `deploy-docker.sh:110-117`.
- It restores only those variables at `deploy-docker.sh:139-146`.
- Build/deploy behavior flags are initialized after sourcing at
  `deploy-docker.sh:195-199`.
- Target env files define behavior flags, for example
  `.env.deploy.algo:17-19`, `.env.deploy.algo:36`,
  `.env.deploy.worv:15-17`, and `.env.deploy.worv:35`.

Failure mode:

An operator-provided environment override such as `SKIP_BUILD`,
`SKIP_LANGUAGES`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`,
`SKIP_POST_DEPLOY_PRUNE`, `DEPLOY_DISK_WARN_PCT`, or `WORKER_HOSTS` can be
overwritten by `.env.deploy*` before flag initialization. CLI flags still win,
but environment overrides do not reliably follow the documented precedence.

Fix:

Either snapshot/restore all caller-provided deploy behavior variables before
sourcing `.env.deploy*`, or update the documentation to say `.env.deploy*`
overrides shell env except for the restored connection variables. The safer
operator behavior is to make explicit caller env win consistently.

Confidence: Medium.

### T6 - Medium - Pre-deploy `.dump` backups are not verified before retention

Evidence:

- The deploy backup writes a custom-format `pg_dump` named
  `judgekit-predeploy-*.dump` at `deploy-docker.sh:858-864`.
- The retention delete runs immediately after backup success at
  `deploy-docker.sh:865-867`.
- `scripts/verify-db-backup.sh` handles PostgreSQL only for `*.sql.gz` at
  `scripts/verify-db-backup.sh:13-65`; a `.dump` file falls through to the
  SQLite verification path.
- `scripts/backup-db.sh` verifies gzip backups with `gzip -t` at
  `scripts/backup-db.sh:52-57`, but that does not apply to deploy-created
  custom-format dumps.

Failure mode:

The deploy safety net assumes `pg_dump` plus `docker cp` success means the remote
backup is usable. A truncated or otherwise unusable custom dump could still be
the newest file, and retention can delete older dumps immediately afterward.
This weakens the "backup before destructive deploy" guarantee.

Fix:

After `docker cp`, run `pg_restore -l /home/$REMOTE_USER/backups/$BACKUP_NAME`
on the remote host before retention. Extend `scripts/verify-db-backup.sh` to
recognize `*.dump` and verify with `pg_restore -l`, with an optional full restore
path similar to the existing `*.sql.gz` flow.

Confidence: Medium.

### T7 - Medium - Recurring cleanup can race active deploy/build work

Evidence:

- The cleanup timer runs every six hours with up to 15 minutes of jitter at
  `scripts/docker-disk-cleanup.timer:4-7`.
- The service uses low CPU/IO priority at
  `scripts/docker-disk-cleanup.service:10-12`, but no deploy/build lock.
- The cleanup script prunes builder cache at `scripts/docker-disk-cleanup.sh:41-47`.
- Deploy builds run on the same host Docker daemon at `deploy-docker.sh:753-813`
  and `deploy-docker.sh:1199-1201`.

Failure mode:

The cleanup timer can overlap with a live deploy or manual language-image build.
Docker should protect in-use layers, but concurrent builder pruning can still
slow or fail builds and makes incident diagnosis harder. This is especially
relevant around the BuildKit history/cache failure class already documented in
`deploy-docker.sh:423-470`.

Fix:

Use the same host-level lock for deploy and cleanup. The timer can skip when the
deploy lock is held; deploy can skip or wait if cleanup is already running. Keep
the cleanup's no-volume/no-`-a` behavior unchanged.

Confidence: Medium.

## Positive Safety Controls

- `CLAUDE.md:12` explicitly forbids `docker system prune --volumes` on
  production.
- The app-host pre-build disk guard at `deploy-docker.sh:513-541` is correctly
  image/cache/history only.
- The recurring cleanup script explicitly never prunes volumes at
  `scripts/docker-disk-cleanup.sh:4-7`.
- The recurring cleanup uses dangling-only image prune, preserving tagged
  `judge-*` images at `scripts/docker-disk-cleanup.sh:14-21` and
  `scripts/docker-disk-cleanup.sh:38-39`.
- `docker-compose.production.yml:44-55` pins PostgreSQL `PGDATA` to the named
  mounted volume, addressing the prior Postgres 18 anonymous-volume incident.
- `scripts/pg-volume-safety-check.sh:145-183` aborts before deploy when the old
  anonymous-volume data-loss pattern is detected.
- Worker hosts have no database volume in `docker-compose.worker.yml:94-96`, so
  pre-build cleanup there should remain image/cache/container-only and should not
  need volume pruning.

## Safe Cleanup Recommendation for the User TODO

Implement one shared pre-build cleanup primitive and use it before every Docker
build on every target host:

```bash
safe_prebuild_disk_guard <host_label> <runner_fn> <will_build>
```

Required behavior:

- Check `df --output=pcent /`.
- If usage is above `DEPLOY_DISK_WARN_PCT`:
  - run `docker container prune -f --filter "until=24h"` only if desired for
    stopped containers;
  - run `docker image prune -f`;
  - run `docker builder prune -af`;
  - run `docker buildx history rm --all || true`;
  - print `df -h /`.
- If usage is still above `DEPLOY_DISK_HARD_PCT` and a build would run, abort
  before starting the build.
- Never call `docker volume prune`.
- Never call `docker image prune -a`.
- Never call `docker system prune --volumes`.

Call sites:

- Primary app host: replace the inline block at `deploy-docker.sh:513-541`.
- Dedicated worker hosts: call before `deploy-docker.sh:1167-1201`.
- Optional: call in `scripts/rebuild-worker-language-images.sh` before the loop
  at `scripts/rebuild-worker-language-images.sh:92-107`, using the same
  no-volume rules.

This directly addresses the disk-full-before-build failure while preserving the
database and tagged language images.

