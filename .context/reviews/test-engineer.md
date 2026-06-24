# Test Engineer Review - review-plan-fix cycle 2 prompt 1

## Inventory

Reviewed the dirty-tree inventory from `git status --short` and `git diff --stat`.
Review-relevant changes are concentrated in these areas:

- Quality gates and E2E setup: `playwright.config.ts`, `scripts/playwright-local-webserver.sh`, `.github/workflows/ci.yml`, `tests/e2e/function-judging-responsive.spec.ts`, `tests/unit/infra/playwright-profiles.test.ts`, `deploy-docker.sh`, `tests/unit/infra/deploy-security.test.ts`.
- Security/auth and password policy: `src/lib/security/password.ts`, `src/app/api/v1/auth/reset-password/route.ts`, `src/lib/actions/public-signup.ts`, `src/lib/actions/user-management.ts`, `src/lib/auth/trusted-host.ts`, `docs/authentication.md`, related unit tests.
- Backup/import/export and plugin secrets: `src/lib/db/export.ts`, `src/lib/db/export-with-files.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/lib/plugins/secrets.ts`, related unit/API tests.
- Judge/compiler/runtime limits: `judge-worker-rs/src/executor.rs`, `judge-worker-rs/src/validation.rs`, `src/lib/compiler/execute.ts`, `src/lib/validators/api.ts`, related Rust/Vitest tests.
- Problem import/management: `src/app/api/v1/problems/import/route.ts`, `src/lib/problem-management.ts`, related validator/action tests.
- UI/i18n and language admin pages: language pages/table components, `messages/en.json`, `messages/ko.json`, related unit/E2E tests.
- Realtime and Docker client: `src/lib/realtime/realtime-coordination.ts`, `src/lib/docker/client.ts`, related unit tests.

Findings count: 7

## Findings

### 1. CI still does not run Playwright E2E, despite changed Playwright/UI behavior

- Type: quality-gate gap, missing E2E coverage
- Status: confirmed
- Confidence: High
- Evidence: `AGENTS.md:450` requires tests for every feature/fix and `AGENTS.md:525` makes E2E testing mandatory for user-facing features. The CI quality job runs unit coverage, component, integration, harness, Rust tests, audit, build, and Docker checks in `.github/workflows/ci.yml:78-119`, but there is no `npm run test:e2e` / `playwright test` step. The dirty tree changes `playwright.config.ts` and `tests/e2e/function-judging-responsive.spec.ts`, so the changed E2E surface is not gated.
- Failure scenario: a responsive regression in the function-judging UI or a broken Playwright profile can pass PR CI because only Vitest/source checks run. The first time it is caught is a manual post-deploy E2E run, which is after the gate that should have blocked the change.
- Suggested fix: add a CI Playwright job or a smoke E2E job using the configured local webServer. If the full suite is too expensive, gate at least `PLAYWRIGHT_PROFILE=smoke npm run test:e2e` and schedule/full-run the complete suite separately.

### 2. Remote smoke silently drops authenticated smoke specs when credentials are missing

- Type: flaky Playwright setup, false-green smoke
- Status: confirmed
- Confidence: High
- Evidence: `playwright.config.ts:24-39` defines the authenticated remote smoke list, including admin/auth/contest/rankings specs. `playwright.config.ts:41-52` removes those specs for `remoteSafeSpecsWithoutAuth`. `playwright.config.ts:62-70` selects that reduced list whenever `PLAYWRIGHT_BASE_URL` is set and `E2E_PASSWORD` is absent or equals `skip-login`.
- Failure scenario: a post-deploy smoke run with `PLAYWRIGHT_BASE_URL` but missing `E2E_PASSWORD` exits green while skipping the admin language, worker, auth flow, contest access, contest nav, and rankings checks. That masks broken login/admin behavior behind a successful smoke label.
- Suggested fix: fail fast for `PLAYWRIGHT_PROFILE=smoke` remote runs when credentials are required, or require an explicit `PLAYWRIGHT_PROFILE=public-smoke` for the unauthenticated subset. Add a profile test that asserts missing credentials produce an intentional failure or an explicit public-only profile.

### 3. Compiler workspace permission tests are source-grep false positives

- Type: false-positive test, inadequate assertions
- Status: confirmed
- Confidence: High
- Evidence: the changed behavior in `src/lib/compiler/execute.ts:724-746` creates a workspace, chmods it, chowns the workspace/source to `65534:65534`, and falls back to broad permissions. The regression test in `tests/unit/compiler/execute-implementation.test.ts:6-14` only checks that source strings are present. The behavioral `executeCompilerRun` tests in `tests/unit/compiler/execute.test.ts:81-145` stop at command validation or runner config failures, so they never reach the local Docker fallback workspace branch.
- Failure scenario: the chown/chmod calls could be moved after `runDocker`, skipped under a condition, or applied to the wrong path while the source-grep test still passes. Local fallback would then fail under the non-root sandbox user only in manual Docker execution.
- Suggested fix: add a behavioral unit test that mocks `fs/promises`, `child_process.spawn`, and Docker inspect/cleanup, calls `executeCompilerRun()` through the local fallback path, and asserts the exact order and target paths for `mkdir`, `mkdtemp`, `writeFile`, `chown`, `chmod`, and the Docker run invocation.

### 4. Full-fidelity plugin export encryption is not behavior-tested

- Type: false-positive test, missing coverage for changed backup behavior
- Status: confirmed
- Confidence: High
- Evidence: `src/lib/db/export.ts:139-143` is the only export path that calls `normalizeExportValue()` for each row/column, and `src/lib/plugins/secrets.ts:103-129` contains the helper that encrypts plugin secret fields. The new test in `tests/unit/db/export-sanitization.test.ts:200-206` only greps `src/lib/db/export.ts` for three strings. `tests/unit/plugins.secrets.test.ts:95-107` proves the helper works in isolation, but not that `streamDatabaseExport()` applies it to plugin rows.
- Failure scenario: a table-name mismatch, column-name mismatch, redaction-map change, or future refactor could export raw plaintext plugin API keys in full-fidelity backups while all current tests still pass because the strings remain in the source file.
- Suggested fix: add a behavior test around `streamDatabaseExport()` with a mocked transaction returning a `plugins` row containing plaintext `config.openaiApiKey`; consume the stream and assert the exported JSON contains an `enc:v1:` value that decrypts to the original secret. Also assert sanitized exports null `plugins.config`.

### 5. Trusted-host production fail-closed branches have no production-mode tests

- Type: missing security regression tests
- Status: confirmed
- Confidence: High
- Evidence: production-only branches in `src/lib/auth/trusted-host.ts:14-27` reject a missing host header and reject an empty trusted-host set. Current tests assert the development fallbacks instead: empty trusted host set returns `null` in `tests/unit/auth/trusted-host.test.ts:28-34`, and missing host returns `null` in `tests/unit/auth/trusted-host.test.ts:53-59`. These tests do not stub `NODE_ENV=production`.
- Failure scenario: a regression that allows all hosts in production when no trusted hosts are configured would not fail the current unit suite, because the existing tests only pin the non-production behavior.
- Suggested fix: add `vi.stubEnv("NODE_ENV", "production")` cases that assert `MissingHostHeader` returns 400 and `NoTrustedHostsConfigured` returns 500, plus separate development-mode tests for the permissive fallback.

### 6. Problem import route changes only have schema tests, not API handler tests

- Type: missing API/mock coverage
- Status: likely
- Confidence: Medium
- Evidence: the changed API route wires validation, capability checks, and persistence mapping in `src/app/api/v1/problems/import/route.ts:63-101`. The added coverage in `tests/unit/validators/problem-import.test.ts:50-136` imports `problemImportSchema` and calls `safeParse()` only. It does not exercise `POST`, `createApiHandler`, `resolveCapabilities`, or the `createProblemWithTestCases()` payload.
- Failure scenario: the schema can reject empty expected outputs and too many test cases, but the route could still regress by bypassing the schema, returning the wrong status, allowing a role without `problems.create`, or mapping defaults/test cases incorrectly, and these tests would stay green.
- Suggested fix: add `tests/unit/api/problems-import.route.test.ts` with mocked auth/capabilities and `createProblemWithTestCases()`. Cover 201 happy path, 403 without `problems.create`, 400 invalid `testCases`, and the exact payload passed to persistence.

### 7. Successful ZIP restore path is not tested, leaving an audit/count regression visible in code

- Type: missing API coverage, inadequate assertions
- Status: confirmed
- Confidence: Medium
- Evidence: `src/app/api/v1/admin/restore/route.ts:151-163` records the ZIP restore audit before `restoreParsedBackupFiles()` is called in `src/app/api/v1/admin/restore/route.ts:176-177`, so the ZIP audit summary uses the still-zero `filesRestored` value. The new route coverage only adds rejection coverage for oversized ZIPs in the restore safety tests; it does not cover a successful ZIP restore with uploaded files.
- Failure scenario: a ZIP restore that actually restores files returns the correct response after line 177, but the audit trail says `0 files`. Operators investigating a restore get misleading evidence, and current tests do not catch it because they only assert failure responses.
- Suggested fix: add a successful ZIP restore API test where `parseBackupZip()` returns two staged uploads, `importDatabase()` succeeds, and `restoreParsedBackupFiles()` returns `2`; assert both the response and `recordAuditEvent()` details/summary report the restored count. Move the audit emission after file restoration or log a pending/actual two-step audit.

## Final Missed-Issue Sweep

- Checked for missing tests on changed validation limits, backup ZIP limits, plugin secret encryption, compiler fallback permissions, trusted-host production branches, problem import mapping, and Playwright smoke selection.
- Checked for brittle/source-grep tests. The highest-risk examples are compiler workspace permissions and export plugin encryption.
- Checked quality gates against configured scripts and repo rules. E2E and Bash syntax checking are not represented in CI despite `test:e2e` and `lint:bash` existing and the current dirty tree touching Playwright/deploy code.
- No fixes were implemented and no tests were run; this is a static review of the current dirty repository.
