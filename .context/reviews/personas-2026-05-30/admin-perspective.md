# JudgeKit — System Administrator / Operator Review

Reviewer perspective: a sysadmin running this in **production** for recruiting tests,
student assignments/exams, and contests. Concerns: operability, observability,
disaster recovery, config safety, and the ability to detect/contain incidents.

Date: 2026-05-30. Scope: real code/scripts/compose, cited file:line. Source was
read-only; nothing was modified.

---

## Top risks for production use (ranked)

1. **Audit trail is in-memory buffered and lossy on hard crash** — security/anti-cheat
   events (role changes, settings updates, submission claims) can vanish on
   `docker kill`/OOM/power loss. (`src/lib/audit/events.ts:163-258`) — High.
2. **Capability privilege escalation via custom roles** — anyone with
   `users.manage_roles` can mint a role carrying capabilities they do NOT hold
   (e.g. `system.settings`, `system.backup`) and assign it to a lower-level user.
   Only *level* is checked, never *capability subset*. (`roles/route.ts:55-101`,
   `roles/[id]/route.ts:52-92`, `validators/roles.ts`) — High.
3. **Built-in role customizations are silently reverted** — `ensureBuiltinRoles()`
   runs on every render of the admin roles page and overwrites built-in roles back
   to hardcoded defaults. (`ensure-builtin-roles.ts:30-38`,
   `admin/roles/page.tsx:38`) — High.
4. **SMTP password leaks (ciphertext) through the settings GET API and DB exports**
   — `smtpPass` is not in the API redaction list, not in the logger redaction
   paths, and not in export-sanitization sets. (`admin/settings/route.ts:15-21`,
   `security/secrets.ts:21-74`) — Medium/High.
5. **Worker staleness reaping only runs when *another* worker heartbeats** — if the
   fleet goes silent (all workers crash, network partition), nothing flips workers
   to `stale`/`offline` or reconciles `active_tasks`. (`heartbeat/route.ts:79-128`,
   no timer in `instrumentation.ts`) — Medium/High.
6. **No real alerting** — health/monitor scripts only log to journald; the failure
   notifier ships with email commented out. An operator must actively watch logs to
   notice a wedged queue, DB outage, or dropped-audit condition.
   (`scripts/monitor-health.sh:16`, `scripts/notify-failure@.service`) — Medium.
7. **Backup "verification" never test-restores PostgreSQL dumps** — it only checks
   gzip validity + a non-empty first 100 lines. A truncated/corrupt dump passes.
   (`scripts/verify-db-backup.sh:13-27`) — Medium.
8. **`NODE_ENCRYPTION_KEY` is not part of the startup production-config gate** — the
   app boots without it and only fails later when a secret is read/written.
   (`security/production-config.ts:11-30`, `security/encryption.ts:43-60`) — Medium.

---

## Findings by area

### A. System settings, secrets, SMTP/hCaptcha

**A1. `smtpPass` ciphertext returned by the settings GET API + not redacted in logs/exports.**
- File: `src/app/api/v1/admin/settings/route.ts:15-21,28-34`; `src/lib/security/secrets.ts:21-29,35-41,47-74`; `src/lib/system-settings.ts:88-92` (`findFirst` returns all columns).
- Problem: `getSystemSettings()` selects every column (incl. `smtpPass`, `smtpUser`).
  The GET handler redacts only `SECRET_SETTINGS_KEYS = ["hcaptchaSecret"]`, so the
  response body carries the **encrypted** `smtpPass` value (and plaintext
  `smtpUser`). `smtpPass` is likewise absent from `LOGGER_REDACT_PATHS`,
  `EXPORT_SANITIZED_COLUMNS`, and `EXPORT_ALWAYS_REDACT_COLUMNS`. The server action
  audit path *does* redact it (`actions/system-settings.ts:56`), proving the
  inconsistency is an oversight, not a deliberate exception.
- Ops failure scenario: an operator shares a HAR capture or proxy log of the admin
  settings page for debugging; the encrypted SMTP secret (and provider username)
  travels with it. A DB "sanitized export" handed to a vendor/contractor still
  contains the SMTP secret column. If `NODE_ENCRYPTION_KEY` ever leaks (it lives in
  `.env.production` next to the DB), the ciphertext is directly decryptable.
- Severity: Medium/High. Confidence: Confirmed (the redaction list literally omits it).
- Fix: add `"smtpPass"` to `SECRET_SETTINGS_KEYS`, `LOGGER_REDACT_PATHS`
  (incl. `body.smtpPass`), and both export sets in `src/lib/security/secrets.ts`.
  Consider returning only `hasSmtpPass: boolean` from the GET API instead of any
  value. Also redact/omit `smtpUser` from the API GET if it is sensitive in your
  environment.

**A2. `NODE_ENCRYPTION_KEY` not enforced at startup.**
- File: `src/lib/security/production-config.ts:11-30` (gate list); `src/lib/security/encryption.ts:43-60` (lazy throw).
- Problem: production startup requires `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`,
  `RATE_LIMITER_AUTH_TOKEN` — but NOT `NODE_ENCRYPTION_KEY`, even though that key
  encrypts SMTP/hCaptcha/API-key secrets. The app boots happily; the first attempt
  to save an SMTP password (or read one) throws.
- Ops failure scenario: a fresh deploy or a host where the key got dropped from the
  env boots green, passes the `/login` healthcheck, and only fails when an admin
  tries to configure email — or worse, silently disables all transactional email if
  the throw is swallowed upstream. Email verification on signup then breaks for
  recruiting invites with no obvious cause.
- Severity: Medium. Confidence: Confirmed.
- Fix: add `NODE_ENCRYPTION_KEY` (and arguably `DATABASE_URL`, `POSTGRES_PASSWORD`)
  to `PRODUCTION_REQUIRED_ENV_VARS` with a length/format check mirroring `getKey()`.

**A3. Plaintext-fallback decrypt is a standing tamper surface (documented/deferred).**
- File: `src/lib/security/encryption.ts:81-117`; readers pass `allowPlaintextFallback: true` in `email/providers/smtp.ts:54` and `security/hcaptcha.ts:23`.
- Problem: secret readers explicitly enable the plaintext fallback, so a value
  lacking the `enc:` prefix is returned as-is (with a warn log in prod). An actor
  who can write to `system_settings` (SQL injection elsewhere, a rogue DBA, a
  restored old backup) can bypass the GCM authenticity guarantee.
- Ops failure scenario: a restored pre-encryption backup leaves plaintext secrets in
  place indefinitely; the only signal is a warn-level log line nobody is paging on.
- Severity: Low/Medium. Confidence: Confirmed (the code comments call it a deferred
  known risk).
- Fix: track the warn-log via the admin-health snapshot (surface a
  `plaintextSecretReads` counter) so an operator can actually see it, and schedule
  the audit cycle the comment references to drop the fallback.

**A4. Strengths.** AES-256-GCM with per-value random IV and full redaction
(`redactSecret` returns fixed bullets, no partial disclosure) is correct
(`encryption.ts:67-79,148-151`). hCaptcha/SMTP secrets are encrypted at rest on
write (`route.ts:89`, `actions/system-settings.ts:185,197`). The settings *page*
masks secrets to bullets server-side (`admin/settings/page.tsx:135,140`).

### B. User & role management / RBAC

**B1. Capability escalation through custom-role creation/update.**
- File: `src/app/api/v1/admin/roles/route.ts:55-101`; `src/app/api/v1/admin/roles/[id]/route.ts:52-92`; `src/lib/validators/roles.ts:8-56`; `src/lib/security/constants.ts:72-78` (`canManageRoleAsync` checks level only).
- Problem: the create/update handlers gate `level` (can't exceed your own) and block
  reducing super_admin caps, but they never verify the assigned `capabilities` are a
  subset of the actor's own capabilities. A level-2 `admin` holding
  `users.manage_roles` but NOT `system.backup`/`system.settings` can create a custom
  role at level 0/1 that includes those caps, then assign a user to it
  (`actorLevel > requestedLevel` passes). Net effect: the actor grants privileges
  they do not possess.
- Ops failure scenario: a delegated "assistant admin" provisions a low-level service
  account with `system.backup` + `system.audit_logs`, then uses it to exfiltrate a
  full DB backup or scrub audit logs — all while never holding those caps directly.
  In a contest/exam context this is a clean path to tamper with results or evade the
  audit trail.
- Severity: High. Confidence: Confirmed (no subset check anywhere in the path).
- Fix: in both handlers, reject any requested capability not present in
  `resolveCapabilities(user.role)` (super_admin exempt). Same check for the user
  role-assignment path so you can't escalate by assigning an over-powered role.

**B2. Built-in role edits are silently reverted on roles-page render.**
- File: `src/lib/capabilities/ensure-builtin-roles.ts:17-40`; `src/app/(dashboard)/dashboard/admin/roles/page.tsx:38`.
- Problem: `ensureBuiltinRoles()` does `onConflictDoUpdate` that overwrites
  `capabilities`, `level`, and `displayName` of every built-in role with the
  hardcoded defaults — and it's invoked on every render of the admin roles page
  (not just first boot/seed). The UI even lets admins edit built-in roles
  (`roles/[id]/route.ts` only blocks built-in *level* and super_admin cap-reduction,
  not built-in capability edits).
- Ops failure scenario: an operator adds `contests.export` to the `instructor`
  built-in role for an exam season. Days later anyone opens the roles page; the
  customization is wiped back to defaults with no log line, and instructors silently
  lose access mid-exam. The change "didn't stick" and there's no audit trail of the
  revert.
- Severity: High. Confidence: Confirmed.
- Fix: only `ensureBuiltinRoles()` from a seed/migration/startup path, not on page
  render; and make it insert-missing-only (no capability overwrite of existing
  rows), or explicitly forbid editing built-in role capabilities in the API so the
  two behaviors stop fighting.

**B3. Strengths.** Self-deactivation is blocked, super_admins can't be deactivated by
anyone and can only be re-activated by a super_admin (`user-management.ts:73-115`).
Role deletion is transactional and refuses roles still in use
(`roles/[id]/route.ts:127-170`). API-key creation enforces a level check
(`api-keys/route.ts:66-69`). super_admin caps cannot be reduced
(`roles/[id]/route.ts:71-74`).

### C. Judge fleet ops

**C1. Staleness sweep is piggybacked on heartbeats — no autonomous reaper.**
- File: `src/app/api/v1/judge/heartbeat/route.ts:79-128`; `src/instrumentation.ts:10-26` (no sweep timer); `src/lib/judge/worker-staleness.ts`.
- Problem: the `online->stale` flip and the `stale->offline` + `active_tasks=0`
  reap both live inside the heartbeat handler. They run only when *some* worker
  POSTs a heartbeat. If the entire fleet stops heartbeating (mass crash, network
  partition between worker host and app host, worker-0 down), no sweep ever fires.
- Ops failure scenario: worker-0 (the sole dedicated worker per CLAUDE.md) hard-crashes.
  No surviving worker heartbeats, so its row stays `online` past the stale window,
  `admin-health` keeps reporting it `online`, and `active_tasks` stays non-zero —
  masking the outage. Conversely, the self-healing claim CTE *can* still reclaim its
  in-flight submissions (good), but the fleet inventory and capacity accounting lie
  to the operator until a worker returns. With one worker this is the common case.
- Severity: Medium/High. Confidence: Confirmed (logic is correct but trigger is
  worker-dependent; instrumentation starts no sweep timer).
- Fix: run the staleness/reap sweep on an app-side `setInterval` (alongside the
  existing rate-limit/audit/retention timers in `instrumentation.ts`) or from the
  `monitor-health` cron via a privileged internal endpoint, so it fires regardless of
  worker liveness.

**C2. Worker registration is gated only by the shared `JUDGE_AUTH_TOKEN`.**
- File: `src/app/api/v1/judge/register/route.ts:24-64`; `src/lib/judge/auth.ts:26-35`.
- Problem: any holder of the shared token can register arbitrary workers (any
  hostname, concurrency up to 64) and immediately start claiming/finishing real
  submissions. The token is a single shared secret distributed to worker hosts;
  there is no per-host enrollment approval.
- Ops failure scenario: the token leaks (it's in `.env.production`, worker images,
  and deploy scripts). An attacker on an allowlisted IP — or any IP if
  `JUDGE_ALLOWED_IPS` is unset (allow-all default, see C3) — registers a malicious
  "worker", claims a contestant's submission, and returns a forged Accepted verdict.
  Post-registration auth is per-worker (good, `auth.ts:52-97`), but registration
  itself is the soft spot.
- Severity: Medium (High if IP allowlist unset). Confidence: Confirmed.
- Fix: require operator approval for new workers (pending state until an admin
  activates), or pre-provision worker credentials out-of-band rather than minting a
  secret on first contact with only the shared token.

**C3. IP allowlist defaults to allow-all and is process-cached from env only.**
- File: `src/lib/judge/ip-allowlist.ts:11-32,160-174`.
- Problem: when `JUDGE_ALLOWED_IPS` is empty/unset, all IPs may hit the judge
  endpoints (documented as "temporary for worker access"). The allowlist is cached
  for the process lifetime and only read from env (no DB/runtime toggle), so
  tightening it requires a redeploy/restart.
- Ops failure scenario: an operator who never set `JUDGE_ALLOWED_IPS` exposes
  `/api/v1/judge/*` to the internet; combined with C2 this is the full forged-verdict
  path. There's no admin-health signal that the allowlist is empty.
- Severity: Medium. Confidence: Confirmed.
- Fix: in production require `JUDGE_ALLOWED_IPS` to be set (add to the startup gate),
  or default-deny with an explicit opt-out; surface "judge allowlist: open" in
  admin-health.
- Strength: the IPv4/IPv6 CIDR matching itself is careful and correct
  (`ipv6ToBytes`, prefix masking).

**C4. `staleClaimTimeoutMs` is admin-configurable with a wide range — misconfig risk.**
- File: `src/lib/system-settings-config.ts:48` (default 300s); `worker-staleness.ts:57-60` (clamped to >= 90s).
- Problem: the reset/reap cutoff is clamped to at least the 90s stale floor (good),
  but an operator can set it very high. A huge timeout means a crashed worker's
  claimed submissions stay un-reclaimable for that whole window — submissions appear
  "judging" forever to students mid-exam.
- Severity: Low/Medium. Confidence: Confirmed (range allowed; impact depends on value).
- Fix: document a sane upper bound in the settings UI and warn when set above, say,
  10 minutes.

**C5. Strengths.** The atomic claim (`claim-query.ts`) is genuinely good: capacity
gating inside the same statement (`active_tasks < concurrency`, `FOR UPDATE`),
`FOR UPDATE SKIP LOCKED` candidate selection, a fresh claim-token optimistic fence
to defeat zombie workers, and self-healing reclaim of stale claims. Per-worker auth
post-registration with hashed secrets and timing-safe compare
(`auth.ts:52-97`, `heartbeat/route.ts:55-65`).

### D. Reliability / DR

**D1. PostgreSQL backup verification does not test-restore.**
- File: `scripts/verify-db-backup.sh:13-27`.
- Problem: for `.sql.gz` it checks gzip validity and that the first 100 lines are
  non-empty. It never restores into a scratch DB to confirm the dump is complete and
  loadable. The SQLite path *does* a real restore+integrity check — the active
  PostgreSQL path is weaker than the legacy one.
- Ops failure scenario: a `pg_dump` truncated by a disk-full or a killed container
  produces a valid-gzip but incomplete SQL file. Verification passes. The flaw is
  discovered only during a real restore after a data-loss incident — exactly when it
  hurts most. Given the April-2026 wipe lore, restore confidence matters here.
- Severity: Medium. Confidence: Confirmed.
- Fix: for `.sql.gz`/custom-format dumps, restore into a throwaway database
  (`createdb tmp_verify && pg_restore/psql && SELECT counts && dropdb`) on a
  schedule; assert expected table presence and row-count sanity.

**D2. Backups are taken but verification is not wired into the timer.**
- File: `scripts/online-judge-backup.service`, `online-judge-backup.timer`; no `verify-db-backup` reference in any service/timer/deploy.
- Problem: the daily timer runs `backup-db.sh` (which self-checks gzip) but nothing
  invokes `verify-db-backup.sh`, and nothing reports backup success/failure anywhere
  an operator watches. `backup-db.sh:97-110` also auto-deletes backups >30 days,
  guarded only by "a newer backup exists in the last 30 days" — if the backup job has
  been silently failing for <30 days you still have old copies, but there's no signal
  the job stopped producing fresh ones.
- Ops failure scenario: backups silently stop (PG password rotated, disk full,
  container renamed). 30 days later retention prunes the last good copy while new
  ones never arrived. Nobody noticed because nothing pages on `oneshot` failure
  except the journald `notify-failure` line (email commented out).
- Severity: Medium. Confidence: Confirmed.
- Fix: add `OnFailure=notify-failure@%n.service` with a real notifier; emit a
  freshness check ("newest backup older than 26h => alert") in `monitor-health.sh`;
  run `verify-db-backup.sh` (test-restore) on the newest backup post-job.

**D3. Data-retention pruning is in-process, unaudited, and runs on every boot.**
- File: `src/lib/data-retention-maintenance.ts:106-155`; `src/lib/data-retention.ts:1-24`.
- Problem: prune runs once immediately on `startSensitiveDataPruning()` (every app
  boot) and then every 24h via `setInterval`. Deletions are logged only at
  `logger.debug` — there is no audit event for "pruned N submissions/anti-cheat
  events." Multiple app instances each run their own uncoordinated timer. Retention
  is driven by env vars (`SUBMISSION_RETENTION_DAYS` etc.); a misconfigured small
  value deletes graded submissions immediately on the next boot.
- Ops failure scenario: an operator sets `SUBMISSION_RETENTION_DAYS=30` thinking it
  applies going forward; on next deploy the boot-time prune deletes every submission
  older than 30 days — including a finished contest's records — with only a debug log
  to show for it. Anti-cheat events (default 180d) and audit events (90d) age out
  silently, undercutting later investigations.
- Severity: Medium. Confidence: Confirmed.
- Fix: record an audit event (or at least `logger.info`) with per-table deleted
  counts; gate prune behind an explicit "enabled" flag rather than always-on at boot;
  consider running retention as a coordinated cron/job rather than per-instance
  `setInterval`. Legal-hold escape hatch (`isDataRetentionLegalHold`) is a good
  existing control.

**D4. Strengths.** The DR tooling here is unusually mature: `pg-volume-safety-check.sh`
encodes the exact April-2026 anonymous-pgdata wipe signature and refuses to deploy
(or auto-migrates with tar + pg_dump snapshots first); `deploy-docker.sh` takes a
custom-format `pg_dump` before every deploy, gates destructive `drizzle-kit push`
behind `DRIZZLE_PUSH_FORCE=1`, and supports `SKIP_PG_VOLUME_CHECK` only as an
explicit override. The production compose pins `PGDATA`, uses `restart: unless-stopped`
and healthchecks on every service, isolates Docker access behind a socket proxy
(`BUILD=0`), and binds the app to `127.0.0.1`. Backups optionally `age`-encrypt.
Submission queue limits (per-user pending + global) are enforced atomically with an
advisory lock at submit time (`submissions/route.ts:299-336`).

### E. Observability

**E1. No active alerting anywhere — everything logs to journald.**
- File: `scripts/monitor-health.sh:15-17,88-100`; `scripts/notify-failure@.service` (email commented out).
- Problem: `monitor-health.sh` (cron */5) computes queue depth and worker
  online/stale/offline and logs CRITICAL/WARNING via `systemd-cat`, but there is no
  push to email/Slack/PagerDuty. The failure-notifier unit only writes a journald
  line. An operator must `journalctl -t judgekit-monitor` to find problems.
- Ops failure scenario: the submission queue wedges at 200+ during an exam
  (workers down). `monitor-health.sh` logs CRITICAL every 5 minutes — into journald,
  where nobody is looking — and the first real signal is students reporting "stuck
  judging." The dropped-audit-events condition (E2) similarly only surfaces in logs.
- Severity: Medium. Confidence: Confirmed.
- Fix: wire `monitor-health.sh` thresholds and `OnFailure=` notifier to a real
  channel; scrape `/api/metrics` (already Prometheus-formatted, CRON_SECRET-gated)
  with Alertmanager rules for queue depth, stale>0, db=error, and audit degraded.

**E2. Audit events are buffered in memory and can be lost on hard crash.**
- File: `src/lib/audit/events.ts:163-258`; shutdown flush in `audit/node-shutdown.ts` (SIGTERM/SIGINT/beforeExit only).
- Problem: `recordAuditEvent` pushes into `_auditBuffer` and returns immediately
  (fire-and-forget); flush is every 5s or at 50 events. On `SIGKILL`/OOM/`docker
  kill`/power loss, the graceful `process.once` handlers don't run, so up to 5s/50
  buffered events are lost. On sustained DB outage the buffer drops the oldest failed
  batch once it exceeds `FLUSH_SIZE_THRESHOLD*2` (`events.ts:202-213`) — recording
  `droppedAuditEvents` but losing the events.
- Ops failure scenario: an admin changes a contest's settings, then the container is
  OOM-killed seconds later. The `system_settings.updated` audit row never persisted;
  during a later dispute there is no record of who changed what. For
  contest/exam/recruiting integrity this is a meaningful gap. The "submission claimed"
  audit events are similarly volatile.
- Severity: High (for an integrity-sensitive deployment). Confidence: Confirmed.
- Fix: for high-value events (role/settings/auth changes) write synchronously
  (await the insert) and only batch low-value telemetry; surface
  `getAuditEventHealthSnapshot()` (already includes `droppedEvents`/`failedWrites`)
  via alerting, not just the admin-health JSON.

**E3. admin-health pins to `degraded` on any `stale>0` but can't see a wholly-dead fleet.**
- File: `src/lib/ops/admin-health.ts:88-91`.
- Problem: status is `degraded` if `stale>0` or (`pending>0` and `online==0`). But
  per C1, if the only worker hard-crashes without another heartbeat to flip it, it
  stays `online` in the DB — so `online>0`, `stale==0`, and health reads **ok** while
  no judging is actually happening. The snapshot has no "last heartbeat age" or
  "newest pending submission age" dimension to catch a silently-dead-but-`online`
  fleet.
- Ops failure scenario: single worker dies mid-contest; admin-health says ok;
  submissions pile up as `pending` but `online==1` so the `pending>0 && online==0`
  rule never trips. Operator believes the system is healthy.
- Severity: Medium. Confidence: Confirmed (follows directly from C1 + this rule).
- Fix: include max-heartbeat-age and oldest-pending-age in the snapshot; mark
  degraded when newest heartbeat is older than the stale window even if the row still
  says `online`. (This is the observability half of fixing C1.)

**E4. Strengths.** `/api/metrics` is Prometheus-formatted and CRON_SECRET-gated with
timing-safe compare (`metrics/route.ts:11-43`); admin-health requires
`system.settings` and degrades to a thin public status otherwise
(`api/v1/health/route.ts`). The basic `/api/health` does a real `SELECT 1` and is
rate-limited. Audit-event health (`failedWrites`/`droppedEvents`) is already
computed — it just isn't alerted on.

---

## Priority-ranked fix checklist

1. **[High] Block capability escalation in role create/update** — reject any assigned
   capability not held by the actor (super_admin exempt). `roles/route.ts`,
   `roles/[id]/route.ts`, mirror for role-assignment. (B1)
2. **[High] Stop `ensureBuiltinRoles()` from reverting admin edits** — move it off
   page-render to seed/startup and make it insert-missing-only, or forbid built-in
   capability edits in the API. `ensure-builtin-roles.ts`, `admin/roles/page.tsx`. (B2)
3. **[High] Make high-value audit events durable** — await the insert for
   role/settings/auth/security events; alert on `droppedEvents`/`failedWrites`.
   `audit/events.ts`. (E2)
4. **[High] Add an autonomous worker-staleness sweep** — `setInterval` in
   `instrumentation.ts` (or a cron-driven internal endpoint) independent of worker
   heartbeats; surface heartbeat-age in admin-health. `heartbeat/route.ts`,
   `instrumentation.ts`, `admin-health.ts`. (C1, E3)
5. **[Med/High] Redact `smtpPass` everywhere** — add to `SECRET_SETTINGS_KEYS`,
   `LOGGER_REDACT_PATHS`, and both export sets; prefer returning `hasSmtpPass` from
   the GET API. `security/secrets.ts`, `admin/settings/route.ts`. (A1)
6. **[Med] Enforce `NODE_ENCRYPTION_KEY` (and DB creds) at startup** —
   `production-config.ts`. (A2)
7. **[Med] Real backup verification + freshness alerting** — test-restore newest
   PostgreSQL dump; alert when newest backup > ~26h old; wire `OnFailure=` notifier.
   `verify-db-backup.sh`, `monitor-health.sh`, backup units. (D1, D2)
8. **[Med] Wire real alerting** — push monitor-health thresholds and service failures
   to email/Slack/PagerDuty; add Alertmanager rules on `/api/metrics`.
   `monitor-health.sh`, `notify-failure@.service`. (E1)
9. **[Med] Require/lock down the judge IP allowlist in production** and add worker
   enrollment approval. `ip-allowlist.ts`, `judge/register/route.ts`. (C2, C3)
10. **[Med] Audit + gate data-retention pruning** — log per-table deletion counts as
    an audit/info event; gate behind an explicit enable flag rather than always-on at
    boot. `data-retention-maintenance.ts`. (D3)
11. **[Low/Med] Surface plaintext-secret-read warnings in admin-health**; schedule the
    deferred audit to drop the decrypt fallback. `encryption.ts`. (A3)
12. **[Low/Med] Bound/warn on extreme `staleClaimTimeoutMs`** in the settings UI. (C4)

---

### Distinguishing confirmed vs suspected

- **Confirmed** (read directly in code): A1, A2, A3, B1, B2, C1, C2, C3, C4, C5,
  D1, D2, D3, D4, E1, E2, E3, E4.
- **Suspected / depends on deployment config**: the *severity* of C2/C3 depends on
  whether `JUDGE_ALLOWED_IPS` is set in the live env (not visible in repo defaults);
  the real-world impact of D3 depends on the operator's retention env values; E2's
  blast radius depends on how often the container is `SIGKILL`ed vs gracefully
  stopped. The mechanisms are confirmed; the production exposure should be verified
  against the actual `.env.production` and systemd/cron wiring on algo /
  worker-0.algo.
