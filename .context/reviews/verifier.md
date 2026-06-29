# Verifier review - review-plan-fix cycle 1/100

Scope: evidence-check deploy target resolution, storage preflight, Docker cleanup safety, and dedicated worker-host protection before builds. This is a source-only verification: I did not SSH to production hosts and did not run a deploy. Secrets in `.env.deploy*` were intentionally not copied into this report.

Syntax gate run: `bash -n deploy-docker.sh scripts/deploy-worker.sh scripts/rebuild-worker-language-images.sh scripts/docker-disk-cleanup.sh` passed.

## Inventory

Reviewed files and why they matter:

- `deploy-docker.sh`: primary deploy path, target env sourcing, app-host pre-build disk guard, image builds, post-deploy cleanup, `WORKER_HOSTS` sync/rebuild path.
- `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`, `.env.deploy.auraedu`, `.env.worv`: local target shortcut data. Sensitive values were redacted during review; only safe host/domain/boolean values are cited below.
- `CLAUDE.md`: hard guardrails for `algo.xylolabs.com` topology and destructive Docker cleanup.
- `AGENTS.md`: project deployment hardening claims and operator-facing behavior descriptions.
- `docs/deployment.md`, `docs/deployment-automation.md`, `docs/operator-incident-runbook.md`: docs for target matrix, safe/dangerous cleanup, automatic cleanup, and BuildKit history recovery.
- `scripts/docker-disk-cleanup.sh`, `scripts/docker-disk-cleanup.service`, `scripts/docker-disk-cleanup.timer`, `scripts/install-docker-disk-cleanup.sh`: recurring host cleanup implementation and install path.
- `scripts/deploy-worker.sh`, `scripts/rebuild-worker-language-images.sh`: other worker-host image transfer/build paths.
- `docker-compose.production.yml`, `docker-compose.worker.yml`: container names, DB volume name, worker/proxy topology used by cleanup and worker deployment.

## Confirmed behavior

### 1. `DEPLOY_TARGET=algo|worv|auraedu` resolution mostly works

Evidence:

- `deploy-docker.sh` sources `.env.deploy` first, then sources `.env.deploy.${DEPLOY_TARGET}` when `DEPLOY_TARGET` is set and the file exists: `deploy-docker.sh:119-136`.
- It requires `REMOTE_HOST`, `REMOTE_USER`, and `DOMAIN` after sourcing: `deploy-docker.sh:148-151`.
- `DEPLOY_TARGET=algo` resolves to `REMOTE_HOST=algo.xylolabs.com`, `REMOTE_USER=ubuntu`, `DOMAIN=algo.xylolabs.com`, `SSH_KEY=~/.ssh/xylolabs-algo.pem`: `.env.deploy.algo:7-10`.
- The same file sets the app-only guardrails: `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `SKIP_LANGUAGES=true`: `.env.deploy.algo:17-19`.
- `DEPLOY_TARGET=worv` resolves to `REMOTE_HOST=test.worv.ai`, `REMOTE_USER=ubuntu`, `DOMAIN=test.worv.ai`, `SSH_KEY=~/.ssh/worv-judgekit.pem`: `.env.deploy.worv:8-11`.
- The `worv` target also sets `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `SKIP_LANGUAGES=true`: `.env.deploy.worv:15-17`.
- `DEPLOY_TARGET=auraedu` resolves to `REMOTE_HOST=oj.auraedu.me`, `REMOTE_USER=ubuntu`, `DOMAIN=oj.auraedu.me`, `SSH_KEY=~/.ssh/xylolabs-algo.pem`: `.env.deploy.auraedu:3-6`.
- `auraedu` does not set the worker/language booleans, so deploy defaults apply: `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`: `deploy-docker.sh:195-199`, then `BUILD_WORKER_IMAGE` follows `INCLUDE_WORKER`: `deploy-docker.sh:239-240`.
- This matches the stated `algo` rule: `CLAUDE.md:9-11` says the app server must not build judge/worker images and must use `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`.

Verdict: CONFIRMED for the exact spellings `algo`, `worv`, and `auraedu`.

Confidence: High.

### 2. App-host storage preflight exists before app-host builds

Evidence:

- The script verifies SSH and Docker first: `deploy-docker.sh:506-511`.
- It then reads root filesystem usage using `df --output=pcent /`: `deploy-docker.sh:522-525`.
- If usage is at or above `DEPLOY_DISK_WARN_PCT` default `85`, it runs only safe cleanup: `docker image prune -f`, `docker builder prune -af`, and `docker buildx history rm --all`: `deploy-docker.sh:526-532`.
- It aborts before build when still at or above `DEPLOY_DISK_HARD_PCT` default `92` and `SKIP_BUILD=false`: `deploy-docker.sh:535-536`.
- App/worker/language builds begin later at `deploy-docker.sh:742-817`.

Verdict: CONFIRMED for the app/deploy target host.

Confidence: High.

### 3. Cleanup is intentionally safe for judge images and DB volumes

Evidence:

- `prune_old_docker_artifacts()` skips entirely when `SKIP_POST_DEPLOY_PRUNE` is `1` or `true`: `deploy-docker.sh:399-405`.
- It probes whether `judgekit-db` is running before any volume prune: `deploy-docker.sh:407-408`.
- It uses `docker image prune -f`, not `-af`, preserving tagged `judge-*` language images: `deploy-docker.sh:409-413`; the rationale is documented at `deploy-docker.sh:375-390`.
- It runs `docker volume prune -f` only if `judgekit-db` is running, otherwise it warns and skips volume prune: `deploy-docker.sh:414-418`.
- `docker-compose.production.yml` names the DB container `judgekit-db` and mounts named volume `judgekit-pgdata` at `/var/lib/postgresql/data`: `docker-compose.production.yml:17-19`, `docker-compose.production.yml:44-55`.
- `docs/deployment.md` explicitly classifies `docker image prune -f` as safe, `docker image prune -af` as dangerous for judge images, and `docker volume prune -f` as safe only while `judgekit-db` is running: `docs/deployment.md:236-260`.
- The recurring cleanup script never prunes volumes and uses `docker image prune -f`, never `-af`: `scripts/docker-disk-cleanup.sh:4-7`, `scripts/docker-disk-cleanup.sh:14-20`, `scripts/docker-disk-cleanup.sh:35-47`.

Verdict: CONFIRMED for the code paths reviewed. The helper is safe against the known May 2026 `judge-*` image wipe and Apr 2026 DB-volume wipe classes.

Confidence: High.

## Findings

### V1 - HIGH - Dedicated `WORKER_HOSTS` are not protected by a pre-build disk guard

Evidence:

- Dedicated worker handling starts after the app is already up: `deploy-docker.sh:1126-1144`, then `deploy-docker.sh:1147-1158`.
- For each `WORKER_HOSTS` entry, the script rsyncs source and immediately builds `judgekit-judge-worker:latest` with `docker build --no-cache`: `deploy-docker.sh:1167-1201`.
- The worker block has BuildKit history auto-recovery via `run_remote_build`, but no equivalent of the app-host `_remote_disk_pct` preflight before the worker build: compare app-host guard at `deploy-docker.sh:522-541` with worker build block at `deploy-docker.sh:1156-1201`.
- Worker cleanup runs only after the worker image build succeeds, compose restarts, and the worker is confirmed up: `deploy-docker.sh:1202-1222`.
- If the worker build fails, the script exits at `deploy-docker.sh:1201`; the post-success worker cleanup at `deploy-docker.sh:1222` and app-host cleanup at `deploy-docker.sh:1237` are not reached.
- The docs state cleanup runs on every host touched at the end of deploy: `docs/deployment.md:262-285`. That is true only after successful worker rebuild/restart, not before a risky no-cache worker build.

Scenario:

A dedicated worker host is already at 92% root filesystem usage because previous language-image or worker-image builds left cache/layers behind. `DEPLOY_TARGET=algo` or `DEPLOY_TARGET=worv` has `WORKER_HOSTS` configured, so the app deploy succeeds, then Step 6c starts a no-cache worker image build on the worker. The build fails mid-layer from ENOSPC, leaves more partial BuildKit data, and exits before `prune_old_docker_artifacts` runs on that worker. The next deploy is now more likely to fail, and judging may remain on stale worker code.

Fix:

Factor the app-host disk guard into a reusable helper, for example `preflight_remote_disk <host_label> <runner> <skip_build_bool>`, and call it before `run_remote_build` for every `WORKER_HOSTS` entry. The helper should run the same safe cleanup (`docker image prune -f`, `docker builder prune -af`, `docker buildx history rm --all`), never volumes, and abort before a no-cache worker build if the worker remains above the hard threshold. Also apply the same pattern to `scripts/rebuild-worker-language-images.sh`, whose language loop builds before pruning: `scripts/rebuild-worker-language-images.sh:100-117`.

Confidence: High.

### V2 - MEDIUM - Unknown or alias `DEPLOY_TARGET` silently falls back to `.env.deploy`

Evidence:

- Per-target sourcing is conditional only when `.env.deploy.${DEPLOY_TARGET}` exists: `deploy-docker.sh:132-136`.
- There is no `else` branch that fails when `DEPLOY_TARGET` is set but the matching file is absent.
- Current files include `.env.deploy.algo`, `.env.deploy.worv`, and `.env.deploy.auraedu`, but no `.env.deploy.oj`.
- Docs list the AuraEdu target as "`oj` / AuraEdu": `docs/deployment.md:147-153` and `docs/deployment-automation.md:13-19`.
- `.env.deploy` itself contains default target values, so a misspelled target or `DEPLOY_TARGET=oj` does not fail early; it proceeds with the default file's values: `.env.deploy:4-7`.

Scenario:

An operator follows the docs table and runs `DEPLOY_TARGET=oj ./deploy-docker.sh`, expecting AuraEdu. Because `.env.deploy.oj` does not exist, the script silently uses `.env.deploy` instead. That can deploy to the wrong host/domain pair or run the wrong topology defaults.

Fix:

When `DEPLOY_TARGET` is non-empty and `.env.deploy.${DEPLOY_TARGET}` is missing, abort with a list of available targets. Add an explicit alias for `oj` to `auraedu` if the documented alias is intentional, either via `.env.deploy.oj` or a small case mapping before sourcing.

Confidence: High.

### V3 - MEDIUM - Caller env override comments are not true for build/topology flags

Evidence:

- The comments say explicit caller env vars still win after per-target sourcing: `deploy-docker.sh:127-131`.
- The restoration block only restores `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN`, `SSH_PASSWORD`, `SUDO_PASSWORD`, `SSH_KEY`, and `AUTH_URL_OVERRIDE`: `deploy-docker.sh:139-146`.
- It does not restore caller-provided `SKIP_BUILD`, `SKIP_LANGUAGES`, `LANGUAGE_FILTER`, `INCLUDE_WORKER`, `BUILD_WORKER_IMAGE`, `SKIP_PREDEPLOY_BACKUP`, or `SKIP_POST_DEPLOY_PRUNE`.
- The parser later reads whatever values survived sourcing: `deploy-docker.sh:194-208`.
- For `algo` and `worv`, target files set `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, and `INCLUDE_WORKER=false`: `.env.deploy.algo:17-19`, `.env.deploy.worv:15-17`.

Scenario:

An operator runs `DEPLOY_TARGET=algo SKIP_LANGUAGES=false ./deploy-docker.sh` expecting the env override to win because the script comments say caller env vars take precedence. The target file has already overwritten `SKIP_LANGUAGES` to `true`, and there is no restore for that variable. This happens to protect the `algo` app host, but the code/comment contract is false and can confuse recovery operations.

Fix:

Choose and document one policy. If target guardrails should be non-overridable by env, update the comments and help text to say per-target topology flags are authoritative unless a dedicated CLI escape hatch is added. If caller env should truly win, snapshot and restore all documented env vars, then add explicit protection for `algo` app-server invariants so accidental language/worker builds cannot be enabled without an intentional flag.

Confidence: High.

### V4 - LOW - Storage preflight checks `/` only

Evidence:

- App preflight measures `df --output=pcent /`: `deploy-docker.sh:524`.
- The no-cache Docker builds use Docker's daemon storage, which is usually under `/var/lib/docker` but could be on a separate filesystem.
- Worker workspaces are mounted from `/judge-workspaces`: `docker-compose.production.yml:132-142`, `docker-compose.worker.yml:54-80`, but the deploy preflight does not check that mount.

Scenario:

On a host with Docker data root or `/judge-workspaces` on a separate nearly full mount, `/` can be below the warning threshold while the actual build or judge workspace storage fails from ENOSPC.

Fix:

In the reusable disk preflight helper, check `df` for `/`, Docker's `DockerRootDir` from `docker info`, and `/judge-workspaces` when it exists. Treat the highest usage as the gating value and print each mount in the log.

Confidence: Medium.

## Additional notes

- `scripts/deploy-worker.sh` transfers `judgekit-judge-worker:latest` with `docker save | ssh docker load`, then prunes dangling images after the load: `scripts/deploy-worker.sh:87-93`. It is not a build path, but it can still fail on a full worker host before cleanup. Consider using the same preflight helper or at least a remote `df` guard before `docker load`.
- `scripts/rebuild-worker-language-images.sh` explicitly says the `WORKER_HOSTS` step only rebuilds `judge-worker:latest`, not language images: `scripts/rebuild-worker-language-images.sh:5-9`. Its language image loop builds first and prunes only at the end: `scripts/rebuild-worker-language-images.sh:100-117`, so it has the same pre-build storage-risk class as V1.
- BuildKit history recovery is correctly routed through `run_remote_build` for both app and worker hosts: `deploy-docker.sh:443-469`, `deploy-docker.sh:1193-1201`. That handles the specific `unknown blob ... in history` failure but does not replace disk preflight.

## Overall verdict

The stated `DEPLOY_TARGET=algo|worv|auraedu` behavior is confirmed for exact target names, and cleanup safety is well supported by code and docs. The app host has a real pre-build disk guard. Dedicated worker hosts do not: they are cleaned only after a successful rebuild/restart, which leaves the original disk-full failure mode open on the hosts that accumulate the most judge-worker and language-image artifacts.
