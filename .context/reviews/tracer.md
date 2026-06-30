# Tracer - Cycle 3/100 (2026-06-30)

Inventory reviewed: deploy target resolution, env profile flow, nginx config generation, worker restart flow, storage cleanup flow, and cycle-2 recovery notes.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the causal tracing perspective.

## Findings

### TRACE-C3-1 - Causal path from env profile creation to credential exposure has no guard
- Severity: Medium
- Confidence: High
- Evidence: `deploy-docker.sh:141-158`; `AGENTS.md:427`.
- Chain: operator creates or edits `.env.deploy.<target>` under default `umask 0022` -> file is `0644` -> deploy script sources it without chmod -> credentials remain readable after successful deploy.
- Suggested fix: apply chmod before source so the script heals the profile at first use.

### TRACE-C3-2 - Causal path from deprecated nginx syntax to failed deploy remains open
- Severity: Low/Medium
- Confidence: High
- Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`.
- Chain: deploy writes generated config -> target nginx version warns on `listen ... http2` -> future target version rejects syntax -> `nginx -t` fails -> per-cycle deploy stops after build/migration work.
- Suggested fix: switch to `http2 on;` now while the deploy is healthy.

## Final Sweep

The cycle-2 algo recovery path is preserved: worker URL reconciliation, HTTPS fail-closed guard, health polling, and sanitized logs are present.
