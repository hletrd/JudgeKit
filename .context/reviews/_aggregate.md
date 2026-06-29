# Review Aggregate - Cycle 1/100 (2026-06-30)

Scope: multi-agent review of the current repository, with the user-injected deployment/storage requirements treated as blocking for this cycle.

Reviewer files:
- `.context/reviews/code-reviewer.md`
- `.context/reviews/perf-reviewer.md`
- `.context/reviews/security-reviewer.md`
- `.context/reviews/critic.md`
- `.context/reviews/verifier.md`
- `.context/reviews/test-engineer.md`
- `.context/reviews/tracer.md`
- `.context/reviews/architect.md`
- `.context/reviews/debugger.md`
- `.context/reviews/document-specialist.md`
- `.context/reviews/designer.md`
- `.context/reviews/feature-dev-code-reviewer.md`

Agent note: named reviewer agent types were not registered in this environment, so the review roles were run through available explorer agents and direct aggregation. No required review file failed to land.

## Merged Findings

### AGG1 - Critical/High - Automatic deploy cleanup can still delete detached user-data volumes
Agreement: code-reviewer, security-reviewer, debugger, document-specialist, architect, tracer, feature-dev-code-reviewer.

Evidence: `deploy-docker.sh:399-421` runs `docker volume prune -f` when `judgekit-db` is running; `AGENTS.md:435` now says automated cleanup paths must never prune volumes; `CLAUDE.md:12` forbids destructive volume pruning on production.

Failure scenario: an old PostgreSQL or upload volume is detached during recovery or a compose project rename. A later routine deploy starts a new DB, sees `judgekit-db` running, then host-wide `docker volume prune -f` deletes the only recoverable old data volume.

Fix: remove automatic volume pruning from `deploy-docker.sh`; keep stopped-container, dangling-image, BuildKit cache, and BuildKit history cleanup only. Update docs/tests to reject `docker volume prune`, `docker system prune --volumes`, and `docker image prune -af` in automated paths.

### AGG2 - Critical/High - Bare or typoed deploy target can use stale `.env.deploy` and wrong production host/domain
Agreement: code-reviewer, verifier, critic, architect, debugger, test-engineer, feature-dev-code-reviewer.

Evidence: `.env.deploy:1-13` still describes `oj-internal.maum.ai` while setting `REMOTE_HOST=algo.xylolabs.com`; `deploy-docker.sh:119-137` silently ignores unknown `DEPLOY_TARGET` names.

Failure scenario: `DEPLOY_TARGET=oj` or a typo falls back to stale `.env.deploy`, deploys to `algo.xylolabs.com` with the wrong domain and integrated worker/language build defaults, filling the app host.

Fix: fail closed when `DEPLOY_TARGET` is set but missing, normalize `oj` to `auraedu`, and make `.env.deploy` non-production defaults. Add tests for `algo`, `worv`, `auraedu`, `oj`, and an unknown target.

### AGG3 - High - `algo.xylolabs.com` app-only contract is not enforced for direct commands
Agreement: critic, architect, code-reviewer, debugger, verifier.

Evidence: `CLAUDE.md:7-12` requires `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`; `deploy-docker.sh:195-240` defaults to integrated worker behavior when no target profile is loaded.

Failure scenario: an incident operator runs direct `REMOTE_HOST=algo.xylolabs.com ... ./deploy-docker.sh`, causing worker and language builds on the app server.

Fix: hard-fail when `REMOTE_HOST=algo.xylolabs.com` unless the app-only flags are set.

### AGG4 - High - Split-host `COMPILER_RUNNER_URL` and `AUTH_URL` updates happen incorrectly
Agreement: code-reviewer, critic, debugger, architect, feature-dev-code-reviewer.

Evidence: `.env.deploy.worv:19-21` sets `COMPILER_RUNNER_URL=http://172.31.62.69:3001`, but `deploy-docker.sh:724-726` hardcodes `http://host.docker.internal:3001`; `deploy-docker.sh:1251-1252` rewrites `AUTH_URL` after `judgekit-app` has already started at `deploy-docker.sh:1132`.

Failure scenario: first `DEPLOY_TARGET=worv` deploy writes the wrong runner URL; app health passes, but submissions fail. A first-time target can also boot with a copied `.env.production` from another domain before `AUTH_URL` is corrected.

Fix: use target-provided `COMPILER_RUNNER_URL` for app-only targets, upsert non-secret target runtime keys before compose startup, and validate local first-deploy `.env.production` domain before copying.

### AGG5 - High - Dedicated `WORKER_HOSTS` builds lack pre-build disk guard
Agreement: verifier, tracer, debugger, code-reviewer, test-engineer, feature-dev-code-reviewer.

Evidence: `deploy-docker.sh:1156-1201` rsyncs and runs a no-cache worker build on each worker before any disk check or cleanup.

Failure scenario: `worker.test.worv.ai` or `worker-0.algo.xylolabs.com` is near full; the worker build fails mid-layer and leaves more cache before post-deploy cleanup can run.

Fix: factor the app-host disk preflight into a reusable helper and call it on each worker host before rsync/build, using only safe cleanup.

### AGG6 - High/Medium - Disk guards inspect `/`, not DockerRootDir or workspace mounts
Agreement: code-reviewer, perf-reviewer, verifier, debugger, test-engineer, feature-dev-code-reviewer.

Evidence: `deploy-docker.sh:524` uses `df --output=pcent /`; no `DockerRootDir` check exists.

Failure scenario: `/` appears healthy while Docker layers live on a near-full separate mount, so no-cache builds still fail with ENOSPC.

Fix: inspect `/`, Docker's `DockerRootDir`, and `/judge-workspaces` when present; gate on the highest usage.

### AGG7 - High - `SKIP_BUILD=true` does not skip dedicated worker image builds
Agreement: tracer, debugger, test-engineer.

Evidence: app builds are gated by `SKIP_BUILD` at `deploy-docker.sh:742`, but the `WORKER_HOSTS` block still builds at `deploy-docker.sh:1199-1201`.

Failure scenario: an operator uses `--skip-build` because storage is high, yet the worker no-cache build still starts and fills the worker host.

Fix: honor `SKIP_BUILD` in the worker-host build/restart block.

### AGG8 - Medium - Build failure paths do not guarantee cleanup
Agreement: perf-reviewer, test-engineer.

Evidence: cleanup runs after successful compose/restart; failed `run_remote_build` paths call `die` before post-deploy cleanup.

Failure scenario: failed language or worker build leaves additional dangling layers and cache, worsening the next deploy.

Fix: run safe cleanup in a failure trap or around build failure paths without touching volumes.

### AGG9 - High/Medium - Admin Docker image build capability is advertised without real storage/proxy safety
Agreement: architect, critic, perf-reviewer, feature-dev-code-reviewer.

Evidence: `src/lib/docker/client.ts` reports worker-backed `canBuild=true`; production proxy compose uses `BUILD=0`; admin build endpoints do not enforce disk thresholds.

Failure scenario: an admin clicks Build on a nearly full host or a proxy where build is forbidden; the worker starts expensive work or fails with a generic error.

Fix: expose real worker capabilities and disk health, disable unavailable build UI/actions, and apply the same pre-build storage guard to admin-triggered builds.

### AGG10 - High/Medium - Split worker deploy refreshes worker image but not language images
Agreement: architect, critic.

Evidence: `deploy-docker.sh:1156-1204` builds only `judgekit-judge-worker`; `scripts/rebuild-worker-language-images.sh:5-9` documents the gap.

Failure scenario: app language config changes, but dedicated workers keep stale or missing `judge-*` images.

Fix: add an explicit worker-language build policy or fail when language Dockerfiles/config changed and no worker language rebuild is requested.

### AGG11 - Medium - Deploy backups are DB-only while production has app upload data
Agreement: architect.

Evidence: `docker-compose.production.yml` mounts `judgekit-app-data:/app/data`; deploy backups only run `pg_dump`.

Failure scenario: DB rows referencing uploaded files are restored, but the upload volume is not backed up.

Fix: document DB-only scope and add an optional app-data backup artifact with retention controls.

### AGG12 - Medium - Deploy/cleanup operations can race without per-target locks
Agreement: tracer.

Evidence: no lock is taken around deploy or recurring cleanup.

Failure scenario: two deploys or a timer cleanup race over Docker cache, compose, or backups.

Fix: use per-target `flock`/lockfile around deploy and cleanup.

### AGG13 - Medium - Pre-deploy `.dump` backups are retained without verification
Agreement: tracer.

Evidence: `deploy-docker.sh:856-867` writes and retains dumps but does not run `pg_restore --list` or another integrity check first.

Failure scenario: corrupt or truncated dump is kept while older valid dumps are aged out.

Fix: verify the dump before retention pruning.

### AGG14 - Medium - `.dockerignore` misses local/generated directories
Agreement: perf-reviewer.

Evidence: `.dockerignore` omits `.context/`, `.omx/`, `.agent/`, `.sisyphus/`, static-site output, coverage, and test results.

Failure scenario: remote/local Docker build contexts include large review artifacts or generated files, slowing every build.

Fix: extend `.dockerignore` for known non-runtime generated directories.

### AGG15 - Medium - Production migrations install unpinned tooling at deploy time
Agreement: critic.

Evidence: deploy migration paths invoke package tooling dynamically rather than relying only on the built app image/toolchain.

Failure scenario: registry drift changes migration behavior during production deploy.

Fix: run migrations with repo-pinned dependencies already present in the app image.

### AGG16 - Medium/Low - Deployment docs and wording still imply unsafe cleanup
Agreement: document-specialist, code-reviewer, test-engineer.

Evidence: `docs/deployment.md:244-277`, `docs/deployment-automation.md:27-30`, and `AGENTS.md:432` still mention DB-guarded volume prune and "unused images".

Failure scenario: future operators interpret "unused images" as `docker image prune -af` or accept routine `docker volume prune`.

Fix: update docs to "dangling images" and no automated volume pruning; fix the broken `docs/deployment.md` relative link.

### AGG17 - Low - Language image docs/inventory counts disagree
Agreement: critic, document-specialist.

Evidence: reviewer noted drift between language image docs and inventory tests.

Failure scenario: operators choose a preset based on stale size/count expectations.

Fix: sync docs after language inventory changes.

### AGG18 - Medium - Multiple visible form controls have no programmatic label
Agreement: designer.

Evidence: designer cites unlabeled visible controls in current UI components.

Failure scenario: screen-reader and voice-input users cannot identify or activate those controls reliably.

Fix: add explicit labels or `aria-label`/`aria-labelledby` tied to visible text.

### AGG19 - Medium - Base dialogs can trap keyboard users in off-screen content on small viewports
Agreement: designer.

Failure scenario: modal content overflows viewport and keyboard focus reaches inaccessible off-screen controls.

Fix: constrain dialog max height, scroll body content, and preserve reachable action buttons.

### AGG20 - Medium/Low - Lecture-mode menu toggle is unnamed and undersized
Agreement: designer.

Failure scenario: touch and assistive users cannot discover or reliably hit the control.

Fix: add an accessible name and meet minimum target sizing.

### AGG21 - Medium/Low - Quick-create contest layout is brittle on narrow screens
Agreement: designer.

Failure scenario: controls overflow or become hard to scan on mobile.

Fix: adjust responsive grid and wrapping behavior.

### AGG22 - Medium - Public tag badges can fail contrast with admin-selected colors
Agreement: designer.

Failure scenario: custom tag colors make text unreadable and fail WCAG contrast.

Fix: compute contrast-aware foreground or restrict color choices.

### AGG23 - Medium - Horizontal table scroll regions are not keyboard reachable or announced
Agreement: designer.

Failure scenario: keyboard-only users cannot reach hidden columns.

Fix: make scroll containers focusable with accessible labels and visible focus.

### AGG24 - Medium - Admin file-management row checkboxes have no accessible names
Agreement: designer.

Failure scenario: screen-reader users hear repeated anonymous checkboxes.

Fix: label checkboxes with file names or row context.

### AGG25 - Medium - Problem-create tag picker is not exposed as a labelled combobox/listbox
Agreement: designer.

Failure scenario: assistive tech cannot understand the picker or its selected state.

Fix: use a labelled combobox/listbox pattern.

### AGG26 - Low/Medium - Homepage first paint waits on dashboard-like metrics
Agreement: designer.

Failure scenario: public LCP is delayed by nonessential metrics.

Fix: defer low-priority metrics or cache them separately.

### AGG27 - High - Function-judging int64 precision is broken end to end
Agreement: feature-dev-code-reviewer.

Evidence: `src/lib/judge/function-judging/serialization.ts` coerces `int`/`long` through JS `Number`; C++/Java/C# adapters parse integers through doubles.

Failure scenario: inputs above `2^53` are rounded before judging, producing wrong answers or misleading runtime errors.

Fix: serialize exact integer tokens and parse them with integer readers; document JS/TS safe-integer limits.

### AGG28 - Medium - Worker orphan sweep does not reap running `oj-*` containers after ungraceful restart
Agreement: feature-dev-code-reviewer.

Failure scenario: crash/redeploy leaves running judge containers that are never reaped by the exited-only sweep.

Fix: add startup sweep for all `oj-*` containers before polling starts.

### AGG29 - Low/Medium - Docker `pids_limit` branch is dead code
Agreement: feature-dev-code-reviewer.

Failure scenario: runtime branch appears intentional but is identical to compile branch, masking whether VM languages need higher runtime limits.

Fix: choose a single value with corrected comment or introduce a real per-phase/per-language limit.

### AGG30 - High/Medium - Judge API IP allowlist fails open in production when unset
Agreement: security-reviewer.

Failure scenario: missing allowlist config leaves runner endpoints exposed beyond intended hosts.

Fix: define per-target worker CIDR/source rules and then fail closed when absent.

### AGG31 - High/Medium - ZIP restore commits DB before uploaded files are restored
Agreement: security-reviewer.

Failure scenario: restore leaves DB rows pointing to files that failed to extract.

Fix: stage files first or make restore two-phase with rollback/verification before DB commit.

### AGG32 - Low/Medium - Role PATCH authorization checks are not row-locked
Agreement: security-reviewer.

Failure scenario: concurrent role mutation can race authorization assumptions.

Fix: use transaction/row lock or optimistic version checks.

### AGG33 - Low/Medium - Same-level custom roles can be edited laterally
Agreement: security-reviewer.

Failure scenario: one privileged custom role mutates another same-rank role unexpectedly.

Fix: tighten role hierarchy/ownership checks.

### AGG34 - Low/Medium - Recruiting password reset can clobber security metadata updates
Agreement: security-reviewer.

Failure scenario: concurrent updates overwrite audit/security fields.

Fix: update only intended columns with optimistic concurrency where needed.

### AGG35 - Low - Judge worker source files remain world-readable/writable in fallback workspaces
Agreement: security-reviewer.

Failure scenario: rootless/dev fallback exposes source files to same-host users.

Fix: narrow fallback permissions when possible and document dev-only risk.

### AGG36 - Low - Legacy migrate import success audits omit the pre-restore snapshot path
Agreement: security-reviewer.

Failure scenario: incident responders cannot locate the exact snapshot used before import.

Fix: include snapshot path in success audit details.

### AGG37 - Medium - Judge output buffering can consume hundreds of MiB per worker
Agreement: perf-reviewer.

Failure scenario: large stdout/stderr across concurrent submissions pressures worker memory.

Fix: stream with caps or enforce output limits earlier.

### AGG38 - Medium - Submission POST performs exact global queue count on every submit
Agreement: perf-reviewer.

Failure scenario: high submit load pays avoidable count cost.

Fix: use cheaper queue pressure signal or cache.

### AGG39 - Medium - Judge claim ships all test case payloads with no byte cap
Agreement: perf-reviewer.

Failure scenario: large tests produce oversized claim responses and memory pressure.

Fix: enforce byte caps and stream or shard payloads.

### AGG40 - Medium - Leaderboard cache invalidation defeats stale-while-revalidate
Agreement: perf-reviewer.

Failure scenario: active contests recompute too aggressively.

Fix: tune invalidation and background refresh.

### AGG41 - Medium - Code similarity work can continue after client timeout
Agreement: perf-reviewer.

Failure scenario: abandoned requests keep CPU saturated.

Fix: propagate cancellation/abort signals.

## Agent Failures

None. The environment only exposed generic subagent roles, so specialist roles were emulated with role-specific prompts.

## Final Sweep

No reviewer reported skipped deployment/storage files. The fresh UI reviewer could not run a live browser pass because the local standalone server artifact was missing, and recorded that blocker in `.context/reviews/designer.md`; its findings are source-backed.
