# Test Engineer Review - Cycle 2

Scope: comprehensive test-engineering review for coverage gaps, flaky tests, TDD opportunities, gate risks, and regression exposure in the current dirty worktree. I reviewed uncommitted changes and did not implement fixes.

## Inventory Built

- Repo rules and gates reviewed: `AGENTS.md`, `CLAUDE.md`, `package.json:10-28`, `vitest.config.ts:10-39`, `vitest.config.integration.ts:10-18`, `vitest.config.component.ts:10-23`, `vitest.config.harness.ts:20-32`, `playwright.config.ts:1-91`, and `.github/workflows/ci.yml:24-330`.
- Test inventory: 501 TypeScript/TSX test-support files under `tests/`, including 486 executable `*.test.ts`, `*.test.tsx`, and `*.spec.ts` files: 362 unit, 76 component, 5 integration, 1 harness, and 42 e2e specs.
- API/gate inventory: 113 `src/app/api/**/route.ts` handlers and 87 API unit test files under `tests/unit/api`.
- Changed surface reviewed: judge claim/poll/rejudge/submission routes, status labels and UI badges, admin submission filters/export, DB env loading, Playwright config, CI workflow, Rust worker verdict/output-limit paths, root Cargo workspace changes, and generated artifact hygiene.
- Existing review provenance checked: current cycle reviews in `.context/reviews/*.md`, especially code-reviewer, critic, verifier, and security-reviewer, to avoid silently missing cross-agent findings.

## Findings

### TST-C2-1 - CI E2E job still cannot provision PostgreSQL before DB gates

- Severity: High
- Confidence: High
- Status: Confirmed gate failure
- Evidence: The `quality` job has a PostgreSQL service and `INTEGRATION_DATABASE_URL` (`.github/workflows/ci.yml:30-52`), but the separate `e2e` job has no `services:` block or `DATABASE_URL` env before it runs `npm run db:push`, `npm run seed`, `npm run languages:sync`, backup verification, build, and Playwright (`.github/workflows/ci.yml:264-319`). The e2e setup still deletes SQLite files in a step named "Reset SQLite database" (`.github/workflows/ci.yml:296-299`), while `drizzle.config.ts:1-10` uses PostgreSQL credentials from `process.env.DATABASE_URL`.
- Failure scenario: A clean GitHub Actions e2e run reaches "Apply database schema" with no PostgreSQL DSN. `drizzle-kit push` fails before browser tests start, so the configured end-to-end gate is red even if app code is otherwise correct.
- Suggested fix/test: Give the `e2e` job a PostgreSQL service and `DATABASE_URL`, or remove the direct DB setup from the job and let `scripts/playwright-local-webserver.sh` own disposable DB setup. Add an infra unit test that parses `.github/workflows/ci.yml` and fails if the e2e job contains direct DB commands without a PostgreSQL service and DSN.

### TST-C2-2 - Playwright judge helpers wait for obsolete terminal statuses

- Severity: High
- Confidence: High
- Status: Confirmed flaky/broken tests
- Evidence: The Rust worker now serializes terminal verdicts as `time_limit_exceeded`, `memory_limit_exceeded`, and `output_limit_exceeded` (`judge-worker-rs/src/types.rs:47-49`). Three Playwright polling helpers still treat only `time_limit` and `memory_limit` as terminal and omit `output_limit_exceeded`: `tests/e2e/all-languages-judge.spec.ts:1058-1065`, `tests/e2e/support/helpers.ts:147-154`, and `tests/e2e/function-judging.spec.ts:135-142`.
- Failure scenario: A TLE, MLE, or OLE submission reaches a final API status. The helper keeps polling until timeout because the status string is not in its terminal set. This can turn a legitimate terminal verdict into a 60-120 second failure, and it explains the carried-over Playwright admin/all-languages failures around status migration.
- Suggested fix/test: Centralize an e2e terminal-status list that includes canonical statuses and optionally accepts legacy aliases only for migration. Add a unit-style test for the e2e helper status set, plus one Playwright fixture that forces TLE/MLE/OLE and asserts the poller returns promptly.

### TST-C2-3 - No regression test covers manual submissions staying out of the judge queue

- Severity: High
- Confidence: High
- Status: Confirmed product bug plus missing coverage
- Evidence: The submission route now sets `const initialStatus = "pending"` for every problem, including manual problems (`src/app/api/v1/submissions/route.ts:328-331`). The same route comments that manual problems need no judge queue checks (`src/app/api/v1/submissions/route.ts:367-382`). Claim SQL explicitly excludes manual problems from worker claims in both worker and no-worker arms (`src/lib/judge/claim-query.ts:46-50`, `src/lib/judge/claim-query.ts:140-144`). The main route test default fixture only asserts auto-style `pending` creation (`tests/unit/api/submissions.route.test.ts:159-208`) and the pending-limit tests do not seed manual pending rows (`tests/unit/api/submissions.route.test.ts:498-529`).
- Failure scenario: A student submits a manual problem. It is inserted as `pending`, no worker can claim it, the UI reports it as in progress forever, and those rows can inflate pending counts for later auto submissions.
- Suggested fix/test: Restore or introduce a non-judge status for manual submissions, then add a route test that submits `problemType: "manual"` and asserts the inserted status is not in `pending/queued/judging`. Add an integration test that a manual submission is not claimable by `buildClaimSql` and does not count against auto pending queue limits.

### TST-C2-4 - Claim cleanup is not tested for malformed claimed rows after mutation

- Severity: High
- Confidence: High
- Status: Confirmed missing coverage on a real failure mode
- Evidence: `src/app/api/v1/judge/claim/route.ts:231-237` parses `claimedRaw` and returns `invalidJudgeClaim` on schema mismatch before `claimedForCleanup` is set. The cleanup helper is used for missing-problem failures (`src/app/api/v1/judge/claim/route.ts:300-306`) and catch-block errors after `claimedForCleanup` exists (`src/app/api/v1/judge/claim/route.ts:403-418`), but not for this parse-error path. Integration tests exercise the raw SQL builder and worker counters (`tests/integration/db/judge-claim-reclaim.test.ts:221-270`), not the route-level Zod parse failure after the DB update.
- Failure scenario: A schema drift or driver type change makes the raw claim return an invalid `submittedAt`, numeric field, or null shape after the SQL has already set `status='queued'`, `judge_claim_token`, and worker ownership. The route returns 422 without releasing the claim or decrementing the worker slot. Existing tests remain green because they never mock `rawQueryOne` to return a malformed claimed row through the route.
- Suggested fix/test: Add a route-level unit test for malformed `claimedRaw` that proves the claim is released when enough identifiers are present, or change the implementation to capture a minimal raw id/token before full parse. Also test that cleanup uses `GREATEST(active_tasks - 1, 0)` and token-matches before reset.

### TST-C2-5 - Diagnostic truncation has no direct regression coverage

- Severity: Medium
- Confidence: High
- Status: Confirmed test gap
- Evidence: Truncation is implemented in `truncateJudgeDiagnostic` with a 16 KiB byte cap and UTF-8 boundary cleanup (`src/lib/judge/verdict.ts:4-28`), then used for per-test actual output (`src/lib/judge/verdict.ts:94-100`) and terminal compile output (`src/app/api/v1/judge/poll/route.ts:142-148`). The poll route test mocks `truncateJudgeDiagnostic` as identity (`tests/unit/api/judge-status-report.route.test.ts:43-49`), and `tests/unit/judge/verdict.test.ts:126-212` covers row mapping but not over-limit output or multibyte boundary behavior.
- Failure scenario: A future refactor removes truncation from `compileOutput`, truncates by UTF-16 code units instead of bytes, or stores broken replacement characters at the byte boundary. The route tests still pass because they replace the helper with an identity function, and the verdict tests do not cover the helper.
- Suggested fix/test: Add pure tests for `truncateJudgeDiagnostic` with ASCII over-limit data, exact-limit data, null/undefined, and multibyte data cut at the boundary. Add a poll route test that uses the real helper or asserts the stored payload is capped for both `compileOutput` and `submissionResults.actualOutput`.

### TST-C2-6 - Rejudge worker-counter behavior has no route-level test

- Severity: Medium
- Confidence: High
- Status: Confirmed test gap
- Evidence: The rejudge route now reads current submission status and worker ownership, resets claim fields, and decrements `judge_workers.active_tasks` when rejudging a queued/judging submission (`src/app/api/v1/submissions/[id]/rejudge/route.ts:36-70`). A search found no direct route test for `src/app/api/v1/submissions/[id]/rejudge/route.ts`; the closest unit check only source-greps capabilities (`tests/unit/api/problem-set-and-submission-capabilities-implementation.test.ts:30-31`), and worker-counter tests focus on claim/poll flows (`tests/unit/api/judge-status-report.route.test.ts:171-232`, `tests/integration/db/judge-claim-reclaim.test.ts:221-270`).
- Failure scenario: A future rejudge refactor resets a claimed submission without decrementing the worker's active task count, or decrements on terminal rows where the worker no longer owns work. The queue appears at capacity until heartbeat/staleness recovery, but existing tests do not exercise the rejudge route.
- Suggested fix/test: Add a route-level unit test with mocked `execTransaction` for queued, judging, pending, and terminal submissions. Assert claimed queued/judging rows decrement exactly once, terminal/pending rows do not, claim fields are cleared, previous results are deleted, and leaderboard cache invalidation remains fire-and-forget.

### TST-C2-7 - Status filter/export tests do not enforce the canonical status catalog

- Severity: Medium
- Confidence: High
- Status: Confirmed coverage gap
- Evidence: Public submissions filters include only accepted, wrong_answer, TLE, MLE, runtime, and compile errors (`src/app/(public)/submissions/page.tsx:39-43`). Admin submissions filters add pending/queued/judging but still omit `output_limit_exceeded`, `internal_error`, and `cancelled` (`src/app/(dashboard)/dashboard/admin/submissions/page.tsx:44-55`). Admin CSV export omits the same statuses (`src/app/api/v1/admin/submissions/export/route.ts:8-18`). Canonical statuses exist in `src/lib/security/constants.ts:54-63` and component coverage only shows one local mapping for OLE in an assignment board fixture (`tests/component/assignment-status-board.test.tsx:58`).
- Failure scenario: Production accumulates `output_limit_exceeded`, `internal_error`, or `cancelled` submissions. Admins cannot filter or export them by status, and no current test fails because each surface hand-maintains its own smaller list.
- Suggested fix/test: Export a single canonical filterable-status list or add tests that compare public/admin/export status lists against `SUBMISSION_STATUSES` with documented exclusions. Include OLE/internal/cancelled cases in page/component tests and CSV route tests.

### TST-C2-8 - Root Cargo workspace artifacts are not ignored or covered by hygiene gates

- Severity: Low
- Confidence: High
- Status: Confirmed test hygiene issue
- Evidence: A root workspace was added at `Cargo.toml:1-12`, which causes `cargo test` and `cargo audit` from the repo root to create `target/`. `.gitignore` only ignores `judge-worker-rs/target/` and `rate-limiter-rs/target/` under its Rust section (`.gitignore:68-70`), while `git status --short --untracked-files=all` now reports root `target/...` artifacts and `code-similarity-rs/target/`. `.dockerignore` was updated for several target paths and `._*` (`.dockerignore:15-20`), but source-control hygiene remains uncovered.
- Failure scenario: Repository-wide searches, review inventories, and accidental commits get polluted by generated Rust dependency files. This already happened during this review when an unrestricted `rg` matched thousands of `target/debug/deps/*.d` paths before narrowing to source roots.
- Suggested fix/test: Ignore `/target/`, `code-similarity-rs/target/`, and macOS `._*` artifacts in `.gitignore`. Add a lightweight hygiene check that fails if `git status --porcelain --untracked-files=all` contains known build-artifact directories after the configured gates.

## Final Missed-Issues Sweep

- Rechecked all configured test layers: unit coverage, component, integration, harness, Playwright, Rust crate tests, cargo audit, npm audit, Dockerfile checks, compose validation, script syntax checks, backup verification, DB push/seed/language sync, and full Playwright.
- Searched for stale status strings, skipped tests, source-grep-only tests, route handlers with no route-level tests, output truncation paths, manual problem lifecycle, worker counter drift, and generated-artifact pollution.
- Verified adjacent tests before filing each gap so findings are not just "no test exists" claims; the cited tests either miss the behavior, mock it away, or assert only source shape.
- Did not run the full gate suite because this prompt explicitly requested review only and no implementation.
