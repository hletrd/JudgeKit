# Debugger Review - review-plan-fix cycle 1/100

Repo: `/Users/hletrd/flash-shared/judgekit`
Reviewer: debugger
Date: 2026-06-30

Scope: latent bugs, edge cases, shell failure behavior, deploy storage checks,
env override order, cleanup safety, and the corrected `test.worv.ai` target.
This was a source-level review only. I did not SSH to any target and did not run
a deploy. Syntax check run: `bash -n deploy-docker.sh
scripts/docker-disk-cleanup.sh scripts/install-docker-disk-cleanup.sh
scripts/deploy-worker.sh scripts/rebuild-worker-language-images.sh
deploy-test-backends.sh deploy.sh` passed.

Worktree note: the repo was already dirty before this pass
(`.context/reviews/code-reviewer.md`, `.context/reviews/critic.md`,
`.context/reviews/perf-reviewer.md`, `.context/reviews/security-reviewer.md`,
`.context/reviews/verifier.md`, `plan/cycle-7-2026-06-28-review-remediation.md`,
and `src/app/api/v1/admin/restore/route.ts`). I only replaced this debugger
artifact.

## Inventory

Review-relevant files inventoried and examined:

- `deploy-docker.sh`: env sourcing, target selection, disk preflight, app/worker
  builds, app-only compose override, migrations, cleanup, nginx, smoke.
- `deploy-test-backends.sh`, `deploy.sh`: legacy/test deploy paths for shell and
  storage comparison.
- `scripts/docker-disk-cleanup.sh`,
  `scripts/install-docker-disk-cleanup.sh`,
  `scripts/pg-volume-safety-check.sh`,
  `scripts/deploy-worker.sh`,
  `scripts/rebuild-worker-language-images.sh`: host cleanup and worker build
  recovery paths.
- `docker-compose.production.yml`, `docker-compose.worker.yml`,
  `docker-compose.test-backends.yml`: DB volume attachment, app runner URL, and
  split worker topology.
- `docs/deployment.md`, `docs/deployment-automation.md`, `AGENTS.md`,
  `CLAUDE.md`, `docs/operator-incident-runbook.md`: operator claims and safety
  rules.
- `playwright.config.ts`, `package.json`,
  `tests/unit/infra/deploy-security.test.ts`,
  `tests/unit/infra/playwright-remote-safety.test.ts`,
  `tests/unit/infra/playwright-profiles.test.ts`: deploy/smoke regression
  coverage.
- Local target env files `.env.deploy*` were inspected with secret values
  redacted. Only non-secret domain/flag line evidence is cited.

Confirmed target note: the active Worv target is corrected to `test.worv.ai` in
the local shortcut (`.env.deploy.worv:10`) and operator docs
(`docs/deployment.md:153`, `docs/deployment-automation.md:19`,
`AGENTS.md:577-579`). I did not find an active deploy shortcut pointing Worv at
the old non-test domain.

## Findings

### D1 - HIGH - Target auth env can be copied from the wrong host and then corrected too late

Confidence: High.

Files/lines:

- `deploy-docker.sh:555-590` generates one local `${SCRIPT_DIR}/.env.production`
  using the current `DOMAIN`.
- `deploy-docker.sh:593-598` reuses that local file unchanged on later deploys.
- `deploy-docker.sh:712-719` copies the existing local `.env.production` to a
  new remote target when the remote file is missing.
- `deploy-docker.sh:1126-1132` starts the app before the later AUTH_URL rewrite.
- `deploy-docker.sh:1251-1252` rewrites remote `AUTH_URL` after containers are
  already running.

Scenario:

An operator first deploys AuraEdu, creating a local `.env.production` with
AuraEdu auth URL and secrets. Later they bootstrap a fresh `DEPLOY_TARGET=worv`
host. Because the remote env is missing, the script copies the old local env to
`test.worv.ai`. The later `sed` changes the file on disk, but the app container
has already started with the old environment, so the running process can keep
stale `AUTH_URL`, tokens, and target-specific secrets until another restart.

Fix:

Generate target env files per target or directly on the remote. Before copying a
local env to a first-time remote, parse it and fail if `AUTH_URL` does not match
the requested `DOMAIN` or `AUTH_URL_OVERRIDE`. Move the `AUTH_URL_TARGET` update
before any `docker compose up`, or restart the app after the rewrite. Add a
source test for "existing local env for target A must not seed target B" and for
"AUTH_URL is finalized before app start".

### D2 - HIGH - Caller env override order is false for topology/build flags

Confidence: High.

Files/lines:

- `deploy-docker.sh:110-117` saves only a small set of caller-provided env vars.
- `deploy-docker.sh:127-136` sources `.env.deploy.${DEPLOY_TARGET}`.
- `deploy-docker.sh:139-146` restores only host/auth URL variables, not
  `SKIP_BUILD`, `SKIP_LANGUAGES`, `LANGUAGE_FILTER`, `INCLUDE_WORKER`,
  `BUILD_WORKER_IMAGE`, `WORKER_HOSTS`, or cleanup flags.
- `deploy-docker.sh:194-208` later consumes whatever values survived sourcing.

Scenario:

The comments say explicit caller env vars still win. They do not for build and
topology flags. For example, `DEPLOY_TARGET=worv SKIP_LANGUAGES=false
./deploy-docker.sh` is overwritten by `.env.deploy.worv` before argument parsing.
That may be desirable for safety on app-only targets, but the current
implementation and comments disagree, which makes recovery commands
unpredictable. Empty overrides also cannot intentionally clear target values
because the restore block only handles non-empty saved values.

Fix:

Choose one policy and encode it explicitly. If target files are authoritative,
say so and provide deliberate CLI escape hatches for dangerous overrides. If
caller env should win, snapshot/restore every documented env var using
`${VAR+x}` so empty overrides can be represented, then add host-level guards for
known app-only targets such as `algo.xylolabs.com`.

### D3 - HIGH - Dedicated worker hosts do not get pre-build storage cleanup

Confidence: High.

Files/lines:

- `deploy-docker.sh:513-541` runs the disk preflight only against the primary app
  host.
- `deploy-docker.sh:1156-1201` rsyncs each `WORKER_HOSTS` entry and starts a
  no-cache `judgekit-judge-worker` build without checking that worker's disk.
- `deploy-docker.sh:1213-1222` cleans the worker host only after build, compose
  restart, and health verification succeed.
- `scripts/rebuild-worker-language-images.sh:94-118` builds the full language
  set first and prunes only after the loop.

Scenario:

`worker.test.worv.ai` is already near full because language images and BuildKit
cache accumulated. The app host passes its preflight, then Step 6c starts a
worker `docker build --no-cache`. The build fails with ENOSPC, leaves partial
BuildKit state, and exits before the worker cleanup path. The next deploy starts
with even less free space and the worker can remain stale or down.

Fix:

Factor the app-host preflight into a reusable `preflight_docker_storage
<host_label> <runner>` helper. Run it before every app-host build phase and
before every `WORKER_HOSTS` build. It should use safe cleanup only: stopped
containers if appropriate, dangling images, builder cache, and BuildKit history;
never volumes. Add a failure cleanup path that runs before `die` when a remote
build fails.

### D4 - MEDIUM - Storage checks inspect `/` percentage only, not Docker's data root or free bytes

Confidence: Medium.

Files/lines:

- `deploy-docker.sh:522-536` uses `df --output=pcent /` for the deploy guard.
- `deploy-docker.sh:777-816` can build selected or all language images, but the
  guard does not scale to selected build scope.
- `scripts/docker-disk-cleanup.sh:30-49` uses the same root-only percentage for
  recurring cleanup.

Scenario:

Docker's data root is on `/mnt/docker` at 91 percent while `/` is at 40 percent.
The deploy says "Remote disk preflight OK" and starts a build that fills the
actual Docker mount. On a small root disk, the reverse can also happen: 84
percent used skips cleanup even though the remaining free space cannot hold an
`all` language build.

Fix:

Ask Docker for `docker info --format '{{.DockerRootDir}}'`, check `df` for that
path, `/`, and `/judge-workspaces` when present. Gate builds on both percent
used and absolute available bytes. Estimate required free space from the build
scope: app-only, worker image, selected language preset, `all`, or
`everything`. Mirror the same target path in the recurring cleanup script.

### D5 - HIGH - Default cleanup can delete detached data volumes

Confidence: High.

Files/lines:

- `deploy-docker.sh:399-417` runs `prune_old_docker_artifacts()`.
- `deploy-docker.sh:407-415` treats a running `judgekit-db` as sufficient proof
  to run host-wide `docker volume prune -f`.
- `docs/deployment.md:244-246` and `docs/deployment.md:274-277` document this
  as routine safe cleanup.
- `scripts/docker-disk-cleanup.sh:4-7` documents the safer recurring posture:
  no volume prune.
- `scripts/pg-volume-safety-check.sh:195-199` explicitly warns that orphaned
  real data can later be garbage-collected by `docker volume prune`.

Scenario:

A failed/manual recovery leaves an old anonymous Postgres volume or renamed
compose-project app data volume detached but still recoverable. A later deploy
starts a new `judgekit-db`, sees it running, then executes `docker volume prune
-f`. Docker removes every unattached volume on the host, not just JudgeKit
scratch artifacts, potentially deleting the only remaining recovery copy.

Fix:

Remove automatic `docker volume prune -f` from deploy cleanup. Keep container
prune, dangling-only image prune, builder cache prune, and BuildKit history
cleanup. If volume cleanup is ever needed, make it a manual runbook with explicit
volume names, dry-run output, recent backup confirmation, and a clear warning
that the command is host-wide.

### D6 - HIGH - `worv` app-only deploy can ignore its target-specific runner URL

Confidence: High.

Files/lines:

- `.env.deploy.worv:21` provides a target-specific `COMPILER_RUNNER_URL`
  (value redacted in this report).
- `deploy-docker.sh:724-727` hardcodes `http://host.docker.internal:3001` for
  every `INCLUDE_WORKER != true` target when the remote key is missing.
- `deploy-docker.sh:636-647` only appends missing literals; it does not replace
  stale defaults.
- `deploy-docker.sh:731-735` warns for `http://judge-worker:3001` but not for
  the wrong `host.docker.internal` value on a split remote target.
- `docker-compose.production.yml:101-108` consumes `COMPILER_RUNNER_URL` but the
  app service does not define a host-gateway mapping there.

Scenario:

`DEPLOY_TARGET=worv ./deploy-docker.sh` correctly deploys the app to
`test.worv.ai`, but a fresh remote env gets the generic host bridge runner URL
instead of the Worv worker URL from the target file. The app starts and public
smoke can pass, while submissions or admin Docker operations fail because the
app container cannot reach the dedicated worker.

Fix:

Use the sourced target value:
`COMPILER_RUNNER_DEFAULT="${COMPILER_RUNNER_URL:-http://host.docker.internal:3001}"`.
For app-only targets, fail closed when no explicit runner URL is present, or
probe `${COMPILER_RUNNER_URL}/health` from inside the app network. Treat
`host.docker.internal` as valid only when the compose service includes a verified
host-gateway mapping for the target.

### D7 - MEDIUM - Worker SSH/rsync command construction is brittle

Confidence: Medium.

Files/lines:

- `deploy-docker.sh:267-270` stores SSH options in a shell string and appends an
  unquoted `-i ${SSH_KEY}`.
- `deploy-docker.sh:1162-1165` lets `WKEY` default from `SSH_KEY`.
- `deploy-docker.sh:1188` embeds `ssh -i ${WKEY} ${SSH_OPTS}` in the rsync
  remote shell string.
- `deploy-docker.sh:1196-1204` uses `ssh -i "${WKEY}" ${SSH_OPTS}` for worker
  build/restart commands.

Scenario:

If a worker entry omits a key while the main deploy uses password auth, `WKEY`
is empty and the rsync remote shell becomes `ssh -i  -o ...`, so `ssh` can treat
the next token as the identity file and fail after the app has already deployed.
If a key path contains whitespace, line 1188 splits it because the rsync `-e`
string is not constructed as an argv array. The same string-based `SSH_OPTS`
pattern makes future quoting changes fragile.

Fix:

Use arrays for local SSH invocations and validate worker auth before app
mutation: require a non-empty readable key for every `WORKER_HOSTS` entry, or add
explicit sshpass support for worker hosts. For rsync, build the remote shell with
properly quoted key paths or a temporary ssh config file.

## Test gaps

- No test asserts that caller env precedence matches the comments in
  `deploy-docker.sh:127-131`.
- No test asserts `AUTH_URL` is updated before app start or that a local env for
  target A cannot seed target B.
- No test fails on automatic `docker volume prune -f` in deploy automation.
- No test verifies `WORKER_HOSTS` receive the same pre-build disk guard as the
  app host.
- No test checks DockerRootDir-aware disk accounting or minimum free bytes.
- No test checks that `.env.deploy.worv`'s target-specific runner URL is used
  when `DEPLOY_TARGET=worv`.

## Overall

The `test.worv.ai` target correction itself is present. The remaining risk is
that target-specific values are either applied too late, overwritten by target
env sourcing in surprising ways, or ignored for app-only runner wiring. The
highest priority fixes are: remove automatic volume pruning, finalize target env
before container start, add worker-host storage preflight, and make target/env
precedence explicit and tested.
