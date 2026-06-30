# Test Engineer - Cycle 3/100 (2026-06-30)

Inventory reviewed: `tests/unit/infra/*`, e2e support, component/unit suites, deploy scripts, nginx templates, and prior warning/deploy plans.

Agent availability: no callable Agent tool is exposed in this environment, so this review was performed in-session from the test engineering perspective.

## Findings

### TEST-C3-1 - No test prevents deprecated nginx HTTP/2 syntax from returning
- Severity: Low/Medium
- Confidence: High
- Evidence: source occurrences at `deploy-docker.sh:1452-1453`, `scripts/online-judge.nginx.conf:27-40`, `static-site/static.nginx.conf:10-11`; existing nginx test at `tests/unit/infra/judge-report-nginx.test.ts:9-25` checks body-size guardrails only.
- Problem: tests cover the judge report body-size locations but not deploy-time nginx syntax compatibility.
- Failure scenario: a future nginx template edit reintroduces deprecated or invalid syntax and only appears during a production deploy.
- Suggested fix: extend the nginx infra test to reject `listen ... http2` and require `http2 on;`.

### TEST-C3-2 - No test pins chmod-before-source for local deploy profiles
- Severity: Medium
- Confidence: High
- Evidence: deploy profile source block at `deploy-docker.sh:141-158`; security test coverage in `tests/unit/infra/deploy-security.test.ts`.
- Problem: existing deploy security tests cover remote `.env` chmod but not local `.env.deploy*` profiles.
- Failure scenario: a future edit keeps sourcing target profiles but drops permission hardening.
- Suggested fix: add a static deploy-security test for the helper and ordering.

## Final Sweep

The requested full gates remain necessary after implementation. The test plan should include at least the touched infra tests before the whole-gate run.
