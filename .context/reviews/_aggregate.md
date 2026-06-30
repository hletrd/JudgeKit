# Review Aggregate - Cycle 2/100 (2026-06-30)

Scope: continuation after cycle 1 deploy stopped on `algo-worker-register`; includes the user's corrected target set (`algo.xylolabs.com`, `test.worv.ai`, `oj.auraedu.me`) and storage-safety requirement.

Agent note: no separate Agent tool is registered in this environment, so the reviewer roles were executed in-session and written to the required per-role files.

## Merged Findings

### C2-1 - High - Dedicated worker deploy does not repair stale `JUDGE_BASE_URL`
Agreement: code-reviewer, verifier, tracer, architect.

Evidence: `deploy-docker.sh:1282-1345` rebuilds/restarts `WORKER_HOSTS` but does not write `JUDGE_BASE_URL` to each worker host `.env`. Read-only inspection of `worker-0.algo.xylolabs.com` showed `JUDGE_BASE_URL=http://algo.xylolabs.com/api/v1` and logs rejected it as non-local HTTP.

Failure scenario: the algo worker restarts forever before `/judge/register`; per-cycle deploy remains blocked even though disk is healthy.

Fix: derive `${AUTH_URL_TARGET%/}/api/v1`, require HTTPS for dedicated workers, and upsert it into each worker host `.env` before restart.

### C2-2 - Medium - Worker restart verification hides registration/config failures
Agreement: code-reviewer, debugger, critic, designer, perf-reviewer.

Evidence: `deploy-docker.sh:1342-1357` sleeps 5 seconds and checks only `docker ps` `Up`, then points at the docker-capability probe regardless of the real failure.

Failure scenario: HTTPS, token, or registration failures are misdiagnosed as docker-proxy issues.

Fix: poll running + health status and emit sanitized worker logs on failure.

### C2-3 - Medium - Compiler and worker workspace fallbacks still allow broad host permissions
Agreement: security-reviewer, test-engineer, feature-dev-code-reviewer.

Evidence: `src/lib/compiler/execute.ts:740-756`, `judge-worker-rs/src/executor.rs:321-395`, and `judge-worker-rs/src/runner.rs:754-796` preserve `0o777`/`0o666` fallbacks when `chown` fails. This also matches the queued `plan/user-injected/pending-next-cycle.md` TODO.

Failure scenario: if ownership assignment fails on a shared host, in-flight source and artifacts can become world-readable or writable.

Fix: fail closed on ownership failure; update source-contract tests to reject the broad fallback.

### C2-4 - High - Insecure HTTP is not an acceptable production worker recovery
Agreement: security-reviewer, critic.

Evidence: `judge-worker-rs/src/config.rs:343-382` rejects non-local HTTP unless `JUDGE_ALLOW_INSECURE_HTTP=1`, and the observed algo env used HTTP.

Failure scenario: enabling the insecure override to recover production would expose judge tokens and submission data in transit.

Fix: deploy automation must write HTTPS worker URLs and fail closed for non-local HTTP.

### C2-5 - Medium - Deploy tests do not pin worker-host URL repair
Agreement: test-engineer.

Evidence: `tests/unit/infra/deploy-storage-safety.test.ts` covers target selection, runner URL upserts, storage roots, and safe prune commands, but not worker `JUDGE_BASE_URL` reconciliation.

Fix: add static test coverage for the new worker env upsert and HTTPS fail-closed guard.

### C2-6 - Low/Medium - Worker host secret rotation remains manual
Agreement: architect.

Evidence: routine `WORKER_HOSTS` deploy updates source/images/env URL, but secret rotation for `JUDGE_AUTH_TOKEN` and `RUNNER_AUTH_TOKEN` is not automated.

Deferral reason: routine deploys should not silently copy or rotate secrets across hosts without an explicit operator-approved secret-sync mode. This is a follow-up observability/operations item, not the root cause of the current outage.

Exit criterion: add an explicit worker secret sync/rotation command with audit logging and tests.

### C2-7 - Low/Medium - Docs should describe dedicated worker URL reconciliation
Agreement: document-specialist.

Evidence: `docs/deployment.md` documents worker env requirements but not that deploys keep `JUDGE_BASE_URL` aligned for `WORKER_HOSTS`.

Fix: update deployment docs after the script behavior is implemented.

## Storage Verification

Read-only inspection of `worker-0.algo.xylolabs.com` showed `/`, DockerRootDir, and `/judge-workspaces` at 40% used. Existing deploy cleanup uses stopped-container prune, dangling-only `docker image prune -f`, builder prune, and BuildKit history cleanup; no automated volume prune path was found in the inspected deploy automation.
