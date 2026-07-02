# Test-Engineer Review — Cycle 4 / 2026-07-03

**Scope:** entire repository (`/tmp/judgekit-local`).
**Goal:** deep test-engineering review focused on coverage gaps, flaky tests, TDD opportunities, missing integration tests, test maintainability, and race-condition coverage.

---

## Executive Summary

The test suite is large (537 files, ~473 non-node_modules tests) and has strong regression coverage for the cycles of remediation already completed. However, it is heavily skewed toward **source-grep contract tests** (163 counted) and **mock-heavy unit tests** (173 using `mockResolvedValue`/`mockReturnValue`). Behavioral integration tests are minimal and gated behind `hasPostgresIntegrationSupport`, so CI on a clean checkout skips the most important reliability properties (judge claim reclaim, submission lifecycle, DB concurrency). Many security/correctness paths added in recent cycles are only verified by text contracts rather than exercised code, and several critical API routes have no unit test at all.

Key themes:
1. **API route coverage is patchy:** 113 route files exist, but only a handful have dedicated behavioral unit tests; the rest are covered only by shared-library tests or source-grep guards.
2. **Rust sidecars are barely unit-tested:** 15 Rust source files have inline `#[cfg(test)]` blocks, but there is no dedicated Rust test harness run in CI; language/runtime contracts are tested from TypeScript by reading the Rust source.
3. **Integration tests are gated and few:** Only 6 integration tests exist; 5 skip automatically without `DATABASE_URL`/`TEST_DATABASE_URL`/`INTEGRATION_DATABASE_URL`.
4. **Mock brittleness is high:** Route tests mock `createApiHandler` or its dependencies rather than exercising the wrapper, and many tests assert on exact mock call counts that can break on harmless refactoring.
5. **Race-condition coverage exists but is mostly source-grep or single-threaded:** Real DB-level races are only covered by the judge-claim-reclaim integration test; other concurrency guards are verified by reading `pg_advisory_xact_lock` strings.
6. **Deployment/infrastructure tests verify string presence, not rendered behavior:** This is acknowledged in the codebase but still leaves real configuration drift (body-size limits, XFF headers, security headers) only partially protected.

---

## Inventory of Test Files vs. Source Files

| Category | Count | Notes |
|---|---|---|
| All test files (`tests/**/*.{test.ts,test.tsx}`) | 537 | Includes component, unit, integration, e2e, harness. |
| TypeScript/Rust source files (`src/**/*.{ts,tsx}`, `judge-worker-rs/src/**/*.rs`, `rate-limiter-rs/src/**/*.rs`, `code-similarity-rs/src/**/*.rs`) | 649 | Excludes node_modules. |
| API route files (`src/app/api/**/route.ts{,x}`) | 113 | Foundation of the API surface. |
| Unit API test files (`tests/unit/api/*.test.ts`) | 98 | Many are implementation/source-grep guards rather than behavioral route tests. |
| Integration tests (`tests/integration/**/*.test.ts`) | 6 | 5 skip without Postgres integration env. |
| Rust source files with inline `#[cfg(test)]` | 15 | No dedicated `tests/` directories; relies on `cargo test` in CI. |
| Tests using mocks (`vi.mock` / `jest.mock` / `mockReturnValue`) | 229 | ~48% of all test files. |
| Tests using `readFileSync` (source-grep) | 163 counted by `source-grep-inventory.test.ts` | Documented baseline; legitimate for infra/schema but over-used for application logic. |

### API Route Coverage Detail

Using a conservative stem-matching algorithm against unit API test names:

- **Routes with behavioral unit tests:** roughly 10–15 (e.g., `handler`, `contests`, `similarity-check`, `judge-*`, `auth-public-routes`, `compiler-run`, `playground-run`, `submissions`).
- **Routes with only source-grep/implementation guards:** many admin routes (`admin-backup-security`, `admin-roles`, etc.).
- **Routes with no obvious test:** ~110 of 113 routes, including critical paths such as:
  - `v1/files/route.ts` (GET list has no rate-limit test)
  - `v1/admin/restore/route.ts`, `v1/admin/backup/route.ts`, `v1/admin/migrate/import/route.ts`
  - `v1/admin/workers/**`
  - `v1/auth/forgot-password/route.ts`, `v1/auth/reset-password/route.ts`, `v1/auth/verify-email/route.ts`
  - `v1/contests/[assignmentId]/leaderboard/route.ts` (partially covered by `contests.route.test.ts`)
  - `v1/groups/**`
  - `v1/problems/**`
  - `v1/submissions/**` (some covered by `submissions.route.test.ts` but not all methods)

This does not mean the routes are completely untested—some logic is exercised through component tests or library tests—but the **route handler contract** (auth, CSRF, rate limit, body parsing, error handling) is not directly verified for most endpoints.

---

## Confirmed Findings

### 1. CRITICAL: Integration tests are almost entirely skipped in default CI

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/integration/db/judge-claim-reclaim.test.ts:28`; `tests/integration/db/submission-lifecycle.test.ts:28`; `tests/integration/db/user-crud.test.ts:15`; `tests/integration/db/catalog-numbers.test.ts:23`; `tests/integration/api/health.test.ts:6`
- **Problem:** Five of six integration tests use `describe.skipIf(!hasPostgresIntegrationSupport)`. The helper checks for `INTEGRATION_DATABASE_URL || TEST_DATABASE_URL || DATABASE_URL`. In a fresh CI checkout or contributor environment, `DATABASE_URL` is typically unset, so the entire integration suite is silently skipped.
- **Failure scenario:** A regression in the judge claim reclaim logic (e.g., a stale claim is never reclaimed, or active_tasks leaks) passes CI because the only test that exercises real PostgreSQL concurrency is skipped. The 2026-05-16 silent `compile_error` sweep and similar incidents show that DB-level races cause production failures.
- **Suggested fix:** Provide a lightweight Postgres service container in CI and set `TEST_DATABASE_URL` so integration tests run on every PR. Add a CI gate that fails if integration tests are skipped because no DB is available (e.g., assert `hasPostgresIntegrationSupport` is true in the CI job).

### 2. HIGH: `GET /api/v1/files` has no rate-limit test

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/app/api/v1/files/route.ts:155-208`; `tests/unit/api/files-by-id.route.test.ts` (only tests `[id]`)
- **Problem:** The file-list endpoint performs a `LEFT JOIN` against `users`, a `COUNT(*) OVER()` window function, pagination, and optional `LIKE` search. It has no `rateLimit` key and no test verifies that it is unthrottled. The aggregate review (SEC M-4) already flags the missing rate limit; the test gap is the same issue from a test-engineering angle.
- **Failure scenario:** An authenticated attacker scrapes or brute-forces paginated file lists without throttling, driving database load and potentially enumerating uploaded file metadata.
- **Suggested fix:** Add `rateLimit: "files:list"` to the GET handler and add a unit test asserting 429 when the rate-limit response is returned. Also add an integration test that verifies the DB query plan uses the expected indexes under load.

### 3. HIGH: Rust sidecars have no behavioral test harness in the TypeScript suite

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `judge-worker-rs/src/**/*.rs`, `rate-limiter-rs/src/**/*.rs`, `code-similarity-rs/src/**/*.rs`; `tests/unit/infra/language-contract.test.ts`; `tests/unit/infra/worker-runtime.test.ts`
- **Problem:** The only tests referencing the Rust crates are source-grep guards (`language-contract`, `worker-runtime`, `execute-implementation`, `output-limits-implementation`, `ioi-run-all-tests-implementation`). There are no black-box tests that compile and run the Rust binaries, mock the app server, and assert on HTTP responses.
- **Failure scenario:** A change in `judge-worker-rs/src/api.rs` breaks deregister semantics or claim polling, but CI only checks that strings still appear in source files. The worker deregister non-2xx bug fixed in cycle 2 (AGG HIGH) is exactly the kind of issue a Rust unit test should have caught.
- **Suggested fix:** Add `cargo test` to the CI matrix and add targeted Rust unit tests for deregister response handling, runner command validation, workspace cleanup, and rate-limiter monotonic-clock behavior. Add a small Rust integration test that spins up a mock app server (using `wiremock` or `httptest`) and verifies registration/claim/poll/deregister HTTP contracts.

### 4. HIGH: Route tests mock `createApiHandler` instead of exercising it

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/api/similarity-check.route.test.ts:40-47`; `tests/unit/api/contests.route.test.ts:48-65`; many other route tests
- **Problem:** Route tests commonly mock `createApiHandler` to a trivial wrapper that bypasses auth, CSRF, rate limiting, and body parsing. This means the route tests verify only the inner handler logic, not the actual middleware ordering, auth/CSRF/rate-limit integration, or error handling of the real wrapper.
- **Failure scenario:** A regression in `createApiHandler` (e.g., rate limit is checked after auth, CSRF skipped for API keys, body parsed before auth) passes all route tests because they never call the real wrapper. The aggregate review’s handler ordering concerns are not covered.
- **Suggested fix:** Refactor route tests to import the real `createApiHandler` and mock only the dependencies (`getApiUser`, `consumeApiRateLimit`, `csrfForbidden`, etc.), as `tests/unit/api/handler.test.ts` already does. Add a shared route-test helper that sets up sensible defaults.

### 5. HIGH: `forgot-password` and public auth routes have CSRF tests but no rate-limit or abuse tests

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/api/auth-public-routes.test.ts:69-99`; `src/app/api/v1/auth/forgot-password/route.ts:30-40`
- **Problem:** The public auth routes test verifies CSRF presence and valid request handling, but does not test the per-IP/email rate limits or the `email_not_configured` / `sendFailed` branches. The aggregate review (SEC HIGH) notes that these routes are public and state-changing; without rate-limit tests, abuse protections are unverified.
- **Failure scenario:** A bug in `consumeRateLimitAttemptMulti` or `getRateLimitKey` allows password-reset email spam to arbitrary addresses. CI passes because the rate-limit path is never exercised.
- **Suggested fix:** Add tests that mock `consumeRateLimitAttemptMulti` returning `true`, assert 429; test `email_not_configured` returns 503; test `sendFailed` returns 500; test unknown email still returns 200 to avoid user enumeration.

### 6. HIGH: No test verifies the request-ID / correlation-ID behavior on real routes

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/api/handler.ts:114-123`; `tests/unit/api/handler.test.ts:569-614`
- **Problem:** `handler.test.ts` verifies request ID propagation in isolation, but no route test checks that a real API route returns `X-Request-Id` on success/error or propagates an existing header. The aggregate review flags generic 500 responses lacking correlation; request IDs are the mitigation.
- **Failure scenario:** A middleware or helper strips the request ID before it reaches the client, making incident response harder. CI passes because only the wrapper unit test checks it.
- **Suggested fix:** Add a route-level test (e.g., on `GET /api/v1/health` or `POST /api/v1/contests/quick-create`) that asserts the response includes `X-Request-Id` and that an incoming `X-Request-Id` header is preserved.

### 7. HIGH: Source-grep tests dominate infra and security verification

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/infra/source-grep-inventory.test.ts:241`; `tests/unit/infra/deploy-security.test.ts`; `tests/unit/infra/deploy-storage-safety.test.ts`; `tests/unit/infra/judge-report-nginx.test.ts`
- **Problem:** Deployment and nginx correctness are verified by string presence in source files, not by rendering the generated config and validating it. The aggregate review (MEDIUM) already notes this. The `judge-report-nginx.test.ts` does execute small bash snippets to test version parsing, but it does not actually render the full nginx config from `deploy-docker.sh` and run `nginx -t`.
- **Failure scenario:** A valid-looking string is placed inside a dead code path (e.g., `if false; then client_max_body_size 50M; fi`), or the generated config has a syntax error from heredoc quoting. The string-matching test passes while production 413/500 errors occur.
- **Suggested fix:** Add a test that runs the nginx generation function from `deploy-docker.sh` against a local nginx binary (or `nginx -t` with the rendered config) to validate syntax and body-size directives. Use `bash -n` and extract the heredoc output for parsing.

### 8. HIGH: No test exercises `AbortSignal.any` composition in `computeSimilarityRust`

- **Severity:** HIGH
- **Confidence:** Medium
- **Status:** Confirmed
- **Files / Lines:** `src/lib/assignments/code-similarity-client.ts:57-58`; `tests/unit/assignments/code-similarity-client.test.ts:67-95`
- **Problem:** The similarity client now composes the caller signal with a 25-second sidecar timeout. The unit test verifies caller-initiated abort, but does not verify that the sidecar timeout fires when the caller does not abort, or that a caller abort before fetch start is respected.
- **Failure scenario:** A bug in `AbortSignal.any` polyfill usage (Node 20+ supports it, but test environments may vary) causes the route to hang beyond 30 seconds or leak. The aggregate review’s HIGH finding about ignored signals was fixed; the timeout composition needs coverage.
- **Suggested fix:** Add a test using `vi.useFakeTimers()` and a fetch that never resolves, advancing time past 25 seconds and asserting `SIDECAR_TIMEOUT`. Also test that the caller signal aborting before `fetch` is called returns `SIDECAR_ABORTED` without a network request.

### 9. MEDIUM: Race-condition tests are mostly source-grep

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/api/recruiting-invitations-race-implementation.test.ts:6-24`; `tests/unit/api/judge-claim-db-time.test.ts:16-56`; `tests/unit/assignments/access-codes-race-invariant.test.ts`
- **Problem:** Concurrency guards are verified by reading strings like `pg_advisory_xact_lock` from source, not by running concurrent operations. Only `tests/integration/db/judge-claim-reclaim.test.ts` exercises real DB races, and it is skipped without Postgres.
- **Failure scenario:** A refactor removes the advisory lock or changes the lock key, but the string still appears elsewhere. The source-grep test passes while a production race corrupts data.
- **Suggested fix:** For critical race paths (recruiting invitations, access codes, similarity-check serialization, rate-limit first-insert), add integration tests that launch multiple parallel requests/transactions against a real Postgres database and assert exactly-one semantics.

### 10. MEDIUM: `workspace leak regression` test in `execute.test.ts` is root-gated

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/compiler/execute.test.ts:225-266`
- **Problem:** The test that verifies sandbox-owned workspace cleanup is skipped unless the test runner is root (`if (!isRoot) return;`). In CI and developer laptops the test almost always no-ops, so a regression in `cleanupCompilerWorkspace` can slip through.
- **Failure scenario:** A permission change in the cleanup helper causes workspaces to leak in production, but CI passes because the regression test never ran.
- **Suggested fix:** Run the workspace-cleanup tests in a CI job as root (e.g., in a container with `USER root`), or use filesystem namespaces/overlayfs to simulate chown without root. At minimum, add a non-root test that verifies `cleanupCompilerWorkspace` does not throw and logs appropriately when it lacks permission.

### 11. MEDIUM: No tests for the fallback path when `getTrustedAuthHosts` returns empty in production

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/security/csrf.ts:8-15`; `tests/unit/security/csrf.test.ts:241-253`; `tests/unit/security/csrf-allowed-hosts.test.ts:1-54`
- **Problem:** `validateCsrf` refuses to fall back to request headers in production when `getTrustedAuthHosts()` is empty. The existing CSRF tests cover development fallback and allowedHosts matching, but there is no test asserting that in production with empty trusted hosts, a missing `Origin` is rejected or allowed only for same-origin `Sec-Fetch-Site`.
- **Failure scenario:** Misconfigured production env (`AUTH_URL` not set, no allowed hosts) causes CSRF to degrade insecurely or reject all requests. Both outcomes are untested.
- **Suggested fix:** Add a production-mode test that sets `NODE_ENV=production`, mocks `getTrustedAuthHosts` to empty, and asserts behavior for requests with/without `Origin` and `Sec-Fetch-Site`.

### 12. MEDIUM: No behavioral test for token invalidation millisecond precision

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/auth/session-security.ts:33-34`; aggregate review HIGH finding
- **Problem:** The aggregate review’s HIGH finding about one-second token revocation grace window was fixed by using millisecond precision. There is no unit test that creates a token at `t-500ms`, revokes at `t`, and asserts the token is rejected.
- **Failure scenario:** A refactor reintroduces whole-second truncation and the grace window returns. No test fails.
- **Suggested fix:** Add a unit test for `isTokenInvalidated` with millisecond boundary values, including the same-second pre-revocation token case.

### 13. MEDIUM: Many API routes without rate-limit keys have no tests explaining why

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Confirmed
- **Files / Lines:** `src/app/api/v1/admin/**/*.ts`, `src/app/api/v1/judge/**/*.ts`, etc.
- **Problem:** 55 route files have no `rateLimit:` key. Some are intentionally exempt (health, NextAuth, internal cleanup), but many admin routes perform expensive operations (backup, restore, export, build, worker management) and should be rate-limited. There is no test or ADR documenting the exemption list.
- **Failure scenario:** An admin endpoint is accidentally left unthrottled and is abused; reviewers cannot tell whether the omission was intentional.
- **Suggested fix:** Create an allowlist test that enumerates routes exempt from rate limiting with justification, and fails when a new route is added without a rate limit key unless explicitly exempted.

### 14. LOW: Test file naming is inconsistent, making coverage mapping harder

- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/api/admin-submissions-bulk-rejudge-implementation.test.ts`, `tests/unit/api/admin-submissions-export-behavioral.test.ts`, `tests/unit/api/admin-submissions-export-implementation.test.ts`, etc.
- **Problem:** The `-implementation`/`-behavioral`/`-route` suffixes are not applied consistently. This makes automated route-to-test mapping unreliable and increases maintenance burden.
- **Suggested fix:** Standardize on `tests/unit/api/<route-path>.route.test.ts` for behavioral route tests and `tests/unit/api/<route-path>-contract.test.ts` for source-grep guards. Update the source-grep inventory test to enforce naming.

### 15. LOW: `source-grep-inventory` baseline is a manual number that requires constant updates

- **Severity:** LOW
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `tests/unit/infra/source-grep-inventory.test.ts:241`
- **Problem:** The documented baseline of 163 source-grep test files is manually bumped. This creates churn and can mask unintended new source-grep tests because the update is just a number change.
- **Suggested fix:** Replace the single number assertion with a categorized assertion: each new source-grep file must be added to `INTENTIONAL_INFRA_DEPLOY`, `INTENTIONAL_SCHEMA`, or a new `INTENTIONAL_APPLICATION_CONTRACT` list with a comment justifying why it cannot be a behavioral test.

---

## Likely Issues / Risks Needing Manual Validation

### L1. Flaky timing in `similarity-check.route.test.ts`

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Files / Lines:** `tests/unit/api/similarity-check.route.test.ts:133-167`
- **Problem:** The timeout test uses a real 31-second `setTimeout` and a test timeout of 35 seconds. If the test runner is slow or GC pauses occur, the test can flake. It also does not verify the `clearTimeout` in the `finally` block.
- **Suggested fix:** Use `vi.useFakeTimers()` for the route-level timeout test, or mock `runAndStoreSimilarityCheck` to throw an `AbortError` synchronously.

### L2. `waitFor` loops in component tests may be brittle under CI load

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Risk
- **Files / Lines:** Many component tests, e.g., `tests/component/access-code-manager.test.tsx:99-120`
- **Problem:** Component tests rely on `@testing-library/react` `waitFor` with default timeouts. Complex async state can time out on slower CI runners.
- **Suggested fix:** Review the slowest component tests; consider increasing timeouts for animation-heavy components and using `findBy*` queries instead of `waitFor` where possible.

### L3. `consumeApiRateLimit` unit tests mock `execTransaction` to pass the same mock object as tx

- **Severity:** LOW
- **Confidence:** Medium
- **Files / Lines:** `tests/unit/security/api-rate-limit.test.ts:26-27`
- **Problem:** The `execTransaction` mock runs the callback with the same `dbMock` object used for non-transactional queries. This does not catch bugs where code accidentally uses the global `db` instead of `tx` inside a transaction.
- **Suggested fix:** Provide a separate transaction-client mock that tracks calls differently, and assert that the rate-limit core functions receive the transaction client.

### L4. Property-based/fuzz tests are missing for input validators and serialization

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Confirmed
- **Files / Lines:** `src/lib/validators/**/*.ts`, `src/lib/judge/function-judging/serialization.ts`
- **Problem:** The only fuzz-like coverage is manual tables in `serialization.test.ts` and `ip.test.ts`. There are no generative tests for validators, CSV escaping, file-name sanitization, or IP parsing.
- **Suggested fix:** Add `fast-check` tests for `extractClientIp` (random valid/invalid IPs, XFF chains), `encodeArgs`/`decodeValue` (random scalar/array values), and file-name sanitization (control characters, long names, Unicode).

---

## Commonly Missed Test Issues — Final Sweep

| Area | Status | Notes |
|---|---|---|
| E2E coverage of critical user flows | Weak | Only 43 e2e files; no evidence of full submission/judge/leaderboard flow. |
| Real-time/SSE tests | Minimal | `tests/unit/realtime/realtime-coordination.test.ts` exists but relies on mocks. |
| File upload happy path + malicious inputs | Partial | Magic bytes and ZIP bomb are tested, but not large image processing, MIME spoofing combos, or storage path traversal. |
| Docker/sandbox runtime tests | Skipped | `tests/harness/adapters-smoke.test.ts` skips every language without toolchains. |
| Audit log completeness | Partial | Some route tests assert `recordAuditEvent` is called, but not that all security-relevant actions emit audit events. |
| Backup/restore round-trip | Missing | No test imports a backup and verifies row counts. |
| Admin role/capability matrix | Partial | Capability consistency tests exist, but not an end-to-end matrix of every admin endpoint for every role. |
| Error taxonomy propagation | Partial | `handler.test.ts` covers `OperationalError`/`NotFoundError`, but most route tests only assert `internalServerError`. |
| Logging assertions | Sparse | Few tests assert structured log fields; most mock `logger.error` to silence output. |
| Schema/migration drift | Good | `schema-parity.test.ts`, `pg-migration-drift.test.ts`, `import-implementation.test.ts` provide strong guards. |

---

## Recommended Next Steps (TDD Opportunities)

1. **CI Postgres service:** Unblock integration tests by running Postgres in CI and setting `TEST_DATABASE_URL`.
2. **Route test harness:** Create a shared helper that uses the real `createApiHandler` with mocked dependencies so route tests exercise the full middleware stack.
3. **Rate-limit coverage:** Add a test that fails if a route file lacks `rateLimit:` without an explicit exemption comment.
4. **Rust test matrix:** Add `cargo test` for all three Rust crates and a small HTTP contract test for the worker.
5. **Rendered nginx validation:** Extract and run `nginx -t` on the generated config in a CI job.
6. **Concurrency integration tests:** For advisory-lock paths, run parallel DB transactions and assert exactly-one semantics.
7. **Fuzz/property tests:** Introduce `fast-check` for serialization, IP parsing, and validators.
8. **Source-grep governance:** Tighten `source-grep-inventory.test.ts` to require categorized justification for every source-grep file.

---

## Conclusion

The test suite is a valuable regression net but has become top-heavy with text-contract and mock-based tests. The highest-impact improvements are (1) making integration tests run by default in CI, (2) exercising real route middleware instead of mocking the wrapper, and (3) adding behavioral tests for the Rust sidecars. These changes would catch the class of bugs that source-grep tests and isolated mocks cannot, particularly concurrency, configuration drift, and cross-service contract failures.
