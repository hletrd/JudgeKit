# Comprehensive Code Review — JudgeKit (current working tree)

**Date:** 2026-04-09  
**Scope:** Current repository working tree, including uncommitted local changes (`git status` showed 31 modified files).  
**Inventory baseline:** `src/` 418 files, `tests/` 153 files, `docker/` 104 files, `scripts/` 25 files, `docs/` 12 files, plus 3 Rust crates (`judge-worker-rs`, `code-similarity-rs`, `rate-limiter-rs`).  
**Excluded as non-review artifacts:** `.git/`, `node_modules/`, `.next/`, `data/`, `coverage/`, `test-results/`, `*/target/`, `.omc/`, `.omx/`, and similar generated/cache directories.

## Review inventory and method

I first built a file/category inventory and then reviewed the repository in layers:

- **Docs/config:** `README.md`, `docs/api.md`, `docs/deployment.md`, `docs/judge-workers.md`, env examples, `package.json`, `next.config.ts`, `drizzle.config.ts`
- **Deployment/runtime:** `deploy-docker.sh`, `deploy.sh`, compose files, nginx configs, Dockerfiles
- **Core app layers:** auth, permissions, API handler/auth wrappers, DB schema/import/export, submissions/problem management
- **Admin/security paths:** backup/restore/migrate, plugins, API keys, workers, code snapshots
- **Rust/runtime side:** judge worker Docker/executor/runner files
- **Tests:** reviewed existing coverage and searched for missing coverage around the risky paths above

I also ran repo-wide pattern sweeps over `src/`, `docs/`, `scripts/`, and the Rust crates for:

- role/capability mismatches
- direct `req.json()` usage and large file parsing
- synchronous filesystem/process usage
- Docker execution/sandbox changes
- PostgreSQL/SQLite/MySQL documentation drift
- admin/export/import/backup/restore call sites

## Findings

---

## 1) Confirmed — Critical — The current backup/export format is no longer restorable because it nulls required columns

**Files / regions**
- `src/lib/db/export.ts:248-260`
- `src/lib/db/schema.pg.ts:58-64`
- `src/lib/db/schema.pg.ts:139-148`
- `src/lib/db/schema.pg.ts:729-759`
- `src/app/api/v1/admin/backup/route.ts:54-71`
- `src/app/api/v1/admin/restore/route.ts:70-80`

**Why this is a problem**
The export code now redacts several fields by writing `null` into exported rows, including:
- `sessions.sessionToken`
- `apiKeys.keyHash`
- `recruitingInvitations.token`

Those fields are not optional in the schema:
- `sessions.sessionToken` is the primary key
- `apiKeys.keyHash` is `NOT NULL`
- `recruitingInvitations.token` is `NOT NULL` and uniquely indexed

The restore/import path blindly reinserts exported rows. That means a backup taken from any live system with active sessions, API keys, or recruiting invitations will fail on restore with constraint violations.

**Concrete failure scenario**
A super admin downloads a “database backup” from `/api/v1/admin/backup` on a live system. The system has active sessions and at least one API key. During disaster recovery, `/api/v1/admin/restore` parses the JSON and `importDatabase()` attempts to insert rows where `session_token` / `key_hash` / `token` are `null`. PostgreSQL rejects them, the transaction aborts, and the advertised backup is unusable.

**Suggested fix**
Pick one of these models and implement it consistently:
1. **True backup/restore:** do not redact columns required to reconstruct the DB.
2. **Sanitized export:** exclude whole tables/rows or transform them into a different import format, and do **not** present it as a restorable backup.
3. Split the feature into **backup** vs **sanitized export** with different endpoints, docs, and filenames.

Also add an end-to-end backup→restore test that uses non-empty `sessions`, `api_keys`, and `recruiting_invitations` tables.

**Confidence:** High

---

## 2) Confirmed — High — The current working-tree `deploy-docker.sh` computes DB credentials on the local machine instead of the remote host

**Files / regions**
- `deploy-docker.sh:366-371`

**Why this is a problem**
The new `.env.dbcreds` generation command is passed to `remote "..."`, but the `$(grep ...)` substitutions inside the string are expanded by the **local shell** before SSH runs. Those `grep` commands target `${REMOTE_DIR}/.env.production`, which is a **remote** path, so on the local machine they resolve to a non-existent file and substitute the wrong value (usually empty).

That means the script writes a broken remote env file such as:
- `PGPASSWORD=`
- `DATABASE_URL=postgres://judgekit:@db:5432/judgekit`

**Concrete failure scenario**
An operator runs the current working-tree `deploy-docker.sh` from a clean laptop. The migration step creates `/home/<user>/judgekit/.env.dbcreds` remotely with an empty password because the `grep` ran locally. `drizzle-kit push` and `psql` then fail or connect with bad credentials, leaving deployment in a half-updated state.

**Suggested fix**
Extract the password either:
- **fully on the remote side**, using escaped `\$(...)` or a remote shell variable, or
- **explicitly once locally via SSH**, e.g. `PG_PASS=$(remote "grep ...")`, then write the file using that already-fetched value.

Also add a deploy-script regression test that asserts remote-only variables are not interpolated locally.

**Confidence:** High

---

## 3) Confirmed — High — The local/fallback compiler-run path is permission-broken after the new non-root Docker change

**Files / regions**
- `src/lib/compiler/execute.ts:232-259`
- `src/lib/compiler/execute.ts:508-519`
- `Dockerfile:58-61`
- `deploy.sh:117-120`

**Why this is a problem**
The compiler sandbox now runs containers as `65534:65534` (`--user 65534:65534`), but the workspace directory is created with mode `0750`. That denies “other” users execute/traverse permission, so the sandboxed container user cannot even access `/workspace`.

The current legacy deploy path compounds this: `deploy.sh` creates `/compiler-workspaces` with mode `0750` and owner `root:docker`. The `nextjs` app user is in the `docker` group, but group `r-x` still does **not** permit creating subdirectories there.

So there are two independent breakages:
- **fallback/local compiler run:** container user cannot traverse workspace dir
- **legacy deploy path:** app process cannot create workspace dirs under `/compiler-workspaces`

**Concrete failure scenario**
The Rust runner sidecar is unavailable, so `/api/v1/compiler/run` falls back to `executeCompilerRun()`. The app creates a workspace directory with mode `0750`, then starts Docker as user `65534`. Compilation immediately fails with permission errors reading `/workspace/solution.*` or writing compiler artifacts. On hosts provisioned through `deploy.sh`, it can fail even earlier because the app cannot create the temp directory at all.

**Suggested fix**
Make the permissions model consistent across app user, host directory, and sandbox user. For example:
- use a shared writable group and `0770`/`setgid` directories, or
- run the sandbox as the same UID/GID that created the workspace, or
- if isolation requires `65534`, ensure the workspace dir is at least traversable/readable/writable as needed by that UID.

Add an integration test that actually exercises `executeCompilerRun()` with the configured Docker user.

**Confidence:** High

---

## 4) Confirmed — High — Admin UI access is still capability-based while multiple backing routes/server actions remain built-in-role-only

**Files / regions**
- `src/app/(dashboard)/dashboard/admin/plugins/page.tsx:14-15`
- `src/lib/actions/plugins.ts:24-27,75-78`
- `src/app/(dashboard)/dashboard/admin/api-keys/page.tsx:10-11`
- `src/app/api/v1/admin/api-keys/route.ts:18-20,49-53`
- `src/app/(dashboard)/dashboard/admin/settings/page.tsx:176-177`
- `src/app/api/v1/admin/backup/route.ts:21-23`
- `src/lib/actions/system-settings.ts:55-59`
- `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:23-25`
- `src/app/(dashboard)/dashboard/admin/languages/page.tsx:13-14`
- `src/lib/actions/language-configs.ts:18-23`

**Why this is a problem**
The admin pages now admit users based on capabilities (`system.plugins`, `system.settings`, `system.backup`), but several actual mutating paths still hard-code built-in roles (`admin` / `super_admin`).

That creates a broken authorization model where custom roles can open the page and see controls, but every real action fails with 401/403.

**Concrete failure scenario**
A custom role is granted `system.plugins` so an operator can manage the chat widget. They can open `/dashboard/admin/plugins`, but `PluginConfigClient` calls `updatePluginConfig()`, whose server action rejects anyone not literally `admin` or `super_admin`. The same problem exists for API keys, system settings changes, backup/export, and test-connection.

**Suggested fix**
Standardize admin authorization around capabilities everywhere:
- page gates
- route handlers
- server actions
- “secondary” helper endpoints like chat-widget test-connection

Then add route/action tests for a non-built-in custom role that has the relevant capability.

**Confidence:** High

---

## 5) Confirmed — High — API-key creation and plugin secret storage now hard-require `PLUGIN_CONFIG_ENCRYPTION_KEY`, but the repo does not document or template it anywhere

**Files / regions**
- `src/lib/api/api-key-auth.ts:21-29`
- `src/lib/plugins/secrets.ts:8-17`
- `.env.example:6-48`
- `.env.production.example:6-20`

**Why this is a problem**
The runtime now throws if `PLUGIN_CONFIG_ENCRYPTION_KEY` is unset. That is a reasonable security requirement, but neither `.env.example` nor `.env.production.example` defines it, and the deployment docs do not mention it.

This means a fresh install that follows the repository’s documented environment setup can boot successfully and then later fail at runtime the first time an admin:
- creates an API key, or
- saves plugin configuration containing a secret

**Concrete failure scenario**
A new deployment follows `.env.production.example` exactly. The app starts. An admin opens the API keys page and tries to create the first key. `encryptApiKey()` calls `getEncryptionKey()` and throws `PLUGIN_CONFIG_ENCRYPTION_KEY must be set...`, yielding a 500.

**Suggested fix**
- Add `PLUGIN_CONFIG_ENCRYPTION_KEY` to `.env.example`, `.env.production.example`, and the deployment docs.
- Validate it at startup instead of failing deep inside admin flows.
- If backward compatibility matters, support a documented migration path from the old fallback behavior.

**Confidence:** High

---

## 6) Confirmed — Medium/High — `POST /api/v1/code-snapshots` writes snapshots without checking whether the caller may access that problem or assignment

**Files / regions**
- `src/app/api/v1/code-snapshots/route.ts:15-29`
- compare with `src/app/api/v1/submissions/route.ts:176-200`
- no matching route tests found under `tests/unit/` or `tests/e2e/`

**Why this is a problem**
The code-snapshot route accepts `problemId` and optional `assignmentId` from any authenticated caller and writes them straight to the database. Unlike the submissions route, it does not:
- validate assignment context
- check `canAccessProblem(...)`
- verify that the user belongs to the assignment/group

So any logged-in user can store snapshot records against any existing problem ID they know, including private contest problems they do not have access to.

**Concrete failure scenario**
A student discovers a private contest problem ID from leaked markup or logs. They repeatedly POST 256 KB snapshots against that `problemId`. The inserts succeed, polluting anti-cheat / code-snapshot history for a problem they cannot actually open, and consume storage without any real authorization gate.

**Suggested fix**
Mirror the submissions route’s checks before inserting:
- validate assignment context when `assignmentId` is provided
- require `canAccessProblem(problemId, user.id, user.role)`
- return 403/404 rather than relying on raw FK failures

Also add route tests for:
- inaccessible problem
- invalid assignment context
- successful in-context snapshot write

**Confidence:** High

---

## 7) Confirmed — Medium — Editing a problem still deletes all test cases and cascades away historical `submission_results`

**Files / regions**
- `src/lib/problem-management.ts:131-161`
- `src/lib/db/schema.pg.ts:687-692`

**Why this is a problem**
`updateProblemWithTestCases()` still does:
1. `DELETE FROM test_cases WHERE problem_id = ...`
2. recreate all test cases with fresh IDs

But `submission_results.testCaseId` has `ON DELETE CASCADE` to `test_cases.id`. That means any problem edit, even a harmless typo fix, deletes historical per-test-case results for all past submissions tied to the old case IDs.

**Concrete failure scenario**
An instructor fixes punctuation in a problem description and reorders nothing. The update path deletes all test cases and recreates them. PostgreSQL cascades through `submission_results`, so old judging detail pages lose their per-case history.

**Suggested fix**
Use a diff-based update strategy:
- preserve existing test-case IDs when cases are unchanged
- update rows in place where possible
- only insert/delete the specific changed cases

If test-case versioning is intentional, separate “judge against new cases” from “destroy historical result linkage”.

**Confidence:** High

---

## 8) Likely — Medium — The destructive import/restore paths still fully materialize huge uploads in memory

**Files / regions**
- `src/app/api/v1/admin/migrate/import/route.ts:17-48`
- `src/app/api/v1/admin/migrate/import/route.ts:70-104`
- `src/app/api/v1/admin/restore/route.ts:54-73`

**Why this is a problem**
The JSON-body path incrementally reads request chunks, but still concatenates the entire payload into one giant string before `JSON.parse`. The multipart path calls `file.text()`, and restore calls `file.arrayBuffer()` + `buffer.toString(...)`. At the configured 500 MB limit, this can easily require significantly more than 500 MB of live memory once string/Buffer/object duplication is included.

**Concrete failure scenario**
An admin uploads a 400–500 MB export during restore. The Node process simultaneously holds:
- multipart file data
- a UTF-8 string copy
- parsed JSON objects

The process hits memory pressure or OOM-kills, turning the restore endpoint into a denial-of-service against the app container.

**Suggested fix**
Move large imports/restores to a staged pipeline:
- stream to a temp file
- parse incrementally or batch by table
- enforce a substantially lower in-memory limit for direct JSON bodies

At minimum, document the real memory overhead and lower the hard cap.

**Confidence:** Medium

---

## 9) Confirmed — Low/Medium — Backup/export documentation and UI still describe the wrong method and file format

**Files / regions**
- `docs/api.md:1561-1565`
- `src/app/api/v1/admin/migrate/export/route.ts:14-35`
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:43-45`
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:140-145`
- `.env.production.example:12-17`

**Why this is a problem**
The repo currently mixes several incompatible stories:
- docs still say `GET /api/v1/admin/migrate/export`
- code now exposes `POST /api/v1/admin/migrate/export` with password re-confirmation
- the backup UI still downloads a `.sqlite` filename even though the route returns JSON
- the restore file input still invites `.sqlite` / `.db` uploads even though the restore route only accepts JSON exports
- `.env.production.example` still says `sqlite (default), postgresql, or mysql`

**Concrete failure scenario**
An operator builds automation against the docs and issues `GET /api/v1/admin/migrate/export`; it fails because the real route is POST with a password body. Another operator downloads a “`.sqlite`” backup from the UI, assumes it is a SQLite database file, and hands it to the wrong restore workflow.

**Suggested fix**
Update all of the following together:
- `docs/api.md`
- `.env.production.example`
- backup/restore UI labels, `accept=` filter, and download extension
- any admin copy/translations referencing SQLite

**Confidence:** High

---

## Final missed-issues sweep

After the main review, I did an extra pass specifically for commonly missed categories:

- **authorization drift** — searched for raw `role ===`, `isAdmin(...)`, `isInstructor(...)`, and compared those sites to capability-gated pages/actions
- **data-loss paths** — inspected import/export/restore and problem/test-case update flows
- **deploy/runtime regressions** — inspected current uncommitted changes in `deploy-docker.sh`, `deploy.sh`, compose, Dockerfiles, and compiler sandbox code together
- **storage and large-payload routes** — reviewed backup/import/restore/code-snapshots
- **docs/code drift** — checked `README.md`, `docs/api.md`, deployment docs, env examples, and admin UI against current route implementations
- **test gaps** — searched for coverage around the risky routes and noted where none exists

## Coverage confirmation

This review covered every review-relevant category in the repository:

- [x] top-level docs/config/examples
- [x] deploy scripts and runtime configs
- [x] Dockerfiles / compose / nginx templates
- [x] app auth / permissions / capability model
- [x] database schema / import / export / restore interactions
- [x] admin routes and admin server actions
- [x] submissions / snapshots / problem-management flows
- [x] judge worker Rust runtime and compiler execution path
- [x] tests related to the reviewed areas (plus explicit missing-coverage checks)

**Note:** generated artifacts and caches were intentionally excluded from deep review (`node_modules`, `.next`, coverage output, `target/`, etc.).
