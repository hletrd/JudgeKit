# Architect - Cycle 3/100 (2026-06-30)

Inventory reviewed: deployment architecture, split app/worker targets, compose topology, nginx templates, scripts/docs, review carry-forward notes, and test structure.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the architecture perspective.

## Findings

### ARCH-C3-1 - Deployment hardening contract is split between docs and implementation
- Severity: Medium
- Confidence: High
- Evidence: `AGENTS.md:427` says all `.env*` deploy profiles are `0600`; `deploy-docker.sh:141-158` sources local deploy profiles without permission handling.
- Problem: hardening lives partly as operator lore instead of a deploy invariant. Architecture-wise, deployment should fail/heal at the boundary where it ingests secret-bearing files.
- Suggested fix: centralize local profile sourcing behind a helper that enforces mode first.

### ARCH-C3-2 - Nginx config syntax is duplicated across deploy systems
- Severity: Low/Medium
- Confidence: High
- Evidence: duplicated deprecated syntax in `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, and `static-site/static.nginx.conf:10-11`.
- Problem: three config sources drift independently. Even if the Docker deploy path is primary, legacy/static configs can keep stale syntax alive.
- Suggested fix: update all checked-in nginx config sources in the same commit and add one source-grep test over all of them.

## Final Sweep

The app/worker split for `algo` and `worv` remains encoded in target profiles, tests, and deploy docs. No new architectural regression was found in the Docker socket proxy boundary.
