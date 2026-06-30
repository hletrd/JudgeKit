# Cycle 3 (2026-06-30) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 3/100).

Repo rules read before planning: `CLAUDE.md`, `AGENTS.md`, `.context/README.md`, `.context/development/conventions.md`, `.context/development/documentation-rules.md`, `.context/development/open-workstreams.md`, `.context/plans/README.md`, `.context/project/current-state.md`, `docs/admin-security-operations.md`, `docs/data-retention-policy.md`, `docs/deployment-automation.md`, `docs/deployment.md`, and `docs/transcript-access-policy.md`. No `.cursorrules` or `CONTRIBUTING.md` exists.

Cycle constraints:
- Deploy mode is per-cycle.
- Correct deploy targets are `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; never deploy to `oj.worv.ai`.
- Preserve cycle-2 deployment health. If app/worker health regresses, treat it as a deployment blocker.
- Before deploy/build, verify target storage posture and rely on safe cleanup only: stopped containers, dangling images, BuildKit cache/history. Never run `docker system prune --volumes`, automated `docker volume prune`, or delete PostgreSQL/user-data volumes.
- Use semantic git messages with gitmoji and signed commits.

## Phase A - Implement This Cycle

### A1. Modernize Nginx HTTP/2 Syntax
- Findings: C3-1.
- Original severity/confidence: Low/Medium, High.
- Files: `deploy-docker.sh`, `scripts/online-judge.nginx.conf`, `static-site/static.nginx.conf`, `tests/unit/infra/judge-report-nginx.test.ts`.
- Plan:
  1. Replace every `listen ... ssl http2` directive with `listen ... ssl` plus a separate `http2 on;` directive in the same TLS server block.
  2. Update generated Docker-deploy nginx config and checked-in systemd/static-site templates together to avoid config drift.
  3. Add a source-level infra test that rejects `listen ... http2` in deploy/script/static nginx sources and requires `http2 on;`.
- Progress: [x] Implemented. Generated Docker-deploy nginx config, the legacy systemd nginx template, and the static-site nginx template now use `listen 443 ssl` plus `http2 on;`. `tests/unit/infra/judge-report-nginx.test.ts` rejects deprecated `listen ... http2` syntax.

### A2. Enforce Local Deploy Profile Permissions Before Sourcing
- Findings: C3-2.
- Original severity/confidence: Medium, High.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-security.test.ts`.
- Plan:
  1. Add a helper for local deploy env profiles that `chmod 600`s the file before `source`.
  2. Use the helper for `.env.deploy` and `.env.deploy.<target>` while preserving the existing caller-override precedence.
  3. Add a static test that pins chmod-before-source ordering for both default and target profiles.
- Progress: [x] Implemented. `deploy-docker.sh` now routes `.env.deploy` and `.env.deploy.<target>` through `source_local_env_profile`, which `chmod 600`s the profile before sourcing it. `tests/unit/infra/deploy-security.test.ts` pins the helper and ordering.

### A3. Storage and Deploy Verification
- Findings: user-injected storage/deploy TODO, C3 non-findings.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-storage-safety.test.ts`.
- Plan:
  1. Before the per-cycle deploy, verify the deploy script still has DockerRootDir-aware storage preflight and safe cleanup only.
  2. Confirm no automated path contains `docker volume prune`, `docker system prune --volumes`, or `docker image prune -af`.
  3. Run every configured gate before deploying.
  4. Run the exact per-cycle deploy command once after commits/gates, using `DEPLOY_TARGET=algo`, `DEPLOY_TARGET=worv`, and `DEPLOY_TARGET=auraedu` only.
- Progress: [ ] Not started.

## Deferred Register

No cycle-3 findings are deferred. Both aggregate findings are scheduled for implementation in Phase A.

Carry-forward warnings from the archived cycle-2 plan remain recorded there:
- BuildKit secret-in-env warning.
- Compose `POSTGRES_PASSWORD` interpolation warning.
- Third-party judge image compiler/build warnings.

## Phase B - Progress Tracking

- [x] A1 nginx HTTP/2 syntax modernized.
- [x] A2 local deploy profile permission hardening implemented.
- [ ] A3 storage verification and no-volume-prune contract checked before deploy.
- Gates: [ ] Focused checks passed: `npm run test:unit -- tests/unit/infra/judge-report-nginx.test.ts tests/unit/infra/deploy-security.test.ts tests/unit/infra/deploy-storage-safety.test.ts`; `npm run lint:bash`.
- Commits: [x] 429f27af (`docs(review): 📝 record cycle 3 remediation plan`), b2edee07 (`fix(deploy): 🛡️ harden nginx and env profiles`).
- Deploy: [ ] pending.
