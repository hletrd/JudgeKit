# Document Specialist Review - Cycle 2

Date: 2026-06-20

Role: document-specialist for PROMPT 1. This review checks documentation/code mismatches against authoritative repo docs (`AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/**`, `.context/**`), API docs, deployment docs, language docs, and observed implementation. Uncommitted worktree changes were included in the review. No fixes were implemented.

## Inventory

Reviewed documentation surfaces:

- `AGENTS.md`, `CLAUDE.md`, `README.md`, `.context/development/**`, `.context/project/current-state.md`, `.context/plans/**`, existing `.context/reviews/**`
- `docs/api.md`, `docs/authentication.md`, `docs/deployment.md`, `docs/judge-workers.md`, `docs/function-judging.md`, `docs/languages.md`, `docs/data-retention-policy.md`, operator/security runbooks
- Deployment script help and comments in `deploy-docker.sh`, `scripts/deploy-worker.sh`, compose files, ignore files
- Language/runtime docs and sync behavior in `src/lib/judge/languages.ts`, `docs/languages.md`, Dockerfiles, and `scripts/sync-language-configs.ts`
- API route families under `src/app/api/v1/**/route.ts`
- Submission, judging, backup/restore, auth, CSRF, Docker image, function-judging, and visibility implementation touchpoints

The final sweep also searched for drift markers including `CSRF`, `X-Requested-With`, `RUNNER_AUTH_TOKEN`, `PostgreSQL 17`, `postgres:18`, `TypeScript 5.9`, `SCMP_ACT_ALLOW`, `deny-list`, `standalone bearer token`, `python3`, `target/`, and API completeness claims.

## Findings

### DOC-C2-1 - API CSRF docs tell session-cookie clients to use the wrong mechanism

Severity: High

Confidence: High

Status: Confirmed

Evidence: `docs/api.md:78-80` says mutation methods require a valid CSRF token header from `/api/auth/csrf` when using session cookies. The implementation requires the custom header instead: `src/lib/security/csrf.ts:19-45` documents and enforces `X-Requested-With: XMLHttpRequest`, and `src/lib/api/handler.ts:138-148` applies the check to mutation methods except API-key requests. The local agent guide is already correct at `AGENTS.md:263-265`.

Failure scenario: An external integration follows the API reference, fetches `/api/auth/csrf`, sends a token header, and receives `403 {"error":"csrfValidationFailed"}` for every cookie-authenticated `POST`, `PUT`, `PATCH`, or `DELETE`.

Suggested fix: Update `docs/api.md` to distinguish Auth.js login CSRF from API-route CSRF. Document `X-Requested-With: XMLHttpRequest` for session-cookie mutations, and keep the note that API-key requests skip CSRF.

### DOC-C2-2 - Authentication docs say protected API routes do not support bearer tokens, but API keys do

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `docs/authentication.md:8-13` says protected `/api/v1/*` routes use the Auth.js session cookie and that bearer tokens are reserved for `GET`/`POST /api/v1/judge/poll`. In code, `src/lib/api/auth.ts:61-83` first authenticates `Authorization: Bearer jk_...` API keys, then falls back to session cookies and non-standard bearer API key parsing. `docs/api.md:68-76` also documents `jk_` API keys and says they skip CSRF.

Failure scenario: A CLI or LMS integration author reads `docs/authentication.md` and builds a brittle browser-cookie workflow instead of using the supported `jk_` API key path, or treats successful bearer API-key calls as undocumented behavior.

Suggested fix: Update `docs/authentication.md` to distinguish public/user API keys (`Bearer jk_...`) from internal judge worker bearer tokens. Clarify which protected route families accept API keys.

### DOC-C2-3 - Manual problem docs promise out-of-band grading, but submissions are inserted as permanent `pending`

Severity: High

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:169-176` describes `manual` problems as judged outside the automatic pipeline. `docs/api.md:567-579` documents `POST /api/v1/submissions` as submitting code for judging and says pending/global queue limits are enforced. The implementation detects manual problems at `src/app/api/v1/submissions/route.ts:328-331`, but still sets `initialStatus = "pending"` and inserts that status at `src/app/api/v1/submissions/route.ts:405-416`. It then skips queue checks for manual problems at `src/app/api/v1/submissions/route.ts:367-382`, while judge claiming excludes manual problems at `src/lib/judge/claim-query.ts:43-50` and `src/lib/judge/claim-query.ts:138-144`.

Failure scenario: A manual-problem submission is accepted into the database as `pending`, never claimed by a worker, and never reaches a documented manual-review or final status. Students and staff see an in-progress submission that cannot complete through the described pipeline.

Suggested fix: Implement and document a manual grading/status workflow, or insert manual submissions with an explicit manual-review/terminal status and update API docs and UI copy accordingly.

### DOC-C2-4 - `deploy-docker.sh` header claims app-server worker defaults that the script does not implement

Severity: High

Confidence: High

Status: Confirmed

Evidence: The deploy script header says `BUILD_WORKER_IMAGE` defaults false on the app server and `INCLUDE_WORKER` defaults false on the app server at `deploy-docker.sh:25-28`. Actual defaults are `INCLUDE_WORKER="${INCLUDE_WORKER:-true}"` and `BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-auto}"` at `deploy-docker.sh:180-185`, with `auto` resolved to `INCLUDE_WORKER` at `deploy-docker.sh:225-226`. `CLAUDE.md:7-12` says `algo.xylolabs.com` is app-only and must be deployed with `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, and `INCLUDE_WORKER=false`.

Failure scenario: An operator trusts the script header and runs an app-server deploy without explicit worker env vars. The script builds and starts worker-related containers on a host where repo policy says this must not happen.

Suggested fix: Either implement host-aware app-server defaults or change the header to say the default is local-worker-on, with app servers requiring explicit `INCLUDE_WORKER=false BUILD_WORKER_IMAGE=false`.

### DOC-C2-5 - Dedicated worker deployment guide/helper omit required `RUNNER_AUTH_TOKEN`

Severity: High

Confidence: High

Status: Confirmed

Evidence: `docs/deployment.md:151-169` recommends `./scripts/deploy-worker.sh` and shows a direct `docker-compose.worker.yml` command without `RUNNER_AUTH_TOKEN`. Other docs already document the requirement: `README.md:204-212` and `docs/judge-workers.md:56-60`, `docs/judge-workers.md:82-90`. Compose injects `RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN:-}` at `docker-compose.worker.yml:55-58`; the worker rejects a present empty value at `judge-worker-rs/src/config.rs:160-164`; and `scripts/deploy-worker.sh:131-139` writes `JUDGE_BASE_URL`, `JUDGE_AUTH_TOKEN`, `JUDGE_CONCURRENCY`, `JUDGE_WORKER_HOSTNAME`, and `RUST_LOG`, but not `RUNNER_AUTH_TOKEN`.

Failure scenario: A new remote worker deployed from `docs/deployment.md` or the helper starts with `RUNNER_AUTH_TOKEN=""`, then crash-loops with `RUNNER_AUTH_TOKEN must not be empty`.

Suggested fix: Add `RUNNER_AUTH_TOKEN` to the deployment guide and direct compose example. Update `scripts/deploy-worker.sh` to accept, generate, or require a runner token before starting compose.

### DOC-C2-6 - Agent guide says PostgreSQL 17, production compose and deployment docs use PostgreSQL 18

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:291-293` says the database runtime is PostgreSQL 17. Production compose uses `postgres:18-alpine` at `docker-compose.production.yml:17-18`, and `docs/deployment.md:216-224` explicitly documents the PostgreSQL 18 PGDATA behavior.

Failure scenario: An operator plans backups, restore testing, extension compatibility, or upgrade work using PostgreSQL 17 assumptions and discovers during an incident that production is running PostgreSQL 18.

Suggested fix: Update `AGENTS.md` to PostgreSQL 18 or make the compose file match PostgreSQL 17. Name `docker-compose.production.yml` as the source of truth for the image tag.

### DOC-C2-7 - Seccomp docs describe a default-allow deny-list, but the profile is default-deny allow-list

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:298-301` and `AGENTS.md:584` say the seccomp profile uses a deny-list with `SCMP_ACT_ALLOW` as the default action. `.context/project/current-state.md:181` and `.context/development/open-workstreams.md:84` repeat the same default-allow story. The actual profile says default-deny in its comment and sets `"defaultAction": "SCMP_ACT_ERRNO"` at `docker/seccomp-profile.json:1-4`; the syscall list is explicitly allowed at `docker/seccomp-profile.json:265-270`, with a separate `clone3` errno compatibility entry at `docker/seccomp-profile.json:272-275`.

Failure scenario: A future hardening change or incident response starts from the wrong mental model, assumes unlisted syscalls are allowed, and either weakens the profile unnecessarily or misdiagnoses runtime failures.

Suggested fix: Update `AGENTS.md` and `.context/**` to say the active profile is default-deny allow-list. If default-allow was intended, change the profile and tests instead.

### DOC-C2-8 - Restore docs say ZIP backups are integrity-checked before import, but uploaded files are written before DB validation

Severity: High

Confidence: High

Status: Confirmed

Evidence: `docs/api.md:1716-1720` says ZIP backups include a checksum manifest and are integrity-checked before import. `docs/data-retention-policy.md:44-50` says the manifest lets the restore route reject tampered archives before import. In code, the ZIP path calls `restoreFilesFromZip` before `validateExport`, sanitized-export rejection, or pre-restore snapshot at `src/app/api/v1/admin/restore/route.ts:81-142`. `restoreFilesFromZip` parses `database.json` and then writes uploads to disk at `src/lib/db/export-with-files.ts:248-292`.

Failure scenario: A ZIP with valid upload checksums but an invalid, sanitized, or wrong-version `database.json` can overwrite files under `data/uploads` and then fail DB validation. The docs promise a pre-import rejection, but the filesystem has already been mutated and no DB snapshot has been taken yet.

Suggested fix: Split ZIP verification from file writes. Validate manifest, `database.json`, export shape, and sanitized/full-fidelity status first; then take the pre-restore snapshot; then stage and atomically restore uploads with rollback semantics.

### DOC-C2-9 - Function-judging docs overstate compile-error line remapping coverage

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `docs/function-judging.md:21-23` says compile errors are mapped back to student-relative line numbers, and `docs/function-judging.md:68-79` lists `error-mapping.ts` as part of the architecture. The mapper is real and is applied by `sanitizeSubmissionForViewer` at `src/lib/submissions/visibility.ts:155-181`. However, several display paths bypass that sanitizer and pass raw `submissions.compileOutput`: public submission detail at `src/app/(public)/submissions/[id]/page.tsx:172-182`, admin submissions table at `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:185-193` and `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:462-469`, and public submissions list for logged-in users at `src/app/(public)/submissions/page.tsx:214-222` and `src/app/(public)/submissions/page.tsx:483-487`. The worker poll path also stores raw truncated output at `src/app/api/v1/judge/poll/route.ts:141-148`.

Failure scenario: A student or staff member viewing a function-signature compile error through a page that does not use `sanitizeSubmissionForViewer` sees line numbers from `prelude + studentCode + generatedMain`, while docs promise student-relative lines.

Suggested fix: Route all compile-output display/API surfaces through the central sanitizer or move remapping to the write path with enough metadata to keep it correct. If raw admin views are intentional, document that only sanitized submission-detail APIs remap line numbers.

### DOC-C2-10 - TypeScript judge version is inconsistent between docs, DB standard, and Docker/runtime compiler

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:35-40` says the `typescript` judge language is TypeScript 5.9. The runtime constants set `JUDGE_TOOLCHAIN_VERSIONS.typescript = "6.0"` at `src/lib/judge/languages.ts:3-13`, and `docker/Dockerfile.judge-node:1-4` installs `typescript@6.0`. `docs/languages.md:22-24` also says TypeScript 6.0. But the synced language config still advertises `standard: "TS 5.9"` at `src/lib/judge/languages.ts:294-300`, and `scripts/sync-language-configs.ts:60-70` syncs that `standard` value to the database.

Failure scenario: The admin language table and any DB-backed language metadata show TS 5.9 while submissions compile with TypeScript 6.0. Users debug syntax and compiler behavior against the wrong version.

Suggested fix: Set the judge language `standard` and `AGENTS.md` entry to TypeScript 6.0, or pin the Docker/runtime compiler back to 5.9. If `README.md:10` is only the app framework TypeScript badge, label it that way to avoid confusing it with judge toolchains.

### DOC-C2-11 - Root Rust build artifacts are unignored even though this repo now has root Cargo artifacts

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `.gitignore:68-70` ignores only `judge-worker-rs/target/` and `rate-limiter-rs/target/`. `.dockerignore:15-20` ignores subcrate targets, including `code-similarity-rs/target/`, but not root `/target/`. `deploy-docker.sh:647-656` and `deploy-docker.sh:1134-1143` also exclude subcrate targets but not root `target/`. Current `git status --short --untracked-files=all` shows untracked root `Cargo.toml`, `Cargo.lock`, `.npmrc`, `scripts/load-env.ts`, and many `target/...` build outputs.

Failure scenario: A future commit or deploy accidentally includes or transfers thousands of root Cargo build artifacts. The dirty worktree also hides real review changes and makes commit staging error-prone.

Suggested fix: Decide whether the root `Cargo.toml` and `Cargo.lock` are intentional for the `cargo audit` gate and document them if so. Add `/target/` to `.gitignore`, `.dockerignore`, and deploy rsync excludes.

### DOC-C2-12 - Docker image API docs use role labels and an invalid build example that do not match code

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `docs/api.md:1563-1595` documents image list/pull/remove using "Admin or Super Admin" and "Super Admin only" role labels, while the actual handlers authorize `capabilities: ["system.settings"]` at `src/app/api/v1/admin/docker/images/route.ts:48-50`, `src/app/api/v1/admin/docker/images/route.ts:75-78`, and `src/app/api/v1/admin/docker/images/route.ts:129-132`. Capability enforcement is generic at `src/lib/api/handler.ts:129-135`, and the built-in admin role has `system.settings` at `src/lib/capabilities/defaults.ts:82-100`. The build endpoint docs show `{ "language": "python3" }` at `docs/api.md:1599-1606`, but the route looks up exact `language_configs.language` at `src/app/api/v1/admin/docker/images/build/route.ts:15-31`, and the documented/configured ID is `python` at `docs/languages.md:20`.

Failure scenario: Operators infer the wrong authorization boundary for pull/remove, and API clients copying the build example get `404 {"error":"languageNotFound"}` for `python3`.

Suggested fix: Document the required capability (`system.settings`) and current built-in roles that include it. Change the build example to `{ "language": "python" }`.

### DOC-C2-13 - API reference is advertised as complete, but shipped route families are omitted

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `README.md:286-289` describes `docs/api.md` as covering "all REST endpoints, authentication, request/response formats". The `docs/api.md` table of contents does not cover multiple shipped route families. Representative examples include `POST /api/v1/community/threads` at `src/app/api/v1/community/threads/route.ts:12-16`, `POST /api/v1/auth/forgot-password` at `src/app/api/v1/auth/forgot-password/route.ts:11-17`, and `GET /api/v1/admin/submissions/export` at `src/app/api/v1/admin/submissions/export/route.ts:45-50`.

Failure scenario: An operator or integrator assumes functions like community thread creation, password reset, admin submission export, rejudge, code snapshots, or recruiting flows are unavailable because the advertised complete API reference omits them.

Suggested fix: Either label `docs/api.md` as core/stable coverage or generate/fill a route inventory so every shipped endpoint family is documented.

### DOC-C2-14 - `.context/project/current-state.md` is stale enough to mislead future agents

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `.context/project/current-state.md:176-181` says both test and production hosts run `judgekit-app` and `judgekit-judge-worker`, and repeats the default-allow seccomp model. `.context/project/current-state.md:314-316` says the README and docs reflect 86 supported language variants across 69 Docker images and mentions `privileged:true`. Current repo rules say `algo.xylolabs.com` is app-only and must not build judge/worker images at `CLAUDE.md:7-12`; current `AGENTS.md` lists many more language variants and says the static table can drift while `src/lib/judge/languages.ts` and `docs/languages.md` are source of truth; current worker architecture uses docker-proxy rather than direct privileged worker access per `AGENTS.md:303-318` and `AGENTS.md:580-584`.

Failure scenario: Review-plan-fix agents are explicitly told to read `.context/**` before planning deferrals. A future cycle could rely on stale current-state text, deploy workers to an app-only host, reason from the wrong seccomp policy, or plan language work from an 86-language snapshot.

Suggested fix: Archive or update `.context/project/current-state.md` so it no longer presents stale deployment and language state as current. Add a short pointer to the live sources of truth (`CLAUDE.md`, `AGENTS.md`, `docs/languages.md`, `src/lib/judge/languages.ts`, compose files).

## Final Missed-Issues Sweep

- Rechecked the high-risk docs/code seams: auth and CSRF, worker deployment tokens, app-vs-worker deployment defaults, database versioning, seccomp policy, restore/import sequencing, function-judging compile-output mapping, language metadata, Docker image API docs, and route inventory coverage.
- Verified uncommitted changes were part of the review by inspecting current modified files and untracked root build artifacts with `git status --short --untracked-files=all`.
- Did not run tests or modify implementation. Findings are based on static line-by-line inspection of current files.
- No relevant documentation surface was intentionally skipped, though historical `.context/reviews/_archive/**` was treated as provenance rather than current operator documentation.
