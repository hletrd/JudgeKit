# Document Specialist Review - Prompt 1

Date: 2026-06-22

Role: document-specialist for a review-plan-fix cycle. This pass checked documentation/code mismatches across the current repo docs and authoritative operational sources. I did not edit implementation code.

## Inventory

Review-relevant documentation examined:

- `AGENTS.md`, `CLAUDE.md`, `README.md`
- `.context/development/**`, `.context/project/current-state.md`, active `.context/plans/**`, existing `.context/reviews/**`
- `docs/api.md`, `docs/authentication.md`, `docs/deployment.md`, `docs/judge-workers.md`, `docs/function-judging.md`, `docs/languages.md`, `docs/data-retention-policy.md`, `docs/privacy-retention.md`, `docs/operator-incident-runbook.md`, `docs/high-stakes-*.md`

Implementation surfaces cross-checked:

- API handlers under `src/app/api/**`, especially auth, CSRF, Docker image management, restore/backup, submissions, language APIs, community/auth/admin routes
- `src/lib/security/csrf.ts`, `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/data-retention*.ts`
- `src/lib/judge/languages.ts`, `src/types/index.ts`, `judge-worker-rs/src/types.rs`, `judge-worker-rs/src/languages.rs`, `docker/Dockerfile.judge-*`
- `deploy-docker.sh`, `deploy.sh`, `deploy-test-backends.sh`, `scripts/setup.sh`, `scripts/sync-language-configs.ts`, `scripts/docker-disk-cleanup.sh`, `scripts/deploy-worker.sh`
- PostgreSQL runtime compose/migration context under `docker-compose*.yml` and `drizzle/pg/**`

Static inventory checks performed:

- Parsed `src/lib/judge/languages.ts`: 125 language configs, 98 unique Docker image names.
- Parsed `docs/languages.md`: 125 language rows, 97 unique Docker image names.
- The config image absent from `docs/languages.md` is `judge-flix`.
- Listed current `src/app/api/v1/**/route.ts` route families and spot-checked omissions against `docs/api.md`.
- Final sweep searched for drift markers: `CSRF token`, `X-Requested-With`, `standalone bearer token`, `CHAT_MESSAGE_RETENTION_DAYS`, `30 days`, `5 years`, `judge-flix`, `judge-jvm`, `TypeScript 5.9`, `TypeScript 6.0`, `PostgreSQL 17`, `postgres:18`, `SCMP_ACT_ALLOW`, `deny-list`, `102`, `full 99 set`, `python3`, `all (~14`, `all (~30`, and `privileged:true`.

## Confirmed Issues

### DOC-P1-1 - API CSRF docs tell session-cookie clients to use the wrong mechanism

Severity: High

Confidence: High

Status: Confirmed

Evidence: `docs/api.md:78-80` says mutation methods require a valid CSRF token header obtained from `/api/auth/csrf`. The implementation requires `X-Requested-With: XMLHttpRequest`: `src/lib/security/csrf.ts:19-45` documents and enforces that exact header, and `src/lib/api/handler.ts:138-148` applies it to mutation methods unless the request uses API-key auth. `AGENTS.md:265` is already correct and explicitly says not to use `x-csrf-token`.

Mismatch: The API reference describes Auth.js login CSRF behavior as if it were the API mutation-route CSRF contract.

Concrete failure scenario: An integration follows `docs/api.md`, fetches `/api/auth/csrf`, sends a token header on `POST /api/v1/problems`, and receives `403 {"error":"csrfValidationFailed"}` because the required `X-Requested-With` header is missing.

Suggested fix: Update `docs/api.md` to distinguish Auth.js credential-login CSRF from API-route CSRF. Document `X-Requested-With: XMLHttpRequest` for session-cookie `POST`/`PUT`/`PATCH`/`DELETE`, and keep the note that `Bearer jk_...` API-key requests skip CSRF.

### DOC-P1-2 - Authentication docs deny bearer-token support for protected API routes, but API keys use bearer auth

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `docs/authentication.md:8-13` says protected `/api/v1/*` routes use the Auth.js session cookie, "not a standalone bearer token", reserving bearer tokens for `/api/v1/judge/poll`. In code, `src/lib/api/auth.ts:61-83` authenticates `Authorization: Bearer jk_...` API keys before trying session cookies, and `docs/api.md:68-76` separately documents those API keys and says they skip CSRF.

Mismatch: The auth architecture doc contradicts the API reference and the current auth implementation.

Concrete failure scenario: A CLI/LMS integration author reads `docs/authentication.md`, builds a cookie-login workflow, and misses the supported `Bearer jk_...` API-key path. Conversely, a successful API-key call looks like undocumented behavior.

Suggested fix: Update `docs/authentication.md` to distinguish public API keys (`Bearer jk_...`) from internal judge-worker bearer tokens. State which protected route families accept API keys and that session cookies remain the browser UI path.

### DOC-P1-3 - Operator privacy-retention doc says AI chat logs default to 30 days, but runtime default is 5 years

Severity: High

Confidence: High

Status: Confirmed

Evidence: `docs/privacy-retention.md:12-18` says the public `/privacy` page and operator doc must stay in sync, and `docs/privacy-retention.md:20-28` lists "AI chat logs" as 30 days. The newer retention policy says 5 years at `docs/data-retention-policy.md:9-24`. Runtime defaults also use 5 years: `src/lib/data-retention.ts:1-34` sets `chatMessages: 365 * 5` with `CHAT_MESSAGE_RETENTION_DAYS` override, and `src/lib/data-retention-maintenance.ts:40-43` prunes chat messages with that value. The public privacy page now derives retention from `DATA_RETENTION_DAYS` at `src/app/(public)/privacy/page.tsx:39-49`, so the stale surface is the operator-facing `docs/privacy-retention.md`.

Mismatch: Two current policy docs give materially different AI-chat retention periods, and the older "current platform baseline" doc disagrees with code.

Concrete failure scenario: An operator or data subject relies on `docs/privacy-retention.md` and expects chat logs to be purged after 30 days, while the default deployment retains them for 1825 days. This is a privacy/compliance disclosure failure even though the public page is code-derived.

Suggested fix: Update or retire `docs/privacy-retention.md`. If 5 years is the intended baseline, change the table and last-updated date. If 30 days is required for a deployment, document that it must set `CHAT_MESSAGE_RETENTION_DAYS=30` and verify the public `/privacy` page reflects that override.

### DOC-P1-4 - Docker image API docs use stale authorization labels and an invalid build example

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `docs/api.md:1566-1617` documents image pull/remove/prune as "Super Admin only" and shows `POST /api/v1/admin/docker/images/build` with `{ "language": "python3" }`. The actual handlers authorize by capability, not direct role label: `src/app/api/v1/admin/docker/images/route.ts:48-50`, `src/app/api/v1/admin/docker/images/route.ts:75-77`, `src/app/api/v1/admin/docker/images/route.ts:129-131`, `src/app/api/v1/admin/docker/images/build/route.ts:19-21`, and `src/app/api/v1/admin/docker/images/prune/route.ts:11-13` all require `system.settings`. The build route looks up exact `language_configs.language` at `src/app/api/v1/admin/docker/images/build/route.ts:23-42`; the configured language ID is `python`, not `python3` (`docs/languages.md:20`).

Mismatch: The docs describe role requirements too narrowly/broadly depending on custom roles, and the build example is not a valid current language ID.

Concrete failure scenario: A client copies the documented build body and receives `404 {"error":"languageNotFound"}`. An operator reviewing custom roles may also think only `super_admin` can pull/remove/prune images, while any role carrying `system.settings` can call those endpoints.

Suggested fix: Document the required capability (`system.settings`) plus the built-in roles that currently carry it. Change the build example to `{ "language": "python" }`.

### DOC-P1-5 - Flix Docker image is documented as `judge-jvm`, but runtime config uses `judge-flix`

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `docs/languages.md:68-74` and `AGENTS.md:108-114` list `flix` as using `judge-jvm`. The TypeScript source of truth uses `judge-flix:latest` at `src/lib/judge/languages.ts:1192-1200`; the Rust fallback config also uses `judge-flix:latest` at `judge-worker-rs/src/languages.rs:1148-1156`; and `docker/Dockerfile.judge-flix:1-11` defines a separate image layered on `judge-jvm`. The static count check found `judge-flix` present in config but absent from `docs/languages.md` image rows.

Mismatch: The language docs point operators to the base JVM image while the judge/admin UI expects a distinct `judge-flix` image.

Concrete failure scenario: An operator builds `judge-jvm` only, sees Flix documented as available, and then the admin language table or worker reports `judge-flix` as missing/not built. A Docker image remove/build flow may also target the wrong image.

Suggested fix: Update `docs/languages.md` and the AGENTS static table to `judge-flix`. If the desired architecture is to reuse `judge-jvm` directly, then change `src/lib/judge/languages.ts`, the Rust fallback, and remove the separate Dockerfile.

### DOC-P1-6 - TypeScript judge version is split between 5.9 and 6.0

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:35-40` says the `typescript` judge language is TypeScript 5.9. `src/lib/judge/languages.ts:3-13` sets `JUDGE_TOOLCHAIN_VERSIONS.typescript = "6.0"`, `docker/Dockerfile.judge-node:1-4` installs `typescript@6.0`, and `docs/languages.md:20-24` says TypeScript 6.0. However the synced language metadata still says `standard: "TS 5.9"` at `src/lib/judge/languages.ts:294-300`, and `scripts/sync-language-configs.ts:60-70` syncs that standard into `language_configs`.

Mismatch: The compiler/runtime is TypeScript 6.0, while the AGENTS table and DB-backed `standard` metadata advertise 5.9.

Concrete failure scenario: A student or admin debugs a compiler behavior difference using the admin language table or AGENTS guidance and assumes TS 5.9, while submissions actually compile with TS 6.0.

Suggested fix: Set the TypeScript language `standard` and AGENTS table to 6.0, or pin the Docker/runtime compiler back to 5.9. If the README badge at `README.md:10` is only the app's package TypeScript version (`package.json` uses 5.9.3), label it as app/framework TypeScript to avoid judge-toolchain confusion.

### DOC-P1-7 - `deploy-docker.sh` header says app-server worker defaults are false, but the script defaults them on

Severity: High

Confidence: High

Status: Confirmed

Evidence: The deploy header says `BUILD_WORKER_IMAGE` defaults false on the app server and `INCLUDE_WORKER` defaults false on the app server at `deploy-docker.sh:15-28`. Actual defaults are `INCLUDE_WORKER="${INCLUDE_WORKER:-true}"` and `BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-auto}"` at `deploy-docker.sh:180-185`; `auto` resolves to `INCLUDE_WORKER` at `deploy-docker.sh:225-226`. `CLAUDE.md:7-12` says `algo.xylolabs.com` is app-only and must be deployed with `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`.

Mismatch: Script documentation implies host-aware app-server defaults that are not implemented.

Concrete failure scenario: An operator deploying to `algo.xylolabs.com` trusts the script header and omits `INCLUDE_WORKER=false BUILD_WORKER_IMAGE=false`. The deploy builds/starts worker pieces on an app-only host, violating the project deployment rules.

Suggested fix: Either implement host-aware defaults keyed by target, or change the header to say local worker is enabled by default and app-only targets require explicit `INCLUDE_WORKER=false BUILD_WORKER_IMAGE=false SKIP_LANGUAGES=true`.

### DOC-P1-8 - AGENTS database version says PostgreSQL 17, production compose uses PostgreSQL 18

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:289-296` says the runtime database is PostgreSQL 17. Production compose uses `postgres:18-alpine` at `docker-compose.production.yml:17-18`, and `docs/deployment.md:226-232` explicitly documents PostgreSQL 18's `PGDATA` behavior.

Mismatch: The agent guide and production deployment source disagree on the active PostgreSQL major version.

Concrete failure scenario: An operator plans backup/restore drills, extension compatibility, or incident recovery using PostgreSQL 17 assumptions, then discovers production is on PostgreSQL 18 during a restore or migration incident.

Suggested fix: Update `AGENTS.md` to PostgreSQL 18 or make the compose file match PostgreSQL 17. Name `docker-compose.production.yml` as the runtime image source of truth.

### DOC-P1-9 - Seccomp docs describe default-allow deny-list, but the active profile is default-deny allow-list

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `AGENTS.md:298-301` says the seccomp profile uses a deny-list with default action `SCMP_ACT_ALLOW`. `.context/project/current-state.md:176-181` and `.context/development/open-workstreams.md:80-84` repeat the default-allow/deny-list story. The actual profile states default-deny and sets `"defaultAction": "SCMP_ACT_ERRNO"` at `docker/seccomp-profile.json:1-4`; the syscall list action is `SCMP_ACT_ALLOW` at `docker/seccomp-profile.json:264-270`, with a `clone3` errno compatibility rule at `docker/seccomp-profile.json:272-275`.

Mismatch: Operator and agent docs describe the opposite security model from the profile Docker actually loads.

Concrete failure scenario: A future sandbox change or incident response assumes unlisted syscalls are allowed, misdiagnoses runtime failures, or weakens the profile based on the wrong model.

Suggested fix: Update `AGENTS.md` and active `.context/**` notes to say the profile is default-deny with an allow-list. If default-allow was intended, change `docker/seccomp-profile.json` and tests instead.

### DOC-P1-10 - Docker image counts, examples, and preset semantics are inconsistent across current docs and scripts

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `README.md:75-132` says there are 102 language-specific Docker images, gives removed/stale examples (`cpp17`, `clang17`, `clang20`) at `README.md:77`, and still lists `judge-malbolge` and `judge-j` at `README.md:86` and `README.md:94`. `docs/languages.md:190-200` still says 102/102 images and 113-language E2E summaries despite the top of the same file saying 125 variants at `docs/languages.md:1-3`; `docs/languages.md:240-247` calls `LANGUAGE_FILTER=everything` the "full 99 set". `AGENTS.md:318-320` also says all 102 Docker images build/run on arm64, while `AGENTS.md:375` says `all` is about 14 GB. Current deploy help says `all` is everything except 18 ARM-prohibitive images and about 30 GB at `deploy-docker.sh:140-176` and `deploy-docker.sh:208-216`. `scripts/setup.sh:53-76` uses a different `all` list that includes the ARM-prohibitive set, including `roc` and `flix`, with no separate `everything` escape hatch.

Mismatch: "All", image counts, and example image names mean different things depending on which current doc or script the operator reads.

Concrete failure scenario: An operator sizes a worker host from README/AGENTS, picks `all` in setup or deploy expecting the same image set, and either under-provisions disk/time or unexpectedly attempts ARM-prohibitive/disabled image builds. Another operator may try to build or preserve `judge-j`/`judge-malbolge` because the README still lists them as part of the fleet.

Suggested fix: Generate the Docker-image inventory from `DEFAULT_JUDGE_LANGUAGES` plus explicit disabled/orphan metadata. Align `scripts/setup.sh` presets with `deploy-docker.sh` (`all` vs `everything`) or document the intentional difference. Remove or archive stale README rows for images no longer present in current language config.

### DOC-P1-11 - API reference is advertised as complete, but shipped route families are omitted

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `README.md:288-290` describes `docs/api.md` as "all REST endpoints, authentication, request/response formats". The route tree includes endpoint families that are not covered by `docs/api.md`; representative examples are `POST /api/v1/community/threads` at `src/app/api/v1/community/threads/route.ts:12-16`, `POST /api/v1/auth/forgot-password` at `src/app/api/v1/auth/forgot-password/route.ts:11-17`, and `GET /api/v1/admin/submissions/export` at `src/app/api/v1/admin/submissions/export/route.ts:45-58`. A grep of `docs/api.md` found no entries for `community`, `forgot-password`, or `admin/submissions/export`; it only matched contest access-code and a submission rejudge endpoint among the sampled omitted families.

Mismatch: The README promises complete REST coverage, while the API reference is a partial/core reference.

Concrete failure scenario: Integrators or operators assume community threads, password reset, admin submission CSV export, code snapshots, recruiting validation, or other route families are unavailable or unsupported because the advertised complete API reference omits them.

Suggested fix: Either relabel `docs/api.md` as a core/stable API reference, or generate a route inventory and fill endpoint sections for all shipped `src/app/api/v1/**/route.ts` families.

### DOC-P1-12 - `.context/project/current-state.md` is stale enough to mislead future agents

Severity: Medium

Confidence: High

Status: Confirmed

Evidence: `.context/project/current-state.md:176-181` says both test and production hosts run `judgekit-app` and `judgekit-judge-worker`, and repeats the default-allow seccomp model. `.context/project/current-state.md:312-316` says README/docs reflect 86 language variants across 69 Docker images and mentions `privileged:true`. Current project rules say `algo.xylolabs.com` is app-only at `CLAUDE.md:7-12`; current Docker architecture says the worker uses `docker-proxy` rather than direct privileged access at `AGENTS.md:303-318`; current language docs/config have 125 variants (`AGENTS.md:18-20`, `docs/languages.md:1-3`, `src/lib/judge/languages.ts:1510`).

Mismatch: A file named `current-state.md` in `.context/project/` presents historical deployment/language/security details as current.

Concrete failure scenario: A future review-plan-fix agent reads `.context/**` as requested context, assumes worker/app topology and seccomp posture from this stale file, and produces an unsafe deploy plan or stale language remediation.

Suggested fix: Archive the file or replace it with a short current pointer document listing the live sources of truth: `CLAUDE.md`, `AGENTS.md`, `docs/languages.md`, `src/lib/judge/languages.ts`, compose files, and `deploy-docker.sh`.

## Likely Issues

### LIKELY-P1-1 - Historical language E2E summaries read like current status

Severity: Low

Confidence: Medium

Status: Likely issue

Evidence: `docs/languages.md:190-200` has dated 2026-03-29 E2E summaries for 113 languages directly under the current "Supported Languages (125 variants)" page. `docs/languages.md:133` says output-only languages were excluded from historical totals, which helps, but the section is still placed in a current status document without a freshness boundary.

Mismatch: Historical validation data is mixed into the current support matrix.

Concrete failure scenario: An operator cites "113 of 113 pass" as current validation evidence for a 125-variant deployment and misses newer languages/output-only modes that were not part of that run.

Suggested fix: Move dated E2E results to an archive/changelog section, or regenerate the matrix from current all-language E2E runs and label exclusions explicitly.

### LIKELY-P1-2 - Deploy cleanup comments use dangerous shorthand despite safe code

Severity: Low

Confidence: Medium

Status: Likely issue

Evidence: `deploy-docker.sh:31-36` and `deploy-docker.sh:1208-1214` describe post-deploy cleanup as removing "unused images" and "orphan volumes". The actual cleanup helper is safer and more specific: `deploy-docker.sh:365-401` warns against `docker image prune -af`, uses `docker image prune -f`, and gates `docker volume prune -f` on `judgekit-db` running. `docs/deployment.md:264-275` and `AGENTS.md:432-435` correctly emphasize dangling-only image pruning and volume-prune constraints.

Mismatch: Comments near the operational entry points use shorthand that can be read as `docker image prune -a` or broad volume cleanup, while the detailed docs and code intentionally avoid that.

Concrete failure scenario: During an incident, an operator copies the shorthand into a manual cleanup command and uses `docker image prune -af`, wiping tagged judge images on worker hosts.

Suggested fix: Change script comments/header to "stopped containers, dangling images, BuildKit cache, and DB-gated volume prune" and remove "unused images" wording.

## Manual-Validation Risks

### RISK-P1-1 - Production retention overrides need verification

Severity: High if deployed disclosure differs from configured environment

Confidence: Manual validation required

Evidence: Code defaults to 5-year chat retention (`src/lib/data-retention.ts:1-34`) and public `/privacy` derives values from code (`src/app/(public)/privacy/page.tsx:39-49`), but production may set `CHAT_MESSAGE_RETENTION_DAYS`.

Mismatch to validate: The deployed privacy disclosure, runtime env, and operator docs may not describe the same retention window.

Concrete failure scenario: A production deployment sets a non-default chat retention window but the public privacy page or operator runbook still describes the default, creating a disclosure gap.

Manual validation: Check deployed `.env.production`/runtime env for `CHAT_MESSAGE_RETENTION_DAYS`, then load `/privacy` in that deployment and confirm it matches the legal/operator retention policy.

Suggested fix: If mismatch is found, update env, docs, or policy together; do not leave a doc-only override.

### RISK-P1-2 - Docker image inventory should be regenerated from real build hosts

Severity: Medium

Confidence: Manual validation required

Evidence: Local static config says 98 unique images; docs mention 97/99/102 depending section. Actual remote hosts may have additional orphan/stale images from older deployments.

Mismatch to validate: The repository source-of-truth image set may not match what production hosts actually retain.

Concrete failure scenario: Cleanup or build planning removes an image that is still required by a DB language override, or preserves stale images because docs overstate the current fleet.

Manual validation: On each worker/app Docker host, compare `docker images 'judge-*'` with the generated set from `DEFAULT_JUDGE_LANGUAGES`, `deploy-docker.sh` presets, and intentionally preserved disabled Dockerfiles.

Suggested fix: If mismatch is found, add a generated inventory doc or script output committed with a timestamp, and separate "current config images" from "historical/orphan Dockerfiles kept for reference".

### RISK-P1-3 - API docs completeness should be checked by generation, not spot inspection

Severity: Medium

Confidence: Manual validation required

Evidence: Spot checks found omitted shipped route families, but this review did not build a full route-to-doc coverage map.

Mismatch to validate: The full `src/app/api/v1/**/route.ts` surface may be larger than the advertised complete API reference.

Concrete failure scenario: A route family with production behavior or security requirements remains undocumented because only sampled omissions were reviewed.

Manual validation: Generate the `src/app/api/v1/**/route.ts` route list, normalize dynamic segments, and compare it against headings in `docs/api.md`. Decide whether undocumented internal/test endpoints should be excluded by policy.

Suggested fix: If mismatch is found, add a docs coverage check or a generated appendix so the README's "all REST endpoints" claim stays true.

## Verified Non-Findings From Prior Reviews

- Manual submissions no longer insert as permanent `pending`: `src/app/api/v1/submissions/route.ts:328-331` now sets manual problem submissions to `submitted`, and judge claim still excludes manual problems at `src/lib/judge/claim-query.ts:44-50` and `src/lib/judge/claim-query.ts:139-144`.
- Dedicated worker docs/helper now include `RUNNER_AUTH_TOKEN`: `docs/deployment.md:169-174`, `README.md:200-212`, `docs/judge-workers.md:54-60`, `scripts/deploy-worker.sh:139-142`, and `docker-compose.worker.yml:58-60` are aligned.
- Function-judging compile-output remapping now routes through `mapFunctionCompileOutputForDisplay` in the public detail page (`src/app/(public)/submissions/[id]/page.tsx:137-142`), admin submissions list (`src/app/(dashboard)/dashboard/admin/submissions/page.tsx:230-236`), and public submissions list (`src/app/(public)/submissions/page.tsx:276-282`).
- ZIP restore staging/integrity appears aligned with current docs: `src/app/api/v1/admin/restore/route.ts` uses `parseBackupZip` before DB validation and later calls `restoreParsedBackupFiles`; `src/lib/db/export-with-files.ts` validates the manifest/checksums before staging upload contents.

## Final Missed-Issues Sweep

- Rechecked high-risk doc/code seams: auth/API-key/CSRF, privacy retention, Docker image admin APIs, language source of truth, deploy presets, app-vs-worker deployment defaults, database version, seccomp model, API route coverage, backup/restore claims, function judging, and manual problem judging.
- Searched for stale terms and footguns across `AGENTS.md`, `README.md`, `docs/**`, `.context/**`, `src/**`, `scripts/**`, and `deploy-docker.sh`.
- Did not run tests because this was a documentation/code mismatch review. No implementation source files were edited.
- Existing dirty review files from other agents were left untouched; this pass only wrote `.context/reviews/document-specialist.md`.
