# Cycle 1 (2026-06-30) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 1/100 fan-out aggregate).

Repo rules read before planning: `CLAUDE.md`, `AGENTS.md`, `.context/README.md`, `.context/development/conventions.md`, `.context/development/documentation-rules.md`, `.context/development/open-workstreams.md`, `.context/plans/README.md`, `.context/project/current-state.md`, deployment docs, and policy docs. No `.cursorrules` or `CONTRIBUTING.md` exists.

Cycle constraint: per-cycle deploy to `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; never `oj.worv.ai`. Before any build/deploy, storage checks and cleanup must be safe: no `docker system prune --volumes`, no automated `docker volume prune`, no PostgreSQL/user-data volume deletion. Prefer dangling image/build-cache cleanup.

Commit rules: semantic commit messages with gitmoji, GPG-signed, fine-grained, pull --rebase before push, tests with every fix.

## Phase A - Implement This Cycle

### A1. Safe Docker Cleanup Contract
- Findings: AGG1, AGG16, TE-6, DS-1/2.
- Files: `deploy-docker.sh:399-421`, `docs/deployment.md:236-285`, `docs/deployment-automation.md:27-30`, `AGENTS.md:432-435`, `tests/unit/infra/deploy-security.test.ts`.
- Plan:
  1. Remove automated `docker volume prune -f` from `prune_old_docker_artifacts`.
  2. Keep safe cleanup to stopped containers, dangling images (`docker image prune -f`), BuildKit cache, and BuildKit history metadata.
  3. Update docs/comments from "unused images/orphan volumes" to "dangling images/build cache; no automated volume pruning".
  4. Add static tests rejecting `docker volume prune`, `docker system prune --volumes`, and `docker image prune -af` in deploy automation.
- Progress: [x] Implemented. `prune_old_docker_artifacts` now removes stopped containers, dangling images, BuildKit cache, and BuildKit history metadata only; automated volume pruning is removed. Docs and tests were updated to pin that contract.

### A2. Fail-Closed Deploy Target Resolution
- Findings: AGG2, AGG3, ARCH-1, V2, C1-H3.
- Files: `deploy-docker.sh:119-151`, `.env.deploy:1-13`, `.env.deploy.algo:15-22`, `.env.deploy.worv:15-21`, `.env.deploy.auraedu:1-12`, `tests/unit/infra/deploy-security.test.ts`.
- Plan:
  1. Normalize `DEPLOY_TARGET=oj` to `auraedu`.
  2. If `DEPLOY_TARGET` is set and `.env.deploy.<target>` is missing, abort before SSH.
  3. Make the checked-in `.env.deploy` a non-production placeholder so bare deploys require explicit target or caller-provided host/domain.
  4. Add a post-resolution guard: `REMOTE_HOST=algo.xylolabs.com` requires `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, `INCLUDE_WORKER=false`.
  5. Add source-contract tests for the corrected targets: `algo.xylolabs.com`, `test.worv.ai`, `oj.auraedu.me`; explicitly reject `oj.worv.ai`.
- Progress: [x] Implemented. `DEPLOY_TARGET` now fails closed when a target file is missing, `oj` aliases to `auraedu`, caller overrides survive target sourcing, and `algo.xylolabs.com` is guarded as app-only.

### A3. Target-Aware Runtime Env Updates Before Startup
- Findings: AGG4, D1, D6, C1-H1/2.
- Files: `deploy-docker.sh:712-737`, `deploy-docker.sh:1126-1253`, `.env.deploy.worv:19-21`, tests.
- Plan:
  1. Add an upsert helper for non-secret target runtime keys.
  2. For app-only targets, use target-provided `COMPILER_RUNNER_URL` when set; otherwise fall back to the existing host-bridge default.
  3. Upsert `COMPILER_RUNNER_URL`, `AUTH_TRUST_HOST`, and `AUTH_URL` before `docker compose up -d`, not after the app container starts.
  4. Keep a warning for local-worker defaults on app-only targets.
  5. Add tests that pin `test.worv.ai` to `http://172.31.62.69:3001`.
- Progress: [x] Implemented. `COMPILER_RUNNER_URL`, `AUTH_TRUST_HOST`, and `AUTH_URL` are upserted into the remote `.env.production` before `docker compose up`, with target-provided runner URLs honored.

### A4. Reusable Pre-Build Storage Guard For App And Worker Hosts
- Findings: AGG5, AGG6, AGG7, TE-3/4, T1/T2, V1/V4.
- Files: `deploy-docker.sh:513-541`, `deploy-docker.sh:1156-1222`, `scripts/docker-disk-cleanup.sh:30-49`, `scripts/rebuild-worker-language-images.sh:79-118`, tests.
- Plan:
  1. Factor the app-host disk preflight into a reusable helper that accepts a host label and runner function.
  2. Check `/`, Docker's `DockerRootDir`, and `/judge-workspaces` when present; gate on the highest usage.
  3. Use only safe cleanup: stopped containers, dangling images, builder cache, BuildKit history. Never volumes.
  4. Run the helper before app-host builds and before each dedicated worker build.
  5. Honor `SKIP_BUILD=true` in the `WORKER_HOSTS` build/restart path.
  6. Bring the recurring cleanup script and language-image rebuild script into the same DockerRootDir-aware posture.
- Progress: [x] Implemented. App and worker build paths now share Docker storage preflight over `/`, DockerRootDir, and `/judge-workspaces`; cleanup is safe and `SKIP_BUILD=true` skips worker build/restart work.

### A5. Build Context Hygiene
- Finding: AGG14.
- File: `.dockerignore`.
- Plan: exclude current non-runtime generated directories (`.context/`, `.omx/`, `.agent/`, `.sisyphus/`, coverage/test-result/static output, local caches) without excluding runtime sources.
- Progress: [x] Implemented. `.dockerignore` excludes generated agent/context outputs, test reports, static output, and local caches from Docker build contexts.

### A6. Deploy Safety Tests And Gate Accounting
- Findings: AGG2-7, AGG16, TE-1/2/3/4/6/8.
- Files: `tests/unit/infra/deploy-security.test.ts` or a new `tests/unit/infra/deploy-storage-safety.test.ts`; `package.json` if a named deploy-safety script is warranted.
- Plan: add tests that encode target selection, storage cleanup, DockerRootDir, worker-host preflight, and target runtime-env contracts.
- Progress: [x] Implemented. Added deploy storage safety tests covering forbidden prune commands, corrected deploy targets, target runtime URL upserts, DockerRootDir-aware preflights, and worker build guards.

## Deferred / Already-Scheduled Register

These are review findings not in this cycle's implementation scope. Severity/confidence are preserved from the aggregate. Deferred items remain bound by repo policy when picked up later.

- AGG8 `deploy-docker.sh` build failure cleanup trap - Medium, `.context/reviews/_aggregate.md:67`. Reason: adjacent to A4 but needs careful trap design around existing `die`/BuildKit retry semantics; this cycle will add pre-build guards first. Exit: add a failure trap that runs safe cleanup after failed builds and unit/source tests for it.
- AGG9 admin Docker build capability/storage guard - High/Medium, `.context/reviews/_aggregate.md:75`, `src/lib/docker/client.ts`, admin Docker routes. Reason: API/UI capability redesign spans app and worker protocol; not safe to combine with deploy-script changes before per-cycle deploy. Exit: worker capabilities endpoint + disk-health check + disabled UI actions where build is unavailable.
- AGG10 worker language image rollout - High/Medium, `.context/reviews/_aggregate.md:83`, `deploy-docker.sh:1156-1204`, `scripts/rebuild-worker-language-images.sh:5-9`. Reason: rollout policy needs operator choice of preset/registry; current cycle protects storage before builds. Exit: `WORKER_LANGUAGE_FILTER` or registry-pinned language image release contract.
- AGG11 app-data backup - Medium, `.context/reviews/_aggregate.md:91`, `docker-compose.production.yml`, `src/lib/files/storage.ts`. Reason: scheduled into operations/backup hardening; implementing upload-volume backup requires retention/disk budget design. Exit: optional `judgekit-app-data` backup artifact with restore runbook.
- AGG12 deploy/cleanup lock - Medium, `.context/reviews/_aggregate.md:99`. Reason: lock semantics need coordination with existing recurring systemd cleanup and parallel per-target deploy command. Exit: per-target `flock` around deploy and cleanup with tests.
- AGG13 pre-deploy dump verification - Medium, `.context/reviews/_aggregate.md:107`, `deploy-docker.sh:856-867`. Reason: backup integrity is planned in operations hardening; current storage work avoids data deletion risk first. Exit: `pg_restore --list` or equivalent verification before retention pruning.
- AGG15 pinned deploy migration tooling - Medium, `.context/reviews/_aggregate.md:124`. Reason: requires migration execution contract change and image dependency audit. Exit: migrations run only with repo-pinned dependencies already in the app image.
- AGG17 language image doc/inventory drift - Low, `.context/reviews/_aggregate.md:141`. Reason: docs-only drift outside deploy safety. Exit: sync language image count docs with inventory tests after next language-table update.
- AGG18 UI unlabeled controls - Medium, `.context/reviews/designer.md:29`. Reason: user asked deployment/storage cycle; UI a11y requires component-specific tests/browser pass. Exit: add labels/ARIA and component/E2E coverage for cited controls.
- AGG19 small-viewport dialog trap - Medium, `.context/reviews/designer.md:60`. Reason: UI layout fix requires browser verification. Exit: dialog max-height/scroll/focus regression test.
- AGG20 lecture-mode toggle - Medium/Low, `.context/reviews/designer.md:83`. Reason: UI polish; not deploy-blocking. Exit: accessible name and 44px target.
- AGG21 quick-create contest responsiveness - Medium/Low, `.context/reviews/designer.md:102`. Reason: UI polish; not deploy-blocking. Exit: responsive grid fix and viewport test.
- AGG22 tag badge contrast - Medium, `.context/reviews/designer.md:122`. Reason: UI a11y; needs color algorithm decision. Exit: contrast-aware foreground or constrained palette.
- AGG23 horizontal table scroll accessibility - Medium, `.context/reviews/designer.md:142`. Reason: UI a11y; needs selector-specific implementation. Exit: focusable labelled scroll regions.
- AGG24 file-management checkbox labels - Medium, `.context/reviews/designer.md:165`. Reason: UI a11y; not deploy-blocking. Exit: row-context checkbox labels.
- AGG25 problem-create tag picker combobox semantics - Medium, `.context/reviews/designer.md:185`. Reason: UI a11y; requires picker component refactor. Exit: labelled combobox/listbox pattern.
- AGG26 homepage metrics first paint - Low/Medium, `.context/reviews/designer.md:207`. Reason: performance optimization outside deploy safety. Exit: defer/cache nonessential metrics.
- AGG27 function-judging int64 precision - High, `.context/reviews/feature-dev-code-reviewer.md:43`, `src/lib/judge/function-judging/serialization.ts`. Reason: correctness issue, but it requires coordinated serialization + C++/Java/C# adapter + harness updates per AGENTS harness rule. Exit: exact integer serialization/parsing and `npm run test:harness`.
- AGG28 startup `oj-*` container sweep - Medium, `.context/reviews/feature-dev-code-reviewer.md:84`, `judge-worker-rs/src/docker.rs`. Reason: worker runtime change outside deploy-script storage; needs Rust tests/manual Docker validation. Exit: startup sweep for all `oj-*` before polling.
- AGG29 `pids_limit` dead branch - Low/Medium, `.context/reviews/feature-dev-code-reviewer.md:107`, `judge-worker-rs/src/docker.rs`. Reason: low risk; requires runtime compatibility decision. Exit: single value/comment or per-language phase policy.
- AGG30 judge IP allowlist fail-open - High/Medium, `.context/reviews/security-reviewer.md:61`, `src/lib/judge/ip-allowlist.ts:5-16`, `src/lib/security/production-config.ts:37-51`. Reason for deferral is explicitly repo-authored: `src/lib/judge/ip-allowlist.ts:11-16` says the unset allow-all default was deliberately preserved and a default flip was reverted because it broke deployed workers; `production-config.ts:37-41` says recommended env vars warn rather than exit because each has a safe, less-hardened default. Exit: record per-target worker CIDRs for all production/test targets and then set `JUDGE_ALLOWED_IPS` or `JUDGE_STRICT_IP_ALLOWLIST=1` everywhere.
- AGG31 ZIP restore two-phase atomicity - High/Medium, `.context/reviews/security-reviewer.md:75`, `src/app/api/v1/admin/restore/route.ts`, `src/lib/db/export-with-files.ts`. Reason: existing SEC-01 Phase 1 schedules restore hardening; pre-existing cycle-7 work added post-write verification, while full staging/rename needs restore integration coverage per AGENTS testing rule "No code is considered complete without tests." Exit: staging directory restore, verify, DB commit, atomic rename, and restore integration test.
- AGG32 role PATCH row lock - Low/Medium, `.context/reviews/security-reviewer.md:89`, roles API. Reason: concurrency hardening outside deploy path. Exit: transaction row lock or optimistic version checks.
- AGG33 same-level custom role lateral editing - Low/Medium, `.context/reviews/security-reviewer.md:103`. Reason: authorization policy change requires product decision. Exit: hierarchy/ownership rule and tests.
- AGG34 recruiting metadata clobber race - Low/Medium, `.context/reviews/security-reviewer.md:117`. Reason: concurrency hardening outside deploy path. Exit: targeted column update or optimistic concurrency.
- AGG35 worker fallback permissions - Low, `.context/reviews/security-reviewer.md:131`, `plan/user-injected/pending-next-cycle.md:1`. Reason: already tracked as user-injected TODO; production chown path is hardened, fallback is dev/rootless. Exit: group-based sharing or fail-closed fallback.
- AGG36 migrate import audit snapshot path - Low, `.context/reviews/security-reviewer.md:145`. Reason: observability polish. Exit: include pre-restore snapshot path in success audit details.
- AGG37 judge output buffering - Medium, `.context/reviews/perf-reviewer.md:77`. Reason: worker execution contract change outside deploy storage. Exit: stream/cap stdout/stderr with tests.
- AGG38 exact queue count on submit - Medium, `.context/reviews/perf-reviewer.md:89`. Reason: performance optimization outside deployment safety. Exit: cheaper queue pressure signal.
- AGG39 unbounded test payload claim bytes - Medium, `.context/reviews/perf-reviewer.md:101`. Reason: API/worker protocol change. Exit: byte caps or streaming/sharding.
- AGG40 leaderboard invalidation - Medium, `.context/reviews/perf-reviewer.md:113`. Reason: contest cache tuning outside deploy safety. Exit: stale-while-revalidate preserving invalidation model.
- AGG41 code similarity cancellation - Medium, `.context/reviews/perf-reviewer.md:125`. Reason: sidecar cancellation design needed. Exit: propagate abort/cancel and tests.

## Phase B - Progress Tracking

- [x] A1 safe cleanup implemented.
- [x] A2 target fail-closed implemented.
- [x] A3 runtime env upsert implemented.
- [x] A4 storage guard implemented.
- [x] A5 dockerignore implemented.
- [x] A6 deploy-safety tests implemented.
- Gates: [x] Passed. Full required gates run this cycle: `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run db:check`, `npm run test:unit`, `npm run test:security`, `npm run test:integration`, `npm run test:component`, `npm run test:harness`, `npm run test:e2e`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace`.
- Gate fixes completed: `src/instrumentation.ts` skips runtime startup work during `NEXT_PHASE=phase-production-build`; `package.json` pins the supported webpack builder via `next build --webpack` after Turbopack timed out on `src/app/globals.css`; Next 16 page/route export types were fixed in `practice`, `rankings`, `createApiHandler`, analytics cache internals, problem import schema, SSE shutdown timers, and `/og`; E2E assertions now handle current admin password, list pagination/search, deployment availability, and protected-route behavior; Rust formatting and clippy issues were fixed without suppressions.
- Commits: pending.
- Deploy: pending.
