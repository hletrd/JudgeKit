# Cycle 3 (2026-06-30) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 3/100) plus the per-agent files under `.context/reviews/`.

Repo rules read before planning, in required order: `CLAUDE.md`, `AGENTS.md`, `.context/README.md`, `.context/development/conventions.md`, `.context/development/documentation-rules.md`, `.context/development/open-workstreams.md`, `.context/plans/README.md`, `.context/project/current-state.md`, `.cursorrules` (absent), `CONTRIBUTING.md` (absent), `docs/deployment.md`, `docs/deployment-automation.md`, `docs/admin-security-operations.md`, `docs/data-retention-policy.md`, `docs/transcript-access-policy.md`, and `docs/api.md`.

Cycle constraints:
- Deploy mode is per-cycle.
- Correct deploy targets are `algo.xylolabs.com`, `test.worv.ai`, and `oj.auraedu.me`; never deploy to `oj.worv.ai`.
- Preserve cycle-2 deployment health. If app/worker health regresses, treat it as a deployment blocker.
- Before deploy/build, verify target storage posture and rely on safe cleanup only: stopped containers, dangling images, BuildKit cache/history. Never run `docker system prune --volumes`, automated `docker volume prune`, or delete PostgreSQL/user-data volumes.
- Use semantic git messages with gitmoji and signed commits.

## Phase A - Implement This Cycle

### A1. Modernize Nginx HTTP/2 Syntax
- Findings: C3-1.
- Original severity/confidence: Low/Medium, High.
- Files: `deploy-docker.sh`, `scripts/online-judge.nginx.conf`, `static-site/static.nginx.conf`, `tests/unit/infra/judge-report-nginx.test.ts`.
- Plan:
  1. Replace every `listen ... ssl http2` directive with `listen ... ssl` plus a separate `http2 on;` directive in the same TLS server block.
  2. Update generated Docker-deploy nginx config and checked-in systemd/static-site templates together to avoid config drift.
  3. Add a source-level infra test that rejects `listen ... http2` in deploy/script/static nginx sources and requires `http2 on;`.
- Progress: [x] Implemented in existing cycle-3 commit `b2edee07`.

### A2. Enforce Local Deploy Profile Permissions Before Sourcing
- Findings: C3-2.
- Original severity/confidence: Medium, High.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-security.test.ts`.
- Plan:
  1. Add a helper for local deploy env profiles that `chmod 600`s the file before `source`.
  2. Use the helper for `.env.deploy` and `.env.deploy.<target>` while preserving the existing caller-override precedence.
  3. Add a static test that pins chmod-before-source ordering for both default and target profiles.
- Progress: [x] Implemented in existing cycle-3 commit `b2edee07`.

### A3. Scope Generated Nginx Body Limits
- Findings: C3-3.
- Original severity/confidence: Medium, High.
- Files: `deploy-docker.sh`, `tests/unit/infra/judge-report-nginx.test.ts`.
- Plan:
  1. Remove the server-block `client_max_body_size 50M;` directives from generated nginx config.
  2. Preserve `client_max_body_size 50M;` only in `location = /api/v1/judge/poll`.
  3. Add a negative regression assertion for server-level broad body limits.
- Progress: [x] Implemented in working tree (2026-06-30): server-level `client_max_body_size 50M;` removed from generated nginx config; negative regression assertion added to `tests/unit/infra/judge-report-nginx.test.ts`.

### A4. Fix Worv Deploy Target Test Guard
- Findings: C3-4.
- Original severity/confidence: Low, High.
- Files: `tests/unit/infra/deploy-storage-safety.test.ts`.
- Plan:
  1. Move the `oj.worv.ai` negative assertion inside the existing `if (worvEnv)` guard.
  2. Keep the positive `test.worv.ai` assertions unchanged.
- Progress: [x] Verified in working tree (2026-07-01): the `oj.worv.ai` negative assertion is already inside `if (worvEnv)`; no code change required.

### A5. Disable Static-Site Directory Listing
- Findings: C3-5.
- Original severity/confidence: High, High.
- Files: `static-site/nginx.conf`, `tests/unit/infra/deploy-security.test.ts` or a new focused infra test.
- Plan:
  1. Change `autoindex on;` to `autoindex off;` or remove the directive.
  2. Add a static regression test rejecting `autoindex on` in static-site nginx config.
- Progress: [x] Implemented in working tree (2026-06-30): `autoindex on;` changed to `autoindex off;` in `static-site/nginx.conf`; static regression test added to `tests/unit/infra/deploy-security.test.ts`.

### A6. Validate Compiler Commands Before Rust Runner Delegation
- Findings: C3-6.
- Original severity/confidence: Medium, High.
- Files: `src/lib/compiler/execute.ts`, `tests/unit/compiler/execute.test.ts`.
- Plan:
  1. Move Docker image, source-size, compile-command, and run-command validation before `tryRustRunner`.
  2. Preserve current error shapes (`Invalid Docker image reference`, `Source code exceeds...`, `Invalid compile command`, `Invalid run command`).
  3. Add a regression test with `COMPILER_RUNNER_URL` configured that proves invalid commands are rejected before `fetch`.
- Progress: [x] Implemented in working tree (2026-06-30): Docker image, source-size, compile-command, and run-command validation moved before `tryRustRunner`; regression test added to `tests/unit/compiler/execute.test.ts`.

### A7. Refuse `X-Real-IP` Fallback When `X-Forwarded-For` Was Present But Untrusted
- Findings: C3-7.
- Original severity/confidence: High, High.
- Files: `src/lib/security/ip.ts`, `tests/unit/security/ip.test.ts`.
- Plan:
  1. Change `extractClientIp` so `X-Real-IP` is accepted only when `X-Forwarded-For` is absent.
  2. Update/replace the existing test that currently expects fallback with both headers under `TRUSTED_PROXY_HOPS=0`.
  3. Add a specific malformed/too-short XFF regression with spoofed `X-Real-IP`.
- Progress: [x] Implemented in working tree (2026-06-30): `extractClientIp` now accepts `X-Real-IP` only when `X-Forwarded-For` is absent; existing fallback test updated and a new malformed/too-short XFF regression test added to `tests/unit/security/ip.test.ts`.

### A8. Add Code-Scoped Contest Join Rate Limit
- Findings: C3-8.
- Original severity/confidence: High, Medium.
- Files: `src/app/api/v1/contests/join/route.ts`, `tests/unit/api/contests.route.test.ts`.
- Plan:
  1. On failed access-code redemption, consume an additional DB-backed API rate-limit bucket scoped to the normalized code and user id, so distributed IPs cannot brute-force a single code for free.
  2. Avoid rate-limiting successful redemption or already-enrolled success paths.
  3. Add a route test that invalid access-code attempts call the scoped limiter and return 429 when that limiter blocks.
- Progress: [x] Implemented in working tree (2026-06-30): on failed access-code redemption, the route now consumes additional DB-backed rate-limit buckets scoped to the user (`contest:join:invalid`) and the normalized code (`contest:join:invalid-code`); a 429 path is tested in `tests/unit/api/contests.route.test.ts`.

### A9. Validate TA/Instructor Capability Mismatch Claims
- Findings: C3-9.
- Original severity/confidence: High, Medium.
- Files: cited route guards for similarity, announcements, clarifications, exam-session extension, and capability defaults.
- Plan:
  1. Validate the specific reviewer claims against current route tests and role-helper tests.
  2. If a guard is confirmed inconsistent with declared capabilities, align the route guard or remove the dead capability in the same commit with regression tests.
  3. If a claim is disproven or intentionally policy-bound, record the evidence in this plan rather than changing behavior.
- Progress: [x] Validated (2026-06-30).
  - Similarity-check: already aligned in working tree — assistants with `anti_cheat.run_similarity` who are group TAs or assigned to the group can run the scan (`src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`); regression test added in `tests/unit/api/similarity-check.route.test.ts`.
  - Announcements / clarifications: write access remains behind `canManageContest` (instructor/admin) by design; there is no `contests.manage_announcements` or `contests.manage_clarifications` capability in `src/lib/capabilities/types.ts`, so the assistant-reviewer/instructor-reviewer claim of a mismatch is a product-roadmap gap, not an active code defect.
  - Exam-session extension: write access is gated by `canManageGroupResourcesAsync`, which allows owners, co-instructors, and global group managers; TAs are intentionally excluded from time-changing operations. This is consistent with the narrower `canManageGroupMembersAsync` helper and the durable audit requirement.
  - No route guard was changed because no declared capability currently exists for these actions and changing TA permissions is a policy decision outside this hardening cycle.

### A10. Storage and Deploy Verification
- Findings: user-injected storage/deploy TODO, C3 non-findings.
- Files: `deploy-docker.sh`, `tests/unit/infra/deploy-storage-safety.test.ts`, remote deploy output.
- Plan:
  1. Before the per-cycle deploy, verify the deploy script still has DockerRootDir-aware storage preflight and safe cleanup only.
  2. Confirm no automated path contains `docker volume prune`, `docker system prune --volumes`, or `docker image prune -af`.
  3. Run every configured gate before deploying.
  4. Run the exact per-cycle deploy command once after commits/gates, using `DEPLOY_TARGET=algo`, `DEPLOY_TARGET=worv`, and `DEPLOY_TARGET=auraedu` only.
- Progress: [x] Verified in working tree (2026-07-01): `deploy-storage-safety.test.ts` asserts no destructive prune commands in `deploy-docker.sh`, `deploy.sh`, `scripts/docker-disk-cleanup.sh`, or `scripts/rebuild-worker-language-images.sh`; DockerRootDir preflight checks are present; the per-cycle deploy command will be run after gates pass.

### A11. Fix CI E2E SQLite Cleanup Mismatch
- Findings: QA-tester CRITICAL — `.github/workflows/ci.yml` resets SQLite while the Playwright layer expects Postgres.
- Original severity/confidence: CRITICAL, High.
- Files: `.github/workflows/ci.yml`, `playwright.config.ts`, `scripts/playwright-local-webserver.sh`.
- Plan:
  1. Remove the `Reset SQLite database` step from the `e2e` job; the local webserver path already sets up Postgres.
  2. Ensure `DATABASE_URL` is exported explicitly or is clearly inherited from `playwright.config.ts` defaults.
  3. Keep the schema/seed/language-sync steps because the webserver script is responsible for container lifecycle, not data lifecycle.
- Progress: [x] Implemented in working tree (2026-07-01): removed the `Reset SQLite database` step from `.github/workflows/ci.yml`; `playwright.config.ts` already defaults `DATABASE_URL` to Postgres and passes it to the webServer command.

## Deferred Register

Deferred items below are non-security/non-correctness product, performance, accessibility, or documentation work. Security/correctness/data-loss items are either scheduled in Phase A or rejected with evidence in the next section.

- **C3-10 / perf F1-F16**: performance hotspots in realtime/homepage/leaderboard paths. Original severity/confidence: High-to-Low, mostly confirmed; citations include `src/lib/realtime/realtime-coordination.ts:75`, `src/lib/homepage-insights.ts:17`, `src/lib/assignments/leaderboard.ts:21,61,74`, `src/app/api/v1/submissions/[id]/events/route.ts`, and `judge-worker-rs/src/docker.rs`. Reason: performance tuning touches shared contest/realtime behavior and needs load-test validation beyond this security/deploy cycle. Exit criterion: next performance cycle with query-count and SSE-concurrency benchmarks.
- **C3-11 / designer H1-H4 and related UI findings**: accessibility defects in navigation, contrast, signup live-region feedback, and recruiting login error hint. Original severity/confidence: High/Medium (static review; browser runtime blocked). Citations are in `.context/reviews/designer.md` for the affected TSX/CSS regions. Reason: user-facing UI changes need browser verification and locale checks; current cycle is focused on deploy/security correctness. Exit criterion: UI/a11y cycle with Playwright or agent-browser runtime available and WCAG assertions added.
- **C3-12 / document-specialist language drift**: language docs/AGENTS/README drift against `src/lib/judge/languages.ts`. Original severity/confidence: Medium/High; citations in `.context/reviews/document-specialist.md`. Reason: docs sync may touch large generated language tables and should be reconciled with the language source-of-truth script. Exit criterion: run the language docs sync/reconciliation path and confirm `docs/languages.md`, AGENTS language rows, and README image tables agree.
- **QA-tester HIGH findings (judge-dependent E2E assertions skipped, inconsistent auth fixtures, empty known-failing registry)**: Original severity/confidence: HIGH, High/Medium. Citations: `tests/e2e/contest-full-lifecycle.spec.ts`, `tests/e2e/student-submission-flow.spec.ts`, `tests/e2e/function-judging.spec.ts`, `tests/e2e/all-languages-judge.spec.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/support/runtime-admin.ts`. Reason: these require a dedicated judge worker in CI or a broader E2E fixturing refactor that is beyond the current security/deploy hardening cycle. Exit criterion: a follow-up test-hardening cycle that either (a) starts a mock or real judge worker in the E2E job and converts skipped verdict assertions to hard assertions, or (b) moves judge-dependent specs to a separate `e2e-judge` workflow, plus a fixtures migration audit converting every spec to `fixtures.ts`.
- **QA-tester MEDIUM findings (student-submission-flow accepts 409, contest-system accepts 500, hardcoded baseURL, mobile-layout seeded credentials, missing E2E coverage, responsive-layout skip, local webserver db:push, limited data-testid, debug-contest-errors not wired, function/output-only beforeAll skip)**: Original severity/confidence: MEDIUM, High/Medium. Reason: individual test-quality improvements that should be batch-addressed in the same follow-up test-hardening cycle rather than piecemeal in a deploy-security cycle. Exit criterion: E2E test-hardening cycle with at least one commit per category and CI E2E logs showing the targeted tests run against the intended database and worker state.
- **Roadmap feature gaps from instructor/assistant/applicant/student/admin reviewers**: special judge, editor dry-run, direct messaging, editorials, TA workload metrics, regrade requests, side-by-side similarity UI, candidate post-assessment feedback, and autosave/end-ceremony UX. Original severity/confidence preserved in their review files. Reason: these are feature/product roadmap gaps, not regressions in the current hardening work. Exit criterion: product planning converts each accepted feature into its own scoped plan with UX/API/data-model tests.

## Rejected / Not-New Register

- **Judge IP allowlist allow-all default** (`src/lib/judge/ip-allowlist.ts:182-210`, security-reviewer High/High): not accepted as a cycle-3 defect because `AGENTS.md` explicitly documents the current opt-in matrix: unset `JUDGE_ALLOWED_IPS` allows all with a loud warning, while `JUDGE_STRICT_IP_ALLOWLIST=1` fails closed. Re-open only if repo policy changes to fail-closed by default.
- **`AUTH_TRUST_HOST=true` default** (`docker-compose.production.yml:106`, security-reviewer High/Medium): not accepted as a code defect because `docs/deployment.md` says `AUTH_TRUST_HOST=true` is required behind a reverse proxy and does not bypass JudgeKit's auth-route host allowlist. Re-open only if host allowlist validation is removed or reverse-proxy deployment no longer requires the Auth.js trust setting.
- **Admin restore/import `preRestoreSnapshotPath` response** (`src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, security-reviewer Medium/Medium): not accepted as an info-disclosure bug because the route is gated by `system.backup`, code comments and tests intentionally surface the rollback artifact path to the operator, and audit logs retain the path. Re-open if the response becomes visible to non-backup operators or if a safer operator token/retrieval mechanism is designed.
- **`minPasswordLength` ignored** (`src/lib/db/schema.pg.ts:591`, architect Medium/High): accepted as stale-setting debt but not wired into validation because `AGENTS.md` mandates exactly `FIXED_MIN_PASSWORD_LENGTH = 8` and no policy changes without explicit approval. Re-open as a settings-cleanup task to remove/deprecate the admin knob, not to change password validation behavior.
- **Default-language inline SQL repair DR break** (`deploy-docker.sh:1261-1262`, architect/tracer Critical/High): rejected as stated because `drizzle/pg/0007_clumsy_obadiah_stane.sql` and migration snapshots already contain both `default_language` columns. The deploy repair block is redundant debt, not a missing-journal disaster-recovery break. Re-open only as deploy-script simplification after verifying all production DBs carry the columns.

## Phase B - Progress Tracking

- [x] A1 nginx HTTP/2 syntax modernized.
- [x] A2 local deploy profile permission hardening implemented.
- [x] A3 generated nginx body limit scoped.
- [x] A4 Worv target test guard verified (already inside `if (worvEnv)`).
- [x] A5 static-site directory listing disabled.
- [x] A6 compiler command validation moved before Rust runner.
- [x] A7 trusted-proxy fallback fixed.
- [x] A8 contest join scoped rate limit added.
- [x] A9 TA/instructor capability claims validated (similarity-check aligned; announcements/clarifications/exam-extension remain instructor/co-instructor gated by design).
- [x] A10 storage/no-volume-prune contract verified before deploy.
- [x] A11 CI E2E SQLite reset step removed.
- Gates: [x] lint, lint:bash, tsc, test:unit, cargo test, db:check passed; build/e2e/deploy pending.
- Commits: [x] existing cycle-3 commits `429f27af`, `b2edee07`, `20c9e3c4`; [ ] new commits pending build/e2e result.
- Deploy: [ ] pending.
