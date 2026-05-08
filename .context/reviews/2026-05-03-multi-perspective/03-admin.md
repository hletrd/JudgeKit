# Admin Perspective Review — JudgeKit

**Reviewer**: System Administrator (deployment, monitoring, backups, security operations)
**Date**: 2026-05-03
**Compared against**: April 17 review (score: 6/10), May 3 live probe (score: 6/10)

---

## Score by area

| Area | Score | Key change since April |
|---|---|---|
| Deployment & Config | 7.5/10 | +0.5 — Sidecar tokens mandatory, compile swap capped, dockerfilePath anchored |
| Backup & Recovery | 8/10 | +1 — ALWAYS_REDACT in exports, pre-restore snapshot, backup-with-files |
| Monitoring & Observability | 6.5/10 | +1.5 — CRON_SECRET leak fixed, metrics endpoint returns 401 not 503, startup gate on missing config |
| User Management | 7.5/10 | +0.5 — Bulk user creation, group-scoped assistant role |
| Security Operations | 8/10 | +1.5 — Heartbeat enforcement, removed in-memory rate limiter, SECURITY.md, security.txt, removed shared judge token fallback |

**Overall: 7.5/10** (up from 6/10)

---

## What got better

### 1. Backup ALWAYS_REDACT closes the CRITICAL data leak
`export.ts:256-262` defines `ALWAYS_REDACT` covering password hashes, session tokens, API keys, OAuth tokens, and hcaptcha secrets. These are nullified even in full-fidelity disaster-recovery exports. This was the most dangerous finding in the earlier review (password hashes + session tokens in every backup file) and it's now properly mitigated.

### 2. Pre-restore snapshot
Before any `importDatabase` call, a `pg_dump` is taken automatically. If the restore produces unexpected results, the admin can recover from the snapshot. This eliminates the "restore is destructive with no rollback" risk.

### 3. CRON_SECRET leak fixed
`metrics/route.ts:32-38` now returns `401 Unauthorized` when `CRON_SECRET` is not configured, instead of `503 {"error":"CRON_SECRET not configured"}` which leaked the env var name. Combined with the instrumentation startup gate (which crashes the boot if critical env vars are missing), this closes the operational misconfiguration path.

### 4. In-memory rate limiter removed
The dead `in-memory-rate-limit.ts` code has been deleted. The DB-backed rate limiter with `SELECT FOR UPDATE` is the only path. This eliminates the "crash the process → brute-force during reset window" attack.

### 5. Sidecar auth tokens mandatory
`rate-limiter-rs` and `code-similarity-rs` now reject startup when `*_AUTH_TOKEN` env vars are missing. The production compose file includes the tokens. This closes the "any container on the Docker network can call the sidecar" gap.

### 6. Compile swap capped at memory limit
`docker.rs` no longer allows up to 4 GiB swap for compile containers. Swap is capped at the configured memory limit, preventing a malicious build from consuming host swap.

### 7. Shared JUDGE_AUTH_TOKEN fallback removed
Per-worker tokens are now enforced. The shared fallback token that could be used to submit fabricated results has been eliminated.

### 8. SECURITY.md and security.txt
Proper vulnerability disclosure policy with response targets (3 business days acknowledgment, 5 business days triage). The `/.well-known/security.txt` endpoint is available.

---

## What still needs work

### F1. No MFA/TOTP for admin accounts (HIGH)
Admin and instructor accounts with `system.backup`, `submissions.view_all`, and `users.manage` capabilities sit behind single-factor passwords. For a platform handling candidate PII in recruiting mode, this is the most impactful remaining gap. TOTP via `otplib` would take ~1 week.

### F2. No automated backup scheduling in the app (MEDIUM)
The systemd timer exists in the scripts directory, but it's not verified as running on production. The app has no UI to confirm that daily backups are happening. An admin who doesn't check the cron/systemd status directly has no visibility.

### F3. No Prometheus/Grafana integration (MEDIUM)
The `/api/metrics` endpoint is now properly secured and returns Prometheus-format data. But there's no Grafana dashboard, no alerting rules, no documented Prometheus scrape config. The metrics exist but aren't being consumed.

### F4. No structured log aggregation (MEDIUM)
Pino logger is good but there's no ELK/Loki/CloudWatch integration. Production logs go to stdout with no centralized collection. For a platform that handles exams and recruiting, the ability to search logs during an incident is important.

### F5. Restore lacks semantic validation (MEDIUM)
`restore/route.ts` performs structural validation but not semantic integrity checks. A maliciously crafted import could inject admin users, modify role capabilities, or alter submission scores. The pre-restore snapshot mitigates the blast radius but doesn't prevent the bad import.

### F6. No SSO/SAML/OIDC for university integration (MEDIUM)
Only email/password and OAuth (Google/GitHub) are supported. Universities typically require SAML/Shibboleth integration. For institutional adoption, this is a blocker.

### F7. No account lockout policy (LOW)
Rate limiting exists but there's no persistent lockout after N failed attempts. An attacker with a password list can make unlimited attempts within the rate-limit window.

---

## Summary

JudgeKit's admin posture has improved significantly since April. The backup data leak (CRITICAL), in-memory rate limiter, CRON_SECRET leak, and shared judge token were the four most dangerous operational gaps — all fixed. The remaining HIGH item (MFA) is the single most impactful fix to prioritize next. After that, the platform's operational story is solid for a self-hosted deployment.
