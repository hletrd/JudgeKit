# Cycle 1/100 - document-specialist

Repo: `/Users/hletrd/flash-shared/judgekit`
Role: document-specialist
Scope requested: docs/code mismatches against `AGENTS.md`, `CLAUDE.md`, `docs/deployment*.md`, `.context/current-state`, and `deploy-docker.sh`, with focus on the corrected Worv target `test.worv.ai` and deploy storage cleanup policy.

This is a read-only review except for writing this report. The working tree already had unrelated modified review, plan, and source files; I did not touch them.

## Source Inventory

The requested `.context/current-state` path does not exist in this checkout. The repository context index maps current state to `.context/project/current-state.md`: `.context/README.md:12-15`.

Reviewed files:

| File | Relevant evidence reviewed |
|---|---|
| `AGENTS.md` | Deploy hardening and cleanup policy at `AGENTS.md:423-436`; deployment shortcut/key note at `AGENTS.md:577-580`. |
| `CLAUDE.md` | Algo deploy flags and production prune guardrails at `CLAUDE.md:7-12`. |
| `docs/deployment.md` | Target shortcut table at `docs/deployment.md:147-153`; Docker safe/dangerous operations and automatic cleanup at `docs/deployment.md:236-286`. |
| `docs/deployment-automation.md` | Target shortcut table and deployment baseline at `docs/deployment-automation.md:13-30`. |
| `.context/project/current-state.md` | Current deployed cleanup and Worv status at `.context/project/current-state.md:49-59` and `.context/project/current-state.md:129-147`. |
| `deploy-docker.sh` | Target override sourcing at `deploy-docker.sh:127-137`; cleanup helper at `deploy-docker.sh:375-421`; app-host pre-build cleanup at `deploy-docker.sh:513-541`; worker/app post-deploy cleanup calls at `deploy-docker.sh:1213-1222` and `deploy-docker.sh:1230-1237`. |
| `.env.deploy.worv` | Supporting local target override, untracked: `.env.deploy.worv:8-11` and `.env.deploy.worv:35`. Cited only for non-secret host/key-path fields. |
| `scripts/docker-disk-cleanup.*` | Supporting recurring cleanup implementation: `scripts/docker-disk-cleanup.sh:1-49`, `scripts/install-docker-disk-cleanup.sh:15-22`, `scripts/docker-disk-cleanup.service:1-12`, `scripts/docker-disk-cleanup.timer:1-10`. |

## Confirmed: Worv Target Is Corrected To `test.worv.ai`

No docs/code mismatch found for the corrected Worv app target in the reviewed surface.

Evidence:

- `docs/deployment.md:153` documents `worv` as `test.worv.ai`, SSH user `ubuntu`, key `~/.ssh/worv-judgekit.pem`, with dedicated worker `worker.test.worv.ai`.
- `docs/deployment-automation.md:19` documents the same `worv` domain and key.
- `AGENTS.md:577-580` says `test.worv.ai` uses `~/.ssh/worv-judgekit.pem` and must stay aligned with `docs/deployment.md`.
- `.context/project/current-state.md:129-131` records all three deploy targets, including `test.worv.ai`, redeployed with the new prune.
- `deploy-docker.sh:127-137` sources `.env.deploy.${DEPLOY_TARGET}`, so the actual `DEPLOY_TARGET=worv` host comes from the target override file rather than a hardcoded script table.
- The local untracked override confirms `REMOTE_HOST=test.worv.ai` and `DOMAIN=test.worv.ai` at `.env.deploy.worv:8-10`, and `WORKER_HOSTS=worker.test.worv.ai:...:linux/arm64` at `.env.deploy.worv:35`.
- A stale-host sweep over the requested docs/script surface found no non-`test.worv.ai` `worv.ai` deployment target.

Fix: none required for the Worv target. Keep `AGENTS.md`, `docs/deployment.md`, `docs/deployment-automation.md`, and `.env.deploy.worv` aligned when rotating keys or changing the host.

## Findings

### DS-1 - HIGH - Post-deploy volume pruning conflicts with the newer "never volumes" storage-cleanup policy

Confidence: High

Evidence:

- `CLAUDE.md:12` gives the top-level production rule: never run `docker system prune --volumes` because it destroys DB data.
- `AGENTS.md:435` documents the newer pre-build disk guard plus recurring host cleanup as reclaiming dangling images, build cache, and BuildKit history, then states that neither path ever prunes volumes because the PostgreSQL data volume lives there.
- `scripts/docker-disk-cleanup.sh:4-7` implements that recurring policy: no `docker volume prune` and no `docker system prune --volumes`, by design.
- `scripts/docker-disk-cleanup.service:2` describes the timer as "images + build cache; never volumes"; `scripts/install-docker-disk-cleanup.sh:22` prints "Never prunes volumes."
- `deploy-docker.sh:513-541` implements the app-host pre-build disk guard with `docker image prune -f`, `docker builder prune -af`, and `docker buildx history rm --all`, and explicitly says volumes are never touched at `deploy-docker.sh:518-527`.
- But the default post-deploy helper still executes `docker volume prune -f` whenever any running container named `judgekit-db` is found: `deploy-docker.sh:407-417`.
- The helper runs on worker hosts at `deploy-docker.sh:1213-1222` and on the app host at `deploy-docker.sh:1230-1237`.
- The docs bless that behavior as safe: `docs/deployment.md:244-246` says `docker volume prune -f` is safe while `judgekit-db` is running, and `docs/deployment.md:275-277` lists DB-guarded volume prune as step 4 of automatic cleanup.
- `docs/deployment-automation.md:27-30` also says the deployment baseline prunes DB-guarded orphan volumes on every touched host.
- `.context/project/current-state.md:56-59` records the same DB-running volume-prune policy as current state.

Mismatch:

There are now two different storage-cleanup policies in the same operator surface:

1. Pre-build and recurring cleanup: never prune volumes.
2. Default post-deploy cleanup: prune every unattached Docker volume on the host if `judgekit-db` is running.

The post-deploy docs call this broadly safe, but `docker volume prune -f` is host-wide. The `judgekit-db` running check only proves Docker will preserve volumes attached to that currently running DB container. It does not prove that every other detached named or anonymous volume on the same host is disposable.

Failure scenario:

A production host has `judgekit-db` running, plus a detached old compose-project volume, an emergency restore volume, an upload/data volume from another service, or a temporarily detached PostgreSQL volume from a stopped sidecar. A routine JudgeKit deploy reaches `prune_old_docker_artifacts()`, sees `judgekit-db` running, and deletes all unattached volumes on that Docker daemon. The operator followed docs that classified the command as safe.

Fix:

Preferred fix is code plus docs:

- Remove `docker volume prune -f` from `prune_old_docker_artifacts()` in `deploy-docker.sh:414-416`.
- Change the helper log strings and comments at `deploy-docker.sh:33-39`, `deploy-docker.sh:375-377`, `deploy-docker.sh:406`, and `deploy-docker.sh:1230-1232` to say cleanup removes stopped containers, dangling images, and BuildKit cache/history only.
- Update `docs/deployment.md:244-246` and `docs/deployment.md:275-277` so `docker volume prune -f` is not listed as routine safe deploy cleanup. If volume cleanup remains documented at all, put it under a manual, explicitly scoped runbook with a warning that it removes all unattached volumes on the host.
- Update `docs/deployment-automation.md:27-30`, `AGENTS.md:432`, and `.context/project/current-state.md:56-59` to match the no-volume deploy cleanup policy.
- Keep `scripts/docker-disk-cleanup.sh` unchanged; it already implements the safer recurring policy.

If the project intentionally keeps DB-guarded volume prune, the docs should at least stop calling it broadly safe and state the host-wide deletion semantics. That is weaker than the preferred fix because it leaves the data-loss class active.

### DS-2 - MEDIUM - "unused images" wording contradicts the dangling-only image policy

Confidence: High

Evidence:

- `deploy-docker.sh:379-390` explains why the script must not use `docker image prune -af`: tagged `judge-*` images are not attached to long-running containers and would be wiped as "unused".
- The implementation correctly uses dangling-only `docker image prune -f` at `deploy-docker.sh:410-412`.
- `docs/deployment.md:269-273` correctly says automatic cleanup removes dangling-only untagged image layers and preserves tagged judge language images.
- `AGENTS.md:432` also correctly says dangling-only `docker image prune -f`, not `-af`.
- But `deploy-docker.sh:33-39` describes `SKIP_POST_DEPLOY_PRUNE` as skipping cleanup of "unused images".
- `deploy-docker.sh:1230-1232` says Step 6d removes "unused images".
- `docs/deployment-automation.md:27-30` says the baseline prunes "unused images".

Mismatch:

The code and the main deployment runbook use the precise, safe term "dangling images". Some comments/docs still say "unused images", which is Docker's `-a` concept and is exactly the behavior the project warns against. This wording is easy to misread as permission to use `docker image prune -af`.

Failure scenario:

An operator or future patch author tries to make the cleanup match the "unused images" prose and changes `docker image prune -f` to `docker image prune -af`. Because judge language images are tagged but idle between submissions, the deploy wipes language images and breaks judging until they are rebuilt.

Fix:

- Replace "unused images" with "dangling images" or "untagged `<none>:<none>` images" at `deploy-docker.sh:35`, `deploy-docker.sh:1231`, and `docs/deployment-automation.md:27`.
- Keep the existing `docker image prune -f` implementation.
- Consider adding a short pointer in `docs/deployment-automation.md:27-30` to the detailed `docs/deployment.md:269-273` wording so the automation doc cannot be read as `docker image prune -a`.

### DS-3 - LOW - `docs/deployment.md` has a broken relative link to the automation doc

Confidence: High

Evidence:

- `docs/deployment.md:133` links to `[Deployment Automation & Reproducibility](docs/deployment-automation.md)`.
- Because that link is inside `docs/deployment.md`, the relative target resolves as `docs/docs/deployment-automation.md`, not `docs/deployment-automation.md`.
- The target file exists at `docs/deployment-automation.md`.

Mismatch:

The prose points at the right document name, but the Markdown target is wrong from its current directory.

Fix:

- Change `docs/deployment.md:133` to `[Deployment Automation & Reproducibility](deployment-automation.md)`.

## Final Sweep

- No stale non-`test.worv.ai` Worv app-host references were found in `AGENTS.md`, `CLAUDE.md`, `docs/deployment*.md`, `.context/project/current-state.md`, `deploy-docker.sh`, or the local `.env.deploy.worv` target override.
- The app-host pre-build disk guard matches its docs: it uses dangling image prune, builder prune, and BuildKit history cleanup, and it never prunes volumes (`deploy-docker.sh:513-541`; `AGENTS.md:435`).
- The recurring host cleanup artifacts match their docs and service descriptions: stopped containers, dangling images, build cache/history under pressure, no volume pruning (`scripts/docker-disk-cleanup.sh:1-49`; `scripts/docker-disk-cleanup.service:1-12`; `scripts/docker-disk-cleanup.timer:1-10`).
- The remaining deploy-cleanup drift is concentrated in the default post-deploy helper and its documentation, especially the DB-guarded `docker volume prune -f` policy and "unused images" wording.

## Priority Fix Order

1. DS-1: remove routine post-deploy volume prune or document its host-wide deletion semantics. Preferred resolution is no routine volume prune.
2. DS-2: replace "unused images" with "dangling images" in deployment automation prose and deploy script comments.
3. DS-3: fix the relative link in `docs/deployment.md`.
