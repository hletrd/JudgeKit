# Verifier - Cycle 3/100 (2026-06-30)

Inventory reviewed: current git state, prior aggregate, plan directory, deployment scripts, nginx templates, target tests, and storage-safety assertions.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the verifier perspective.

## Confirmed Behaviors

- `deploy-docker.sh` rejects unknown `DEPLOY_TARGET` values and supports only `algo`, `worv`, and `auraedu` plus alias `oj`.
- `tests/unit/infra/deploy-storage-safety.test.ts` pins `worv` to `test.worv.ai` and rejects `oj.worv.ai`.
- Storage cleanup tests reject `docker volume prune`, `docker system prune --volumes`, and `docker image prune -af` in automated paths.

## Findings

### VER-C3-1 - HTTP/2 deprecation warning exit criterion is still open
- Severity: Low
- Confidence: High
- Evidence: plan exit criterion at `plan/cycle-2-2026-06-30-worker-register-remediation.md:64`; current source at `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`.
- Problem: the plan says the issue closes when generated HTTPS config is updated and verified on all targets; the source has not been updated yet.
- Suggested fix: implement source change, run `npm run lint:bash`, and let the per-cycle deploy verify `nginx -t` on `algo`, `worv`, and `auraedu`.

### VER-C3-2 - Local deploy profile permission policy is not mechanically enforced
- Severity: Medium
- Confidence: High
- Evidence: `deploy-docker.sh:141-158`, `AGENTS.md:427`.
- Problem: documented `0600` policy for `.env.deploy*` has no pre-source enforcement.
- Suggested fix: chmod local deploy profiles before sourcing and add tests.

## Final Sweep

No deployment-target regression was found. The storage requirement from the user-injected TODO remains represented by tests and should be re-verified before deploy.
