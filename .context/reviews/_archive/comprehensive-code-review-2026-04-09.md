# Comprehensive Code Review — JudgeKit (Current Workspace)

**Date:** 2026-04-09  
**Scope:** Full current repository state, including app/API, DB/migrations, Rust services, deployment/configuration, tests, and relevant docs/guidance.  
**Goal:** Fresh review of the current codebase after the recent remediation pass; prior review artifacts were treated as hints only, not as source of truth.

## Review inventory

I rebuilt the inventory from tracked files before reviewing.

### Inventory snapshot
- **Tracked files:** 905
- **Top-level code/docs areas reviewed:**
  - `src/` — 414 tracked files
  - `tests/` — 149 current test files
  - `judge-worker-rs/` — 12 tracked files
  - `code-similarity-rs/` — 6 tracked files
  - `rate-limiter-rs/` — 9 tracked files
  - `docker/` — 104 tracked files
  - `scripts/` — 25 tracked files
  - `docs/` — 12 tracked files
  - `.github/workflows/` — 2 tracked files

### Review-relevant categories examined
- **Auth / security / trust boundaries** — `src/lib/auth/**`, `src/lib/security/**`, `src/lib/api/**`, `src/proxy.ts`, auth/judge/plugin/file/user routes, threat/deploy/auth docs
- **DB / integrity / business logic** — `src/lib/db/**`, `drizzle/**`, `src/lib/assignments/**`, `src/lib/problem-management.ts`, `src/lib/problem-sets/**`, contest/group/submission routes, backup/export/import/restore logic
- **Runtime / infra / deploy** — Rust workers and sidecars, Dockerfiles, compose files, deploy/setup/service scripts, CI, runtime docs
- **UI / cross-file interactions** — admin/settings, groups, files, API keys, bulk user creation, submission/event views
- **Tests and docs** — unit/integration/component coverage, `README.md`, `docs/**`, `AGENTS.md`, existing review notes under `.context/reviews`

### Explicitly excluded from deep review
- vendored/generated artifacts such as `node_modules/**`, `.next/**`, static vendored assets under `static-site/html/**`, and migration snapshot metadata under `drizzle/**/meta/**`

## Verification used during review

I validated the current workspace with:
- `npx tsc --noEmit` ✅
- `npm run lint` ✅ (warnings only)
- `npm run test:unit` ✅
- `npx vitest run` ✅
- `npm run build` ✅ (but with 2 Edge Runtime warnings; see finding 8)
- `cargo test --quiet --manifest-path judge-worker-rs/Cargo.toml` ✅
- `cargo test --quiet --manifest-path code-similarity-rs/Cargo.toml` ✅
- `cargo test --quiet --manifest-path rate-limiter-rs/Cargo.toml` ✅ (**0 tests**; see finding 11)
- `bash -n deploy-docker.sh deploy.sh deploy-test-backends.sh scripts/setup.sh scripts/backup-db.sh scripts/verify-db-backup.sh` ✅

---

# Findings

## 1) Confirmed — High — The repository still claims SQLite/MySQL support, but the runtime is PostgreSQL-only and the SQLite export script is broken

**Files / regions**
- `src/lib/db/config.ts:1-39`
- `src/lib/db/index.ts:27-43`
- `scripts/migrate-sqlite-to-pg.ts:28-49`
- `README.md:139`
- `docs/deployment.md:36-38`
- `AGENTS.md:5`, `AGENTS.md:253`

**Why this is a problem**
The runtime DB layer is now hard-coded to PostgreSQL (`DbDialect = "postgresql"`, `DATABASE_URL` mandatory, `pg` pool only), but the repository still documents SQLite/MySQL support in multiple user-facing and agent-facing docs. The migration script doubles down on this stale assumption by setting `DB_DIALECT=sqlite` / `DATABASE_PATH`, then importing the PostgreSQL-only export stack.

**Concrete failure scenario**
An operator follows the docs and tries to run with `DB_DIALECT=sqlite` or uses `tsx scripts/migrate-sqlite-to-pg.ts export`. The script reaches `src/lib/db/index.ts`, which ignores the SQLite env and throws `DATABASE_URL is required`, so the documented migration path fails immediately.

**Suggested fix**
- Either restore actual multi-dialect support, or remove the SQLite/MySQL claims everywhere.
- If PostgreSQL-only is the intended future, replace the migration script with a truly SQLite-specific exporter that does not import the PostgreSQL runtime path.
- Add a smoke test for the documented export path if it is meant to remain supported.

**Confidence:** High

---

## 2) Confirmed — Medium — `GET /api/v1/groups/[id]` silently truncates enrollments to 50 rows without any pagination contract

**Files / regions**
- `src/app/api/v1/groups/[id]/route.ts:22-53`
- `src/app/api/v1/groups/[id]/route.ts:55-78`

**Why this is a problem**
The route embeds `enrollments` directly in the group payload but hard-limits them to 50 rows. It also returns a separate `memberCount`, yet there is no `limit`, `offset`, `nextCursor`, or explicit “preview only” contract in the response shape.

That makes the API ambiguous and easy to misuse: consumers can reasonably assume `enrollments` is the full membership list when it is actually just the first page with no continuation mechanism.

**Concrete failure scenario**
An admin integration or future page consumes `GET /api/v1/groups/:id` expecting authoritative membership data. Once the group exceeds 50 members, the consumer silently works from a truncated slice and makes incorrect decisions about membership or counts.

**Suggested fix**
- Add explicit pagination parameters and metadata for enrollments, or
- rename the embedded field to something clearly preview-scoped (e.g. `memberPreview`) and expose a proper members endpoint for full lists.

**Confidence:** High

---

## 3) Confirmed — High — File authorization still depends on `LIKE`-matching problem descriptions

**File / region**
- `src/app/api/v1/files/[id]/route.ts:15-52`

**Why this is a problem**
`canAccessFile()` determines whether a file belongs to a problem by searching for a file URL string inside `problems.description` with `LIKE`. This is brittle and expensive:
- false positives if the URL text appears in normal content
- false negatives if the description format changes
- O(n) description scans over the problems table
- authorization depends on presentation text rather than data relationships

**Concrete failure scenario**
A problem description contains a pasted example snippet that happens to include another file’s URL. A user who can access that problem could then be authorized to fetch the unrelated file because the string matches, even though there is no real attachment relationship.

**Suggested fix**
- Store an explicit relational link (`attachmentProblemId`, join table, or metadata field) in `files` / `problem_files`.
- Migrate existing references once, then remove the `LIKE`-based fallback.

**Confidence:** High

---

## 4) Confirmed — High — Existing admin API keys can still be re-disclosed indefinitely

**Files / regions**
- `src/app/api/v1/admin/api-keys/[id]/route.ts:19-42`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:172-199`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:301-316`

**Why this is a problem**
Although API keys are hashed for auth and encrypted at rest, the app still exposes a route that decrypts and returns the raw key on demand, and the admin UI provides a “view key” flow for already-created keys. That defeats the “show once at creation time” safety model and turns any later admin compromise into full key recovery.

**Concrete failure scenario**
Months after key creation, an admin session is compromised. The attacker can open the API keys screen, click the eye icon, call `/api/v1/admin/api-keys/:id`, and recover long-lived raw API credentials that should no longer be retrievable.

**Suggested fix**
- Remove the raw-key re-display endpoint and UI entirely.
- Keep showing only a masked preview and offer rotation/re-issue instead.
- If recovery is required operationally, move it behind an out-of-band super-admin break-glass flow with explicit auditing and MFA.

**Confidence:** High

---

## 5) Confirmed — High — Bulk user creation still returns raw generated passwords and renders/downloads them in the browser

**Files / regions**
- `src/app/api/v1/users/bulk/route.ts:63-116`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:74-87`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:251-259`

**Why this is a problem**
The bulk-create API returns each generated password in the response body, and the client renders those passwords in a table and offers CSV download. Even with `no-store` headers, this still exposes credentials to browser memory, extensions, screenshots, front-end telemetry, proxy logs, and any compromised admin session.

**Concrete failure scenario**
An admin bulk-creates 200 student accounts before an exam. The browser UI holds the entire password list in JS state and renders it to the DOM. A browser extension, session recording tool, or malicious shared workstation user can recover all credentials at once.

**Suggested fix**
- Stop returning generated passwords from the API.
- Use password-reset / invitation flows, or force admins to supply initial passwords explicitly and handle delivery out-of-band.
- If a one-time credential export is unavoidable, make it an explicit server-side file generation path with aggressive audit logging and no browser re-display.

**Confidence:** High

---

## 6) Confirmed — Medium — Custom roles are still inconsistent across pages and APIs outside the remediated Docker-image routes

**Files / regions**
- `src/app/(dashboard)/dashboard/admin/settings/page.tsx:111-115`
- `src/app/api/v1/admin/settings/route.ts:11-23`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:103-108`
- `src/app/api/v1/groups/[id]/route.ts:90-99`

**Why this is a problem**
The repo now has better capability-aware routing in some places, but the model is still inconsistent elsewhere:
- the admin settings page allows anyone with `system.settings`
- the settings API still hard-requires built-in admin/super_admin semantics
- the group detail page uses `canManageGroupResourcesAsync(...)`
- the group PATCH route still only allows owner/admin by raw role/owner check

So users can reach pages that imply they are authorized, then hit 403s on the backing mutation endpoints.

**Concrete failure scenario**
A custom role with `system.settings` can open `/dashboard/admin/settings`, but the API route rejects updates because it still checks `isAdmin(user.role)` / `user.role === "super_admin"`. Likewise, a co-instructor who can manage the group page may still be blocked from `PATCH /api/v1/groups/:id`.

**Suggested fix**
- Standardize on one authorization model per feature area: capability-based, role-based, or group-role-based.
- Add integration tests that pair each admin page with its backing route permissions.

**Confidence:** High

---

## 7) Likely — Medium/High — The “streaming” DB export still does full work even if the client stops reading

**Files / regions**
- `src/lib/db/export.ts:60-133`
- `src/app/api/v1/admin/backup/route.ts:55-70`
- `src/app/api/v1/admin/migrate/export/route.ts:16-31`

**Why this is a problem**
`streamDatabaseExport()` performs the entire export inside the `ReadableStream.start()` callback and does not implement cancellation/backpressure handling. If the client aborts a large download, the server-side export work continues anyway until the full transaction completes.

**Concrete failure scenario**
An admin starts a large backup download and closes the browser tab after a few seconds. The app keeps scanning and serializing the whole database inside a repeatable-read transaction, tying up DB and CPU even though nobody will consume the result.

**Suggested fix**
- Implement `cancel()` handling and plumb request abort signals into the export path.
- Consider a pull-based async generator / Node stream so chunk production follows consumer demand instead of fully front-loading work in `start()`.

**Confidence:** Medium

---

## 8) Likely — Medium — Two shared modules still pull Node-only APIs into Edge-reachable import paths

**Files / regions**
- `src/lib/security/ip.ts:1-45`
- `src/lib/submissions/id.ts:1-17`
- import traces visible in `npm run build`

**Why this is a problem**
The production build still emits warnings that:
- `src/lib/security/ip.ts` imports `net.isIP`
- `src/lib/submissions/id.ts` imports `node:crypto`

Both modules are pulled into Edge-reachable traces (middleware / instrumentation / client-adjacent imports). The build completes, but the warning is a signal that these helpers are not cleanly separated into server-only vs edge/browser-safe surfaces.

**Concrete failure scenario**
A future Next.js / runtime change tightens Edge bundling or an affected route is moved deeper into Edge execution. The code that currently “only warns” starts failing at runtime or blocks deployment.

**Suggested fix**
- Replace `net.isIP` with a small runtime-safe validator or isolate it into a Node-only helper.
- Split `formatSubmissionIdPrefix()` into a browser-safe module and keep `generateSubmissionId()` in a server-only file.

**Confidence:** Medium

---

## 9) Confirmed — Medium — The setup wizard still uses `eval` on raw operator input

**File / region**
- `scripts/setup.sh:40-50`

**Why this is a problem**
Both `prompt_with_default()` and `prompt_secret()` write user input via `eval`. That means shell metacharacters entered at the prompt are interpreted rather than treated as plain data.

**Concrete failure scenario**
An operator pastes a password or username containing command substitution or quoting characters while using the interactive setup. The script evaluates it in the shell context instead of treating it as a literal string.

**Suggested fix**
- Replace `eval` with `printf -v` or nameref-based assignment.
- Treat all operator input as inert data.

**Confidence:** High

---

## 10) Confirmed — Medium — Email identity handling is still case-sensitive and inconsistent across login vs uniqueness checks

**Files / regions**
- `src/lib/auth/config.ts:191-198`
- `src/lib/users/core.ts:26-36`
- `src/app/api/v1/users/route.ts:65-90`
- `src/lib/actions/user-management.ts` (email normalization/write paths)

**Why this is a problem**
Usernames are treated case-insensitively, but emails are not:
- login falls back to `eq(users.email, identifier)`
- `isEmailTaken()` also uses `eq(users.email, email)`
- user creation/edit paths preserve raw casing instead of canonicalizing to lowercase

This means the system can accept `Alice@example.com` and `alice@example.com` as distinct identities and will not consistently match user expectations when logging in.

**Concrete failure scenario**
A user is created as `Alice@example.com`. Later, someone creates `alice@example.com` because the uniqueness check is case-sensitive. Depending on which casing the user types at login, they may hit the wrong account or fail to authenticate altogether.

**Suggested fix**
- Normalize emails to lowercase on write.
- Use case-insensitive lookup and uniqueness enforcement (e.g. lower(email) unique index or PostgreSQL `citext`).
- Add regression tests for mixed-case login and duplicate prevention.

**Confidence:** High

---

## 11) Risk needing manual validation — The app now documents a single-instance SSE / anti-cheat constraint, but there is still no code-level guard against accidental multi-replica deployment

**Files / regions**
- `src/app/api/v1/submissions/[id]/events/route.ts:23-25`, `:75-112`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:13-15`, `:72-90`
- `README.md` deployment section
- `docs/deployment.md`, `docs/judge-workers.md`

**Why this is a risk**
The process-local design is now documented, which is a real improvement, but the runtime itself still has no explicit guardrail that stops someone from scaling app replicas and silently breaking per-user SSE caps / heartbeat dedupe.

**Concrete failure scenario**
An operator scales the Next.js app horizontally because the rest of the deployment docs also discuss horizontal worker scaling. The app starts serving fine, but contest monitoring behavior becomes subtly inconsistent across replicas.

**Suggested fix**
- Either add shared coordination, or add a startup/runtime assertion/health check that clearly flags unsupported multi-app-instance deployment for these features.

**Confidence:** Medium

---

## 12) Risk / test gap — The rate-limiter sidecar still has zero real tests

**Files / regions**
- `rate-limiter-rs/src/main.rs:1-342`
- `.github/workflows/ci.yml:68-75`

**Why this is a problem**
The service is security-sensitive, and CI now runs `cargo test` for it — but the crate still reports **0 tests**. That means CI proves only that the code compiles, not that block windows, retry-after values, eviction, or reset semantics are correct.

**Concrete failure scenario**
A future change regresses the `/check` or `/record-failure` logic. CI remains green because there are no assertions covering the behavior that the app relies on.

**Suggested fix**
- Add focused unit tests for window reset, block escalation, retry-after, reset, and eviction.
- Keep the CI step, but make it exercise real behavior rather than “0 tests passed”.

**Confidence:** High

---

## 13) Confirmed — High — `importDatabase()` can still commit a partially failed restore/import

**Files / regions**
- `src/lib/db/import.ts:146-209`
- `src/app/api/v1/admin/migrate/import/route.ts:86-104`
- `src/app/api/v1/admin/restore/route.ts:77-101`

**Why this is a problem**
The import path wraps work in a transaction, but it catches per-batch insert failures inside the transaction body, records them in `result.errors`, and then continues. Because those errors are swallowed instead of rethrown, the transaction still commits whatever earlier deletes/inserts succeeded.

That means a failed restore/import can leave the target database partially truncated and partially repopulated instead of rolling back cleanly.

**Concrete failure scenario**
An operator restores a JSON export into a database where one batch hits a constraint mismatch halfway through. The route returns `500 restoreFailed`, but earlier table deletes and successful inserts have already committed, leaving the instance in a mixed, partially restored state.

**Suggested fix**
- Abort the whole transaction on the first batch failure.
- Record diagnostic context, then throw to force rollback.
- Reserve “continue after error” behavior for dry-run/validation tools, not the live restore path.

**Confidence:** High

---

## 14) Confirmed — Medium — file upload/download/delete still perform synchronous disk I/O on live request paths

**Files / regions**
- `src/lib/files/storage.ts:14-43`
- `src/app/api/v1/files/route.ts:50-78`
- `src/app/api/v1/files/[id]/route.ts:78-99`, `:136-153`
- `src/app/api/v1/files/bulk-delete/route.ts:28-36`

**Why this is a problem**
The storage layer still uses `writeFileSync`, `readFileSync`, and `unlinkSync` directly from request handlers. The platform allows fairly large uploads, so these synchronous filesystem calls can block the Node.js event loop and delay unrelated requests.

**Concrete failure scenario**
Several users upload/download large files while a contest is in progress. Because the app performs blocking disk I/O in the request thread, unrelated API requests (submission creation, polling, admin actions) stall behind those file operations.

**Suggested fix**
- Move file operations to `fs/promises` or streaming APIs.
- Avoid synchronous delete loops in bulk-delete paths.

**Confidence:** High

---

## 15) Confirmed — Medium — the TypeScript similarity fallback still mis-parses comment markers inside string literals

**Files / regions**
- `src/lib/assignments/code-similarity.ts:13-28`
- `code-similarity-rs/src/similarity.rs:19-69`

**Why this is a problem**
The TypeScript fallback removes `//...` and `/*...*/` with regexes **before** removing string literals. That means strings containing comment markers are truncated as if they were comments. The Rust implementation uses a proper scanner that handles quoted strings correctly, so the fallback and the main implementation can disagree.

For example, with the current code:

```ts
normalizeSource('printf(\"http://example.com\");')
```

normalizes to `printf(\"http:` instead of preserving the quoted string shell correctly.

**Concrete failure scenario**
If the Rust sidecar is unavailable and the app falls back to TypeScript normalization, submissions containing URLs, regex fragments, or comment-like strings can produce different similarity results than the normal Rust-backed path, yielding nondeterministic anti-cheat behavior across environments.

**Suggested fix**
- Replace the regex-based TypeScript normalizer with the same state-machine logic used by the Rust implementation.
- Add regression tests for strings containing `//`, `/*`, escaped quotes, and URLs.

**Confidence:** High

---

## Positive observations

Areas I re-checked that look materially better / sound in the current workspace:
- export/import paths now use deterministic ordering and a repeatable-read snapshot
- group co-instructor / TA handling is materially improved versus prior state
- plugin secret storage now requires a dedicated encryption key
- Docker admin routes now restrict removals to `judge-*` images
- full current unit suite passes (`npm run test:unit`, `npx vitest run`)
- typecheck, build, lint, shell syntax, and Rust test commands all complete successfully

---

## Final missed-issues sweep

I did one final sweep specifically for commonly missed categories:
- **Docs-vs-code drift:** DB dialect support, deployment assumptions, migration scripts, source-of-truth mismatches
- **Authorization seams:** page-vs-route capability checks, file access logic, secret re-disclosure paths
- **Performance/operability:** export streaming, member list truncation, edge-runtime warnings, zero-test sidecars
- **Shared-state hazards:** SSE / anti-cheat coordination, long-running export behavior after client abort
- **Input/command safety:** setup-script `eval`, credential-return flows, identifier normalization

### Coverage confirmation
- [x] Current tracked-code inventory rebuilt before review
- [x] Relevant docs reviewed alongside code
- [x] App/API, DB, worker/infra, and tests all examined
- [x] Prior review artifacts cross-checked but not blindly trusted
- [x] Final report written under `./.context/reviews`
