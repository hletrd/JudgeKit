# Admin / Operations Review

**Date:** 2026-06-30  
**Scope:** Entire repository, with emphasis on `/dashboard/admin/**`, `/api/v1/admin/**`, RBAC, audit trails, backups, deployment scripts, and worker/language management.  
**Summary:** JudgeKit has strong RBAC guards, privilege-escalation protections on roles, and correct `algo.xylolabs.com` deployment guardrails. From an operator's viewpoint the biggest gaps are audit durability (high-stakes admin actions are buffered and can be lost on crash), missing rate limits on several data-heavy or long-running admin endpoints, and a settings-reconfirm list that omits security-relevant judging/resource limits. The admin UX also has a few sharp edges: worker force-removal silently requeues in-flight jobs, language "reset all" is a single confirmation, and the user detail page cannot edit users.

**Findings count:** 13

## Admin-perspective category scores

| Area | Score / 10 | Notes |
|---|---|---|
| Deployment safety | 8 | `algo.xylolabs.com` guardrails enforced; no `docker system prune --volumes`; static-site nginx still HTTP-only. |
| User & role management | 8 | Role-level and capability-escalation guards are solid; user detail page lacks edit, audit is buffered. |
| Audit & forensics | 5 | High-stakes events use buffered audit; view events create noise; settings audit omits numeric config changes. |
| Backups & recovery | 7 | Pre-restore snapshot, secret redaction, password reconfirm; backup audit is buffered and recorded before stream completion. |
| Capacity & throughput | 6 | Docker build/prune are synchronous and unbounded; worker force-remove has no active-task warning. |
| Observability | 6 | Structured logs and audit health snapshot exist; no obvious SLO/alarm wiring in the repo. |
| Privacy & retention | 6 | User delete scrubs recruiting PII; default audit/login retention may be too short for academic disputes. |
| Secrets & rotation | 7 | Central secret registry, separate `RUNNER_AUTH_TOKEN`, reconfirm gate; no admin UI for key rotation. |
| Incident playbooks | 4 | Playbooks live in `~/git/nas-ops`, not in this repo. |
| Cost | 5 | No quotas or cost-alert wiring visible for image storage / log volume. |

## HIGH: Security-relevant judging/resource limits are missing from the settings reconfirm list
- **File**: `src/lib/security/sensitive-settings.ts` (lines 19-54), `src/app/api/v1/admin/settings/route.ts` (lines 84-97)
- **Problem**: `SENSITIVE_SETTINGS_KEYS` omits `maxSourceCodeSizeBytes`, `compilerTimeLimitMs`, `defaultTimeLimitMs`, and `defaultMemoryLimitMb`. These numeric limits affect sandbox DoS posture and judging fairness, yet changing them via the admin settings UI or REST API does not require password reconfirmation.
- **Failure scenario**: An attacker who compromises an admin session (XSS, cookie theft, or a shared workstation) can raise `maxSourceCodeSizeBytes` or `compilerTimeLimitMs` to values that exhaust worker memory/CPU or allow oversized submissions, without ever typing a password.
- **Suggested fix**: Add `maxSourceCodeSizeBytes`, `compilerTimeLimitMs`, `defaultTimeLimitMs`, and `defaultMemoryLimitMb` to `SENSITIVE_SETTINGS_KEYS` so they share the single reconfirm gate used by both the REST route and the server action.
- **Cross-references**: `src/lib/validators/system-settings.ts`, `src/lib/actions/system-settings.ts`, `tests/unit/system-settings.test.ts`.

## HIGH: High-stakes admin mutations use buffered audit events
- **File**: `src/lib/audit/events.ts` (lines 163-262)
- **Problem**: `recordAuditEvent` batches inserts for up to 5 seconds or 50 events. Many admin actions that an operator or compliance officer would expect to be durable are recorded this way: user create/update/delete/toggle, language toggle/update/reset/add, worker force-remove, Docker image pull/build/remove/prune, and backup download. A process crash, SIGKILL, or OOM in that 5-second window permanently loses the audit row.
- **Failure scenario**: A rogue admin permanently deletes a user or force-removes a worker, then the container is OOM-killed seconds later. The audit trail shows nothing, undermining academic-integrity or labor disputes and masking the actor.
- **Suggested fix**: Switch all mutating admin events to `recordAuditEventDurable` (already used for role changes, settings changes, and restore). Keep `recordAuditEvent` only for high-frequency, low-stakes events such as judge claims.
- **Cross-references**: `src/lib/actions/user-management.ts` (lines 130, 214, 360, 470), `src/lib/actions/language-configs.ts` (lines 66, 122, 209, 269, 322), `src/app/api/v1/admin/workers/[id]/route.ts` (lines 109-118), `src/app/api/v1/admin/languages/[language]/route.ts` (lines 69-79), `src/app/api/v1/admin/backup/route.ts` (lines 76-87), `src/lib/audit/node-shutdown.ts`, `tests/unit/admin-workers-audit-implementation.test.ts`.

## MEDIUM: Login-log export has no rate limit
- **File**: `src/app/api/v1/admin/login-logs/route.ts` (lines 24-145)
- **Problem**: The route is protected by `system.login_logs` but does not pass a `rateLimit` to `createApiHandler`. It can return up to 10,000 CSV rows in a single request.
- **Failure scenario**: A compromised admin account, a malicious browser extension, or an over-eager script can repeatedly export the full login history, generating heavy DB load and enabling bulk exfiltration of usernames, IPs, and user agents.
- **Suggested fix**: Add `rateLimit: "login-logs:export"` to `createApiHandler`, matching the pattern used in `src/app/api/v1/admin/audit-logs/route.ts`.
- **Cross-references**: `src/lib/api/handler.ts`, `src/lib/security/api-rate-limit.ts`, `tests/unit/admin-security-docs.test.ts`.

## MEDIUM: Docker image build and prune endpoints are synchronous, long-running, and unrate-limited
- **File**: `src/app/api/v1/admin/docker/images/build/route.ts` (lines 19-143), `src/app/api/v1/admin/docker/images/prune/route.ts` (lines 11-96), `src/lib/docker/client.ts` (lines 533-545, 615-641)
- **Problem**: Both endpoints run inside the request thread with timeouts up to 600 seconds. There is no per-user rate limit and no global concurrency guard. Prune inspects every matched image synchronously; build streams back logs only after completion.
- **Failure scenario**: During an exam, an admin (or a compromised session) accidentally or maliciously triggers multiple concurrent builds or a large prune. The request threads, worker CPU, and Docker daemon are tied up, delaying or dropping submissions.
- **Suggested fix**: Enqueue build/prune jobs on a background queue and return a job ID; add `rateLimit` keys; cap concurrent builds/prunes per worker; or at minimum require a confirmation step in the UI for prune.
- **Cross-references**: `tests/unit/admin-language-docker-capabilities-implementation.test.ts`.

## MEDIUM: Force-removing a worker resets queued/judging submissions without warning
- **File**: `src/app/api/v1/admin/workers/[id]/route.ts` (lines 65-127)
- **Problem**: `DELETE` force-removes a worker and, in the same transaction, resets all submissions whose `judgeWorkerId` equals the worker and whose status is `queued` or `judging` back to `pending`. The route never checks `activeTasks`, `status`, or `lastHeartbeatAt`, and the buffered audit event gives no hint that jobs were requeued.
- **Failure scenario**: An admin sees a stale worker entry and clicks remove. Ten submissions currently in `judging` are silently flipped to `pending`; the students' wait time resets, and if the worker was actually still running, the same submission may be double-judged after another worker picks it up.
- **Suggested fix**: Block removal (or require an explicit "force while active" flag) when `activeTasks > 0` or `status = 'active'`. Include the count of requeued submissions and a warning in both the UI confirmation and the audit summary.
- **Cross-references**: `src/lib/db/schema.pg.ts` (submissions foreign key), `tests/unit/admin-workers-audit-implementation.test.ts`.

## MEDIUM: PATCH /api/v1/admin/workers/:id is completely unaudited
- **File**: `src/app/api/v1/admin/workers/[id]/route.ts` (lines 17-62)
- **Problem**: The alias-update endpoint performs a database write but never calls `recordAuditEvent` or `recordAuditEventDurable`. Any change to worker metadata leaves no forensics trail.
- **Failure scenario**: An attacker who gains access changes worker aliases to hide which host was removed or to misdirect operators. There is no audit row to reconstruct what happened.
- **Suggested fix**: Record a durable audit event after the update, capturing the worker id, old alias, and new alias.
- **Cross-references**: `src/lib/audit/events.ts`, `src/app/api/v1/admin/workers/route.ts`.

## MEDIUM: Default data-retention windows may be too short for academic disputes
- **File**: `src/lib/data-retention.ts` (lines 1-34), `src/lib/data-retention-maintenance.ts` (lines 131-164)
- **Problem**: `auditEvents` defaults to 90 days and `loginEvents` to 180 days. University academic-integrity appeals, plagiarism investigations, and labor disputes often run over a semester or longer. The defaults are only overridable via environment variables; there is no admin UI to review or change them, and no warning that data is being pruned.
- **Failure scenario**: A professor requests login/audit evidence for a suspected cheating incident from three months ago. The automatic daily prune has already deleted the relevant rows.
- **Suggested fix**: Raise the defaults for `auditEvents` and `loginEvents` to at least one year, expose the effective retention windows in the admin settings dashboard, and surface a warning when legal hold is not active.
- **Cross-references**: `tests/unit/data-retention.test.ts`, `tests/unit/data-retention-maintenance.test.ts`.

## MEDIUM: Admin settings audit details omit most numeric config changes
- **File**: `src/app/api/v1/admin/settings/route.ts` (lines 190-204)
- **Problem**: The durable audit event for a settings PUT only records a small handful of site-level fields (`siteTitle`, `siteDescription`, `timeZone`, `platformMode`, etc.). It does not record the numeric `allowedConfigKeys` values such as rate limits, queue limits, or `maxSourceCodeSizeBytes`, even though those are exactly what a forensic review would need.
- **Failure scenario**: After a security incident, an investigator sees a settings audit row but cannot tell whether the attacker changed `apiRateLimitMax`, `submissionRateLimitMaxPerMinute`, or `sessionMaxAgeSeconds`.
- **Suggested fix**: Include every key from `filteredConfig` (with secret redaction where appropriate) in the audit `details`, gated by `hasOwnInput` so untouched fields are not logged.
- **Cross-references**: `src/lib/actions/system-settings.ts` (server action mirrors this pattern), `tests/unit/system-settings.test.ts`.

## MEDIUM: GET /api/v1/admin/workers generates audit noise and lacks rate limiting
- **File**: `src/app/api/v1/admin/workers/route.ts` (lines 11-49)
- **Problem**: Every inventory view emits a buffered `worker_inventory.viewed` audit event. The route has no `rateLimit` key, so an auto-refreshing dashboard or a script can rapidly generate both audit rows and DB queries.
- **Failure scenario**: An operator leaves the workers page open with a 5-second refresh. The audit table grows by thousands of low-value rows per day, increasing storage cost and making incident triage harder.
- **Suggested fix**: Either remove the audit event for the read-only list view (audit mutations, not views) or downsample it; add a `rateLimit` to the handler.
- **Cross-references**: `src/lib/audit/events.ts`, `tests/unit/admin-workers-audit-implementation.test.ts`.

## MEDIUM: Backup download audit is buffered and recorded before the stream completes
- **File**: `src/app/api/v1/admin/backup/route.ts` (lines 76-106)
- **Problem**: The `system_settings.backup_downloaded` audit event is emitted via `recordAuditEvent` (buffered) immediately after password verification and before the response stream begins. If the client aborts or the server fails partway through streaming, the audit still claims a successful download.
- **Failure scenario**: An admin starts a backup, cancels it, and later an investigator sees an audit row saying the backup was downloaded. There is no companion event for abort/failure, and the row could be lost if the process crashes before the 5-second audit flush.
- **Suggested fix**: Record the audit only after the stream finishes successfully, use `recordAuditEventDurable`, and add an abort/failure audit event for incomplete downloads.
- **Cross-references**: `src/lib/db/export.ts` (lines 72-116), `src/lib/db/export-with-files.ts` (line 172), `tests/unit/db/export-implementation.test.ts`, `tests/unit/db/export-with-files.test.ts`.

## LOW: User detail page has no edit affordance and no role-change history
- **File**: `src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx` (lines 77-89)
- **Problem**: The detail page displays user metadata and a `<UserActions>` component (activate/deactivate/delete) but does not include the `<EditUserDialog>` used on the list page. Admins must navigate back to the list to edit name, email, class, or role.
- **Failure scenario**: An admin drills into a user to investigate a role escalation, discovers the role is wrong, and must return to the list, search, and open the edit dialog there. There is also no visible history of prior role or activation changes.
- **Suggested fix**: Add an edit button on the detail page (respecting the same `manageableRoleNames` filter) and surface a compact activity timeline from `auditEvents` for that user.
- **Cross-references**: `src/app/(dashboard)/dashboard/admin/users/page.tsx` (lines 247-256), `src/app/(dashboard)/dashboard/admin/users/user-actions.tsx`.

## LOW: "Reset all languages to defaults" has weak confirmation UX
- **File**: `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx` (lines 411-425, 750-779)
- **Problem**: The action is reachable from a dropdown menu and confirmed through a generic `AlertDialog` that only shows a translated string. It does not display how many languages will be overwritten, which configs have custom values, or the consequences for active exams.
- **Failure scenario**: A new admin testing the UI clicks "Reset all languages" expecting to reset one row. All custom Docker images and compile/run commands are overwritten; an in-progress exam may suddenly use a different compiler version.
- **Suggested fix**: Show a summary dialog listing the affected languages and their current vs. default Docker images, require typing a confirmation phrase, and disable the action while any build is in progress.
- **Cross-references**: `src/lib/actions/language-configs.ts` (lines 291-342), `tests/unit/admin-language-docker-capabilities-implementation.test.ts`.

## LOW: static-site nginx config is HTTP-only and lacks security headers
- **File**: `static-site/nginx.conf` (lines 1-23)
- **Problem**: The static-site server block listens on plain HTTP, has no HSTS, CSP, X-Frame-Options, or referrer-policy headers, and no path restrictions. It serves static assets only, but the config is inconsistent with the production-hardening expectations elsewhere.
- **Failure scenario**: If this container is ever exposed directly (misconfigured load balancer, temporary debug deployment), it offers no transport or clickjacking protection for the marketing/auth-related static pages.
- **Suggested fix**: Add TLS redirect/listen 443, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and a restrictive CSP. Document that this config is intended to run behind a TLS-terminating proxy.
- **Cross-references**: `deploy-docker.sh` (lines 313-314 for algo guardrails), `src/lib/security/constants.ts`.

## Final sweep
- **Areas skipped or needing manual validation**: Contest/assignment admin flows are largely instructor-scoped and were not deeply traced; plugin management UI (`/dashboard/admin/plugins`) was not audited; e2e coverage of the backup/restore round-trip and worker force-remove under load were not executed. The `~/git/nas-ops` incident playbooks were not inspected; this review assumes they cover the scenarios listed in the admin persona.
- **Positive controls noted**: `deploy-docker.sh` refuses `algo.xylolabs.com` deployments unless `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false` (line 313). Role create/update enforce capability-escalation and level guards (`src/app/api/v1/admin/roles/route.ts`, `src/app/api/v1/admin/roles/[id]/route.ts`). Database exports redact password hashes and secrets by default via `EXPORT_ALWAYS_REDACT_COLUMNS` (`src/lib/security/secrets.ts`, `src/lib/db/export.ts`). Backup and restore require password reconfirmation and create a pre-restore snapshot (`src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`).
