# Critic - Review-plan-fix Cycle 1/100

Repo: `/Users/hletrd/flash-shared/judgekit`
Date: 2026-06-30
Verdict: REVISE

This pass focused on the deploy/change surface rather than a feature diff. I found no reason to doubt the intent of the recent hardening work, but several safeguards are still lexical or opt-in while the production topology depends on operators choosing the exact right path.

Note: the worktree was already dirty before this critic pass (`plan/cycle-7-2026-06-28-review-remediation.md`, `src/app/api/v1/admin/restore/route.ts`). I did not inspect or change those as authoritative committed state.

## Inventory Reviewed

- Deployment orchestration: `deploy-docker.sh`, `deploy.sh`, `.github/workflows/ci.yml`, `.github/workflows/cd.yml`, `docs/deployment-automation.md`, `docs/deployment.md`.
- Runtime topology: `docker-compose.production.yml`, `docker-compose.worker.yml`, `docker-compose.test-backends.yml`, `Dockerfile*`, `docker/Dockerfile.judge-*`.
- Worker and Docker control plane: `judge-worker-rs/src/runner.rs`, `judge-worker-rs/src/config.rs`, `judge-worker-rs/src/api.rs`, `judge-worker-rs/src/docker.rs`, `src/lib/docker/client.ts`, `src/app/api/v1/admin/docker/images/build/route.ts`.
- Compiler/runner path: `src/lib/compiler/execute.ts`, `docker-compose.production.yml`, `docker-compose.worker.yml`.
- Migration and data safety: `drizzle/pg/**`, `scripts/check-migration-drift.sh`, `scripts/pg-volume-safety-check.sh`, `package.json`, deploy migration block.
- Cleanup and disk safety: `scripts/docker-disk-cleanup.sh`, `scripts/install-docker-disk-cleanup.sh`, deploy preflight and post-deploy prune helpers.
- Operator docs and prior review plans: `CLAUDE.md`, `AGENTS.md`, `.context/plans/2026-06-20-cycle-1-review-remediation.md`, `plan/cycle-3-2026-06-27-review-remediation.md`, `.context/reviews/_aggregate.md`.
- Test coverage relevant to this surface: `tests/unit/infra/deploy-security.test.ts`, `tests/unit/deployment-automation-docs.test.ts`, `tests/unit/infra/language-inventory.test.ts`, `tests/unit/docker/client.test.ts`, `tests/unit/compiler/execute-implementation.test.ts`.

## Findings

### C1-H1 - First-time deploy can copy the wrong target's `.env.production`

Severity: High
Confidence: High
Perspective: release engineering, incident recovery, target-specific config

Evidence:
- The deploy script generates one local `${SCRIPT_DIR}/.env.production` only if it is absent, including `AUTH_URL` from the current `DOMAIN` and fresh secrets at `deploy-docker.sh:555-590`.
- If the local file already exists, the script only chmods it and logs "Using existing .env.production" at `deploy-docker.sh:593-598`.
- For a remote target that does not yet have an env file, the script copies that existing local file verbatim at `deploy-docker.sh:712-719`, while the comment says each target has its own `AUTH_SECRET`, `JUDGE_AUTH_TOKEN`, and `AUTH_URL` at `deploy-docker.sh:712-714`.
- The documented baseline encourages a generic multi-target command, `REMOTE_HOST=... REMOTE_USER=... DOMAIN=... SSH_KEY=... ./deploy-docker.sh`, at `docs/deployment-automation.md:7-11`.

Scenario:
An operator deploys `oj.auraedu.me`, creating local `.env.production` with `AUTH_URL=https://oj.auraedu.me`. Later they bootstrap a fresh `algo.xylolabs.com` or `test.worv.ai` host from the same checkout. Because the local env already exists and the remote env is missing, the second host receives the first host's auth URL and secrets. Auth callbacks, cookie trust, worker tokens, monitoring tokens, and sidecar auth are then cross-target by accident.

Fix:
Generate first-deploy env files per target, not per checkout. Either generate directly on the remote from the current `DOMAIN`, or require `.env.production.${DEPLOY_TARGET}` / `.env.deploy.${DEPLOY_TARGET}` and fail closed when the target env is absent. Before any first-time copy, parse the local env and abort if `AUTH_URL` does not match the requested `DOMAIN` or `AUTH_URL_OVERRIDE`. Add a source/behavior test for "existing local env for target A must not be copied to target B".

### C1-H2 - App-only deploy backfills an unreachable runner URL and then fails to warn

Severity: High
Confidence: High
Perspective: app/worker split topology, admin operations, prior-plan gap

Evidence:
- When `INCLUDE_WORKER != true`, the deploy script backfills `COMPILER_RUNNER_URL=http://host.docker.internal:3001` at `deploy-docker.sh:724-726`.
- The follow-up warning only catches an unset URL or the old local compose default `http://judge-worker:3001` at `deploy-docker.sh:731-736`; it does not flag `host.docker.internal`.
- The production app compose block sets `COMPILER_RUNNER_URL` but does not add an `extra_hosts: host.docker.internal:host-gateway` mapping in the app service block at `docker-compose.production.yml:95-109`.
- A prior plan already named the correct exit criterion: replace the synthesized `host.docker.internal` URL with an explicit external runner requirement or a verified host-gateway mapping and smoke check at `.context/plans/2026-06-20-cycle-1-review-remediation.md:81-85`.

Scenario:
`algo.xylolabs.com` is deployed app-only. The app container gets `COMPILER_RUNNER_URL=http://host.docker.internal:3001`, but Linux Docker does not guarantee that hostname unless configured. The app starts, the landing-page smoke passes, but `/api/v1/compiler/run` and admin Docker management later fail with runner-unavailable errors.

Fix:
For app-only deploys, require an explicit `COMPILER_RUNNER_URL` and run a pre-start or post-start health probe against `${COMPILER_RUNNER_URL}/health` from inside the app container. If the intended topology is a host bridge, add `extra_hosts: ["host.docker.internal:host-gateway"]` and test it. The warning should treat `host.docker.internal` as unsafe unless the mapping exists.

### C1-H3 - The `algo.xylolabs.com` app-only rule is still opt-in

Severity: High
Confidence: High
Perspective: operator footgun, target-specific deploy safety

Evidence:
- `CLAUDE.md` says `algo.xylolabs.com` is app server only and must use `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, and `INCLUDE_WORKER=false` at `CLAUDE.md:7-12`.
- `deploy-docker.sh` sources `.env.deploy.${DEPLOY_TARGET}` only when `DEPLOY_TARGET` is set at `deploy-docker.sh:127-136`.
- Without that opt-in, defaults remain `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, and `BUILD_WORKER_IMAGE=auto` at `deploy-docker.sh:195-199`, with `auto` becoming the value of `INCLUDE_WORKER` at `deploy-docker.sh:239-241`.
- The operator docs still show direct `REMOTE_HOST=...` invocation rather than the safer `DEPLOY_TARGET=algo` path at `docs/deployment-automation.md:7-11`; the disabled CD message repeats the direct form at `.github/workflows/cd.yml:45-47`.
- Cycle 3 only planned the `DEPLOY_TARGET=algo ./deploy-docker.sh` safety path, not hostname inference or hard failure for direct commands, at `plan/cycle-3-2026-06-27-review-remediation.md:64-68`.

Scenario:
During an incident, an operator follows the documented direct command with `REMOTE_HOST=algo.xylolabs.com` and no `DEPLOY_TARGET`. The script builds language images and a local worker on the app host, violating the production topology and risking another disk-pressure incident on the DB/app server.

Fix:
Fail closed when `REMOTE_HOST` or `DOMAIN` matches `algo.xylolabs.com` and the three app-only flags are not set, unless an explicit override such as `ALLOW_ALGO_LOCAL_WORKER=1` is provided. Update docs and CD guidance to show `DEPLOY_TARGET=algo`, not raw `REMOTE_HOST`, for known targets. Add a source test for the hostname guard.

### C1-H4 - `WORKER_HOSTS` deploys rebuild worker code but not language images

Severity: High
Confidence: High
Perspective: worker fleet consistency, language rollout, correctness

Evidence:
- The dedicated worker step is described as syncing code and rebuilding the judge-worker image at `deploy-docker.sh:1147-1154`.
- The actual remote commands only build `judgekit-judge-worker:latest` and restart `docker-compose.worker.yml` at `deploy-docker.sh:1199-1205`.
- A nearby comment says worker hosts accumulate stale images because "judge-worker + every language image is rebuilt --no-cache here" at `deploy-docker.sh:1213-1216`, but no language build exists in that step.
- The recovery helper explicitly documents the gap: `deploy-docker.sh WORKER_HOSTS step only rebuilds judge-worker:latest; it never builds the language images` at `scripts/rebuild-worker-language-images.sh:5-9`.
- Dedicated worker compose lists local judge language images as a prerequisite at `docker-compose.worker.yml:10-15`.
- Language config changes take effect immediately from the database without worker redeploy, per `AGENTS.md:158-162`.

Scenario:
A Dockerfile fix or new language config is deployed to the app, `languages:sync` updates DB rows, and `WORKER_HOSTS` refreshes only the Rust worker image. New submissions are claimed by a dedicated worker whose local `judge-*` image is stale or missing. The failure appears as compile/runtime errors even though the app-side language config is correct.

Fix:
Make worker-host language image handling explicit. Options: add `WORKER_LANGUAGE_FILTER=none|core|all|everything` and invoke the same sequential build loop on each `WORKER_HOSTS` entry; or fail with a clear message when language definitions or Dockerfiles changed and no worker language rebuild was requested. Remove the false comment at `deploy-docker.sh:1213-1216`. Add a test that `WORKER_HOSTS` either builds selected language images or loudly documents that it will not.

### C1-H5 - Admin Docker build capability is advertised even when the worker proxy blocks builds

Severity: High
Confidence: High
Perspective: admin UX, Docker control-plane truthfulness, docs drift

Evidence:
- App capability detection returns `canBuild: true` for any configured worker API at `src/lib/docker/client.ts:120-127`.
- The admin build route trusts that capability before invoking `buildDockerImage` at `src/app/api/v1/admin/docker/images/build/route.ts:23-39` and `src/app/api/v1/admin/docker/images/build/route.ts:119-141`.
- Remote builds call the runner's `/docker/build` endpoint at `src/lib/docker/client.ts:532-540`.
- The Rust runner exposes `/docker/build` at `judge-worker-rs/src/runner.rs:1012-1021` and shells out to `docker build` at `judge-worker-rs/src/runner.rs:375-387`.
- Dedicated worker compose hardcodes `BUILD=0` for the docker-socket-proxy at `docker-compose.worker.yml:37-40`.
- The docs say operators can opt into image/build management with `WORKER_DOCKER_PROXY_BUILD=1` at `docs/judge-workers.md:95-102`, but the compose file ignores that variable. The tests also pin hardcoded `BUILD=0` while only asserting the docs mention `WORKER_DOCKER_PROXY_IMAGES`, not `WORKER_DOCKER_PROXY_BUILD`, at `tests/unit/infra/deploy-security.test.ts:175-193`.

Scenario:
An admin sees the language UI build button in a split app/worker deployment. The app believes build is available, sends `/docker/build`, and the worker's docker CLI receives a proxy 403 because BUILD is disabled. The UI reports a generic build failure after consuming operator time and possibly leaving partial build cache.

Fix:
Expose a runner `/docker/capabilities` endpoint that reflects actual proxy permissions, or configure the worker proxy with `BUILD=${WORKER_DOCKER_PROXY_BUILD:-0}` and make the app capability depend on that negotiated value. Align `docs/judge-workers.md`, `docker-compose.worker.yml`, and `deploy-security.test.ts` so there is one truthful contract. If builds must stay disabled by default, the admin UI should show list/remove only and hide build.

### C1-M1 - Production migrations install unpinned tooling at deploy time

Severity: Medium
Confidence: High
Perspective: reproducibility, supply chain, migration correctness

Evidence:
- The production migration block runs `docker run node:24-alpine` and then `npm install --no-save drizzle-kit drizzle-orm nanoid ... && npx drizzle-kit push` at `deploy-docker.sh:1079-1084`.
- The repo has pinned scripts expecting local project tooling, for example `db:push` and `db:check` at `package.json:15-19`, and `drizzle-kit` is a declared dev dependency at `package.json:102`.

Scenario:
`drizzle-kit` releases a behavior change after CI passed. A later production deploy resolves the newer package inside the temporary container and produces a different schema diff or different destructive prompt text than CI saw. The deploy either mutates the DB unexpectedly or misses the prompt scanner's assumptions.

Fix:
Run migrations with the repo lockfile, not live package resolution. Prefer using the already-built app image or `npm ci --ignore-scripts` against `package-lock.json` in an isolated temp volume. If startup time is a concern, use `npm exec --package=drizzle-kit@<locked> --package=drizzle-orm@<locked>` with versions derived from `package-lock.json`, and add a test that rejects unversioned `npm install --no-save drizzle-kit`.

### C1-M2 - Disk guards and disk UI check `/`, not Docker's data root

Severity: Medium
Confidence: Medium
Perspective: SRE, capacity planning, operator UI

Evidence:
- Deploy preflight reads `df --output=pcent /` at `deploy-docker.sh:524`.
- Recurring cleanup uses the same root filesystem assumption at `scripts/docker-disk-cleanup.sh:30` and reports `df -h /` at `scripts/docker-disk-cleanup.sh:49`.
- App-side Docker disk usage also runs `df -h /` locally at `src/lib/docker/client.ts:375-389`.
- Worker-side disk usage runs `df -h /` at `judge-worker-rs/src/runner.rs:397-409`.

Scenario:
A production host moves Docker's data root to `/var/lib/docker` on a separate mount, or a cloud image mounts `/var` separately. Root `/` stays under 50 percent while Docker's mount is 95 percent full. The deploy guard passes, the admin language page looks safe, and the next image build fails mid-layer.

Fix:
Resolve Docker's data root with `docker info --format '{{.DockerRootDir}}'`, run `df` against that path, and include both root and Docker-root values in API responses and deploy logs. Keep `/` as a fallback only when Docker info fails. Add unit/source tests that the disk helpers do not hardcode only `/`.

### C1-M3 - Tests cover strings, not deploy behavior

Severity: Medium
Confidence: High
Perspective: test engineering, regression prevention

Evidence:
- CI syntax-checks deploy scripts with `bash -n` at `.github/workflows/ci.yml:246-250`.
- The app-only compose test asserts that certain strings exist at `tests/unit/infra/deploy-security.test.ts:134-143`; it does not execute the target-mode decision tree.
- Dockerfile validation checks only a small selected image set at `.github/workflows/ci.yml:192-224`.
- Function-judging harness tests explicitly skip missing compilers/runtimes and "never fail" when toolchains are absent at `.github/workflows/ci.yml:104-114`.

Scenario:
The `host.docker.internal` app-only default, direct `REMOTE_HOST=algo` unsafe path, and worker build-capability mismatch all pass current CI because the tests check for existence of safety strings rather than running the deploy script with mocked `remote`, `remote_rsync`, and target env combinations.

Fix:
Refactor `deploy-docker.sh` enough to support a dry-run/mocked mode, or add Bats/ShellSpec tests that stub `remote`, `remote_copy`, and Docker commands. Minimum cases: `DEPLOY_TARGET=algo`, direct `REMOTE_HOST=algo.xylolabs.com`, first-time remote env with existing local env, `INCLUDE_WORKER=false` runner URL, and `WORKER_HOSTS` language rebuild policy. For Dockerfiles, add a generated matrix or nightly `docker build --check` over every `docker/Dockerfile.judge-*` changed in the PR.

### C1-L1 - Language image docs and inventory tests disagree on "full" image sets

Severity: Low
Confidence: High
Perspective: documentation, operator capacity estimates

Evidence:
- `docs/languages.md` says "102 of 102 images build on ARM64" at `docs/languages.md:190-193`.
- The same doc says `LANGUAGE_FILTER=everything` builds "the full 99 set" at `docs/languages.md:242-248`.
- `deploy-docker.sh` defines 81 `ALL_LANGS` plus 18 `ARM_PROHIBITIVE_LANGS`, so `everything` is 99 entries at `deploy-docker.sh:175-189`.
- The language inventory test only compares images referenced by `src/lib/judge/languages.ts` against deploy/setup presets at `tests/unit/infra/language-inventory.test.ts:18-44`; it does not compare the docs' 102/99 claims or orphan Dockerfiles.

Scenario:
An operator planning disk for a full rebuild sees 102 image support in one section and 99 in another. Orphan Dockerfiles can break silently because they are outside the source-referenced inventory test, while docs still count them as build-supported.

Fix:
Choose one inventory definition: source-referenced runtime images, or every Dockerfile in `docker/`. Generate `docs/languages.md` counts from that definition and add a test that docs counts match. If orphan Dockerfiles such as experimental languages are intentionally preserved, list them in a "not runtime-enabled" section and exclude them from ARM build claims.

## Cross-Cutting Critique

- Prior plans often close the narrow code edit while leaving the operator path open. Example: cycle 3 made `DEPLOY_TARGET=algo` safe, but direct documented `REMOTE_HOST=algo.xylolabs.com` remains unsafe.
- Split app/worker topology is under-specified. `WORKER_HOSTS`, `COMPILER_RUNNER_URL`, worker proxy permissions, and language image freshness are four separate knobs with no single validated target contract.
- The admin Docker UI is ahead of the deployment guarantees. It exposes build/remove concepts, but actual build capability depends on runner reachability and docker-socket-proxy permissions the app does not probe.
- Several safety checks are root-filesystem or source-grep approximations. They are useful, but they should not be treated as behavioral verification for disk capacity, first-time target bootstrap, or app-only runner reachability.

## Recommended Fix Order

1. Fail closed for known targets (`algo.xylolabs.com`) and stop reusing local `.env.production` across first-time targets.
2. Replace the app-only `host.docker.internal` default with an explicit, probed runner URL.
3. Make `WORKER_HOSTS` either rebuild selected language images or explicitly require a separate language rebuild step before DB language changes go live.
4. Align Docker build capability across app, runner, socket proxy, docs, and tests.
5. Pin deploy migration tooling to the repo lockfile.
6. Move disk checks to Docker's data root.
7. Add deploy dry-run tests and generated inventory/doc-count tests.
