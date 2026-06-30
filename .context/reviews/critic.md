# Critic - Cycle 3/100 (2026-06-30)

Inventory reviewed: recent cycle plans, aggregate findings, deployment scripts, target docs, nginx configs, Docker compose runtime, test coverage, and UI/browser feasibility.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the critic perspective.

## Findings

### CRIT-C3-1 - The deploy loop still tolerates known warning noise
- Severity: Low/Medium
- Confidence: High
- Evidence: cycle-2 plan warning at `plan/cycle-2-2026-06-30-worker-register-remediation.md:64`; live source at `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, and `static-site/static.nginx.conf:10-11`.
- Problem: after cycle 2 restored production health, preserving that health means removing known warning sources before they become accepted background noise.
- Failure scenario: a per-cycle deploy fails on a real nginx issue, but the log already contains expected HTTP/2 deprecation warnings, slowing triage.
- Suggested fix: update syntax and add a static guard.

### CRIT-C3-2 - Env profile hardening is documented more strongly than it is enforced
- Severity: Medium
- Confidence: High
- Evidence: `AGENTS.md:427` vs. `deploy-docker.sh:141-158`.
- Problem: the docs say all `.env*` profiles are protected, but the script only hardens generated/remote `.env.production` and worker `.env` paths. The local deploy profiles are consumed as-is.
- Failure scenario: future target credential drift creates a readable `.env.deploy.<target>`; the deploy succeeds, leaving the exposure latent.
- Suggested fix: chmod local deploy profiles before sourcing them and test the contract.

## Final Sweep

The corrected deploy target set is represented in docs/tests: `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; no `oj.worv.ai` production path was found.
