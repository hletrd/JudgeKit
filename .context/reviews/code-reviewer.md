# Code Reviewer - Cycle 3/100 (2026-06-30)

Inventory reviewed: `deploy-docker.sh`, `scripts/online-judge.nginx.conf`, `static-site/static.nginx.conf`, `tests/unit/infra/*`, `docker-compose.production.yml`, `src/app/api/v1/**/route.ts`, `src/lib/security/**`, `judge-worker-rs/src/**`, `docs/deployment.md`, prior cycle aggregate/plan.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the code-review perspective.

## Findings

### CR-C3-1 - Deprecated nginx HTTP/2 listen syntax remains in generated and checked-in configs
- Severity: Low/Medium
- Confidence: High
- Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`.
- Problem: the configs use `listen ... ssl http2`, which current nginx versions warn is deprecated. The cycle-2 deploy plan already recorded this as an observed deploy warning.
- Failure scenario: a future nginx package tightens this from warning to invalid config, causing `nginx -t` to fail during the per-cycle deploy after the app/worker build work completed.
- Suggested fix: switch to `listen 443 ssl;` plus a separate `http2 on;` directive per TLS server block, and add a static test that rejects `listen ... http2`.

### CR-C3-2 - Deploy profile files are sourced before local permission hardening
- Severity: Medium
- Confidence: High
- Evidence: `deploy-docker.sh:141-158` sources `.env.deploy` and `.env.deploy.<target>` directly; `AGENTS.md:427` says all `.env*` including `.env.deploy*` are expected to be `0600`.
- Problem: target profiles often carry SSH keys, passwords, runner URLs, or other deploy secrets. If a profile is created under a permissive umask, the script consumes it without correcting or warning.
- Failure scenario: an operator adds `SSH_PASSWORD` or a private key path/token to `.env.deploy.<target>` and leaves it `0644`; the deploy succeeds while local users can read the credentials.
- Suggested fix: add a small helper that `chmod 600`s each local deploy profile before sourcing it, preserving caller overrides.

## Final Sweep

No additional confirmed code-quality findings were found in the inspected API, worker, security, and deploy paths. The Compose `POSTGRES_PASSWORD` warning from cycle 2 remains a broader follow-up because the production startup paths already pass `--env-file .env.production` and the down path copies `.env.production` to `.env`.
