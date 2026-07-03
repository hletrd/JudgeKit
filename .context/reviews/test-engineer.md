# Test-Engineer Review — Cycle 4 Focus / 2026-07-03

**Scope:** `/tmp/judgekit-local` (full repository, with emphasis on files modified in the current cycle: contest join, similarity-check, compiler execution, IP extraction, nginx/deploy scripts, and their tests).  
**Goal:** identify coverage gaps, flaky tests, TDD opportunities, missing integration tests, mock brittleness, and race-condition coverage.

---

## Executive Summary

The repository has a large, regression-focused test suite: ~392 unit tests, 76 component tests, 42 e2e tests, and 5 integration tests covering 113 API routes and many supporting libraries. The strongest areas are **source-grep contract tests** for deployment/infrastructure and **isolated unit tests** for pure helpers (IP parsing, shell-command validation, handler ordering). The weakest areas are **real middleware coverage on API routes**, **behavioral integration tests against PostgreSQL**, and **exercised coverage of recent security/correctness fixes**.

This cycle’s changes are mostly well guarded by unit tests, but several important paths are verified only by string presence or by mocks that bypass the actual `createApiHandler` wrapper. The most concerning issues are:

1. **A critical route test mocks `createApiHandler` itself**, so it cannot catch regressions in auth, CSRF, rate limiting, body parsing, or error taxonomy.
2. **The integration suite is gated behind a Postgres env var** and is silently skipped on a clean checkout, leaving DB-level races unexercised.
3. **A timing-dependent similarity-check timeout test** uses real wall-clock delays and is fragile under CPU contention.
4. **Compiler workspace-cleanup regression tests are split by root/non-root** and never both run in the same CI job.
5. **Many route-level middleware paths** (CSRF enforcement on contest join, request-ID propagation, malformed params, rate-limit ordering) have no behavioral coverage.

Recommended next steps: (1) refactor mock-heavy route tests to exercise the real handler wrapper, (2) run integration tests against a Postgres service in CI, (3) replace wall-clock timeouts with fake timers, (4) add route-level middleware smoke tests, and (5) add a rendered-nginx syntax check.

---

## Inventory of Tests and Source Coverage

### Test counts

| Category | Count | Notes |
|---|---|---|
| Unit tests (`tests/unit/**/*.test.{ts,tsx}`) | ~392 | Mix of behavioral, mock-heavy, and source-grep tests. |
| Component tests (`tests/component/**/*.test.tsx`) | 76 | jsdom environment; good UI coverage, some waitFor/async fragility. |
| E2E tests (`tests/e2e/**/*.spec.ts`) | 42 | Playwright; many conditional skips based on worker availability / remote run. |
| Integration tests (`tests/integration/**/*.test.ts`) | 5 | 4 of 5 skip without Postgres integration env. |
| Harness tests (`tests/harness/**/*.test.ts`) | 1 | Adapter smoke test. |
| API routes (`src/app/api/**/route.ts`) | 113 | Foundation of the API surface. |
| Unit API route tests (`tests/unit/api/*.test.ts`) | 99 | Many behavioral, but several are source-grep or mock `createApiHandler`. |

### API route coverage mapping (focused on recent changes)

| Source route | Test file | Coverage quality |
|---|---|---|
| `src/app/api/v1/contests/join/route.ts` | `tests/unit/api/contests.route.test.ts` | Behavioral, but CSRF is mocked away and rate-limit ordering is only partially verified. |
| `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` | `tests/unit/api/similarity-check.route.test.ts` | **Mocks `createApiHandler`** — only inner handler logic tested; middleware untested. |
| `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts` | `tests/unit/api/contests.route.test.ts` | Covered via `contests.route.test.ts`; some authorization paths tested. |
| `src/app/api/v1/contests/quick-create/route.ts` | `tests/unit/api/contests.route.test.ts` | Basic schedule validation tested. |
| `src/lib/compiler/execute.ts` | `tests/unit/compiler/execute.test.ts`, `tests/unit/compiler/execute-implementation.test.ts` | Command validation and source-grep coverage strong; runtime Docker/Rust-runner paths not exercised. |
| `src/lib/security/ip.ts` | `tests/unit/security/ip.test.ts` | Exhaustive IPv4/IPv6 unit coverage; no integration with rate-limiter or judge allowlist. |
| `static-site/nginx.conf`, `deploy-docker.sh` | `tests/unit/infra/judge-report-nginx.test.ts`, `tests/unit/infra/deploy-security.test.ts`, `tests/unit/infra/deploy-storage-safety.test.ts` | String-presence and small bash-snippet tests; generated nginx config is not rendered and syntax-checked. |

### Middleware coverage gap

`createApiHandler` (in `src/lib/api/handler.ts`) implements auth, role/capability checks, CSRF, rate limiting, body parsing, Zod validation, request-ID propagation, and error taxonomy. Only `tests/unit/api/handler.test.ts` exercises the wrapper in isolation. Most route tests either:

- mock `createApiHandler` entirely (e.g., `similarity-check.route.test.ts`), or
- mock every dependency and call the wrapped export (e.g., `contests.route.test.ts`),

but almost none verify that the **actual route file** integrates the wrapper correctly (CSRF on/off, rate-limit key present, schema applied, error response shape).

---

## Findings Register

### 1. CRITICAL: `similarity-check.route.test.ts` mocks `createApiHandler`, bypassing all middleware

- **Severity:** CRITICAL  
- **Confidence:** High  
- **Files / Lines:** `tests/unit/api/similarity-check.route.test.ts:40-47`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:26-98`
- **Problem:** The test replaces `@/lib/api/handler` with a trivial wrapper that passes `{ user: mockUser, body: undefined, params }` directly to the inner handler. Auth, the `rateLimit: "similarity-check"` key, CSRF, body parsing, param validation, request-ID propagation, and the wrapper’s error taxonomy are never exercised.
- **Failure scenario:** A regression in `createApiHandler` (e.g., CSRF is accidentally enabled for API keys, rate-limit key is ignored, `requestId` is dropped from error responses) passes this test because the wrapper is not the real one. A change in the route’s `rateLimit` config or `auth` requirements is also invisible to this test.
- **Suggested fix:** Remove the `vi.mock("@/lib/api/handler", …)` block. Mock only the dependencies (`getApiUser`, `consumeApiRateLimit`, `csrfForbidden`, `resolveCapabilities`, `canManageContest`, `runAndStoreSimilarityCheck`, `db`). Import the real route export and assert on status codes, `X-Request-Id`, and error codes returned by the real wrapper.

### 2. HIGH: Similarity-check timeout test is wall-clock dependent and can flake

- **Severity:** HIGH  
- **Confidence:** High  
- **Files / Lines:** `tests/unit/api/similarity-check.route.test.ts:133-167`; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-69`
- **Problem:** The test sets a 31-second `setTimeout` and expects the route’s 30-second `AbortController` to fire first. The test is marked with `, 35000`, but under CI CPU contention or when the test runner is paused, the abort may not win reliably. It also does not verify the timeout fires *before* the sidecar completes—only that an abort eventually produces `timed_out`.
- **Failure scenario:** On a slow runner the mock resolves at 31 s before the abort fires, returning `completed` and failing the assertion. Alternatively, the abort fires late and the test exceeds its own timeout.
- **Suggested fix:** Replace the real timer with a controllable mock. Resolve `runAndStoreSimilarityCheck` from an `AbortSignal` listener and assert that `controller.signal.aborted` becomes true; or use `vi.useFakeTimers()` to advance past 30 s deterministically.

### 3. HIGH: Contest join route does not test CSRF enforcement or malformed body handling

- **Severity:** HIGH  
- **Confidence:** High  
- **Files / Lines:** `tests/unit/api/contests.route.test.ts:224-354`; `src/app/api/v1/contests/join/route.ts:15-51`
- **Problem:** `contests.route.test.ts` mocks `csrfForbidden` to return `null` in every case and never sends an invalid JSON body. The route uses `createApiHandler({ auth: true, schema: redeemAccessCodeSchema, … })`, so the wrapper will enforce CSRF and body parsing, but those paths are not verified at the route level.
- **Failure scenario:** A future refactor changes the route’s `csrf` option or the wrapper’s default CSRF behavior; the route silently becomes CSRF-vulnerable or unnecessarily strict, and CI passes.
- **Suggested fix:** Add route-level tests that (a) omit the CSRF header and expect 403, (b) send malformed JSON and expect 400 `invalidJson`, and (c) send a body that fails Zod validation and expect 400.

### 4. HIGH: No route test verifies request-ID / error taxonomy on real endpoints

- **Severity:** HIGH  
- **Confidence:** High  
- **Files / Lines:** `src/lib/api/handler.ts:114-123`, `287-311`; `tests/unit/api/handler.test.ts:569-614`
- **Problem:** `handler.test.ts` tests request-ID propagation in isolation, but no route test checks that a real route returns `X-Request-Id` or the new `{ error, requestId }` body on 400/500. Recent cycles added the error taxonomy specifically for incident response; the route surface is unverified.
- **Failure scenario:** A middleware or a route helper strips or overwrites the response headers/body shape, making production 500s hard to correlate. CI passes because only the wrapper unit test checks it.
- **Suggested fix:** Add a shared route-level smoke test (or extend `contests.route.test.ts` / `similarity-check.route.test.ts`) that asserts `X-Request-Id` is present on success and error, and that an incoming `X-Request-Id` header is preserved.

### 5. HIGH: Integration tests skip silently without a Postgres database

- **Severity:** HIGH  
- **Confidence:** High  
- **Files / Lines:** `tests/integration/db/judge-claim-reclaim.test.ts:28`; `tests/integration/db/submission-lifecycle.test.ts:28`; `tests/integration/db/user-crud.test.ts:15`; `tests/integration/db/catalog-numbers.test.ts:23`; `tests/integration/api/health.test.ts:6`
- **Problem:** Five of the six integration tests use `describe.skipIf(!hasPostgresIntegrationSupport)`. In a fresh checkout or CI without `DATABASE_URL`/`TEST_DATABASE_URL`/`INTEGRATION_DATABASE_URL`, the entire integration suite is skipped with no failure signal.
- **Failure scenario:** A DB-level race (e.g., stale judge claims not reclaimed, optimistic-update bug in submission status) passes CI because the only test that exercises real PostgreSQL concurrency never runs.
- **Suggested fix:** Provide a Postgres service container in CI and set `TEST_DATABASE_URL`. Add a CI assertion that `hasPostgresIntegrationSupport` is true so a misconfigured job fails loudly instead of silently skipping.

### 6. MEDIUM: Compiler workspace-cleanup regression tests are never both run in one CI job

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / Lines:** `tests/unit/compiler/execute.test.ts:225-266` (root-gated); `tests/unit/compiler/execute.test.ts:268-301` (non-root-gated)
- **Problem:** The sandbox-owned-cleanup test returns early unless `process.getuid() === 0`; the non-root test returns early when root. In a typical CI container running as non-root, the production chown/chmod path is never exercised.
- **Failure scenario:** A regression in `cleanupCompilerWorkspace` (e.g., wrong uid comparison, missing `chownRecursive` call, swallowed error) leaks workspaces in production while CI passes.
- **Suggested fix:** Run the workspace-cleanup tests in a dedicated CI step as root (e.g., a container job with `USER root`), or use Linux user namespaces / overlayfs to simulate chown without privileges. At minimum, assert in the non-root path that the function logs a clear warning instead of throwing.

### 7. MEDIUM: Compiler execute runtime paths are not exercised

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / Lines:** `src/lib/compiler/execute.ts:649-731` (`tryRustRunner`); `src/lib/compiler/execute.ts:738-981` (`executeCompilerRun` fallback); `tests/unit/compiler/execute.test.ts:52-194`
- **Problem:** Tests verify command validation, runner auth token preference, and config-error short-circuit, but the actual Docker spawn, Rust runner fetch, local fallback, output truncation, OOM inspection, and workspace cleanup are never executed in unit tests.
- **Failure scenario:** A bug in `tryRustRunner` fallback logic (e.g., non-2xx response not falling back, malformed JSON parsing error, missing `compileOutput` mapping) ships to production without a failing test.
- **Suggested fix:** Add tests using `vi.spyOn(globalThis, "fetch")` to exercise the runner path: non-2xx → fallback, invalid JSON → fallback, unexpected shape → fallback, network error → fallback. Add an integration/harness test that runs a minimal Docker image end-to-end if Docker is available.

### 8. MEDIUM: IP extraction tests do not cover consumer integration

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / Lines:** `src/lib/security/ip.ts:142-205`; `tests/unit/security/ip.test.ts:33-271`
- **Problem:** `ip.test.ts` exhaustively tests canonicalization and spoofing resistance, but does not verify that `extractClientIp` is used consistently by the rate limiter (`consumeApiRateLimit`) or judge allowlist (`isJudgeIpAllowed`). A mismatch in mapped-IPv4 handling between these consumers would not be caught.
- **Failure scenario:** `extractClientIp` unwraps `::ffff:198.51.100.8` to `198.51.100.8`, but the judge allowlist matcher expects the mapped form. A dual-stack worker is incorrectly denied.
- **Suggested fix:** Add integration tests that call `consumeApiRateLimit` and `isJudgeIpAllowed` with dual-stack headers and assert consistent key derivation and allowlist matching.

### 9. MEDIUM: Generated nginx config is not rendered and syntax-checked

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / Lines:** `tests/unit/infra/judge-report-nginx.test.ts:97-123`; `tests/unit/infra/deploy-security.test.ts:267-309`; `deploy-docker.sh` (nginx heredoc)
- **Problem:** Tests assert that strings like `client_max_body_size 50M;` and security-header `add_header` directives appear in the script source. They do not extract the generated config and run `nginx -t` or parse the heredoc output.
- **Failure scenario:** A valid-looking string is placed inside a dead branch, or heredoc quoting produces invalid nginx syntax. The string test passes while production returns 413/500 or fails to start nginx.
- **Suggested fix:** Add a test that extracts the nginx heredoc from `deploy-docker.sh`, writes it to a temp file, and runs `nginx -t` (guarded by an available `nginx` binary). Also assert that the generated config contains exactly one `client_max_body_size` per location and no duplicate/conflicting directives.

### 10. MEDIUM: Race-condition coverage is mostly source-grep

- **Severity:** MEDIUM  
- **Confidence:** High  
- **Files / Lines:** `tests/unit/api/recruiting-invitations-race-implementation.test.ts:6-24`; `tests/unit/assignments/access-codes-race-invariant.test.ts`; `tests/unit/api/judge-claim-db-time.test.ts:16-56`
- **Problem:** Concurrency guards are verified by reading strings like `pg_advisory_xact_lock` from source, not by running concurrent transactions. Only `tests/integration/db/judge-claim-reclaim.test.ts` exercises a real DB race, and it is skipped without Postgres.
- **Failure scenario:** A refactor changes the lock key or removes the advisory lock while the string still appears elsewhere. The source-grep test passes while a production race corrupts data.
- **Suggested fix:** For critical paths (access-code redemption, recruiting invitation creation, similarity-check serialization), add integration tests that run parallel requests against a real Postgres database and assert exactly-once semantics.

### 11. MEDIUM: No test for similarity-check route enrichment query failure

- **Severity:** MEDIUM  
- **Confidence:** Medium  
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:73-84`; `tests/unit/api/similarity-check.route.test.ts:104-191`
- **Problem:** After the sidecar returns pairs, the route queries `users` to enrich names. There is no test for the case where the DB query throws or returns an empty map, and no test for pairs whose `userId1`/`userId2` are missing from the database.
- **Failure scenario:** A DB outage or orphaned `userId` in a pair causes an unhandled exception and a generic 500 instead of a controlled response.
- **Suggested fix:** Add tests mocking `db.select(...).from(users).where(inArray(...))` to throw and to return partial data; assert graceful degradation (e.g., fallback to raw user IDs) and correct response shape.

### 12. LOW: E2E test suite contains many environment-dependent skips

- **Severity:** LOW  
- **Confidence:** High  
- **Files / Lines:** `tests/e2e/output-only-languages.spec.ts:110`; `tests/e2e/all-languages-judge.spec.ts:1137,1228,1255`; `tests/e2e/function-judging.spec.ts:206,252,275`; `tests/e2e/contest-full-lifecycle.spec.ts:297,319,378,399`; `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136,177,190,203`
- **Problem:** Conditional skips are reasonable for optional prerequisites (online worker, available contests), but they mean large swaths of the e2e suite may no-op in a given run without signaling regression risk.
- **Failure scenario:** A setup step silently fails, causing downstream tests to skip; CI is green but critical flows are untested.
- **Suggested fix:** Add a CI summary step that counts skipped e2e tests and warns/fails if a threshold is exceeded. Ensure setup failures surface as failures, not skips.

### 13. LOW: Component tests do not reset global mocks/stubs after each test

- **Severity:** LOW  
- **Confidence:** Medium  
- **Files / Lines:** `tests/component/setup.ts:1-8`
- **Problem:** The component setup only calls `cleanup()` from `@testing-library/react`. It does not call `vi.clearAllMocks()` or `vi.unstubAllGlobals()`. Some component tests use `vi.stubGlobal` or module-level mocks; without cleanup, state can leak between tests.
- **Failure scenario:** A test that stubs `fetch` or `Date.now` affects a later test, causing intermittent failures that are hard to reproduce.
- **Suggested fix:** Add `afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });` in `tests/component/setup.ts`.

### 14. LOW: Inconsistent route-test naming hampers automated coverage mapping

- **Severity:** LOW  
- **Confidence:** High 
- **Files / Lines:** `tests/unit/api/admin-submissions-bulk-rejudge-implementation.test.ts`; `tests/unit/api/admin-submissions-export-behavioral.test.ts`; `tests/unit/api/admin-submissions-export-implementation.test.ts`; `tests/unit/api/contests.route.test.ts`
- **Problem:** Suffixes `-implementation`, `-behavioral`, `-route` are applied inconsistently, making it hard to map `src/app/api/v1/.../route.ts` to its test automatically.
- **Suggested fix:** Standardize on `tests/unit/api/<path>.route.test.ts` for behavioral route tests and `tests/unit/api/<path>-contract.test.ts` for source-grep guards.

---

## Final Sweep: Commonly Missed Test Issues

- **No test exercises `consumeUserApiRateLimit` ordering for contest join with recruiting access.** The source (`src/app/api/v1/contests/join/route.ts:19-28`) rejects recruiting candidates before consuming the rate limit; the test checks recruiting returns 403, but does not assert that `consumeUserApiRateLimit` is *not* called in that branch.
- **No test for malformed `assignmentId` param.** `similarity-check.route.test.ts` always passes a valid `assignmentId`; the wrapper’s param parsing and the route’s handling of an empty/missing param are untested.
- **No test for the `runAndStoreSimilarityCheck` caller signal composition.** The sidecar client now composes the caller signal with a 25-second timeout, but the unit test only covers caller-initiated abort, not the sidecar timeout firing independently.
- **No test verifies the static-site nginx `add_header` inheritance.** Tests check that individual location blocks do not shadow headers, but do not render the config and verify the final response headers.
- **No test for `createApiHandler` `requireAllCapabilities` default.** The wrapper defaults to requiring all capabilities when `requireAllCapabilities` is undefined; `handler.test.ts` only explicitly tests `false` and implied `true`.

---

## Recommended Next Steps

1. **Refactor `similarity-check.route.test.ts`** to use the real `createApiHandler` and mock only dependencies; add middleware smoke tests (auth 401, rate limit 429, CSRF 403, request-ID propagation).
2. **Add Postgres to CI** and run the integration suite on every PR; fail the job if integration tests are skipped due to missing DB.
3. **Replace wall-clock timeout in similarity-check test** with fake timers or an abort listener so the test is deterministic.
4. **Add a rendered-nginx syntax test** that extracts the heredoc from `deploy-docker.sh` and runs `nginx -t` when nginx is available.
5. **Run compiler workspace-cleanup tests as root** in a dedicated CI container, or use namespaces to exercise both root and non-root paths in one job.
6. **Extend route tests** for contest join to verify CSRF enforcement, invalid JSON, Zod validation errors, and recruiting-access/rate-limit ordering.
7. **Add Rust-runner fallback tests** using mocked `fetch` for non-2xx, invalid JSON, malformed shape, and network error.
8. **Add IP consumer integration tests** for rate-limiter key derivation and judge allowlist matching with dual-stack headers.
9. **Standardize route-test naming** and add a CI check that requires a test for every new `route.ts` file.
10. **Strengthen component test teardown** to clear mocks and global stubs after each test.
