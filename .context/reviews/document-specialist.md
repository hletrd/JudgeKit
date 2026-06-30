# Document Specialist - Cycle 3/100 (2026-06-30)

Inventory reviewed: `AGENTS.md`, `CLAUDE.md`, `docs/deployment.md`, `docs/deployment-automation.md`, nginx scripts, deploy script comments, and prior plans.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the documentation perspective.

## Findings

### DOC-C3-1 - Env hardening documentation overstates local deploy-profile enforcement
- Severity: Medium
- Confidence: High
- Evidence: `AGENTS.md:427` vs. `deploy-docker.sh:141-158`.
- Problem: docs say `.env.deploy*` files are part of the `0600` hardening set, but the script only enforces modes for generated `.env.production`, remote `.env.production`, and worker `.env`.
- Failure scenario: an operator believes `.env.deploy.<target>` is automatically protected because AGENTS says all `.env*` files are covered, but the script never touches a permissive local profile.
- Suggested fix: make the script match the docs; no docs downgrade needed.

### DOC-C3-2 - Nginx templates are stale against current nginx deprecation guidance
- Severity: Low
- Confidence: High
- Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`.
- Problem: deployment docs point operators to templates that emit deprecated syntax.
- Suggested fix: update templates and generated config together.

## Final Sweep

The corrected target names in `docs/deployment.md:147-159` match the user instruction: `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`.
