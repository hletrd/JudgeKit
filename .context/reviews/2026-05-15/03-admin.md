# Admin Review — JudgeKit — 2026-05-15

**Reviewer persona:** Platform operator responsible for production uptime, security patches, user management, backup verification, and incident response. Deploys to `algo.xylolabs.com` and `worker-0.algo.xylolabs.com`. Has been woken up at 3 a.m. by a failing judge worker before.
**Method:** Inspected `src/app/(dashboard)/dashboard/admin/`, `deploy-docker.sh`, `docker-compose.production.yml`, `docs/`, `scripts/`, `src/lib/db/`, `src/lib/auth/`. Walked the full deploy pipeline, backup workflow, and monitoring surface.
**Scope:** Production operability, security posture, disaster recovery, observability, scaling.

## Verdict (1-10) per responsibility

| Area | Score | One-line summary |
|---|---|---|
| User management | **7/10** | Bulk create, role assignment, password reset, and activation toggles exist. Custom roles with capabilities are granular. No MFA. No SSO/OAuth2. |
| System settings | **7/10** | Platform modes, rate limits, judge defaults, and locale are runtime-configurable. Changes to session maxAge require restart (documented). |
| Backup / restore | **7.5/10** | Pre-restore snapshots with 0o700 permissions, automatic retention (5 snapshots), and DB-time consistency are above average. Backup verification script exists (`scripts/verify-db-backup.sh`). No automated daily-backup confirmation alert. |
| Deployment | **6.5/10** | `deploy-docker.sh` handles architecture detection, nginx config, and worker service setup. `SKIP_LANGUAGES=true` for app-server-only deploys is correct. But `CRON_SECRET` is not enforced, and the metrics endpoint has been 503ing for 12 days. |
| Monitoring / alerting | **4/10** | `/api/health` and `/api/metrics` exist. Health checks worker status. Metrics requires `CRON_SECRET`, which is unset in production. Prometheus cannot scrape. No alerting integration. |
| Security operations | **6/10** | Audit logs, login events, CSRF validation, rate limiting, and Argon2id password hashing are real. No MFA. No automated dependency scanning. No WAF rules documented. |
| Judge worker fleet | **6/10** | Multi-worker registration, heartbeats, atomic claim via `UPDATE...RETURNING`, and stale-reclaim logic are sound. Single-worker production deployment is a documented SPOF. No automated drain-before-restart. |

**Overall admin utility: 6.5/10.** The foundation is competent — the backup, audit, and deploy scripts show operational maturity. But the broken metrics endpoint, missing MFA, and worker-SPOF are sharp edges that will cut an operator during an incident.

---

## Top 5 things that work well

1. **Pre-restore snapshots with least-privilege permissions.** `src/lib/db/pre-restore-snapshot.ts` captures a full-fidelity DB export before any admin-driven restore. Directory is `0o700`, files are `0o600`, and only the 5 most recent snapshots are retained. This is the right safety net for a destructive operation.

2. **Audit logs with actor attribution.** `auditEvents` table captures `actorId`, `actorRole`, `action`, `resourceType`, `resourceId`, `ipAddress`, and `userAgent`. The admin audit-log page is searchable and filterable. This is better than many open-source OJs that log to stdout and lose everything on restart.

3. **Docker socket proxy isolation.** `docker-compose.production.yml` uses `tecnativa/docker-socket-proxy` as the only container with `/var/run/docker.sock` access. The judge worker talks to Docker through `tcp://docker-proxy:2375`, not directly. This is the right architecture for container security.

4. **Capability-based role system.** Custom roles can be created with arbitrary capability subsets. The capability cache (`src/lib/capabilities/cache.ts`) resolves role-to-capability mappings with TTL caching. This is more flexible than hardcoded role checks and enables "department-level admin" patterns.

5. **Platform mode switching.** `homework`, `exam`, `contest`, `recruiting` modes change UI labels, hide/show pages, and toggle AI assistant defaults from a single settings dropdown. This is a genuinely useful operational feature for multi-use deployments.

---

## Top 8 admin frustrations / risks

### RISK-1. `/api/metrics` returns 503 with env-var name leak (CRITICAL — 12-day regression)
**Where:** `src/app/api/metrics/route.ts:33`.
Live: `curl https://algo.xylolabs.com/api/metrics` → `503 {"error":"CRON_SECRET not configured"}`.
The error body leaks the exact env var name an attacker needs to know. Prometheus cannot scrape. No alerting is possible. This has been reported in every review cycle since May 3 and remains unfixed.
**Fix:** Set `CRON_SECRET` in `.env.production`; change missing-secret branch to 404; add startup gate.
**ETA:** 30 minutes.

### RISK-2. Single worker is a hard SPOF (HIGH)
**Where:** `docker-compose.production.yml`, `docs/high-stakes-operations.md`.
Production runs one judge worker on the app server. If it restarts, OOM-kills, or crashes, submissions queue for 300 seconds (`STALE_WORKER_SECONDS`) before reclaim. During a 100-student exam, this is a total outage.
**Fix:** Deploy a second worker on a distinct host. Document the freeze-before-restart procedure. Add automated drain.
**ETA:** 1 day for second worker; 2 days for automated drain.

### RISK-3. No MFA on any account (HIGH)
**Where:** `src/lib/auth/config.ts`.
The `super_admin` account is protected by password only. A single credential-stuffing or phishing hit owns the platform. There is no TOTP, no WebAuthn, no SMS fallback.
**Fix:** Add TOTP to the NextAuth credentials flow. Gate sensitive actions (backup restore, role assignment, settings changes) on MFA verification.
**ETA:** 3-5 days.

### RISK-4. Admin username disclosed on public rankings (HIGH)
**Where:** `src/app/(public)/rankings/page.tsx`.
The `admin` user with name "Super Admin" is rendered to anonymous visitors. This is a credential-stuffing target advertisement.
**Fix:** Filter staff roles from public rankings.
**ETA:** 15 minutes.

### RISK-5. No automated dependency scanning (MEDIUM)
**Where:** `package.json`.
There is no `npm audit` in CI, no Snyk, no Dependabot. A vulnerable dependency (e.g., `isomorphic-dompurify`, `next-auth`) would not be flagged automatically.
**Fix:** Add `npm audit --audit-level=moderate` to the build pipeline; enable Dependabot.
**ETA:** 1 hour.

### RISK-6. Backup script does not verify restoration (MEDIUM)
**Where:** `scripts/backup-db.sh`.
The backup script dumps the DB and pushes to S3 (or local storage). But there is no automated "restore the backup to a temp DB and verify it parses" step. A corrupted backup would not be detected until restore time.
**Fix:** Add a post-backup verification step: `pg_restore --list` on the dumped file, or spin up a temp PostgreSQL container and restore into it.
**ETA:** 3 hours.

### RISK-7. Worker auth token is single-use plaintext on registration (MEDIUM)
**Where:** `judge-worker-rs/src/main.rs`, `src/app/api/v1/admin/workers/route.ts`.
The worker registration endpoint generates a plaintext token, sends it to the worker, and stores a hash. If the token is intercepted during registration (e.g., via network sniffing or compromised deploy script), the attacker gains worker impersonation capability.
**Fix:** Use a short-lived registration JWT instead of a permanent plaintext token. The worker exchanges the JWT for a long-term token after verification.
**ETA:** 1 day.

### RISK-8. No WAF or DDoS mitigation documented (MEDIUM)
**Where:** `docs/deployment.md`, `scripts/online-judge.nginx.conf`.
The nginx config handles SSL termination and reverse proxying. There is no rate-limiting at the edge, no bot detection, no Cloudflare integration documented. A submission-flood attack (even within per-user rate limits) could saturate the judge worker queue.
**Fix:** Add nginx `limit_req` zones for `/api/v1/submissions` and `/api/v1/compiler/run`. Document Cloudflare or AWS WAF setup for DDoS protection.
**ETA:** 2 hours.
