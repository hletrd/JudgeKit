# Admin Perspective Review: JudgeKit

**Reviewer**: System Administrator (user management, deployment, monitoring, backups)
**Date**: 2026-04-17 (Post-Plan-008)

---

## 1. Deployment and Configuration — 7/10

**What works well:**

Docker Compose production setup is well-structured. App server and judge worker are separated (algo.xylolabs.com vs worker-0). Environment-based configuration is comprehensive. Docker socket proxy (not direct mount) is used for judge worker communication. The worker uses Rust with bollard for Docker API, containers run with seccomp profiles, and resource limits (memory/CPU/PID) are applied per container. Docker socket proxy now restricted to `CONTAINERS=1` only.

**What needs improvement:**

- **No automated deployment pipeline.** No CI/CD configuration in the repository. Deploys appear to be manual SSH-based operations.
- **No infrastructure-as-code.** No Terraform, Ansible, or similar provisioning.
- **Seccomp profile is not in the repository.** The path is configured but the profile itself was not found — a misconfigured or missing profile negates the sandbox.
- **No health check endpoints on worker containers.** The app has `/api/v1/health` but the worker has no equivalent.
- **Worker Docker compose allows BUILD and DELETE through socket proxy.** More permissive than the production compose, which only allows `CONTAINERS=1`.

---

## 2. Backup and Recovery — 7/10

**What works well:**

Backup now includes file uploads via ZIP archive (`database.json` + `uploads/` folder). Restore handles both ZIP and legacy JSON formats. Password re-confirmation required for both operations. Audit events are recorded. `restoreFilesFromZip` validates against path traversal attacks. Data retention policies exist with automated cleanup.

**What needs improvement:**

- **CRITICAL: Backups include password hashes and all secrets by default.** `streamDatabaseExport()` is called without `sanitize: true` at `backup/route.ts:90`, and `REDACTED_COLUMNS` is an empty object (`export.ts:272`). Any backup file leak exposes every user's password hash and every active session token.
- **No backup encryption.** ZIP archives contain database dumps with user emails, password hashes, and submission source code — all unencrypted at rest.
- **No backup integrity verification.** No checksum validation on restore.
- **Restore is destructive with no rollback.** No pre-restore snapshot. A failed restore could leave the system in a broken state.
- **No automated backup scheduling.** Manual-only.
- **Backup/restore UI hardcodes `isSuperAdmin`** despite the `system.backup` capability existing.

---

## 3. Monitoring and Observability — 5/10

**What works well:**

Health endpoint (`/api/v1/health`) checks DB connectivity, reports uptime, version, and response time. Audit logs record significant operations. Login logs track authentications. Worker status is visible on the admin workers page.

**What needs improvement:**

- **No Prometheus metrics export.** No `/metrics` endpoint for Prometheus scraping.
- **No Grafana dashboards.** No pre-built dashboards for queue depth, judge latency, error rates.
- **No alerting.** Worker goes offline, queue grows, disk fills — nobody knows.
- **No structured log aggregation.** Pino logger is good but no ELK/Loki/CloudWatch integration.
- **No distributed tracing.** A submission goes through API → DB → queue → worker → judge → result — no way to trace the full lifecycle.
- **Audit logs have no export.** Robust filtering but no CSV/JSON export.
- **Login logs have no date range filter.** Only filters by outcome and search text.

---

## 4. User Management — 7/10

**What works well:**

Full CRUD for users with role assignment. Role system now supports 5 built-in roles plus custom roles via the capability system. Password policies include minimum length. Anti-enumeration via dummy hash. JWT invalidation on password change.

**What needs improvement:**

- **No 2FA/MFA.** Admin and instructor accounts have no second factor. Critical for a platform handling exams and recruiting.
- **No SSO/SAML/OIDC integration.** Only email/password and OAuth (Google/GitHub). Universities typically require SAML/Shibboleth.
- **No account lockout policy.** Rate limiting exists but no persistent lockout after N failed attempts.
- **No user import (CSV/batch).** Adding students requires one-at-a-time enrollment.
- **No password expiration policy.** Passwords never expire.

---

## 5. Security Operations — 6.5/10

**What works well:**

CSP with per-request nonces. Rate limiting on API routes. CSRF protection (3-layer: X-Requested-With, Sec-Fetch-Site, Origin/Host). Argon2id password hashing. Docker socket proxy restricted. IP allowlist for judge routes. Per-worker judge auth tokens. DOMPurify sanitization. ZIP bomb protection.

**What needs improvement:**

- **No automated vulnerability scanning.** No Dependabot, Snyk, or Trivy integration.
- **No secrets management.** Sensitive values in `.env` files with no vault integration.
- **In-memory rate limiter resets on process restart.** An attacker could crash the Next.js process via DoS, then brute-force during the reset window.
- **No WAF or rate limiting at the reverse proxy level.** Application-level only.
- **No incident response documentation.** No runbooks for common security scenarios.

---

## Summary Scorecard

| Area | Score | Key Issue |
|---|---|---|
| Deployment | 7/10 | No CI/CD, seccomp profile missing |
| Backup/Recovery | 7/10 | CRITICAL: backups leak password hashes by default |
| Monitoring | 5/10 | No Prometheus/Grafana, no alerting |
| User Management | 7/10 | No 2FA, no SSO |
| Security Ops | 6.5/10 | No vulnerability scanning, rate limit reset on crash |
| **Overall** | **6/10** | Adequate for small deployments, missing production ops |
