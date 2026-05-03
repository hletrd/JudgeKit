# System Administrator Perspective Review

**Date:** 2026-05-03
**Persona:** University-IT or small-team SRE running JudgeKit in production for a department, a recruiting program, or a public contest. The reviewer has on-call experience and has been woken up by Postgres before.
**Method:** Read `deploy-docker.sh`, `docker-compose.production.yml`, `docker-compose.worker.yml`, `scripts/setup.sh`, `src/lib/realtime/`, `src/app/api/v1/admin/restore/route.ts`, `src/lib/data-retention.ts`, the docs under `docs/` (deployment, monitoring, runbooks, validation matrix), and prior admin reviews under `.context/reviews/`.
**Posture:** Critical. The bar is "would I sign off on this for an exam where 500 students show up at 09:00 sharp?"

---

## TL;DR

The deploy + ops story is **incident-hardened but production-constraining**. The script-level safeguards (pre-deploy `pg_dump`, anonymous-volume detection, `chmod 0600` on env, retryable SSH multiplexing) clearly come from real outages. But the underlying architecture (single-instance app server, stop-then-start deploys, manual scaling) is at odds with high-stakes exam-day operations.

| Use case | Verdict | Caveat |
|---|---|---|
| Classroom homework, ≤ 200 students | ✅ Yes | One VM, low risk. |
| Async take-home exam, 200 students | ✅ Yes | Single instance is fine async. |
| Synchronous exam, 200 students, 2 h window | ⚠️ Risky | No zero-downtime deploys, no HA. |
| Synchronous contest / exam, 500+ concurrent | ❌ No | Multi-instance still warned-against in code and README. |
| Recruiting (async, rolling) | ✅ Yes | Backups must be automated first. |

Overall admin score: **5.8 / 10**.

---

## Initial setup (7 / 10)

- `scripts/setup.sh` is a polished interactive wizard. Defaults to `admin / admin123` with a forced password change. Language preset menu is sensible (`core | popular | extended | all`).
- `deploy-docker.sh` is ~1100 lines that have absorbed real production scars. SSH `ControlMaster` multiplexing, retryable connectivity (`DEPLOY_SSH_RETRY_MAX`), per-architecture remote builds (so cross-arch image corruption is impossible), `pg_dump` with 30-day retention.
- Env-secret backfill (`ensure_env_secret`, `ensure_env_literal`) silently patches missing secrets when a remote env predates a feature. Without this you would diff env files by hand on every release.
- PG-volume safety check (`pg-volume-safety-check.sh`) explicitly remembers the April 2026 anonymous-volume incident and prevents recurrence. Includes both `--auto-migrate` and a manual recovery path.

Setup pain points:
- README and `setup.sh` advertise "go". Validating that the worker can actually pull / build the 102 judge images requires a separate full pass. There is no single command "verify a worker is exam-ready".
- `npm install` happens inside the deploy via a temporary container (lines 800-819 of `deploy-docker.sh`). Slow VMs add minutes per deploy. A pre-baked image would be both faster and more reproducible.
- No first-class systemd unit for the app outside of Docker. If your shop is "Docker is not allowed", there is no path.

---

## Workers (7 / 10)

- Per-worker auth: workers register with hostname, CPU, arch; the server returns a `workerSecret` once; the DB stores only the SHA-256 hash. Subsequent calls authenticate against the hash, not the shared `JUDGE_AUTH_TOKEN`. A leaked `JUDGE_AUTH_TOKEN` no longer impersonates an existing worker (it can still register a new one, see security review).
- Heartbeat dedup uses `pg_advisory_xact_lock` (`src/lib/realtime/realtime-coordination.ts:143-191`) so multi-instance deployments do not double-count.
- Rust worker has graceful shutdown (SIGTERM/SIGINT, drains in-flight, deregisters).
- The Docker socket proxy (`tecnativa/docker-socket-proxy`) restricts the worker to `CONTAINERS=1, IMAGES=1, BUILD=0, POST=0, DELETE=0` — see security review for the *inspect* concern this leaves open.

Worker pain points:
- Stale-worker detection is reactive (5-minute window). An OOM-killed worker that died mid-task leaves submissions stuck for 5 minutes before reclaim. For a 2-hour exam, that is 4 % of session time, plus the user's anxiety while their submission "is being judged".
- Heartbeat-failure log level is `debug` for the first two failures (`judge-worker-rs/src/main.rs:313-324`). Unless an operator explicitly sets `RUST_LOG=debug` in production, silent heartbeat degradation goes invisible.
- The admin UI shows worker counts (`online | stale | offline`) but not per-worker active task count or queue depth. You cannot tell which worker is at capacity. No "drain worker for maintenance" button.
- No autoscale, no HPA, no warm-spare pattern. If you anticipate 2x load you cold-start a worker manually.

---

## Multi-instance / scaling (3 / 10)

This is the hard wall.

- `src/lib/realtime/realtime-coordination.ts:27-34` declares a `deploymentDeclarationMissing` flag if production is true and neither `APP_INSTANCE_COUNT` nor `REALTIME_COORDINATION_BACKEND=postgresql` is set.
- Line 252 throws an HTTP 500 for multi-instance without shared coordination.
- The `REALTIME_COORDINATION_BACKEND=postgresql` mode exists but README explicitly says "still validate sticky-session / load-balancer behavior and broader realtime scaling under the PostgreSQL-backed path" before claiming exam-grade or public-contest readiness (README §"App-instance scaling note", lines 219-229).

Translation: **for any synchronous high-stakes event, you are running on a single app VM**. Vertical-scale that VM hard, accept the blast radius, and pray the kernel doesn't oops at 09:42 with 500 students mid-exam.

Recommendations:
1. The team should *itself* run a load test against the PostgreSQL-coordination mode and publish a single sentence: "verified at N concurrent SSE connections at P99 latency M ms". Without this the option is a stub.
2. Document the exact NGINX config needed for sticky-session SSE.
3. Add a "ship me a Grafana JSON" admin export so an operator can stand up dashboards without writing PromQL from scratch.

---

## Monitoring & observability (4 / 10)

- `/api/health` returns DB connectivity, worker counts, audit health.
- `/api/metrics` (Prometheus) exposes `judgekit_health_status`, `judgekit_judge_workers{status=…}`, `judgekit_submission_queue_pending`, `judgekit_uptime_seconds`. Recent commits (`5e4bd457`) added auth + bulk username support to metrics.
- `src/lib/ops/admin-health.ts` aggregates DB + workers + queue into one view.

Gaps:
- **No per-endpoint latency histograms.** I cannot draw a P99 graph of `/api/v1/submissions` from `/metrics`.
- **No per-worker metrics.** Only the aggregate count is exposed.
- **The Rust worker exposes only `/health` (200 OK with no body).** No Prometheus, no /debug/pprof equivalent, no in-flight task count.
- **No structured log shipping.** App logs go to stdout via pino. There is no documented Loki / Elasticsearch path. Five containers + grep at 03:00 = unhappy on-call.
- **Disk-space metric is internal but not exported.** If `/judge-workspaces` fills up the worker silently fails.
- **No SLOs published**, so the docs cannot tell me "you should alert if worker availability < X% for Y minutes".

---

## Backup / restore (5.5 / 10)

- Admin backup endpoint (`/api/v1/admin/backup`) streams JSON or ZIP, password-protected, audit-logged, rate-limited.
- `deploy-docker.sh` runs `pg_dump` pre-deploy with 30-day retention.
- Restore endpoint (`/api/v1/admin/restore`) takes a pre-restore snapshot first into `/app/data/pre-restore-snapshots/`. Last 5 retained. Solid disaster-recovery preparation.

Gaps:
- **No automated scheduled backup.** Pre-deploy backups are deploy-coupled. A semester-stable deployment has no fresh backup. There is no documented systemd timer.
- **No PITR.** PostgreSQL WAL archiving is not configured. Recovery granularity is "the last `pg_dump`" — could be hours of submissions lost.
- **Backups are not snapshot-consistent.** `streamDatabaseExport()` reads tables sequentially; mid-backup writes may produce a backup with referentially inconsistent rows.
- **Restore is a full replacement.** No granular "restore one user's submissions" or "restore problem 42 only".
- **Backups are not encrypted at rest.** Sanitization redacts credentials; source code, problem statements, and PII are still in plaintext.

---

## Secrets & credentials (7 / 10)

Improvements that landed:
- Per-worker token hashing (commit `909fcbf5` per recent reviews). Workers no longer fall back to the shared `JUDGE_AUTH_TOKEN`.
- `${VAR:?}` gating in `docker-compose.production.yml` for sidecar tokens (`CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`) — missing values cause `docker compose up` to fail loudly.
- `.env.production` is forced to `0600` on every deploy.

Concerns:
- Plaintext `secretToken` column still exists in `judge_workers` schema (`drizzle/schema.pg.ts`). Pre-migration workers may still have plaintext stored. There is a backfill DO-block in `deploy-docker.sh` Step 5b but I would still want to verify post-deploy.
- `JUDGE_ALLOWED_IPS` defaults to "allow all". Token auth still applies, but defense-in-depth would be "deny by default, explicitly allow CIDR ranges".
- No documented `X-Forwarded-For` trust configuration for the Next.js side. Behind any reverse proxy with a misconfigured trust chain, `req.ip`-based rate limits are spoofable.
- No automated secret rotation tooling. A leaked `JUDGE_AUTH_TOKEN` requires a manual rotation across all workers.

---

## Data retention & compliance (6 / 10)

`src/lib/data-retention.ts` declares retention windows:
- Audit events: 90 days
- Chat messages: 30 days
- Anti-cheat events: 180 days
- Submissions: 365 days
- Login events: 180 days
- Recruiting records: 365 days
- `DATA_RETENTION_LEGAL_HOLD` env suspends all pruning.

Gap: **the pruner is not visibly scheduled.** It must be invoked explicitly. There is no cron in production compose. If a fresh operator deploys and never reads `data-retention-maintenance.ts`, the policy is dead letter.

GDPR / privacy: per `docs/privacy-retention.md` and the `/privacy` route, candidates can email for data access / deletion. There is no automated data-subject-request (DSR) endpoint. For EU-touching deployments this is a process gap.

---

## Audit & runbooks (6 / 10)

- `docs/operator-incident-runbook.md` (2026-04-17): backup/restore failures, credential leaks, containment, escalation. Not generic — references real endpoints and tables.
- `docs/judge-worker-incident-runbook.md` (2026-04-12): worker compromise, stale worker handling, investigation checklist.
- `docs/admin-security-operations.md`: lockout, MFA/SSO guidance.

Gaps:
- No runbook for "submission queue is wedged" or "SSE connections exhausted". The April review noted you have to write SQL to release stuck submissions; this should be a documented admin button.
- No runbook for "primary worker host dropped, recover stuck assignments".
- Audit log retention is 90 days — for a recruiting platform that may need to reproduce a candidate's session a year later, this is short.

---

## Image management (4 / 10)

- 102 judge images, ~30 GB total.
- `deploy-docker.sh` presets: core (3 langs, 1.2 GB), popular (6, 4 GB), extended (16, 12 GB), all (102, 30 GB).
- No private registry option in compose. Each worker builds its full image set locally on first deploy. Multi-worker fleets re-build the same images on each host.
- No automated dangling-image GC. The prune API exists but is manual.
- No disk-space pre-flight in `setup.sh`. A 40 GB worker VM with `all` will not survive its first arch upgrade.

A small fix that would compound for big deployments: support pushing to a private registry from one builder and pulling on every other worker. This is a half-day of YAML and saves hours per worker host on every deploy.

---

## Deploy mechanics (5 / 10)

- `docker compose down --remove-orphans` followed by `up -d` (deploy-docker.sh:524) → 1-3 minute outage per deploy. During an exam, fatal.
- `--remove-orphans` will kill an operator's debug container that is not in the compose file. At 02:00 in the middle of an incident this is dangerous.
- Migrations run inside ephemeral containers that mount the source tree and `npm install`. No rollback strategy if a migration partially applies.
- No "blue / green" or "rolling" mode in the script.

What works well:
- Architecture detection per worker host (no cross-arch image surprises).
- Pre-deploy `pg_dump` is now reflexive.
- Idempotent env backfill.
- The `algo` mode that explicitly skips worker / language image builds (per `CLAUDE.md` — `algo.xylolabs.com` is the app server, `worker-0.algo.xylolabs.com` is the dedicated worker).

---

## Per-use-case verdict

| Use case | Verdict | Reasoning |
|---|:---:|---|
| Classroom (50, async homework) | ✅ Yes | Low risk, simple ops. |
| Recruiting (async, rolling) | ✅ Yes | Single instance fits. **Automate backups first.** |
| Take-home async exam (200 students, 24-hour window) | ✅ Yes | Async absorbs deploy windows and instance limits. |
| Synchronous exam (200, 2 h) | ⚠️ Risky | No zero-downtime path; one VM dies → done. |
| Synchronous contest (500+ concurrent) | ❌ No | Multi-instance not validated; SSE coordination is "warned about". |
| Public/reputational contest | ❌ No | Add HA + load test + SLOs first. |

---

## Top 5 fixes I would push for first

1. **Automate daily `pg_dump` + WAL archiving.** Single highest-impact change for any use case.
2. **Validate and document `REALTIME_COORDINATION_BACKEND=postgresql` at concrete concurrency numbers.** Until this is signed off, "exam-grade" claims are contingent.
3. **Per-worker metrics + a published Grafana dashboard JSON.** Eliminates blind on-call.
4. **Zero-downtime deploys.** Even just "drain → start replica → swap → drain old" via NGINX is enough for the 95 % case.
5. **Scheduled retention pruner.** A cron / systemd timer in the production compose, not an idle code path.

---

## Bottom line

The team has clearly run this thing in anger. The deploy script and the runbooks read like they were written *after* incidents, not before launches. That is a strong positive signal.

What is missing is the next maturity step: HA, observability, automated backups, and load-tested multi-instance. None of these are research problems. They are a sprint of disciplined plumbing each. With them, JudgeKit goes from "deployable" to "operable". Without them, the operator is the SLO.
