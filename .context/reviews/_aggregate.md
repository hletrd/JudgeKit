# Cycle 2 Aggregate Review

Date: 2026-06-20

Prompt 1 fan-out status:

- Completed reviewers: code-reviewer, perf-reviewer, security-reviewer, critic, verifier, test-engineer, tracer, architect, debugger, document-specialist, designer.
- Registered first-class agent roles exposed by this environment were only `default`, `explorer`, and `worker`; the named reviewer disciplines were executed as named prompts through the available default subagent role.
- Repo-local `.claude/agents/*` reviewer definitions were not present. The UI surface was detected from the Next.js app, component tests, `public/`, `static-site/`, and TSX/CSS files, so the designer reviewer was included.
- Initial fan-out hit the environment's five-agent concurrency limit. Blocked reviewer personas were retried after completed agents were closed. Agent failures after retry: none.

## Merged Findings

### AGG2-1 - High - Manual submissions are stored as active `pending` rows that no worker can claim

Sources: code-reviewer CR2-1, critic #1, verifier V1, tracer T1, architect ARCH2-1, debugger DBG2-1, document-specialist DOC-C2-3, test-engineer TST-C2-3.

Locations: `src/app/api/v1/submissions/route.ts:328-416`, `src/lib/judge/claim-query.ts:43-50`, `src/lib/judge/claim-query.ts:138-144`, `AGENTS.md:169-176`, `docs/api.md:567-579`.

Manual problems are documented as out-of-band/manual grading, but the submission API inserts them with the auto-judge in-progress status `pending` while the claim query excludes manual problems. A student can submit a manual problem and the row remains in flight forever, distorting pending throttles, submission lists, progress displays, and any manual grading workflow. Fix by giving manual submissions a canonical terminal/manual status or routing them into a real manual-grading state machine, then add route and E2E coverage.

Severity/confidence: High / High.

### AGG2-2 - High - Submission status vocabulary is split across worker, app, UI, filters, exports, and tests

Sources: code-reviewer CR2-7, critic #2, verifier V2/V3, architect ARCH2-2, test-engineer TST-C2-2/TST-C2-7, document-specialist DOC-C2-9 adjacent.

Locations: `judge-worker-rs/src/types.rs:41-50`, `src/app/api/v1/judge/poll/route.ts:45-53`, `src/lib/judge/verdict.ts:1-28`, `src/lib/judge/status-labels.ts`, `src/components/submission-status-badge.tsx`, `src/app/(public)/submissions/page.tsx`, `tests/e2e/all-languages-judge.spec.ts`, `messages/en.json`, `messages/ko.json`.

The recent status migration is not fully wired. Some paths still wait for or filter obsolete terminal statuses, translations and labels do not cover every canonical worker value, and the poll route can reject legacy worker reports during app/worker version skew. Users can see stale pending rows or unlocalized/raw statuses, and deploy order can wedge reports. Fix by centralizing a canonical status catalog with legacy normalization at API boundaries, then update filters, exports, badges, tests, and translations from it.

Severity/confidence: High / High.

### AGG2-3 - High - ZIP restore writes uploaded files before DB validation/import succeeds

Sources: code-reviewer CR2-2, security SEC2-6/SEC2-7, tracer T2, architect ARCH2-3, debugger DBG2-2, document-specialist DOC-C2-8.

Locations: `src/app/api/v1/admin/restore/route.ts:81-142`, `src/lib/db/export-with-files.ts:248-292`, `src/lib/db/import.ts:95-204`, `docs/api.md:1716-1720`, `docs/data-retention-policy.md:44-50`.

ZIP restore extracts and overwrites upload files before export validation, sanitized-export rejection, pre-restore snapshotting, and DB import success. A malformed archive can fail validation while leaving the database on the old state and uploaded files on the new state. Fix by validating the DB export and ZIP manifest first, enforcing decompressed-size/entry limits, staging files outside live upload directories, and atomically swapping staged files only after DB import commits.

Severity/confidence: High / High.

### AGG2-4 - High - Pre-restore snapshots are documented as full-fidelity but use redacted portable exports

Sources: security SEC2-5, architect ARCH2-4.

Locations: `src/lib/db/pre-restore-snapshot.ts:30-90`, `src/app/api/v1/admin/restore/route.ts:118-142`, `docs/api.md:1716-1720`.

The restore route creates a safety snapshot through the same sanitized/redacted export path used for portable backups, while docs and operator expectations describe a full-fidelity recovery point. A failed destructive restore can leave operators with a snapshot that cannot restore secrets or private integration configuration. Fix by adding an explicit local-only full-fidelity snapshot path or by documenting and surfacing that snapshots are redacted and incomplete.

Severity/confidence: High / High.

### AGG2-5 - High - Judge output-limit handling still builds oversized reports before the app can truncate diagnostics

Sources: code-reviewer CR2-3, perf PERF2-01/PERF2-11, tracer T3, verifier V4, critic #7.

Locations: `judge-worker-rs/src/docker.rs:375-414`, `judge-worker-rs/src/executor.rs:567-631`, `src/lib/validators/api.ts:23-40`, `src/app/api/v1/judge/poll/route.ts:141-181`, `src/lib/judge/verdict.ts:70-86`.

The worker can classify an output flood as `output_limit_exceeded` yet still include tens of MiB of captured stdout/stderr in the JSON report. Dedicated workers can hit nginx `413`, the app can spend memory parsing the report, and exact-output comparison allocates normalized full buffers before truncation. Fix by truncating diagnostic payloads in the worker before serialization, counting bytes rather than UTF-16 code units on fallback paths, and preserving only bounded excerpts plus overflow metadata.

Severity/confidence: High / High.

### AGG2-6 - High - Production auth host allowlist can be bypassed by default `AUTH_TRUST_HOST=true`

Sources: security SEC2-1.

Locations: `src/lib/auth/trusted-host.ts:23-51`, `src/app/api/auth/[...nextauth]/route.ts:5-22`, `src/lib/security/env.ts:95-106`, `src/lib/security/env.ts:186-192`.

The app has an explicit trusted-host guard, but the default Auth.js trust-host setting can bypass the stricter production allowlist. A misconfigured proxy or hostile Host header can influence auth URL handling and token links. Fix by decoupling Auth.js proxy trust from the app's canonical host allowlist and by enforcing canonical `AUTH_URL` for token-bearing links.

Severity/confidence: High / High.

### AGG2-7 - High - Dedicated workers only warn on insecure remote HTTP control-plane URLs

Sources: security SEC2-2.

Locations: `judge-worker-rs/src/config.rs:113-126`, `judge-worker-rs/src/api.rs:69-241`, `docker-compose.worker.yml:10-12`.

Dedicated workers send bearer tokens, source code, hidden tests, and result reports over the configured judge base URL, but non-local HTTP URLs only produce a warning. A remote worker pointed at `http://` leaks control-plane traffic. Fix by failing closed in production for non-local plain HTTP unless an explicit development override is set.

Severity/confidence: High / High.

### AGG2-8 - High - Runner/admin endpoints can share the judge submission token

Sources: security SEC2-3.

Locations: `src/lib/compiler/execute.ts`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts`, `docker-compose.production.yml`, `judge-worker-rs/src/config.rs:160-180`.

Runner endpoints and judge submission endpoints can fall back to the same secret. If one path leaks or is scoped too broadly, it can authorize unrelated worker operations. Fix by making `RUNNER_AUTH_TOKEN` mandatory for runner traffic in production and rejecting startup/configuration that reuses the judge submission token.

Severity/confidence: High / High.

### AGG2-9 - High - Sanitized exports include plaintext plugin provider secrets

Sources: security SEC2-4.

Locations: `src/lib/db/export.ts`, plugin/provider settings tables referenced by the export pipeline.

The sanitized export path redacts known secret fields, but provider plugin secrets are still emitted in plaintext. A support bundle or migration export can leak production credentials. Fix by extending redaction to every plugin/provider secret column and adding an export regression test that searches for seeded secret values.

Severity/confidence: High / High.

### AGG2-10 - High - Production-capable API keys are hardcoded in repository scripts/artifacts

Sources: critic #5, tracer T4.

Locations: repository scripts and ignored workspace artifacts referenced by the reviewers; exact candidates must be re-scanned with `rg "jk_"` and secret-scanning before commit.

Production-capable bearer API keys appear in checked or easily staged scripts/artifacts. If an ignored archive or accidental forced add leaks, attackers can mutate production content or generate submissions. Fix by removing secrets from scripts, rotating exposed keys, replacing them with environment variables, and adding a local/CI secret-scan gate.

Severity/confidence: High / High.

### AGG2-11 - High - PostgreSQL migration replay is not authoritative because SQL files and journal metadata diverge

Sources: architect ARCH2-9.

Locations: `drizzle/pg/meta/_journal.json`, `drizzle/pg/*.sql`, `scripts/check-migration-drift.sh:13-53`, `src/lib/db/migrate.ts:5-7`.

The committed SQL migration files and Drizzle journal metadata are not in one-to-one sync. A fresh or migrated DB can skip schema/config changes depending on whether `push` or `migrate` is used. Fix the journal/file history or move ad hoc SQL out of the runtime migration path, and add a bijection check that fails CI when journal entries and SQL files diverge.

Severity/confidence: High / High.

### AGG2-12 - High - CI/E2E database gates can resolve Docker-internal hosts from the host process

Sources: test-engineer TST-C2-1 and cycle carryover.

Locations: `drizzle.config.ts`, `playwright.config.ts`, CI/test environment configuration.

Host-run gates such as `db:push`, `seed`, `languages:sync`, and Playwright can inherit a Docker-internal database hostname and fail before tests start. This was a known carryover blocker from cycle 1. Fix by loading host-safe env overrides for host-run gates or by making the Playwright/config bootstrap translate Docker service hosts to host-accessible endpoints.

Severity/confidence: High / High.

### AGG2-13 - Medium - File-link authorization clears state before validating the link owner

Sources: code-reviewer CR2-4.

Locations: `src/lib/problem-management.ts`, file association logic for problem Markdown links.

The problem save path clears the association state it needs before validating file-link ownership/capability. A stale or leaked file link can be rebound or incorrectly rejected after the state is lost. Fix by validating all referenced file IDs before mutating associations, then applying changes in one transaction.

Severity/confidence: Medium / High.

### AGG2-14 - Medium - Local compiler fallback creates workspaces the sandbox user cannot traverse

Sources: code-reviewer CR2-5, security SEC2-8 adjacent.

Locations: `src/lib/compiler/execute.ts`, `judge-worker-rs/src/executor.rs`.

The local compiler fallback can create workspace directories with host-user-only traversal permissions, then launch sandbox users that cannot read or execute inside them. On restrictive umasks this causes spurious compiler/runtime failures. Fix by explicitly setting traverse/read permissions for the workspace while avoiding world-writable production fallbacks.

Severity/confidence: Medium / High.

### AGG2-15 - Medium - TypeScript and Rust runner command validators have incompatible contracts

Sources: code-reviewer CR2-6, architect ARCH2-7, security SEC2-10.

Locations: `src/lib/compiler/execute.ts`, `src/lib/judge/languages.ts`, `judge-worker-rs/src/runner.rs`, `scripts/sync-language-configs.ts`.

Language commands pass different validators at write time and execution time. A command accepted by the TypeScript/admin path can be rejected by the Rust runner, or vice versa, and Docker image trust validation is prefix-spoofable in one boundary. Fix by centralizing/golden-testing command and image validation semantics across TypeScript and Rust.

Severity/confidence: Medium / High.

### AGG2-16 - Medium - Queue claim and queue-position paths lack composite indexes and do sequential reads

Sources: perf PERF2-02/PERF2-12.

Locations: `src/lib/judge/claim-query.ts:38-147`, `src/app/api/v1/submissions/[id]/queue-status/route.ts:40-49`, `src/lib/db/schema.pg.ts`.

Queue claim and position queries filter by status/assignment/problem/user ordering without matching composite indexes, and the claim route performs several sequential DB reads after reserving a worker slot. Under load, claim latency increases and worker capacity is held while the app performs avoidable waits. Fix by adding composite indexes and parallelizing independent post-claim reads.

Severity/confidence: Medium / High.

### AGG2-17 - Medium - Submission creation scans all historical submissions inside the transaction

Sources: perf PERF2-03.

Locations: `src/app/api/v1/submissions/route.ts`.

The submission route fetches broad historical submission data for the user during submission creation. Large student histories make the transaction slower and increase contention. Fix by replacing broad scans with targeted aggregate queries and indexes.

Severity/confidence: Medium / High.

### AGG2-18 - Medium - Live polling and progress filters over-fetch large payloads

Sources: perf PERF2-04/PERF2-05.

Locations: `src/components/submissions/_components/live-submission-status.tsx`, public problem/practice progress pages.

Live fallback polling repeatedly fetches full submission payloads, and problem/progress filters load whole catalogs into memory. Large classes or public catalogs can cause slow UI and excess DB/API load. Fix with lightweight polling endpoints, pagination, and server-side filtered progress summaries.

Severity/confidence: Medium / High.

### AGG2-19 - Medium - Browser diffing and large authoring forms can block the main thread

Sources: perf PERF2-06/PERF2-13.

Locations: `src/lib/diff.ts`, `src/components/submissions/output-diff-view.tsx`, problem editor dirty-check logic.

Wrong-answer diffing remains quadratic on the browser main thread, and problem editor dirty checks stringify large test case arrays on every render. Large output mismatches or imported tests can freeze the UI. Fix with size-gated diffing/workerized comparison and incremental dirty tracking.

Severity/confidence: Medium / High.

### AGG2-20 - Medium - Assignment/contest boards and stats recompute full matrices/aggregates

Sources: perf PERF2-07/PERF2-08.

Locations: assignment status board components/APIs, `src/app/api/v1/contests/[assignmentId]/stats/route.ts`.

Status boards render full student-by-problem matrices and contest quick stats recompute uncached aggregates on polling intervals. Large contests can become sluggish for instructors and load the DB. Fix with pagination/virtualization and cached/materialized aggregate summaries.

Severity/confidence: Medium / High.

### AGG2-21 - Medium - Remote Docker image build API is synchronous and mismatched with production capabilities

Sources: perf PERF2-09, architect ARCH2-6, document-specialist DOC-C2-12, designer DSG2-6.

Locations: `src/app/api/v1/admin/docker/images/build/route.ts`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`, `src/lib/docker/client.ts`, `docker-compose.production.yml`.

The admin language UI exposes build/remove actions even when production disables app-side Docker operations, and remote builds can exceed the app timeout while the worker continues. Mobile row actions can also be off-canvas. Fix by adding capability probing, async build jobs/status, accurate docs, and responsive action layout.

Severity/confidence: Medium / High.

### AGG2-22 - Medium - Sitemap generation accumulates all rows and locale-expands them in memory

Sources: perf PERF2-10.

Locations: sitemap generation route/module.

Sitemap generation loads every eligible row and expands locales in memory. Large public catalogs can spike memory during crawl. Fix with streaming/chunked sitemap indexes.

Severity/confidence: Medium / High.

### AGG2-23 - Medium - Claim schema parse failures can leak claimed rows and active worker slots

Sources: critic #3, architect ARCH2-8, debugger DBG2-4, test-engineer TST-C2-4.

Locations: `src/app/api/v1/judge/claim/route.ts:173-392`, `src/lib/judge/claim-query.ts:30-127`.

The SQL claim mutation can succeed before the returned row is Zod-parsed and response assembly completes. A parse error or payload assembly error returns an error while leaving the submission claimed and the worker active-task count incremented until stale cleanup. Fix by keeping claim mutation and response validation in one rollback boundary or by releasing the claim/token-fenced worker slot on every post-claim failure.

Severity/confidence: Medium / Medium.

### AGG2-24 - Medium - Root Cargo workspace and AppleDouble artifacts are unignored and can enter deploy/review paths

Sources: critic #4, tracer T7, architect ARCH2-10, debugger DBG2-5, document-specialist DOC-C2-11, test-engineer TST-C2-8.

Locations: `.gitignore:68-70`, `.dockerignore:15-20`, `deploy-docker.sh:647-656`, `deploy-docker.sh:1134-1143`, root `Cargo.toml`, root `Cargo.lock`.

Root-level Cargo commands now create `/target`, but ignore/deploy exclusions cover only subcrate targets. AppleDouble metadata can also appear. Broad searches, deploy rsync, and accidental `git add .` can traverse or stage generated artifacts. Fix by ignoring/excluding root `target/` and `._*`, and by making root workspace/profile choices match Docker build boundaries.

Severity/confidence: Medium / High.

### AGG2-25 - Medium - Interactive compiler/playground compile limits diverge from judged submissions

Sources: critic #6.

Locations: `src/lib/compiler/execute.ts`, `src/app/api/v1/compiler/run/route.ts`, `src/app/api/v1/playground/run/route.ts`, `judge-worker-rs/src/runner.rs`.

Interactive compiler/playground compilation still uses a 256 MB compile cap while judged submissions use 2 GB. Students can see code compile in one path and fail in another, or vice versa. Fix by aligning limits or surfacing the distinction as an explicit product choice with tests.

Severity/confidence: Medium / High.

### AGG2-26 - Medium - Function problems can be saved with no supported enabled language

Sources: tracer T5.

Locations: `src/lib/judge/function-judging/types.ts`, `src/components/problem/problem-submission-form.tsx`, problem create/update/import validators.

Function problem validation does not ensure `enabledLanguages` intersects the supported function-judging language registry. A problem can be saved with only unsupported languages, then the student UI falls back to the full language list and every submission fails. Fix by enforcing at least one supported enabled language and rendering a clear unavailable state if existing data violates it.

Severity/confidence: Medium / High.

### AGG2-27 - Medium - Mandatory problem description structure is documented but not enforced

Sources: tracer T6, code-reviewer CR2-8, critic #8.

Locations: `.context/development/problem-descriptions.md`, `src/lib/validators/problem-management.ts`, `scripts/seed.ts`, problem create/update/import routes.

Repo rules require structured Markdown problem descriptions, but create/update/import/seed paths still accept empty, HTML-only, or nonconforming descriptions. Students can see problems missing input/output contracts or examples. Fix by adding server-side validation and updating seed content to match the mandatory format.

Severity/confidence: Medium / High.

### AGG2-28 - Medium - Problem import rejects function-signature problems and allows editor-incompatible time limits

Sources: debugger DBG2-6.

Locations: `src/app/api/v1/problems/import/route.ts`, problem-management validators.

The import route rejects `problemType: "function"` and can accept time limits outside the normal editor contract. Instructors can lose function-specific fields on import or create problems the admin UI cannot later represent cleanly. Fix by sharing the same schema/limits across import and editor save paths.

Severity/confidence: Medium / Medium.

### AGG2-29 - Medium - `drizzle.config.ts` imports a script absent from production app images on legacy deploy path

Sources: debugger DBG2-3.

Locations: `drizzle.config.ts`, `scripts/load-env.ts`, `deploy.sh`, production Docker build context.

The Drizzle config imports `./scripts/load-env`, but legacy deployment/app-image paths can run Drizzle in an image that does not include `scripts/load-env.ts`. Migrations can fail or run with stale env while logs imply success. Fix by copying the script into every image/path that uses Drizzle, or by moving env loading into a packaged module.

Severity/confidence: Medium / High.

### AGG2-30 - Medium - `INCLUDE_WORKER=false` production deploy still starts or configures worker-only behavior

Sources: architect ARCH2-5, document-specialist DOC-C2-4.

Locations: `deploy-docker.sh:25-28`, `deploy-docker.sh:180-226`, `deploy-docker.sh` worker start/stop logic, `CLAUDE.md:7-12`.

Docs and repo rules require `algo.xylolabs.com` to be app-only, but script defaults and compose handling can still include or start worker behavior unless env vars are set exactly. Fix by aligning defaults/docs with the app-server target or by making app-only deployment an explicit guarded mode.

Severity/confidence: Medium / High.

### AGG2-31 - Medium - Dedicated worker deployment helper/docs omit required `RUNNER_AUTH_TOKEN`

Sources: document-specialist DOC-C2-5.

Locations: `docs/deployment.md:151-169`, `scripts/deploy-worker.sh:131-139`, `docker-compose.worker.yml:55-58`, `judge-worker-rs/src/config.rs:160-164`, `README.md:204-212`, `docs/judge-workers.md:56-60`.

The dedicated worker guide/helper configure judge claim auth but omit `RUNNER_AUTH_TOKEN`, while compose passes an empty default and the worker rejects a present empty token. Operators following the documented path can produce crash-looping or insecure workers. Fix docs and helper generation so runner auth is mandatory and validated.

Severity/confidence: Medium / High.

### AGG2-32 - Medium - Docker socket proxy image is mutable at a privileged boundary

Sources: security SEC2-9.

Locations: `docker-compose.production.yml`, `docker-compose.worker.yml`.

The Docker socket proxy uses a mutable image tag at the only service boundary with direct Docker daemon control. A tag change can alter privileged behavior without code review. Fix by digest-pinning the proxy image and documenting an intentional update flow.

Severity/confidence: Medium / Medium.

### AGG2-33 - Medium - Docker image delete/prune failures are not consistently audit logged

Sources: security SEC2-12.

Locations: Docker image management API routes and Docker client helpers.

Some Docker image delete/prune failure paths return errors without durable audit entries. Operators lose traceability for failed privileged operations. Fix by audit logging both success and failure outcomes for every image mutation path.

Severity/confidence: Medium / High.

### AGG2-34 - Medium - API and authentication docs are out of sync with implementation

Sources: document-specialist DOC-C2-1/DOC-C2-2/DOC-C2-12/DOC-C2-13.

Locations: `docs/api.md:68-80`, `docs/api.md:1563-1606`, `docs/authentication.md:8-13`, `README.md:286-289`, `src/lib/security/csrf.ts:19-45`, `src/lib/api/auth.ts:61-83`, `src/lib/api/handler.ts:129-148`.

Docs describe CSRF token headers for session-cookie clients even though the app enforces `X-Requested-With: XMLHttpRequest`; authentication docs understate API-key bearer support; Docker image API docs use role labels and invalid examples; and the API reference is advertised as complete while shipped route families are omitted. Fix docs to match the code and add doc freshness checks where practical.

Severity/confidence: Medium / High.

### AGG2-35 - Medium - Runtime/version docs drift from deployed configs

Sources: document-specialist DOC-C2-6/DOC-C2-7/DOC-C2-10/DOC-C2-14.

Locations: `AGENTS.md`, `.context/project/current-state.md`, `.context/development/open-workstreams.md`, `docker-compose.production.yml`, `docker/seccomp-profile.json`, `src/lib/judge/languages.ts`, `docker/Dockerfile.judge-node`, `docs/languages.md`.

Repo docs disagree with code on PostgreSQL major version, seccomp default action, TypeScript judge version, worker architecture, and language counts. Future agents/operators can follow stale operational guidance. Fix the authoritative docs or source constants so they tell one story.

Severity/confidence: Medium / High.

### AGG2-36 - Medium - Function compile-error line remapping is not applied on several display paths

Sources: document-specialist DOC-C2-9.

Locations: `src/lib/submissions/visibility.ts:155-181`, `src/app/(public)/submissions/[id]/page.tsx:172-182`, `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:185-193`, `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:462-469`, `src/app/(public)/submissions/page.tsx:214-222`, `src/app/(public)/submissions/page.tsx:483-487`, `src/app/api/v1/judge/poll/route.ts:141-148`.

Docs promise compile errors are mapped back to student-relative lines, and the sanitizer can do that, but public/admin list/detail paths pass raw `compileOutput`. Students and staff can see wrapper/harness line numbers. Fix by routing all compile-output display through `sanitizeSubmissionForViewer` or equivalent mapping.

Severity/confidence: Medium / High.

### AGG2-37 - Medium - UI controls have invalid interactive composition, missing labels, or weak context

Sources: designer DSG2-1/DSG2-2/DSG2-4/DSG2-5.

Locations: `src/components/ui/button.tsx`, `src/components/filter-select.tsx`, `src/components/language-selector.tsx`, `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`, dynamic authoring row action components.

Links/buttons are composed in ways that can create nested interactive semantics; select/filter controls lack programmatic labels; Add Language hides required-field guidance behind a disabled submit; dynamic row actions do not include row context. Keyboard and screen-reader users can lose affordance and context. Fix with single interactive elements, visible/programmatic labels, inline validation text, and contextual action labels.

Severity/confidence: Medium / High.

### AGG2-38 - Medium - Admin language command help renders raw i18n keys/formatting errors

Sources: designer DSG2-3.

Locations: `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`, `messages/en.json`, `messages/ko.json`.

The admin language command help UI renders raw translation keys or formatting placeholders. Admins editing compile/run commands can misunderstand required syntax. Fix the message keys/placeholders and add a component test for both locales.

Severity/confidence: Medium / High.

### AGG2-39 - Low - Import drift and diagnostic/status tests do not directly prove their named behavior

Sources: verifier V5, test-engineer TST-C2-5/TST-C2-6.

Locations: `tests/unit`, `tests/integration`, `tests/e2e`.

Some tests are source-grep based or lack direct regression assertions for diagnostic truncation, rejudge worker-counter behavior, and import drift behavior. These gaps let regressions pass under green tests. Fix by replacing grep tests with behavioral tests and adding route-level cases for the named failure modes.

Severity/confidence: Low / Medium.

## AGENT FAILURES

None after retry. The initial fan-out was limited by the environment's five-agent concurrency cap; all blocked reviewer personas were retried and completed.
