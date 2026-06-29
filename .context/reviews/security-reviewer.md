# Security Review - cycle 1/100

Reviewer: security-reviewer  
Repo: `/Users/hletrd/flash-shared/judgekit`  
Date: 2026-06-30  

## Inventory First

`rg --files` found 1,965 tracked workspace files before focused review.

Top-level inventory by file count:

| Path | Count |
| --- | ---: |
| `src/` | 635 |
| `tests/` | 525 |
| `plans/` | 344 |
| `docker/` | 106 |
| `static-site/` | 101 |
| `drizzle/` | 99 |
| `scripts/` | 43 |
| `docs/` | 30 |
| `plan/` | 23 |
| `judge-worker-rs/` | 13 |
| `code-similarity-rs/` | 5 |
| `rate-limiter-rs/` | 4 |

Focused review areas:

- Auth/authz and CSRF: `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/security/csrf.ts`, `src/lib/security/env.ts`, admin role routes, file routes, judge worker routes.
- Secrets: `src/lib/security/env.ts`, `src/lib/security/secrets.ts`, plugin secret storage, env examples, export sanitization.
- OWASP/XSS/file handling: `src/lib/security/sanitize-html.ts`, markdown renderers, file storage and download APIs.
- Backup/restore/import: `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/pre-restore-snapshot.ts`.
- Deploy and destructive operations: `deploy-docker.sh`, `deploy.sh`, `scripts/docker-disk-cleanup.sh`, `scripts/pg-volume-safety-check.sh`, Docker admin APIs, Rust worker Docker execution.
- Judge sandbox: `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/docker.rs`, judge registration/claim/heartbeat auth.

Worktree note: review was against the current working tree. It was already dirty before this report (`plan/cycle-7-2026-06-28-review-remediation.md`, `src/app/api/v1/admin/restore/route.ts`).

Constraints applied:

- I do not recommend `docker system prune --volumes`.
- I do not recommend deleting PostgreSQL or user-data volumes.
- The current worv deployment target is correctly documented as `test.worv.ai` in `docs/deployment.md:153`, `docs/deployment-automation.md:19`, and `AGENTS.md:577-579`.

## Findings

### S1. Post-deploy `docker volume prune -f` can delete detached data volumes

Severity: Medium  
Confidence: High  
Files/lines: `deploy-docker.sh:399-417`, `deploy-docker.sh:1230-1237`, `deploy-docker.sh:879-900`, `scripts/docker-disk-cleanup.sh:4-7`

Scenario:

`deploy-docker.sh` runs post-deploy cleanup by default and calls `docker volume prune -f` whenever `judgekit-db` is running (`deploy-docker.sh:407-417`). That command removes every Docker volume not currently attached to a container, not just build artifacts. The PG orphan safety check reduces one known failure mode, but it is bypassable via `SKIP_PG_VOLUME_CHECK=1` (`deploy-docker.sh:888-900`) and does not prove that every detached volume on the host is disposable. A detached anonymous PostgreSQL volume, an old compose-project data volume, or another service's user-data volume on the same host can be erased during a routine app deploy. The dedicated disk cleanup script explicitly documents the safer posture: no `docker volume prune` and no `docker system prune --volumes` (`scripts/docker-disk-cleanup.sh:4-7`).

Fix:

Remove `docker volume prune -f` from `prune_old_docker_artifacts`. Keep `docker container prune`, dangling-only `docker image prune -f`, and BuildKit cache pruning. If volume cleanup is required, only remove explicitly named and labeled non-data scratch volumes created by JudgeKit, after checking they are not PostgreSQL or upload/user-data volumes. Do not replace this with `docker system prune --volumes`.

### S2. Judge API IP allowlist fails open in production when unset

Severity: Medium  
Confidence: High  
Files/lines: `src/lib/judge/ip-allowlist.ts:6-16`, `src/lib/judge/ip-allowlist.ts:182-201`, `src/lib/security/production-config.ts:47-51`, `.env.production.example:80-87`, `src/app/api/v1/judge/register/route.ts:27-33`, `src/app/api/v1/judge/register/route.ts:80-83`

Scenario:

`isJudgeIpAllowed` allows all clients when `JUDGE_ALLOWED_IPS` is unset unless `JUDGE_STRICT_IP_ALLOWLIST=1` is explicitly set (`src/lib/judge/ip-allowlist.ts:182-201`). Production startup only warns that `JUDGE_ALLOWED_IPS` is recommended (`src/lib/security/production-config.ts:47-51`), and the production env example documents unset as allow-all (`.env.production.example:80-87`). `/api/v1/judge/register` uses this allowlist before accepting the shared judge bearer token (`src/app/api/v1/judge/register/route.ts:27-33`) and returns a new per-worker secret on success (`src/app/api/v1/judge/register/route.ts:80-83`). If the shared `JUDGE_AUTH_TOKEN` leaks from a worker host, env file, or backup, an attacker outside the worker network can register a fake worker, obtain a worker secret, and participate in the claim path from anywhere the app is reachable.

Fix:

For production, fail closed unless either `JUDGE_ALLOWED_IPS` is non-empty or an explicit operator override is set. Prefer making `JUDGE_ALLOWED_IPS` production-required when `JUDGE_PRODUCTION_MODE=1` or when judge routes are enabled. Keep development backward compatibility separately. Populate deployment target env files with actual worker host IPs/CIDRs.

### S3. ZIP restore commits DB before uploaded files are restored

Severity: Medium  
Confidence: High  
Files/lines: `src/app/api/v1/admin/restore/route.ts:163`, `src/app/api/v1/admin/restore/route.ts:174-181`, `src/lib/db/export-with-files.ts:351-367`

Scenario:

The restore route imports the database first (`src/app/api/v1/admin/restore/route.ts:163`). For ZIP backups, uploaded files are written after the DB transaction has already committed (`src/app/api/v1/admin/restore/route.ts:174-181`). `restoreParsedBackupFiles` writes files directly to the live uploads directory and its comment notes that the full staging-then-rename fix is deferred (`src/lib/db/export-with-files.ts:351-367`). If disk fills, permissions fail, or the process dies during file restore, the database can reference upload blobs that do not exist. The durable failure audit and pre-restore snapshot help recovery, but the restore operation still leaves production in an inconsistent state until an operator rolls back manually.

Fix:

Implement two-phase file restore. Write all backup uploads to a staging directory on the same filesystem, verify manifest hashes and file presence, fsync where practical, then atomically swap/rename into place only after the staged set is complete. Couple DB import and file activation so a file-phase failure cannot leave the committed DB pointing at missing live files. Keep the existing pre-restore snapshot as a rollback artifact.

### S4. Role PATCH authorization checks are not protected by a row lock

Severity: Low  
Confidence: High  
Files/lines: `src/app/api/v1/admin/roles/[id]/route.ts:59-63`, `src/app/api/v1/admin/roles/[id]/route.ts:82-96`, `src/app/api/v1/admin/roles/[id]/route.ts:121-124`, `src/app/api/v1/admin/roles/[id]/route.ts:156-162`

Scenario:

Role PATCH reads the target role, checks its current level against the actor, and later updates it without a transaction or row lock (`src/app/api/v1/admin/roles/[id]/route.ts:59-63`, `src/app/api/v1/admin/roles/[id]/route.ts:82-96`, `src/app/api/v1/admin/roles/[id]/route.ts:121-124`). DELETE already uses `execTransaction` and `for("update")` (`src/app/api/v1/admin/roles/[id]/route.ts:156-162`). A lower-level role manager can pass checks on a role while it is still within their level, then a concurrent higher-level admin can promote the role before the first PATCH writes. The stale PATCH can then modify a role that would no longer pass the authorization check.

Fix:

Move PATCH into `execTransaction`, select the role `for("update")`, re-run the built-in, level, super-admin, and capability checks against the locked row, and perform the update inside that transaction. Invalidate role cache after commit.

### S5. Same-level custom roles can still be edited laterally

Severity: Low  
Confidence: High  
Files/lines: `src/app/api/v1/admin/roles/[id]/route.ts:82-96`, `src/app/api/v1/admin/roles/[id]/route.ts:102-108`

Scenario:

The role edit guard blocks edits only when the target role level is greater than the actor's level (`role.level > creatorLevel`) and blocks setting a new level above the actor (`updates.level > creatorLevel`) (`src/app/api/v1/admin/roles/[id]/route.ts:82-96`). Capability validation only checks newly added capabilities (`src/app/api/v1/admin/roles/[id]/route.ts:102-108`); removals are unrestricted. A same-level admin with `users.manage_roles` can strip capabilities from a peer custom role at the same level. This is not vertical privilege escalation, but it is a lateral authorization weakness for role governance.

Fix:

Decide whether same-level role management is intended. If not, reject `role.level >= creatorLevel` for non-super-admin actors or add a separate capability for peer role edits. At minimum, audit capability removals explicitly and consider requiring super-admin for reducing same-level roles.

### S6. Recruiting password reset can clobber security metadata updates

Severity: Low  
Confidence: Medium  
Files/lines: `src/lib/assignments/recruiting-invitations.ts:96-107`, `src/lib/assignments/recruiting-invitations.ts:462-477`, `src/lib/assignments/recruiting-invitations.ts:480-509`

Scenario:

Failed redeem attempts are incremented atomically with `jsonb_set` (`src/lib/assignments/recruiting-invitations.ts:96-107`). `resetRecruitingInvitationAccountPassword` reads invitation metadata before its transaction, builds `nextMetadata` in memory, and writes the whole metadata object later (`src/lib/assignments/recruiting-invitations.ts:462-477`, `src/lib/assignments/recruiting-invitations.ts:480-509`). If a failed redeem attempt increments `_sys.failedRedeemAttempts` while an admin reset is in progress, the reset can overwrite the increment with its stale metadata snapshot. Impact is bounded to undercounting around an admin action, but it weakens the brute-force counter in that race.

Fix:

Avoid whole-object metadata replacement. Inside the reset transaction, lock the invitation row and use `jsonb_set` to set only `_sys.accountPasswordResetRequired`, preserving concurrently updated keys. Alternatively, re-read metadata under `FOR UPDATE` before computing the update.

### S7. Judge worker source files are world-readable/world-writable in fallback workspaces

Severity: Low  
Confidence: Medium  
Files/lines: `judge-worker-rs/src/executor.rs:320-342`, `judge-worker-rs/src/executor.rs:376-395`

Scenario:

The worker tries to chown each temporary workspace to uid/gid 65534 and uses mode `0700` on success, but falls back to `0777` if chown fails (`judge-worker-rs/src/executor.rs:320-342`). The source file is then forced to mode `0666` (`judge-worker-rs/src/executor.rs:376-395`). In production the chown path should usually protect the directory, but in rootless/dev/fallback environments or a misconfigured worker container, another process with access to `/judge-workspaces` can read or modify source while compile/run is in flight. That can leak submissions or alter judged code.

Fix:

Set source files to the minimum mode required by the judge container, ideally `0600` after successful chown to 65534:65534. If chown fails, prefer a dedicated worker uid/gid or group-readable `0640` with a controlled group mapping instead of world-writable source files and `0777` workspaces.

### S8. Legacy migrate import success audits omit the pre-restore snapshot path

Severity: Low  
Confidence: High  
Files/lines: `src/app/api/v1/admin/migrate/import/route.ts:98-108`, `src/app/api/v1/admin/migrate/import/route.ts:123-132`, `src/app/api/v1/admin/migrate/import/route.ts:214-221`, `src/app/api/v1/admin/migrate/import/route.ts:233-242`, `src/app/api/v1/admin/restore/route.ts:219-230`

Scenario:

Both migrate import paths take a pre-restore snapshot and return `preRestoreSnapshotPath` in the HTTP response (`src/app/api/v1/admin/migrate/import/route.ts:98-108`, `src/app/api/v1/admin/migrate/import/route.ts:214-221`). Their durable success audit details include only `skippedTables` (`src/app/api/v1/admin/migrate/import/route.ts:123-132`, `src/app/api/v1/admin/migrate/import/route.ts:233-242`). The main restore route records `preRestoreSnapshotPath` in the durable audit (`src/app/api/v1/admin/restore/route.ts:219-230`). If an import succeeds but is later discovered to be the wrong backup, the audit trail does not carry the exact rollback artifact path; the operator must rely on the HTTP response, logs, or filesystem search.

Fix:

Add `preRestoreSnapshotPath` to the durable audit `details` for both migrate import success paths, matching the restore route. Keep access restricted to authorized audit viewers.

## Verified Non-Findings / Current Guards

- CSRF defaults are active for mutation API handlers and are skipped only for API-key auth, which is not cookie based: `src/lib/api/handler.ts:143-153`, `src/lib/security/csrf.ts:35-79`.
- Production auth and judge secrets reject placeholders and weak lengths: `src/lib/security/env.ts:284-312`.
- Production env files are refused when group/other accessible: `src/lib/security/env.ts:171-211`.
- Sanitized exports and logger redaction cover password hashes, session/account tokens, API keys, judge worker secret hashes/claim tokens, recruiting token hashes, and system-setting secrets: `src/lib/security/secrets.ts:21-42`, `src/lib/security/secrets.ts:48-73`.
- Legacy HTML rendering is sanitized with DOMPurify; markdown renderers use `skipHtml` and capped KaTeX expansion: `src/lib/security/sanitize-html.ts:3-15`, `src/lib/security/sanitize-html.ts:74-81`, `src/components/problem-description.tsx:72-85`, `src/components/assistant-markdown.tsx:38-47`.
- Uploaded-file paths reject traversal-ish stored names, downloads require authz, content sniffing is blocked, and non-images are served as attachments: `src/lib/files/storage.ts:18-30`, `src/app/api/v1/files/[id]/route.ts:67-92`, `src/app/api/v1/files/[id]/route.ts:108-134`.
- Judge `/claim` no longer accepts only the shared bootstrap token; it requires a registered worker id and per-worker secret path: `src/app/api/v1/judge/claim/route.ts:102-128`, `src/app/api/v1/judge/claim/route.ts:173-211`, `src/lib/judge/auth.ts:52-97`.
- I did not find `docker system prune --volumes`, `docker image prune -af`, or `docker compose down -v` in the active deploy scripts. The remaining destructive Docker finding is specifically `docker volume prune -f` in `deploy-docker.sh`.

## Review Limits

This was a static security review. I did not run the test suite, dependency audit, or live deployment commands. 
