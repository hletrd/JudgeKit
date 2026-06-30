# QA and Interactive Testing Review

Date: 2026-06-30
Scope: entire repository
Summary: The E2E/Playwright layer is broad but uneven. Critical judge-dependent flows are gated behind runtime worker availability and will silently skip in CI, while the CI E2E job itself is mis-wired to a non-existent SQLite database. Fixturing is inconsistent (some specs use env credentials, some use DB-injected runtime admin), and several specs accept 5xx-class responses as valid outcomes. Coverage gaps remain in email flows, file uploads, real-time anti-cheat browser events, and mobile interaction beyond layout.

Findings count: 14

## CRITICAL: CI E2E job resets SQLite but the app serves Postgres
- **File**: `.github/workflows/ci.yml` (lines 296-314)
- **Problem**: The `e2e` job runs `rm -f data/judge.db*` (SQLite cleanup), then `npm run db:push`, `npm run seed`, and `npm run languages:sync` against the default `DATABASE_URL`. Neither `DATABASE_URL` nor `JUDGEKIT_HOST_DATABASE_URL` is exported in this job, while `playwright.config.ts` expects Postgres on port 55432 and `scripts/playwright-local-webserver.sh` starts its own Postgres container. The SQLite reset is therefore a no-op for the actual database, and if the local webserver path is taken it will create a fresh container anyway; if the app falls back to any other configured database the seed data lands in the wrong place.
- **Failure scenario**: CI passes but the E2E suite is exercised against an unseeded or differently configured Postgres instance; local failures cannot be reproduced because the data setup path is different. This undermines the value of the entire E2E gate.
- **Suggested fix**: Make the CI E2E job consistent with the local webserver path: either (1) start a Postgres service in CI on port 55432, export `DATABASE_URL`, and remove the SQLite cleanup; or (2) run the full `scripts/playwright-local-webserver.sh` which already handles DB, schema, seed, and build. Add an assertion that the seeded admin user exists before Playwright starts.
- **Cross-references**: `playwright.config.ts:12`, `scripts/playwright-local-webserver.sh:12-103`

## HIGH: Judge-dependent E2E assertions are skipped when no worker is online
- **File**: `tests/e2e/contest-full-lifecycle.spec.ts` (lines 297, 319, 378, 399), `tests/e2e/student-submission-flow.spec.ts` (line 183), `tests/e2e/function-judging.spec.ts` (lines 206, 252, 275), `tests/e2e/all-languages-judge.spec.ts` (line 1137), `tests/e2e/output-only-languages.spec.ts` (line 110)
- **Problem**: The core value of these specs — verifying that submissions actually judge to the expected terminal verdict — is wrapped in `test.skip(!(await hasOnlineJudgeWorker(...)), ...)`. The CI E2E job never starts a judge worker, so these tests will skip their verdict assertions and report success without exercising the judge path.
- **Failure scenario**: A regression in the judge adapter, submission queue, or worker registration goes undetected in CI because the relevant assertions are skipped. The suite appears green while the production judge flow is broken.
- **Suggested fix**: Either start a judge worker in the CI E2E job (e.g., register a mock worker or run the worker service against the test DB), or move these tests to a separate `e2e-judge` workflow that has a worker. Do not rely on unconditional skips for critical paths.
- **Cross-references**: `.github/workflows/ci.yml:318-319`, `src/app/api/v1/judge/register/route.ts`

## HIGH: Inconsistent authentication fixtures between specs
- **File**: `tests/e2e/fixtures.ts`, `tests/e2e/support/runtime-admin.ts`, `tests/e2e/support/helpers.ts`, `tests/e2e/contest-full-lifecycle.spec.ts` (lines 44-71), `tests/e2e/student-submission-flow.spec.ts` (lines 41-52), `tests/e2e/all-languages-judge.spec.ts` (lines 1020-1030), `tests/e2e/output-only-languages.spec.ts` (lines 38-48)
- **Problem**: Some specs import `{ test } from "./fixtures"` and use a DB-injected runtime admin; many others import `@playwright/test` directly and rely on `DEFAULT_CREDENTIALS` from `E2E_USERNAME`/`E2E_PASSWORD`. This means local runs use `pwadmin_runtime` while remote runs use a different account, and many specs re-implement the same `loginAsAdmin`/`apiPost`/`apiGet` helpers inline.
- **Failure scenario**: A spec passes locally against the seeded runtime admin but fails remotely because the remote account has a different role or `mustChangePassword` state. Maintenance is duplicated across files; auth changes require editing N helpers.
- **Suggested fix**: Migrate every spec to the `fixtures.ts` runtime-admin fixture. Extract the common `apiPost`/`apiGet` wrappers into `support/helpers.ts` and delete the per-file duplicates.
- **Cross-references**: `tests/e2e/auth-flow.spec.ts`, `tests/e2e/admin-users.spec.ts`, `tests/e2e/problem-management.spec.ts`

## HIGH: `all-languages-judge.spec.ts` accepts 114 language verdicts but has no known-failing registry
- **File**: `tests/e2e/all-languages-judge.spec.ts` (lines 1083-1085, 1219-1273)
- **Problem**: `KNOWN_FAILING` is an empty Set, so every language is expected to pass. The spec pre-submits all languages in `beforeAll`, then each language test asserts `accepted`. Individual failures are captured with `expect.soft` and swallowed by a catch block that turns the failure into a soft assertion. There is no mechanism to mark a newly broken language as expected-to-fail without editing the spec.
- **Failure scenario**: When a language image or harness regresses, the test still reports a soft failure for that language but the overall file may pass; over time the "all languages pass" invariant is silently degraded. The empty `KNOWN_FAILING` set also does not match reality for esoteric languages that may lack images in some environments.
- **Suggested fix**: Populate `KNOWN_FAILING` from an environment-specific allowlist (or query `/api/v1/admin/languages` for enabled languages) and convert unexpected failures to hard failures. Keep the `test.fixme` path for languages with open issues.
- **Cross-references**: `src/lib/judge/languages.ts`, `tests/harness/adapters-smoke.test.ts`

## MEDIUM: `student-submission-flow.spec.ts` accepts assignment-context failure as success
- **File**: `tests/e2e/student-submission-flow.spec.ts` (lines 150-176)
- **Problem**: The test posts a submission and explicitly accepts status `409` with `error === "assignmentContextRequired"` as a valid outcome, then skips the rest of the flow. This means the test does not actually verify that a student can submit code to a practice problem and view a result.
- **Failure scenario**: The "student submission flow" spec passes even though the core user journey (create problem → student submits → poll result → view detail) is broken. This is the most important student path and it is not validated end-to-end.
- **Suggested fix**: Create a public practice problem and assert the submission returns 201 and reaches a terminal verdict (skipping only when no judge worker is available). Do not treat `assignmentContextRequired` as an acceptable outcome for a practice submission.
- **Cross-references**: `src/app/api/v1/submissions/route.ts`, `src/lib/assignments/submissions.ts`

## MEDIUM: `contest-system.spec.ts` accepts 500 as a valid response
- **File**: `tests/e2e/contest-system.spec.ts` (line 172)
- **Problem**: The "leaderboard returns error for non-existent contest" test expects either 404 or 500. Accepting a 500 response for a simple "not found" lookup masks real bugs and normalizes server errors.
- **Failure scenario**: A regression that causes the leaderboard route to throw an unhandled exception is hidden because 500 is already in the allowed set.
- **Suggested fix**: Assert exactly 404 for a non-existent contest after authentication. If the route currently returns 500, fix the route and then tighten the assertion.
- **Cross-references**: `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts`

## MEDIUM: Hardcoded baseURL bypass in several specs
- **File**: `tests/e2e/all-languages-judge.spec.ts` (lines 1021-1051), `tests/e2e/output-only-languages.spec.ts` (lines 39-69), `tests/e2e/debug-contest-errors.spec.ts` (lines 3-47)
- **Problem**: These specs construct URLs with `BASE_URL` and `ctx.request.post(\`${BASE_URL}${path}\`)` instead of relying on the Playwright `baseURL` configured in `playwright.config.ts`. When `PLAYWRIGHT_BASE_URL` is unset they fall back to `http://localhost:3110`, but this duplicates config and can cause mismatches if the config baseURL is overridden (e.g., the local webserver sets it implicitly).
- **Failure scenario**: Running with a custom `PLAYWRIGHT_BASE_URL` via the Playwright config works for page navigations but API requests in these specs still hit the hardcoded `BASE_URL`, leading to requests against the wrong server.
- **Suggested fix**: Use relative paths and Playwright's request context, which already respects `baseURL`. Remove the `BASE_URL`-based URL building in these specs.
- **Cross-references**: `playwright.config.ts:84`, `tests/e2e/support/constants.ts:6`

## MEDIUM: Mobile-layout spec uses hardcoded seeded admin credentials instead of fixtures
- **File**: `tests/e2e/mobile-layout.spec.ts` (lines 30-44, 70-90)
- **Problem**: The spec logs in as `admin`/`admin123` directly, ignoring the runtime-admin fixture. This is brittle: the seeded admin may require password change in some environments, and the credentials may not match the remote test account.
- **Failure scenario**: The test fails on first run after seed because the admin must change password, or fails remotely because `admin` does not exist.
- **Suggested fix**: Use the `runtimeAdminPage` fixture or `loginAsRuntimeAdmin` helper, which already handle the forced password-change flow.
- **Cross-references**: `tests/e2e/support/runtime-admin.ts:100-139`

## MEDIUM: No E2E coverage for email-based auth flows, file uploads, or real-time anti-cheat browser events
- **File**: `tests/e2e/` (overall)
- **Problem**: There are no specs for forgot-password → email → reset-password, file upload/management in the admin UI, or anti-cheat client events emitted from the browser during an exam. These are high-risk user journeys for an online judge.
- **Failure scenario**: A regression in the password-reset email flow, the file upload validation/size limit, or the anti-cheat event collection breaks without E2E detection.
- **Suggested fix**: Add at least smoke-level coverage for (1) password-reset request and token validation, (2) admin file upload with oversized/invalid-type rejection, and (3) anti-cheat event emission from a student exam session and visibility in the admin dashboard. Use API-only or mocked-email approaches where full SMTP is impractical.
- **Cross-references**: `src/app/(auth)/forgot-password/`, `src/app/(dashboard)/dashboard/admin/files/`, `src/components/exam/anti-cheat-monitor.tsx`

## MEDIUM: `responsive-layout.spec.ts` skips 404 double-chrome test unconditionally
- **File**: `tests/e2e/responsive-layout.spec.ts` (line 323)
- **Problem**: The 404 page layout assertion is skipped with `test.skip(shouldSkip404, "404 double-chrome fix not yet deployed to production")`. The skip condition should be tied to the actual environment, but leaving a permanent skip for a known bug means the bug is not tracked as `test.fixme` and may be forgotten.
- **Failure scenario**: The 404 page continues to render double chrome in production indefinitely because the test is skipped instead of failing or being marked as a tracked fixme.
- **Suggested fix**: Convert to `test.fixme` with a linked issue, or remove the skip once the fix is verified. If environment-specific, compute the condition from the actual deployment tag rather than a hardcoded assumption.
- **Cross-references**: `src/app/not-found.tsx`, `src/app/(public)/not-found.tsx`

## MEDIUM: Local webserver uses `db:push` instead of migration-run
- **File**: `scripts/playwright-local-webserver.sh` (lines 83-85)
- **Problem**: The script runs `npm run db:push` to set up the test database. `db:push` applies the schema directly and can diverge from the committed migration chain. The production path uses `npm run db:migrate`.
- **Failure scenario**: A migration that requires data transformation or depends on sequential migration files works in local E2E (push) but fails in production/staging (migrate), leading to false confidence.
- **Suggested fix**: Run `npm run db:migrate` in the local webserver script, or run both and assert schema parity. Ensure the test DB is dropped/recreated before migrate to keep tests hermetic.
- **Cross-references**: `package.json:19`, `src/lib/db/migrate.ts`

## LOW: Limited `data-testid` surface makes selectors brittle
- **File**: `src/app/(dashboard)/dashboard/admin/users/` (e.g., `user-actions.tsx`), `src/components/` (overall)
- **Problem**: Only ~9 `data-testid` attributes exist across the source tree. E2E specs rely heavily on text/role selectors (`getByRole("button", { name: /Change Password|비밀번호 변경/ })`) and substring matching of body text, which is fragile when copy changes or i18n keys are updated.
- **Failure scenario**: A harmless Korean copy update causes multiple E2E specs to fail because the regex no longer matches. Test maintenance cost increases and failures become noisy.
- **Suggested fix**: Add stable `data-testid` attributes to key interactive elements (login form, submit button, test-case rows, user toggle, delete confirm) and prefer them in E2E selectors. Keep text selectors for copy-related assertions only.
- **Cross-references**: `tests/e2e/task12-destructive-actions.spec.ts:167-178`, `tests/e2e/support/helpers.ts:30`

## LOW: `debug-contest-errors.spec.ts` is not wired into the suite
- **File**: `tests/e2e/debug-contest-errors.spec.ts`
- **Problem**: The file appears to be a temporary debugging helper rather than a regression test. It requires manual env vars and navigates every contest link to look for 500s. It is not referenced in `playwright.config.ts` allowlists or in any CI step.
- **Failure scenario**: The file drifts out of sync with the UI and is not run automatically, so any coverage it provides is lost.
- **Suggested fix**: Either promote it to a maintained spec (rename, use fixtures, assert no 500s across public/admin contest pages) or remove it. If kept, ensure it is not included in `remoteSafeSpecs` because it may be noisy against production.
- **Cross-references**: `playwright.config.ts:23-49`, `tests/e2e/contest-nav-test.spec.ts`

## LOW: `function-judging.spec.ts` and `output-only-languages.spec.ts` skip core assertions when prerequisites fail in `beforeAll`
- **File**: `tests/e2e/function-judging.spec.ts` (lines 202-209, 251-276), `tests/e2e/output-only-languages.spec.ts` (lines 102-110, 139-160)
- **Problem**: Both specs compute worker/image availability in `beforeAll` and then skip individual tests when unavailable. Unlike `test.skip` inside a test, this pattern can leave the entire describe block as skipped if `beforeAll` fails or returns early.
- **Failure scenario**: A transient Docker/image check failure in `beforeAll` causes all language tests to be skipped without a clear signal, and the CI run is reported as passing despite exercising nothing.
- **Suggested fix**: Fail `beforeAll` hard if the prerequisites are missing in CI; only skip when explicitly opted out via an env var. Add a dedicated setup test that asserts worker + required images exist before the language tests run.
- **Cross-references**: `tests/e2e/support/helpers.ts:142-167`

## Final sweep
- Confirmed no `.only` markers in tests.
- No `test.fixme` or `test.todo` outside the expected `all-languages-judge.spec.ts` dynamic fixture and the `responsive-layout.spec.ts` 404 skip.
- E2E specs cover contest creation, joining, access codes, leaderboard rendering, admin users/languages/workers, problem CRUD, groups, recruiting isolation, auth login/logout, mobile layout, locale cookies, and system settings. Coverage is broad but the actual execution depth is limited by worker availability and inconsistent auth.
- Manual validation still needed: run the full E2E suite locally with `scripts/playwright-local-webserver.sh` and verify which judge-dependent tests skip; inspect CI E2E logs to confirm whether the seeded admin is actually used; verify the 404 double-chrome skip condition against production.
- Skipped deeper review of the Rust worker tests, static-site HTML assets, and visual regression (none present) because they are outside the QA/interactive-testing angle.
