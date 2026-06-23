# Cycle 2 RPF Review Remediation Plan

**Date:** 2026-06-20
**Source:** `.context/reviews/_aggregate.md` (cycle 2) and all cycle-2 per-agent reviews
**Repo rules read before planning:** `CLAUDE.md`, `AGENTS.md`, `docs/data-retention-policy.md`, `docs/transcript-access-policy.md`, `plans/README.md`, `plans/open/README.md`. This local clone does not contain `.context/README.md`, `.context/development/**`, `.cursorrules`, or `CONTRIBUTING.md`; those paths were checked and are absent.

## Scope

Cycle 2 found 39 deduped aggregate findings. Every finding is scheduled below. No new cycle-2 finding is deferred: the review set includes High/Medium security, correctness, data-loss, deployment, and test-gate failures, and the repo rules do not explicitly permit deferring those categories.

## Implementation Lanes

### Lane A - Submission Status And Manual Problems

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG2-1 | Manual submissions are active `pending` rows that no worker can claim | `src/app/api/v1/submissions/route.ts`, `src/lib/judge/claim-query.ts`, docs/tests | High/High | [x] |
| AGG2-2 | Status vocabulary drift across worker, app, UI, filters, exports, tests | worker/app status files, badges, messages, E2E waiters | High/High | [x] |

Planned work:
- Add a canonical manual-submission status or terminal manual state and prevent manual rows from entering the auto-judge queue.
- Centralize submission-status normalization/labels/translations and update filters, exports, badges, and E2E terminal status sets.
- Add route/unit/component coverage for manual submissions and status catalogs.

### Lane B - Restore, Export, And Import Safety

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG2-3 | ZIP restore writes uploads before DB validation/import succeeds | `src/app/api/v1/admin/restore/route.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/import.ts` | High/High | [x] |
| AGG2-4 | Pre-restore snapshots are redacted despite full-fidelity expectations | `src/lib/db/pre-restore-snapshot.ts`, docs | High/High | [x] |
| AGG2-28 | Problem import rejects function problems and allows editor-incompatible time limits | `src/app/api/v1/problems/import/route.ts`, validators | Medium/Medium | [x] |
| AGG2-29 | `drizzle.config.ts` imports a script absent from production app images | `drizzle.config.ts`, `scripts/load-env.ts`, Docker/deploy paths | Medium/High | [x] |

Planned work:
- Validate `database.json`, manifest, archive entry count, decompressed size, and sanitized/full-fidelity mode before any live file mutation.
- Stage uploaded files and swap them only after DB import success, or document/guard any non-atomic remainder explicitly.
- Align problem import schema with editor/problem-management contracts.
- Ensure every production/legacy Drizzle execution path can resolve `scripts/load-env.ts`, or move the helper to a copied module.

### Lane C - Judge Worker, Output, Claims, And Runner Contracts

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG2-5 | Output-limit handling builds oversized reports before app truncation | `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, poll validators | High/High | [x] |
| AGG2-14 | Local compiler fallback workspace permissions can block sandbox users | `src/lib/compiler/execute.ts`, `judge-worker-rs/src/executor.rs` | Medium/High | [x] |
| AGG2-15 | TS/Rust command and image validators have incompatible contracts | `src/lib/compiler/execute.ts`, `judge-worker-rs/src/runner.rs`, language sync | Medium/High | [x] |
| AGG2-23 | Claim schema parse failures leak claims and worker active-task slots | `src/app/api/v1/judge/claim/route.ts`, `src/lib/judge/claim-query.ts` | Medium/Medium | [x] |
| AGG2-25 | Interactive compiler/playground compile limits diverge from judged submissions | compiler/playground routes, runner limits | Medium/High | [x] |

Planned work:
- Truncate stdout/stderr diagnostics in the worker before report serialization and keep explicit overflow metadata.
- Add release/rollback handling for post-claim parse or payload failures.
- Align runner request limits and validation semantics with judged submissions.
- Add focused Rust and TypeScript regression tests for output caps, claim cleanup, and command validation.

### Lane D - Auth, Secrets, Worker Control Plane, And Docker Privilege Boundaries

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG2-6 | Production auth-host allowlist bypassed by default `AUTH_TRUST_HOST=true` | auth trusted-host/env files | High/High | [x] |
| AGG2-7 | Dedicated workers only warn on insecure remote HTTP control-plane URLs | `judge-worker-rs/src/config.rs`, worker docs/compose | High/High | [x] |
| AGG2-8 | Runner/admin endpoints can share the judge submission token | runner auth config, compose, compiler execution | High/High | [x] |
| AGG2-9 | Sanitized exports include plaintext plugin provider secrets | DB export redaction pipeline | High/High | [x] |
| AGG2-10 | Production-capable API keys are hardcoded in scripts/artifacts | scripts/artifacts found by secret scan | High/High | [x] |
| AGG2-31 | Dedicated worker helper/docs omit required `RUNNER_AUTH_TOKEN` | `scripts/deploy-worker.sh`, `docs/deployment.md`, compose | Medium/High | [x] |
| AGG2-32 | Docker socket proxy image is mutable at privileged boundary | production/worker compose files | Medium/Medium | [x] |
| AGG2-33 | Docker image delete/prune failures are not consistently audit logged | Docker image API routes/client | Medium/High | [x] |

Planned work:
- Enforce canonical auth hosts and secure worker URLs in production.
- Make runner auth distinct and mandatory for runner traffic.
- Remove hardcoded API keys, add environment-variable script patterns, and add a secret-scan guard.
- Extend export redaction and audit logging for privileged Docker operations.
- Pin Docker socket proxy image by digest or document/update the pinned immutable reference.

### Lane E - Database, Gates, And Repository Hygiene

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG2-11 | Drizzle migration SQL and journal metadata diverge | `drizzle/pg`, `scripts/check-migration-drift.sh` | High/High | [x] |
| AGG2-12 | Host DB gates resolve Docker-internal hosts | `drizzle.config.ts`, `playwright.config.ts`, env loading | High/High | [x] |
| AGG2-16 | Queue claim/position paths lack composite indexes and do sequential reads | schema, claim, queue-status route | Medium/High | [x] |
| AGG2-17 | Submission creation scans all historical submissions inside transaction | `src/app/api/v1/submissions/route.ts` | Medium/High | [x] |
| AGG2-24 | Root Cargo workspace and AppleDouble artifacts are unignored | `.gitignore`, `.dockerignore`, `deploy-docker.sh` | Medium/High | [x] |
| AGG2-39 | Import drift and diagnostic/status tests do not directly prove named behavior | tests | Low/Medium | [ ] |

Planned work:
- Make migration drift checks verify SQL/journal bijection.
- Load/translate host-safe database env for host-run gates.
- Add or verify indexes for queue hot paths.
- Replace broad submission scans with targeted aggregates where practical.
- Ignore/exclude root `target/` and AppleDouble files.
- Replace source-grep tests with behavioral tests for migration drift, diagnostics, and status catalogs.

### Lane F - Product Validation, Problem Authoring, Docs, And UI

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG2-13 | File-link authorization clears state before validation | problem-management file association | Medium/High | [ ] |
| AGG2-18 | Live polling and progress filters over-fetch large payloads | submission polling/progress pages | Medium/High | [ ] |
| AGG2-19 | Browser diffing and large authoring forms block main thread | diff/output/problem editor | Medium/High | [ ] |
| AGG2-20 | Assignment/contest boards and stats recompute full matrices/aggregates | status board/stats routes | Medium/High | [ ] |
| AGG2-21 | Docker build UX/API is synchronous and mismatched with production capabilities | admin languages UI, Docker build route | Medium/High | [ ] |
| AGG2-22 | Sitemap generation accumulates all rows and locale-expands in memory | sitemap generation | Medium/High | [ ] |
| AGG2-26 | Function problems can be saved with no supported enabled language | function validators/submission form | Medium/High | [ ] |
| AGG2-27 | Mandatory problem description structure is not enforced | validators, seed/import/admin/API paths | Medium/High | [ ] |
| AGG2-30 | `INCLUDE_WORKER=false` deploys still start/configure worker behavior | `deploy-docker.sh`, compose/docs | Medium/High | [ ] |
| AGG2-34 | API/auth docs are out of sync with implementation | `docs/api.md`, `docs/authentication.md`, README | Medium/High | [x] |
| AGG2-35 | Runtime/version docs drift from deployed configs | `AGENTS.md`, `.context/project/current-state.md`, language/seccomp docs | Medium/High | [ ] |
| AGG2-36 | Function compile-error line remapping is skipped on display paths | submission display routes/components | Medium/High | [ ] |
| AGG2-37 | UI controls have invalid composition, missing labels, weak context | UI components/admin language/form rows | Medium/High | [ ] |
| AGG2-38 | Admin language command help renders raw i18n keys/formatting errors | admin language UI, messages | Medium/High | [ ] |

Planned work:
- Validate problem file links before mutation and validate function/problem description contracts on every save/import path.
- Add pragmatic payload caps/size gates for diffing and editor dirty checks; update polling endpoints to fetch smaller status payloads where feasible.
- Align docs with code for CSRF, API keys, PostgreSQL, seccomp, TypeScript, worker architecture, and Docker image API examples.
- Apply compile-output line mapping on all display paths.
- Fix labeled controls, action context, admin language i18n, and mobile row action layout.

## Deferred Register

No new cycle-2 findings are deferred.

## Housekeeping

- [x] Archived completed prior plans:
  - `plans/open/2026-05-29-cycle-7-rpf-review-remediation.md` -> `plans/done/2026-05-29-cycle-7-rpf-review-remediation.md`
  - `plans/open/2026-06-13-cycle-10-rpf-review-remediation.md` -> `plans/done/2026-06-13-cycle-10-rpf-review-remediation.md`

## Required Gates Before Commit/Deploy

Run every configured gate from the cycle context:

- `npm audit --audit-level=high`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run db:check`
- `npm run test:unit:coverage`
- `npm run test:component`
- `npm run test:integration`
- `npm run test:harness`
- `cargo test --quiet --manifest-path judge-worker-rs/Cargo.toml`
- `cargo test --quiet --manifest-path code-similarity-rs/Cargo.toml`
- `cargo test --quiet --manifest-path rate-limiter-rs/Cargo.toml`
- `cargo audit`
- `npm run build`
- Docker compose/build checks listed by the orchestrator
- bash syntax checks and backup safety scripts
- DB seed/sync gates
- `npx playwright test`

## Progress

- [x] Prompt 1 reviews completed and aggregated.
- [x] Prompt 2 plan written.
- [ ] Lane A implemented.
- [ ] Lane B implemented.
- [ ] Lane C implemented.
- [ ] Lane D implemented.
- [ ] Lane E implemented.
- [ ] Lane F implemented.
- [ ] Required gates green.
- [ ] Fine-grained GPG-signed commits pushed.
- [ ] Per-cycle deployment completed.

### Cycle 2 Resumed Progress (2026-06-23)

- [x] AGG2-2: Added a shared E2E terminal-status catalog in `tests/e2e/support/helpers.ts` that includes canonical `time_limit_exceeded`, `memory_limit_exceeded`, and `output_limit_exceeded` verdicts while still accepting legacy `time_limit`/`memory_limit` aliases during migration. Updated local E2E pollers and verdict assertions to use it.
- [x] AGG2-34: Updated `docs/api.md` and `docs/authentication.md` so API-route CSRF, API-key bearer auth, and Docker image management docs match the implementation.
- [x] AGG2-1 verified already fixed in current HEAD: manual submissions now start as `submitted`, and pending/queue checks are skipped for manual problems in `src/app/api/v1/submissions/route.ts`.
- [x] AGG2-4 verified already fixed in current HEAD: `src/lib/db/pre-restore-snapshot.ts` streams pre-restore snapshots with `sanitize: false` and 0600 file mode.
- [x] AGG2-10 verified already fixed in tracked source: `git grep`/`rg` found no checked-in production-looking `jk_` API keys or long token assignments outside excluded review/plan text.
- [x] AGG2-11 verified already fixed in current HEAD: `scripts/check-migration-drift.sh` checks SQL-file/journal bijection before Drizzle checks, and current journal/file counts match.
- [x] AGG2-24 verified already fixed in current HEAD: `.gitignore`, `.dockerignore`, and deploy rsync excludes cover root `target/` and AppleDouble files.
- [x] AGG2-31/AGG2-32/AGG2-33 verified already fixed in current HEAD: dedicated worker compose/docs require `RUNNER_AUTH_TOKEN`, Docker socket proxy images are digest-pinned, and Docker image mutation failure paths are audit logged.
- [x] AGG2-7 verified already fixed in current HEAD: `judge-worker-rs/src/config.rs` rejects non-local plain HTTP judge URLs unless `JUDGE_ALLOW_INSECURE_HTTP=1` is explicitly set, with unit coverage for local allow and remote reject cases.
- [x] AGG2-8 verified already fixed in current HEAD: the Rust worker requires `RUNNER_AUTH_TOKEN`, rejects reuse of `JUDGE_AUTH_TOKEN`, and the app compiler/docker clients send only `RUNNER_AUTH_TOKEN` for runner/admin endpoints.
- [x] AGG2-14 verified already fixed in current HEAD: `src/lib/compiler/execute.ts` chmods local fallback workspaces to `0o770`, writes source files as `0o644`, and keeps compiler containers on uid/gid `65534:65534`; `tests/unit/compiler/execute-implementation.test.ts` locks this behavior.
- [x] AGG2-6 verified already fixed in current HEAD: `/api/auth/*` calls `validateTrustedAuthHost()` before Auth.js handlers, and `tests/unit/auth/trusted-host.test.ts` proves proxy trust mode does not bypass the allowed-host check.
- [x] AGG2-9 verified already fixed in current HEAD: `src/lib/security/secrets.ts` includes `plugins.config` in `EXPORT_SANITIZED_COLUMNS`, so portable exports null plugin provider secret configs; `tests/unit/db/export-sanitization.test.ts` covers the redaction entry.
- [x] AGG2-3 completed: `tests/unit/api/admin-backup-security.route.test.ts` now proves ZIP uploads are staged by `parseBackupZip`, skipped when `importDatabase()` fails, and written via `restoreParsedBackupFiles()` only after a successful database import.
- [x] AGG2-28 verified already fixed in current HEAD: `src/app/api/v1/problems/import/route.ts` accepts `problemType: "function"` with `functionSpec`, rejects unsupported/missing specs, uses `problemDescriptionSchema`, and keeps `timeLimitMs` at the same 10s ceiling as `problemMutationSchema`; `tests/unit/validators/problem-import.test.ts` covers these contracts.
- [x] AGG2-29 completed: `Dockerfile` now copies `scripts/load-env.ts` and its `@next/env` runtime dependency into the app image so legacy `docker exec judgekit-app npx drizzle-kit push` can resolve the `drizzle.config.ts` import; `tests/unit/infra/deploy-security.test.ts` guards the packaging contract.
- [x] AGG2-5 completed: `judge-worker-rs/src/executor.rs` now truncates report-facing `actualOutput` and compile diagnostics to 16 KiB before JSON report/dead-letter serialization, while leaving Docker-captured stdout available for comparison; Rust worker unit tests cover report truncation and UTF-8 boundaries.
- [x] AGG2-15 completed: `judge-worker-rs/src/runner.rs` now rejects unbraced `$VAR`/`$1` shell expansions like the TypeScript compiler path, and `judge-worker-rs/src/validation.rs` now enforces trusted-registry delimiter boundaries plus the same local-registry handling as `src/lib/judge/docker-image-validation.ts`; focused Rust and Vitest validator tests pass.
- [x] AGG2-23 verified/completed: `src/app/api/v1/judge/claim/route.ts` token-fences `releaseClaimedSubmission()` for schema parse errors, missing problems, and outer post-claim exceptions; `tests/unit/api/judge-poll.route.test.ts` now covers worker-slot cleanup when response assembly fails after a successful claim.
- [x] AGG2-25 completed: `judge-worker-rs/src/runner.rs` now uses the same 2048 MiB compiler-runner memory envelope as `src/lib/compiler/execute.ts`, with a Rust unit guard so the runner sidecar cannot drift back to the old 256 MiB cap; `cargo test --quiet --manifest-path judge-worker-rs/Cargo.toml` passes.
- [x] AGG2-12 completed: host-run npm scripts now set `JUDGEKIT_HOST_DATABASE_URL=1`, and `scripts/load-env.ts` resolves `HOST_DATABASE_URL`/`DATABASE_URL_HOST` first or translates known Docker DB service hosts (`db`, `db-postgres`) to loopback only in that host-run mode; `.env.example` documents the override and `tests/unit/infra/host-database-url.test.ts` covers the resolver and script wiring.
- [x] AGG2-16 completed: `src/lib/db/schema.pg.ts` and `drizzle/pg/0035_queue_claim_indexes.sql` add `submissions_queue_claim_idx` and `submissions_stale_claim_idx` for queue-position, claim, and stale-reclaim scans; `src/app/api/v1/judge/claim/route.ts` now fetches problem metadata, test cases, language config, and assignment scoring metadata in one `Promise.all()` after reserving a row to reduce worker-slot hold time. Focused queue/claim tests, `npx tsc --noEmit`, and `npm run db:check` pass.
- [x] AGG2-17 completed: `src/app/api/v1/submissions/route.ts` now replaces the broad per-user `SUM(CASE ...)` aggregate with targeted `COUNT(*)` queries for recent submissions and active queue submissions, backed by `submissions_user_submitted_at_idx` and `submissions_user_status_idx` in `drizzle/pg/0036_submission_create_indexes.sql`; route tests, the new implementation guard, `npx tsc --noEmit`, and `npm run db:check` pass.
