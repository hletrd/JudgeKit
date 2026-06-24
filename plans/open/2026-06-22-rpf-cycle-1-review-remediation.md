# Cycle 1 RPF Review Remediation Plan

**Date:** 2026-06-22  
**Source:** `.context/reviews/_aggregate.md` plus every per-agent review in `.context/reviews/*.md` from this cycle.  
**Repo rules read before planning:** `CLAUDE.md`, `AGENTS.md`, `.context/README.md`, `.context/development/conventions.md`, `.context/development/documentation-rules.md`, `.context/development/problem-descriptions.md`, `.context/development/open-workstreams.md`, `.context/plans/README.md`, `plans/README.md`, `plans/open/README.md`, `plans/archive/README.md`, `docs/data-retention-policy.md`, `docs/privacy-retention.md`, `docs/admin-security-operations.md`, `docs/high-stakes-operations.md`, `docs/release-readiness-checklist.md`, `docs/operator-incident-runbook.md`, `docs/judge-worker-incident-runbook.md`, `docs/transcript-access-policy.md`, `docs/deployment.md`, and `docs/deployment-automation.md`. `.cursorrules` and `CONTRIBUTING.md` do not exist in this checkout.

## Scope

The cycle produced 29 aggregate confirmed findings plus a likely/manual-validation register. Security, correctness, data-loss, and release-blocking findings are scheduled for implementation below. Pure performance scaling work, non-blocking UI polish, broad missing-test inventory, and manual production validation items are deferred only where the repo rules do not forbid deferral; every deferred item records original severity/confidence, concrete reason, and reopen criterion.

## Implementation Lanes

### Lane A - Judge Result Transport, Restore Safety, And Backup Fidelity

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG1-1 | Judge result reports can exceed transport/app limits before truncation | `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/api.rs`, `src/app/api/v1/judge/poll/route.ts`, `src/lib/validators/api.ts`, `src/lib/judge/verdict.ts`, `deploy-docker.sh` | High/High | [ ] |
| AGG1-2 | Backup ZIP restore can exhaust memory and commit DB before file restore completes | `src/app/api/v1/admin/restore/route.ts`, `src/lib/db/export-with-files.ts`, `src/lib/db/import-transfer.ts` | High/High | [ ] |
| AGG1-3 | Full-fidelity backup/snapshot contract is false for disaster recovery | `src/lib/security/secrets.ts`, `src/lib/db/export.ts`, `src/lib/db/pre-restore-snapshot.ts`, `src/app/api/v1/admin/restore/route.ts`, docs | High/High | [ ] |

Planned work:

- Add worker-side diagnostic caps before JSON report serialization and app-side schema/body limits before persistence truncation.
- Add ZIP restore expanded-size, entry-count, and per-entry caps before inflation.
- Stage upload files before DB import and fail before committing DB when file staging cannot succeed.
- Make the backup/export restore contract coherent: either truly full-fidelity with encrypted local handling or a distinct redacted mode that cannot be misrepresented as DR-safe.
- Add focused Rust/Vitest tests for oversized output reports, ZIP limits, and backup/restore fidelity.

### Lane B - Auth, Secrets, Docker Trust, And Deploy Safety

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG1-4 | Password policy sources conflict and reset/change flows enforce different rules | `AGENTS.md`, `src/lib/security/password.ts`, reset/change/recruiting/admin flows, docs/messages | High/High | [ ] |
| AGG1-6 | Destructive migration detection only warns and then starts new code | `deploy-docker.sh`, `AGENTS.md` | High/High | [ ] |
| AGG1-7 | Dedicated worker deploy failures do not fail app deploys | `deploy-docker.sh` | High/High | [ ] |
| AGG1-8 | App-only topology is encoded as remembered shell flags | `CLAUDE.md`, `deploy-docker.sh`, `docker-compose.production.yml` | High/High | [ ] |
| AGG1-9 | Admin Docker image management can fall back to local Docker from Next in production | `src/lib/docker/client.ts`, `src/lib/security/production-config.ts`, docs | High/High | [ ] |
| AGG1-10 | Plugin provider API keys are plaintext at rest and included in full backups | `src/lib/plugins/secrets.ts`, plugin config paths, export/redaction paths | High/High | [ ] |
| AGG1-15 | Rust Docker trusted-registry validation is prefix-spoofable | `judge-worker-rs/src/validation.rs`, `src/lib/judge/docker-image-validation.ts` | Medium/High | [ ] |
| AGG1-17 | Worker workspaces/source files can become world-readable/writable | `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/runner.rs` | Medium/High | [ ] |
| AGG1-21 | Auth trusted-host validation trusts client-supplied `X-Forwarded-Host` | `src/lib/auth/trusted-host.ts`, `deploy-docker.sh`, tests | Medium/High | [ ] |
| AGG1-26 | Hardcoded local secrets/API keys exist in ignored workspace files | `.context/development/conventions.md`, ignored local scripts | High-if-live/High | [ ] |
| AGG1-27 | Production dependency advisories remain in lockfiles | Rust/npm lockfiles | Medium/High | [ ] |

Planned work:

- Restore the repo-mandated 8-character length-only password policy unless the instruction file is explicitly changed first; align reset/change/admin/recruiting flows and tests.
- Fail deploy on destructive `drizzle-kit push` prompts unless `DRIZZLE_PUSH_FORCE=1` is explicitly set.
- Make configured remote worker failures fatal by default and encode app-only topology in deploy behavior instead of comments.
- Fail Docker admin local fallback in production unless an authenticated worker runner is configured.
- Encrypt/migrate plugin secret config values or redact/refuse unsafe export modes.
- Port trusted registry boundary checks to Rust, harden workspace permissions, and clear/overwrite `X-Forwarded-Host` in generated nginx.
- Remove local literal credentials, require env vars in ignored scripts, and rotate/revoke externally as operator follow-up.
- Update dependencies to clear the Rust audit advisories and any fixable npm advisories.

### Lane C - Language Sync, Compiler, Status, Problem, And UI Correctness

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG1-5 | Startup language sync overwrites admin-managed command overrides | `src/lib/judge/sync-language-configs.ts`, `src/instrumentation.ts`, `src/lib/actions/language-configs.ts`, schema | High/High | [ ] |
| AGG1-12 | Admin language management renders as a perpetual skeleton | `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`, `messages/en.json`, `messages/ko.json` | High/High | [ ] |
| AGG1-13 | Problem file-link sync clears ownership before authorization | `src/lib/problem-management.ts`, problem update API | Medium/High | [ ] |
| AGG1-14 | Compiler command validation and command length limits drift across TS/Rust/API/defaults | compiler execution, Rust runner, language APIs/actions | Medium/High | [ ] |
| AGG1-16 | Local compiler fallback workspace is unreadable by UID/GID 65534 | `src/lib/compiler/execute.ts` | High/High | [ ] |
| AGG1-18 | Remote Docker image builds are synchronous but app calls time out after 30 seconds | `src/lib/docker/client.ts`, Docker build route, Rust runner | High/High | [ ] |
| AGG1-19 | Submission status names are inconsistent after canonical verdict migration | worker/app status constants, messages, UI, filters, E2E helpers | High/High | [ ] |
| AGG1-20 | Problem import bypasses normal test-case validation | `src/app/api/v1/problems/import/route.ts`, validators | Medium/High | [ ] |
| AGG1-22 | Per-user SSE connection counting uses unescaped SQL LIKE user IDs | `src/lib/realtime/realtime-coordination.ts`, `src/lib/db/like.ts` | Medium/High | [ ] |
| AGG1-28 | Documentation/code drift misleads operators and integrators | `docs/api.md`, `docs/authentication.md`, `docs/privacy-retention.md`, `docs/languages.md`, `AGENTS.md`, `.context/project/current-state.md`, deploy docs | High-Medium/High | [ ] |
| AGG1-29a | High-impact UI accessibility regressions: invalid `Link > Button`, unnamed practice filters, silent skeletons | UI components/routes listed in aggregate | High-Medium/High | [ ] |

Planned work:

- Preserve admin command overrides during startup sync.
- Escape/pass admin-language ICU placeholders and add coverage for the page/sheet render path.
- Validate file links before mutating existing associations.
- Align command validation/max-length contracts enough to keep first-party defaults valid across API/action/local/Rust paths.
- Fix local fallback workspace ownership and remote build timeout semantics.
- Normalize legacy/canonical submission statuses, labels, filters, E2E waiters, and CSV export.
- Reuse normal problem test-case validation in import.
- Escape SSE user IDs in SQL LIKE patterns.
- Update high-impact docs and UI semantics that can cause operational or accessibility failure.

### Lane D - Quality Gate Contract And High-Risk Test Gaps

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| AGG1-11 | E2E and worker-backed quality gates can go green without exercising judge paths | `.github/workflows/ci.yml`, Playwright setup/specs | High/High | [ ] |
| AGG1-25 | Test coverage misses destructive/admin/test-only paths | Docker prune, file bulk-delete, test seed, contest participant audit, Dockerfile validation | Medium/High-Medium | [ ] |

Planned work:

- Make CI E2E database setup explicit and self-contained.
- Add a required or at least CI-failing judge-E2E prerequisite mode when worker specs are expected to run.
- Add behavioral route tests for Docker prune, file bulk-delete, and test seed security gates where practical this cycle.
- Replace fixed sleeps/skips in touched tests if they block quality gates.

### Lane E - Likely Issues Scheduled For Validation/Fix

| ID | Finding | Files | Severity/confidence | Status |
|---|---|---|---|---|
| L1 | Non-terminating output floods can be classified as time limit/output flags are dropped on timeout | `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs` | Medium/Medium and Low/High | [ ] |
| L2 | Manual `submitted` rows may be hidden from assignment/contest aggregates | assignment/contest aggregate files | Medium/Medium | [ ] |
| L3 | Function harness assembly failure is converted into student compile failure | `src/app/api/v1/judge/claim/route.ts` | Medium/High | [ ] |
| L4 | Rust worker orphan cleanup ignores running `oj-*` containers after worker crashes | `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/main.rs` | Medium/Medium | [ ] |
| L5 | Nginx config test failure is non-fatal during deploy | `deploy-docker.sh` | Medium/Medium | [ ] |
| L6 | Stale-claim reclaim can deadlock under cross-worker stale reclaims | `src/lib/judge/claim-query.ts`, claim route | Medium/Medium | [ ] |

Planned work:

- Add focused tests or low-risk fixes for each likely item when the source evidence is enough.
- If validation disproves a likely item, update this plan with the evidence and mark it closed.

## Deferred Register

The following findings are deferred because they are performance scaling work, broad product validation, or non-blocking UX polish rather than security/correctness/data-loss findings. Repo rules do not forbid deferring these categories. Deferred items remain bound by the repo policies above: semantic gitmoji commits, GPG signing, relevant tests, and full gates when picked up.

### D-1 - Queue/performance indexing and query-shape optimization

- Finding: AGG1-23 (`src/lib/judge/claim-query.ts:38-52`, `src/lib/judge/claim-query.ts:133-147`, `src/app/api/v1/submissions/[id]/queue-status/route.ts:40-51`, `src/app/api/v1/submissions/route.ts:345-379`, `src/lib/db/schema.pg.ts:500-513`)
- Original severity/confidence: High for queue index, Medium for submission history scan / High confidence.
- Reason for deferral: performance scaling change needs realistic row counts and `EXPLAIN (ANALYZE, BUFFERS)` to avoid adding ineffective or harmful indexes during this correctness/security cycle.
- Exit criterion: production-scale queue latency, contest spikes, or the next performance cycle provides query plans showing the target index/query shape, or any gate/load test fails due to these paths.

### D-2 - Large catalog/UI data-loading performance work

- Finding: AGG1-24 (`src/app/(public)/problems/page.tsx:356-405`, `src/app/(public)/practice/page.tsx:423-466`, `src/lib/diff.ts:26-78`, `src/lib/assignments/submissions.ts:636-844`, `src/app/api/v1/contests/[assignmentId]/stats/route.ts:92-140`, `src/lib/assignments/code-similarity.ts:329-380`, `src/app/sitemap.ts:21-94`)
- Original severity/confidence: Medium/High.
- Reason for deferral: these are multi-surface performance improvements that do not block correctness/security fixes; each needs separate workload-specific tests or pagination/cache design.
- Exit criterion: large public catalogs, rosters, similarity candidate sets, or sitemap size approach documented thresholds; browser freezes are reproduced; or a dedicated performance lane starts.

### D-3 - Non-critical UI polish beyond the high-impact accessibility fixes

- Finding: AGG1-29 low/medium subitems (`src/app/(public)/_components/public-problem-list.tsx:115-214`, `src/components/layout/public-header.tsx:255-269`, static unnamed select/repeated-action lists in `designer.md`)
- Original severity/confidence: Medium-Low / High-Medium.
- Reason for deferral: Lane C schedules the high-impact admin skeleton, invalid interactive composition, practice filter labels, and semantic loading states. The remaining mobile table redesign, hamburger target sizing, and broad select/action audit are product UX polish that can safely follow after blocking fixes.
- Exit criterion: mobile practice/problem discovery is prioritized, accessibility audits flag the broader select/action list, or this cycle touches the relevant components anyway.

### D-4 - Broad Dockerfile validation matrix and ambient-data E2E hardening

- Finding: AGG1-25 partial (`.github/workflows/ci.yml:180-223`, `tests/e2e/contest-participant-audit.spec.ts:42-220`)
- Original severity/confidence: Medium/High.
- Reason for deferral: Lane D schedules the high-risk route/security test gaps and E2E DB/worker contract. Full Dockerfile matrix generation and contest fixture rewrites are broader CI/product-test investments.
- Exit criterion: Dockerfile changes touch non-core images, a deploy fails due to an unchecked Dockerfile, or contest participant audit is changed.

### D-5 - Manual production/operations validation items

- Findings: external MFA/SSO, `JUDGE_ALLOWED_IPS`, full backup encryption/access controls, staging judge/language validation, remote smoke profile expansion, production retention overrides, real Docker image inventory, generated API-doc coverage, contrast/RTL/contest live UI validation.
- Original severity/confidence: Medium-High / High where noted in agent reviews.
- Reason for deferral: these require production/staging operator access, legal/product decisions, or live environment evidence beyond local repo edits. They are not silently dropped; they remain validation tasks for release readiness.
- Exit criterion: before any high-stakes launch, before deploy signoff when relevant env/docs changed, or when operator access is available to validate the named production control.

## Housekeeping

- No open RPF plan was fully complete at Prompt 2 time. Existing open plan `plans/open/2026-06-20-cycle-2-rpf-review-remediation.md` still has unchecked lanes and was not archived.

## Cycle 1 Implementation Progress

Implemented in the worktree but not committed because the full Playwright gate is not green:

- AGG1-1 partial: added Rust report diagnostic truncation plus app-side judge report size/result-count validation.
- AGG1-2 partial: added backup ZIP entry-count, per-entry, and total decompressed-size limits before extraction; DB/file atomicity remains open.
- AGG1-4 fixed: restored the repo-mandated length-only 8-character password policy across reset/change/admin/public flows, docs, messages, and tests.
- AGG1-5 fixed: startup language sync preserves admin-managed compile/run command overrides and only backfills missing commands.
- AGG1-6 fixed: destructive `drizzle-kit push` prompts now fail deploy unless explicitly forced.
- AGG1-7 fixed: configured remote worker deployment failures now fail the app deploy.
- AGG1-9 fixed: production Docker image management rejects local fallback when no authenticated worker runner is configured.
- AGG1-10 partial: new plugin secret writes and exports encrypt secret fields; legacy plaintext rows still need migration/backfill.
- AGG1-12 fixed: admin language Build/Remove ICU placeholders render as literal `{file}` / `{binary}` values instead of keeping the UI in a skeleton/fallback state.
- AGG1-13 fixed: problem file-link updates validate requested file IDs/ownership before clearing existing links.
- AGG1-15 fixed: Rust trusted-registry matching now requires a registry boundary (`/`, `:`, or end).
- AGG1-16 partial: local compiler fallback workspaces are made readable/executable for UID/GID 65534; broader workspace permission hardening remains open.
- AGG1-18 fixed: remote Docker image build requests use a build-length timeout instead of the normal short request timeout.
- AGG1-20 fixed: problem import test cases reuse the normal bounded test-case schema.
- AGG1-21 fixed: trusted-host validation no longer trusts client-supplied `X-Forwarded-Host`.
- AGG1-22 fixed: per-user SSE connection counting escapes SQL LIKE wildcards.
- L5 fixed: nginx config-test failure is fatal during deploy.
- Gate warning fixed: `/languages` is explicitly dynamic so production builds do not query PostgreSQL during static generation.
- Gate warning fixed: Playwright local webServer can reuse a prebuilt standalone app and has a 10-minute startup timeout; `PLAYWRIGHT_REBUILD_APP=1` forces the old rebuild behavior.

Gate results from this cycle:

- Passed: `npm audit --audit-level=high` (with non-blocking moderate PostCSS advisories), `npm run lint`, `npm run lint:bash`, `npx tsc --noEmit`, `npm run db:check`, `npm run test:unit:coverage`, `npm run test:component`, `npm run test:harness`, all three Rust `cargo test` commands, `cargo audit`, `npm run build`, `docker compose config --quiet`, all listed Dockerfile `docker build --check` commands, shell syntax checks, `bash scripts/test-backup.sh`, and `python3 scripts/check-pgdata-pinned.py docker-compose.production.yml docker-compose.test-backends.yml`.
- Limited: `npm run test:integration` exited 0 but skipped all 5 files / 45 tests because the local integration database was not configured.
- Blocking: `npx playwright test` was retried after fixing webServer startup and then reached the suite, but ended with 6 failures, 1 interrupted, 132 skipped, 29 not run, and 300 passed. Failures were in `tests/e2e/admin-audit-logs.spec.ts`, `tests/e2e/admin-login-logs.spec.ts`, `tests/e2e/contest-full-lifecycle.spec.ts`, `tests/e2e/contest-system.spec.ts`, `tests/e2e/problem-management.spec.ts`, and `tests/e2e/task12-destructive-actions.spec.ts`; `tests/e2e/task7-unsaved-changes-history.spec.ts` was interrupted when the cycle was stopped.

Deferred gate warnings:

- `package-lock.json` / `npm audit --audit-level=high`: original severity/confidence Medium/High for production dependency advisories. The high-level audit gate passed, but npm still reports moderate PostCSS advisories through Next. Deferral reason: `npm audit fix --force` proposes a breaking/downgrade path rather than a safe patch. Exit criterion: Next releases a non-breaking patched dependency path or an audited override is approved.
- `npm run test:integration`: original severity/confidence High/High under AGG1-11. Deferral reason: this local shell lacks the integration database URL required by the suite, so the configured gate skipped all integration tests while still exiting 0. Exit criterion: CI/local gate provisions the integration database or fails when those tests are skipped unexpectedly.
- `npx playwright test`: original severity/confidence High/High under AGG1-11. Deferral reason: the full local browser gate is not green and needs targeted E2E fixes/fixture cleanup before commit/deploy. Exit criterion: all failing/interrupted Playwright specs pass in the full suite.

## Required Gates Before Commit/Deploy

Run every configured gate from the cycle context:

- `npm audit --audit-level=high`
- `npm run lint`
- `npm run lint:bash`
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
- `docker compose config --quiet`
- all listed Dockerfile `docker build --check` commands
- shell syntax checks for backup/deploy scripts
- `bash scripts/test-backup.sh`
- `python3 scripts/check-pgdata-pinned.py docker-compose.production.yml docker-compose.test-backends.yml`
- `npx playwright test`

## Progress

- [x] Prompt 1 reviews completed and aggregated.
- [x] Prompt 2 plan written.
- [ ] Lane A implemented (partial).
- [ ] Lane B implemented (partial).
- [ ] Lane C implemented (partial).
- [ ] Lane D implemented.
- [ ] Lane E validated/fixed.
- [x] Deferred register reviewed for any item made relevant by touched files.
- [ ] Required gates green.
- [ ] Fine-grained GPG-signed commits pushed.
- [ ] Per-cycle deployment completed.
