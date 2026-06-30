# Security Reviewer - Cycle 3/100 (2026-06-30)

Inventory reviewed: `src/lib/security/**`, auth/session env guards, admin/judge API routes, sandbox worker code, Docker socket proxy config, deploy scripts, nginx templates, and prior security/deploy reviews.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the security perspective.

## Findings

### SEC-C3-1 - Local deploy profiles are not permission-hardened before sourcing
- Severity: Medium
- Confidence: High
- Evidence: `deploy-docker.sh:141-158`; policy at `AGENTS.md:427`.
- Problem: `.env.deploy*` files are explicitly included in the repo's "all `.env*` files are 0600" hardening note, but the deploy script sources them before any chmod/check.
- Failure scenario: a profile containing `SSH_PASSWORD`, `SSH_KEY`, `RUNNER_AUTH_TOKEN`, or target-specific credentials is left group/world-readable by a permissive umask. The deploy proceeds successfully, so the misconfiguration can persist unnoticed.
- Suggested fix: enforce `chmod 600` on existing `.env.deploy` and `.env.deploy.<target>` before `source`, and add a static test for the helper order.

### SEC-C3-2 - Nginx HTTP/2 deprecation warning weakens deploy signal
- Severity: Low
- Confidence: High
- Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`.
- Problem: this is not a direct vulnerability, but repeated known warnings are security-operational debt: they normalize noisy deploy output and can mask meaningful TLS/header/config warnings.
- Suggested fix: update all nginx config generators/templates to the non-deprecated `http2 on;` directive and test for absence of `listen ... http2`.

## Final Sweep

No regression was found in the cycle-2 worker URL HTTPS fail-closed behavior or Docker cleanup policy. No automated `docker volume prune` or `docker system prune --volumes` path was found.
