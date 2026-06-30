# Debugger - Cycle 3/100 (2026-06-30)

Inventory reviewed: deploy failure paths, nginx reload path, worker health polling, env sourcing, storage checks, and existing infra tests.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the debugger perspective.

## Findings

### DBG-C3-1 - Known nginx warning can hide the first useful failure line
- Severity: Low
- Confidence: High
- Evidence: `deploy-docker.sh:1452-1453`; cycle-2 warning record at `plan/cycle-2-2026-06-30-worker-register-remediation.md:64`.
- Problem: debugging deploy failures depends heavily on scanning remote output. Known warnings reduce signal.
- Failure scenario: `nginx -t` returns mixed output containing the deprecated HTTP/2 warning plus a real error; operator spends time chasing the already-known warning.
- Suggested fix: update syntax and add a regression test.

### DBG-C3-2 - Readable deploy profile is silent until someone audits file modes
- Severity: Medium
- Confidence: High
- Evidence: `deploy-docker.sh:141-158`.
- Problem: a bad profile mode produces no deploy error, no warning, and no log line.
- Failure scenario: credentials are exposed locally but every deployment appears successful.
- Suggested fix: chmod profile files before sourcing and log only the profile path, not contents.

## Final Sweep

The worker health failure message is now neutral and includes sanitized logs, so the cycle-2 misdiagnosis class remains fixed.
