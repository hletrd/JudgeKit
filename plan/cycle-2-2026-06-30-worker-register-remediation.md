# Cycle 2 (2026-06-30) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 2/100). This cycle continues after cycle 1 stopped on `DEPLOY: per-cycle-failed:algo-worker-register`.

Repo rules read before planning: `CLAUDE.md`, `AGENTS.md`, `.context/README.md`, `.context/development/conventions.md`, `.context/development/documentation-rules.md`, `.context/development/open-workstreams.md`, `.context/plans/README.md`, `.context/project/current-state.md`, `docs/deployment.md`, and deployment/security docs. No `.cursorrules` or `CONTRIBUTING.md` exists.

Cycle constraints:
- Deploy mode is per-cycle.
- Correct deploy targets are `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; never `oj.worv.ai`.
- Before deploy/build, verify target storage and use only safe cleanup: stopped containers, dangling images, BuildKit cache/history. Never run `docker system prune --volumes`, automated `docker volume prune`, or delete PostgreSQL/user-data volumes.
- Use semantic git messages with gitmoji and signed commits.

## Phase A - Implement This Cycle

### A1. Dedicated Worker `JUDGE_BASE_URL` Repair
- Findings: C2-1, C2-4, C2-5.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-storage-safety.test.ts`, `docs/deployment.md`.
- Plan:
  1. Derive `WORKER_JUDGE_BASE_URL="${AUTH_URL_TARGET%/}/api/v1"` after the app target URL is computed.
  2. If `WORKER_HOSTS` is set and the derived URL is non-local HTTP, abort with a clear TLS remediation instead of relying on `JUDGE_ALLOW_INSECURE_HTTP`.
  3. Upsert `JUDGE_BASE_URL` into each worker host's `~/judgekit/.env` before `docker compose -f docker-compose.worker.yml --env-file .env up -d`.
  4. Add tests that pin the upsert and fail-closed HTTPS guard.
- Progress: [x] Implemented. `deploy-docker.sh` now derives `WORKER_JUDGE_BASE_URL` from the app `AUTH_URL`, rejects non-local HTTP worker URLs, and upserts `JUDGE_BASE_URL` into each worker host `.env` before restart.

### A2. Worker Restart Verification
- Findings: C2-2.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-storage-safety.test.ts`.
- Plan:
  1. Replace the fixed 5-second status check with bounded polling of Docker running and health status.
  2. On failure, print the last worker logs with token/secret redaction.
  3. Use neutral failure wording so registration/config/TLS errors are not mislabeled as docker-proxy failures.
- Progress: [x] Implemented. Worker restart verification now polls Docker health, tails sanitized logs on failure, and uses neutral failure wording.

### A3. Workspace Permission Fail-Closed Hardening
- Findings: C2-3, queued `plan/user-injected/pending-next-cycle.md`.
- Files: `src/lib/compiler/execute.ts`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/runner.rs`, `tests/unit/compiler/execute-implementation.test.ts`, Rust unit tests.
- Plan:
  1. Remove broad `0o777`/`0o666` fallback from the Node compiler path; fail closed if `chown` to the sandbox uid/gid fails.
  2. Remove broad fallback from Rust executor and runner paths; report a runtime/configuration error before mounting the workspace.
  3. Update source-contract tests to assert no broad fallback remains in executable code paths.
- Progress: [x] Implemented. The Node compiler path, Rust executor, and Rust runner now fail closed if sandbox ownership cannot be assigned; source-contract tests were updated.

### A4. Storage Verification Before Deploy
- Findings: user-injected deploy/storage TODO; C2 aggregate storage verification.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-storage-safety.test.ts`.
- Plan:
  1. Preserve the existing DockerRootDir-aware preflight for app and worker hosts.
  2. Preserve no-volume-prune cleanup semantics.
  3. Before the per-cycle deploy, confirm the deploy script still contains the safe cleanup contract and run the configured gates.
- Progress: [x] Preserved. Existing DockerRootDir-aware preflight and no-volume-prune cleanup contract remain in place; deploy tests pin the contract.

## Deferred Register

Each item records file/line citation, original severity/confidence, reason, and exit criterion. Security/correctness/data-loss items are not deferred unless the repo rules or current safety constraints require an explicit follow-up design.

- C2-6 worker host secret rotation remains manual - Low/Medium, `.context/reviews/_aggregate.md:52`, `deploy-docker.sh:1295-1405`. Reason: routine deploys should not silently copy or rotate `JUDGE_AUTH_TOKEN` / `RUNNER_AUTH_TOKEN` across hosts without an explicit operator-approved secret-sync mode; changing secret propagation during an outage recovery risks locking out working targets. Exit criterion: add a separate worker secret sync/rotation command or deploy mode with audit logging, redacted logs, and tests.

## Phase B - Progress Tracking

- [x] A1 worker URL repair implemented.
- [x] A2 worker restart verification implemented.
- [x] A3 workspace permission fallback removed.
- [x] A4 storage verification preserved and checked.
- Gates: lint, lint:bash, build, db:check, test:unit, test:security, test:integration, test:component, test:harness, test:e2e, cargo fmt, cargo clippy, and cargo test all passed.
- Commits: b972dfaa, 8542f6a6, b98f2d77, eb528822, 50e442b6, cede5097.
- Deploy: pending.
