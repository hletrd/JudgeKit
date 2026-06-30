# Perf Reviewer - Cycle 3/100 (2026-06-30)

Inventory reviewed: deploy script build flow, Docker cleanup/storage checks, nginx templates, worker restart polling, Rust worker executor/runner, Next.js app routes, and test gates.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the performance/reliability perspective.

## Findings

### PERF-C3-1 - Deprecated nginx HTTP/2 syntax creates avoidable deploy friction
- Severity: Low
- Confidence: High
- Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`.
- Problem: every deploy that reloads nginx can emit avoidable warnings. This adds noise to already long deploy logs and can obscure real warnings around storage, worker health, or TLS.
- Failure scenario: during a deadline-rush incident, operators search deploy logs for the worker/storage failure and must filter out repeated nginx syntax warnings on all three targets.
- Suggested fix: emit modern `http2 on;` syntax and pin it with a source-level test.

## Final Sweep

The storage preflight and post-deploy cleanup contract still uses stopped-container, dangling-image, BuildKit cache, and BuildKit history cleanup only. No automated volume prune path was found.
