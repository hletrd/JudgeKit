# Review Aggregate - Cycle 3/100 (2026-06-30)

Scope: continuation after cycle 2 reported `DEPLOY: per-cycle-success`; preserve production deployment health for `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; verify storage-safe cleanup constraints before any deploy/build.

Agent note: no callable Agent tool is registered in this environment, so the mandatory reviewer roles and project-specific reviewer personas were executed in-session and written to `.context/reviews/<agent-name>.md`. UI review was included because the repo contains a Next.js frontend. `agent-browser` was available, but local `/` and `/login` requests hung under the local runtime environment, so no DOM/screenshot product finding is claimed.

## Merged Findings

### C3-1 - Low/Medium - Generated and checked-in nginx configs use deprecated HTTP/2 listen syntax
Agreement: code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, admin-reviewer, security-analyzer.

Evidence: `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`, and the cycle-2 warning register at `plan/cycle-2-2026-06-30-worker-register-remediation.md:64`.

Why it matters: nginx currently accepts `listen ... ssl http2` with a deprecation warning, but every known warning reduces deploy-log signal and future nginx versions may reject the syntax. In per-cycle deploy mode this can fail the deploy after build/migration work has already run.

Failure scenario: `nginx -t` on one of the three production targets fails or emits mixed output during deploy; operators must triage known HTTP/2 deprecation noise while preserving worker/app health.

Fix: replace `listen 443 ssl http2` and `listen [::]:443 ssl http2` with `listen 443 ssl`, `listen [::]:443 ssl`, and a separate `http2 on;` directive in generated and checked-in nginx configs. Add a static regression test that rejects `listen ... http2`.

Confidence: High.

### C3-2 - Medium - Local deploy profiles are sourced before `.env.deploy*` permission hardening
Agreement: code-reviewer, security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, admin-reviewer, security-analyzer.

Evidence: `deploy-docker.sh:141-158` sources `.env.deploy` and `.env.deploy.<target>` directly. `AGENTS.md:427` says the cycle-2 hardening extended to all `.env*` files including `.env.deploy*` at `0600`.

Why it matters: target deploy profiles can contain SSH/deploy credentials or secret-bearing runner settings. If a file is created with default `umask 0022`, deployment succeeds while credentials remain readable by group/other users.

Failure scenario: an operator adds `SSH_PASSWORD`, `SSH_KEY`, or token material to `.env.deploy.<target>` and leaves it `0644`; the script sources it silently and leaves the exposure in place.

Fix: add a helper that enforces `chmod 600` on local deploy profiles before sourcing them, preserving caller overrides. Add a static test for chmod-before-source ordering.

Confidence: High.

## Non-Findings / Verified Constraints

- Correct deploy targets remain `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; no production `oj.worv.ai` path was found.
- Automated storage cleanup still avoids Docker volumes and `docker image prune -af`.
- Cycle-2 dedicated worker URL reconciliation and HTTPS fail-closed behavior remain present.

## AGENT FAILURES

- No reviewer agent was retried via the Agent tool because no Agent tool is exposed in this environment. The role outputs were produced in-session as a fallback.
