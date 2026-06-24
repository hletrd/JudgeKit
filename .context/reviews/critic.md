# Critic Review - Review-Plan-Fix Cycle 2 Prompt 1

Scope: static, cross-file critique of the current dirty repository in `/Users/hletrd/flash-shared/judgekit` on 2026-06-23. I treated all uncommitted changes as intentional prior-cycle work, did not revert anything, and did not implement source fixes.

Findings count: 9

## Inventory

I built the inventory from `git status --short`, `git diff --name-only`, `git diff --stat`, and the repo instructions. I then read the changed files and the files they interact with, including API callers, schema definitions, deployment compose files, tests, and docs. I did not sample within the changed surface.

Review-relevant dirty runtime, docs, ops, and test files examined:

- `deploy-docker.sh`
- `docs/authentication.md`
- `judge-worker-rs/src/executor.rs`
- `judge-worker-rs/src/validation.rs`
- `messages/en.json`
- `messages/ko.json`
- `playwright.config.ts`
- `scripts/playwright-local-webserver.sh`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`
- `src/app/(public)/languages/page.tsx`
- `src/app/api/v1/admin/restore/route.ts`
- `src/app/api/v1/auth/reset-password/route.ts`
- `src/app/api/v1/problems/import/route.ts`
- `src/app/change-password/change-password-form.tsx`
- `src/lib/actions/public-signup.ts`
- `src/lib/actions/user-management.ts`
- `src/lib/auth/trusted-host.ts`
- `src/lib/compiler/execute.ts`
- `src/lib/db/export-with-files.ts`
- `src/lib/db/export.ts`
- `src/lib/docker/client.ts`
- `src/lib/judge/sync-language-configs.ts`
- `src/lib/plugins/secrets.ts`
- `src/lib/problem-management.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/security/password.ts`
- `src/lib/system-settings-config.ts`
- `src/lib/validators/api.ts`
- `src/lib/validators/system-settings.ts`
- `tests/e2e/function-judging-responsive.spec.ts`
- `tests/unit/actions/problem-management.test.ts`
- `tests/unit/api/admin-backup-security.route.test.ts`
- `tests/unit/auth/trusted-host.test.ts`
- `tests/unit/compiler/execute-implementation.test.ts`
- `tests/unit/dashboard-judge-system-implementation.test.ts`
- `tests/unit/db/export-sanitization.test.ts`
- `tests/unit/db/export-with-files.test.ts`
- `tests/unit/docker/client.test.ts`
- `tests/unit/infra/deploy-security.test.ts`
- `tests/unit/infra/playwright-profiles.test.ts`
- `tests/unit/plugins.secrets.test.ts`
- `tests/unit/realtime/realtime-coordination.test.ts`
- `tests/unit/security/password.test.ts`
- `tests/unit/sync-language-configs-skip-instrumentation.test.ts`
- `tests/unit/validators/api.test.ts`
- `tests/unit/validators/problem-import.test.ts`

Cross-file dependencies and unchanged files examined because they are needed to validate behavior:

- `AGENTS.md`
- `docker-compose.production.yml`
- `docker-compose.worker.yml`
- `docs/api.md`
- `docs/data-retention-policy.md`
- `docs/judge-workers.md`
- `src/app/api/v1/admin/backup/route.ts`
- `src/app/api/v1/admin/migrate/export/route.ts`
- `src/app/api/v1/admin/languages/[language]/route.ts`
- `src/app/api/v1/admin/languages/route.ts`
- `src/lib/db/import.ts`
- `src/lib/db/pre-restore-snapshot.ts`
- `src/lib/db/schema.pg.ts`
- `src/lib/judge/languages.ts`
- `src/lib/security/derive-key.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `plans/open/2026-06-22-rpf-cycle-1-review-remediation.md`
- Current review artifacts in `.context/reviews/`

## Findings

### CRIT-1 - Admin language image builds still route through a Docker proxy that explicitly blocks builds

Severity: High  
Confidence: High  
Status: confirmed  
Perspectives: product correctness, operational readiness, UI risk, deployment safety

Evidence:

- The app's Docker build client calls the worker runner endpoint `/docker/build` with a 600 second timeout: `src/lib/docker/client.ts:443-450`.
- The Rust runner exposes `/docker/build` and shells out to `docker build -t ... -f ... .`: `judge-worker-rs/src/runner.rs:313-325`, `judge-worker-rs/src/runner.rs:590-623`, `judge-worker-rs/src/runner.rs:919-928`.
- In production, the worker uses the Docker socket proxy through `DOCKER_HOST=tcp://docker-proxy:2375`: `docker-compose.production.yml:137-143`.
- That same proxy is configured with `BUILD=0`, with a comment that image builds must not flow through the worker path: `docker-compose.production.yml:70-79`.
- Dedicated workers also hardcode `BUILD=0`: `docker-compose.worker.yml:37-39`.
- The dedicated worker docs tell operators to opt into `WORKER_DOCKER_PROXY_BUILD=1`, but the compose file does not read that variable: `docs/judge-workers.md:95-102` versus `docker-compose.worker.yml:37-39`.

Concrete failure scenario:

An admin opens `/dashboard/admin/languages` and clicks the Build button for a missing language image. The app sends `/docker/build` to the worker. The worker invokes `docker build`, but the only Docker daemon access path is the proxy with `BUILD=0`, so the request is forbidden by proxy policy. The UI now exposes a build workflow that cannot succeed in the documented production topology, and the docs advertise an env opt-in that is ignored by the compose file.

Suggested fix:

Pick one explicit production model. Either disable/hide the Build action when the worker is behind a no-build proxy and route image builds through `deploy-docker.sh`, or add a reviewed build-capable override/compose profile that actually sets `BUILD=${WORKER_DOCKER_PROXY_BUILD:-0}` and documents the security tradeoff. The app should also surface "build disabled by worker policy" distinctly from generic build failure.

### CRIT-2 - Startup language sync preserves overrides by freezing stale generated defaults forever

Severity: High  
Confidence: High  
Status: confirmed  
Perspectives: product correctness, maintainability, deployment safety

Evidence:

- Startup sync now inserts missing rows, but for existing rows it only backfills empty `runCommand` and null `compileCommand`: `src/lib/judge/sync-language-configs.ts:23-63`.
- `language_configs` stores the live runtime values but no provenance, default hash, or override flag: `src/lib/db/schema.pg.ts:516-528`.
- The admin PATCH route writes the same `compileCommand` and `runCommand` columns that startup sync writes: `src/app/api/v1/admin/languages/[language]/route.ts:46-58`.
- The project guide says the worker reads these DB fields at runtime and `npm run languages:sync` is the source of truth synchronization step after language config changes.

Concrete failure scenario:

A default command bug is fixed in `src/lib/judge/languages.ts`, for example a compiler output path or runtime flag. The operator runs the documented sync command. Every existing production row already has a non-empty `runCommand` and usually a non-null `compileCommand`, so sync skips it. Fresh test databases pass with the corrected default, while production continues using the stale DB command because the sync code cannot distinguish "old generated default" from "intentional admin override."

Suggested fix:

Add provenance. Store generated default hashes or explicit override flags per command. On sync, update rows that still match the previous generated default, preserve rows marked as admin overrides, and add a "reset to current default" admin action. Add a regression test with three rows: old generated default updates, real admin override remains, and missing command backfills.

### CRIT-3 - ZIP restore commits the database before uploaded files are restored

Severity: High  
Confidence: High  
Status: confirmed  
Perspectives: product correctness, operational readiness, deployment safety

Evidence:

- ZIP restore parses `database.json` and holds uploaded files in memory as `pendingUploadedFiles`: `src/app/api/v1/admin/restore/route.ts:78-90`.
- The route imports the database first: `src/app/api/v1/admin/restore/route.ts:165-174`.
- Only after the DB import succeeds does it write uploaded files: `src/app/api/v1/admin/restore/route.ts:176-178`.
- File restoration writes each upload sequentially and can fail mid-loop: `src/lib/db/export-with-files.ts:351-357`.
- The cycle plan already records this as still open: `plans/open/2026-06-22-rpf-cycle-1-review-remediation.md:161-162`.

Concrete failure scenario:

An operator restores a ZIP backup with a valid database and uploads. `importDatabase(data)` commits the new database state. Then `restoreParsedBackupFiles()` fails because the uploads directory is unwritable, the disk fills, or a later file write errors. The route returns a 500, but the database has already been replaced and now references files that were not restored. The pre-restore snapshot helps manual recovery but does not prevent inconsistent live state.

Suggested fix:

Stage and verify uploads before the destructive DB import. A safer flow is: unpack to a bounded temp directory, verify manifest hashes and file count, verify available space, import DB, then atomically promote the staged upload tree. If atomic promotion is not feasible, restore should have an explicit rollback/cleanup path and should not report success until DB and files are consistent.

### CRIT-4 - Local compiler fallback makes submission workspaces world-writable even when chown succeeds

Severity: High  
Confidence: High  
Status: confirmed  
Perspectives: security, product correctness, maintainability

Evidence:

- The fallback workspace starts restrictive at `0700` and source files start at `0600`: `src/lib/compiler/execute.ts:718-733`.
- After successful `chown` to UID/GID 65534, the code still broadens the workspace to `0777` and source to `0666`: `src/lib/compiler/execute.ts:735-739`.
- The error fallback also uses `0777`/`0666`: `src/lib/compiler/execute.ts:740-746`.
- The unit test locks in those broad permissions: `tests/unit/compiler/execute-implementation.test.ts:9-14`.

Concrete failure scenario:

On a shared host or any environment where another local process can traverse `COMPILER_WORKSPACE_DIR`, a different user or compromised process can read or rewrite `solution.*` before the sibling judge container runs. That leaks submitted code and can also tamper with what gets judged. The risk remains even on the successful `chown` path, where UID 65534 ownership should have allowed restrictive permissions.

Suggested fix:

When `chown` succeeds, keep the directory and source readable only to the sandbox user, for example owner `65534:65534` with `0700` and `0600` or the narrowest permissions the container needs. If `chown` fails, prefer fail-closed or a controlled group/ACL over world-writable fallback. Update the test to assert restricted permissions on the successful path and only narrowly document any local-dev fallback.

### CRIT-5 - The admin password-length setting is still exposed and writable but no longer affects validation

Severity: Medium  
Confidence: High  
Status: confirmed  
Perspectives: product correctness, security, docs/code mismatch, UI risk

Evidence:

- Runtime password validation is fixed at exactly the repository policy minimum of 8 characters: `src/lib/security/password.ts:1-30`.
- Admin settings still expose `minPasswordLength` under session/auth settings: `src/app/(dashboard)/dashboard/admin/settings/page.tsx:49-52`.
- The settings validator still accepts `minPasswordLength` values from 8 to 128: `src/lib/validators/system-settings.ts:124-130`.
- The admin settings API still accepts the key: `src/app/api/v1/admin/settings/route.ts:63-76`.
- Config defaults and translations still describe it as "Minimum Password Length": `src/lib/system-settings-config.ts:50-56`, `messages/en.json:1547-1550`.

Concrete failure scenario:

An operator raises the minimum password length to 12 in the admin UI and believes the site is hardened. New public signup, password reset, user management, and change-password flows still accept any 8-character password because they call the fixed policy validator. The UI presents a control whose value is ignored by the implementation.

Suggested fix:

Because `AGENTS.md` mandates the 8-character length-only policy, remove or disable this setting from the admin UI and reject new writes to `minPasswordLength`, or label it as deprecated/no-op until a migration removes it. If configurability is desired later, first change the project policy explicitly and then wire every password path to the configured value.

### CRIT-6 - Local Playwright runs can test a stale standalone build by default

Severity: Medium  
Confidence: High  
Status: confirmed  
Perspectives: test strategy, maintainability, product correctness

Evidence:

- The Playwright webServer script only rebuilds when `PLAYWRIGHT_REBUILD_APP=1` or `.next/standalone/server.js` is missing: `scripts/playwright-local-webserver.sh:105-107`.
- The package script does not set that env var: `package.json:24-28`.
- Playwright uses that script for local non-remote runs: `playwright.config.ts:98-119`.
- CI happens to build immediately before Playwright: `.github/workflows/ci.yml:315-319`, so the primary risk is local and ad hoc validation.
- The cycle plan records that full Playwright was still not green after the webServer change: `plans/open/2026-06-22-rpf-cycle-1-review-remediation.md:181-185`.

Concrete failure scenario:

A developer changes a route or component, then runs `npm run test:e2e` while an old `.next/standalone/server.js` exists. The webServer starts the stale build and Playwright validates old code. The run can pass despite the new source being broken, or fail on behavior that no longer matches the source, wasting debugging time.

Suggested fix:

Make local e2e rebuild the default. For example, set `PLAYWRIGHT_REBUILD_APP=1` in `npm run test:e2e`, or invert the flag to `PLAYWRIGHT_REUSE_BUILD=1` for the fast path. A stronger option is an mtime/build-id check against source, lockfile, and config files before deciding reuse is safe.

### CRIT-7 - "Full-fidelity" backup/export docs and metadata are false for auth-critical fields

Severity: High  
Confidence: High  
Status: confirmed  
Perspectives: operational readiness, docs/code mismatch, security, product correctness

Evidence:

- Docs say full-fidelity export means "all fields included" and should be used for disaster recovery: `docs/data-retention-policy.md:44-50`.
- API docs say sanitized exports are rejected and a full-fidelity backup should be used for disaster recovery restores: `docs/api.md:1719-1725`.
- The export stream labels `sanitize: false` output as `"full-fidelity"`: `src/lib/db/export.ts:98-106`, `src/lib/db/export.ts:288`.
- Even when `sanitize` is false, `EXPORT_ALWAYS_REDACT_COLUMNS` is still applied: `src/lib/db/export.ts:104-106`.
- Always-redacted fields include `users.passwordHash`, `sessions.sessionToken`, OAuth tokens, API key encrypted material, and selected system secrets: `src/lib/security/secrets.ts:36-42`.
- Import inserts rows as-is: `src/lib/db/import.ts:183-197`.
- `sessions.session_token` is a primary key, so redacted session rows are not full-fidelity and can fail restore if present: `src/lib/db/schema.pg.ts:65-70`.

Concrete failure scenario:

An operator downloads a backup that the API and docs call full-fidelity, then restores it during disaster recovery. User password hashes are redacted, sessions are not restorable as original session rows, OAuth tokens and some secrets are missing, and any session rows with null tokens can cause import errors. Even if import succeeds for nullable columns, the restored system is not a faithful recovery of authentication state or integrations.

Suggested fix:

Separate the concepts. Either make true disaster-recovery backups include restorable encrypted secret/auth fields under strict access controls, or rename the current mode to a redacted administrative export and document exactly which tables cannot be restored faithfully. If intentionally excluding ephemeral tables such as sessions, transform or omit them with explicit restore semantics rather than exporting invalid redacted primary keys under a "full-fidelity" label.

### CRIT-8 - Plugin secret encryption makes restored backups dependent on an undeclared environment-key coupling

Severity: Medium  
Confidence: Medium  
Status: likely  
Perspectives: operational readiness, docs/code mismatch, security

Evidence:

- Plugin secret config values are encrypted before storage/export: `src/lib/plugins/secrets.ts:103-129`, `src/lib/db/export.ts:271-280`.
- Runtime plugin use decrypts with the current `PLUGIN_CONFIG_ENCRYPTION_KEY`; on failure it logs and clears the secret value: `src/lib/plugins/secrets.ts:148-169`.
- Key derivation depends entirely on `process.env.PLUGIN_CONFIG_ENCRYPTION_KEY`: `src/lib/security/derive-key.ts:9-16`.
- `deploy-docker.sh` generates a fresh `PLUGIN_CONFIG_ENCRYPTION_KEY` for a new `.env.production`: `deploy-docker.sh:541-560`.
- The backup/restore docs cited in CRIT-7 do not state that this key must be preserved with the backup for plugin secrets to remain usable.

Concrete failure scenario:

An operator restores a backup to a fresh host whose `.env.production` was generated independently. The database import succeeds, but plugin config secret ciphertext was encrypted under the old host key. When the plugin runs, decryption fails and the secret fields become empty, breaking chat/provider integrations after an otherwise successful restore.

Suggested fix:

Document `PLUGIN_CONFIG_ENCRYPTION_KEY` as part of the disaster-recovery backup set and add backup metadata or restore preflight that can warn when encrypted plugin secrets are present. Longer term, add key identifiers and a re-key flow so restores can detect, validate, and rotate encrypted plugin config safely.

### CRIT-9 - ZIP restore audit records "0 files" before file restore happens

Severity: Low  
Confidence: High  
Status: confirmed  
Perspectives: operational readiness, security auditability

Evidence:

- `filesRestored` is initialized to zero before ZIP parsing: `src/app/api/v1/admin/restore/route.ts:78-80`.
- The audit event is recorded before `importDatabase()` and before uploaded files are written, and the summary interpolates that still-zero value: `src/app/api/v1/admin/restore/route.ts:151-163`.
- Actual restore count is only assigned later: `src/app/api/v1/admin/restore/route.ts:176-184`.

Concrete failure scenario:

An admin restores a ZIP backup containing hundreds of uploaded files. The audit trail says "Restoring from ZIP backup (..., 0 files, ... MB)" even when the response later says files were restored. During incident response, audit logs underreport the scope of restored file data and make it harder to distinguish a DB-only restore from a DB+uploads restore.

Suggested fix:

Record the planned upload count in the pre-import audit event, for example `pendingUploadedFiles.length`, and record a second post-restore audit event with the actual restored count after `restoreParsedBackupFiles()` returns. For failures, include whether the failure happened before DB import, during DB import, or during file promotion.

## Positive Validations

- The destructive `drizzle-kit push` prompt path now aborts before app startup: `deploy-docker.sh:1009-1064`, and app startup happens later at `deploy-docker.sh:1096-1123`.
- Dedicated worker restart failure is now fatal: `deploy-docker.sh:1190-1204`.
- Nginx config-test failure is now fatal: `deploy-docker.sh:1399-1405`.
- Password validation itself is now aligned with the repo-mandated 8-character length-only policy: `src/lib/security/password.ts:1-30`.
- Restore rejects sanitized exports before import: `src/app/api/v1/admin/restore/route.ts:126-138`.
- The backup ZIP parser applies entry count, per-entry size, and total decompressed-size checks before extracting file contents: `src/lib/db/export-with-files.ts:32-35`, `src/lib/db/export-with-files.ts:267-273`.

## Final Missed-Issue Sweep

After drafting the findings, I rechecked the dirty file list and the cross-file paths most likely to hide regressions: Docker image management, language sync, restore/import/export, plugin secrets, password settings, local compiler fallback, and Playwright webServer behavior. I also compared the docs that describe those features against the code paths that implement them.

Lower-signal items I did not promote to findings:

- Judge report diagnostics now have a 64 KiB API validation cap and a 16 KiB persistence cap. That is a maintainability mismatch, but the current code intentionally validates before persistence truncation and I did not find a concrete user-visible failure.
- `/languages` is forced dynamic to avoid production build-time DB access. That has caching/performance cost, but it is an acceptable operational tradeoff unless the public page becomes hot.
- Trusted-host validation now ignores client-supplied `X-Forwarded-Host`; with the current nginx config forwarding `Host`, I did not find a concrete deployment break.
- The backup ZIP limits appear enforceable from JSZip's loaded entry metadata in the current package shape, so I did not keep the older "unknown uncompressed size" concern as a finding.

No source fixes were applied in this review pass.
