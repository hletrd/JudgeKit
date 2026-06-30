# Architect - Cycle 2/100 (2026-06-30)

## Findings

### C2-1 - High - Split-host deploy lacks a single source of truth for worker app URL
- Evidence: the app target URL is managed in remote `.env.production`, but dedicated workers keep a separate `.env` that deploys do not reconcile.
- Failure scenario: app and worker configuration drift independently; app deploys can be green while worker registration is permanently red.
- Fix: during split-host deploy, derive the worker control-plane URL from `AUTH_URL_TARGET` and apply it to every worker host before restart.
- Confidence: High.

### C2-7 - Low/Medium - Worker host secrets remain manually managed
- Evidence: the worker deploy path updates source/image but not secret material such as `JUDGE_AUTH_TOKEN` or `RUNNER_AUTH_TOKEN`.
- Failure scenario: future token rotation on the app host can strand workers with 401 registration or runner-admin failures.
- Suggested follow-up: add an explicit, auditable worker secret sync/rotation mode rather than silently copying secrets in routine deploys.
- Confidence: Medium.
