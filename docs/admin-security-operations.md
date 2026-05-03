# Admin security operations

_Last updated: 2026-04-17_

This guide documents the current operational security baseline for admin and instructor access, plus the integration points for stronger enterprise controls.

## Current built-in baseline

### Login lockout policy
- login attempts are tracked in PostgreSQL-backed rate-limit state
- lockouts survive app restarts because the authoritative state is persisted in the database
- the default policy is driven by system settings / env-backed defaults:
  - `loginRateLimitMaxAttempts`
  - `loginRateLimitWindowMs`
  - `loginRateLimitBlockMs`
- repeated violations escalate the effective block duration via the existing exponential backoff path

### Session invalidation
- password changes and account deactivation invalidate JWT-backed sessions through `tokenInvalidatedAt`
- invalidated tokens are cleared of identity and preference claims before reuse

### Dependency scanning baseline
- CI runs `npm audit --audit-level=high`
- CI runs `cargo audit`
- Dependabot monitors:
  - npm dependencies
  - Rust crates (`judge-worker-rs`, `code-similarity-rs`, `rate-limiter-rs`)
  - GitHub Actions workflows

## MFA and SSO status

JudgeKit does **not** currently ship native MFA or institution-grade SSO (SAML/OIDC) for admin/instructor sign-in.

### Recommended integration point today
Until native support exists, deploy higher-assurance admin access behind an external identity-aware control plane such as:
- a reverse proxy / access gateway with IdP-backed MFA
- institution-managed SSO in front of the admin hostname
- IP allowlisting / VPN requirements for admin-only entry points

### What to protect first
- `/dashboard/admin/*`
- deployment hosts and SSH access
- any workstation or CI environment that can run `deploy-docker.sh`
- secrets used for backups, judge workers, and runtime auth

## Secret management baseline

JudgeKit currently relies on environment variables rather than a built-in vault integration.

### Required operator posture
- keep `.env` and `.env.production` out of version control
- restrict file permissions on deployment hosts and CI runners
- rotate leaked secrets using `docs/operator-incident-runbook.md`
- prefer a platform secret store (host secret manager, CI secrets, cloud secret store) over hand-copying values between machines

### Secrets that deserve the highest handling bar
- `AUTH_SECRET`
- `JUDGE_AUTH_TOKEN` (bootstrap only — per-worker `secretTokenHash` is the steady-state credential)
- `RUNNER_AUTH_TOKEN`
- `CRON_SECRET` — bearer for `/api/metrics` and `/api/internal/cleanup`. Production startup gate refuses to boot without it.
- `CODE_SIMILARITY_AUTH_TOKEN` — required by the similarity sidecar in `docker-compose.production.yml` (`${VAR:?}`). Compose refuses to start without it.
- `RATE_LIMITER_AUTH_TOKEN` — required by the rate-limiter sidecar (same compose contract).
- `PLUGIN_CONFIG_ENCRYPTION_KEY`
- database credentials
- backup artifacts that include full-fidelity secrets

## Reverse proxy and perimeter controls

JudgeKit does not ship a full WAF, but the default deployment path already includes reverse-proxy rate limiting in nginx for:
- auth/login-sensitive traffic
- judge/worker-sensitive traffic

Recommended production posture:
- keep those nginx rate limits enabled
- restrict admin access by network boundary where possible (VPN, allowlist, access proxy)
- terminate TLS at a controlled reverse proxy or access gateway
- add an external WAF or access proxy when institutional policy requires it

## Operator checklist
- review login-log and audit-log exports during investigations
- verify lockout settings before high-stakes launches
- rotate leaked credentials using `docs/operator-incident-runbook.md`
- review `docs/judge-worker-incident-runbook.md` for worker-boundary incidents

## Future native work
- app-native MFA enrollment/recovery flow
- institution-facing SSO/SAML/OIDC sign-in
- role-aware admin session hardening and risk-based step-up auth
