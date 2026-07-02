# Test Engineer Review — Cycle 4

**Scope:** Full repository (`/tmp/judgekit-local`) — unit, component, integration, harness, E2E, and Rust test coverage.  
**Reviewer:** test-engineer-3 agent  
**Findings count:** 19  

---

## Executive Summary

The test suite is large and currently green: **386 unit files / 3,040 tests passed**, **76 component files**, **5 integration suites**, **1 harness suite**, **42 E2E specs**, and **81 Rust tests passed** in `judge-worker-rs`.  Since the last review, one critical gap was partially closed (`src/lib/security/sandbox-gate.ts` now has unit tests), and the rate-limit conflict path is now exercised indirectly through the consumer tests.

However, **four security-critical library modules still have zero unit tests**, the **participant-audit E2E spec is still permanently skipped**, the **compiler local-fallback Docker path is only guarded by source scans**, and the number of source-scan "implementation checklist" tests has grown to **~162 files**.  Coverage thresholds remain low (functions 40%) and are still not evaluated by the default `npm run test:unit` gate, so new untested security code can pass CI silently.

---

## Inventory Reviewed

| Tier | Files | Gate command | Notes |
|---|---|---|---|
| Unit | 386 files in `tests/unit/` | `npm run test:unit` (vitest) | 3,040 tests passed in latest run (30.5 s). |
| Component | 76 files in `tests/component/` | `npm run test:component` | jsdom-based React component tests; not executed for this review. |
| Integration | 5 files in `tests/integration/` | `npm run test:integration` | Skipped locally unless Postgres is configured; runs in CI with a service container. |
| Harness | 1 file in `tests/harness/` | `npm run test:harness` | Toolchain-gated; C# usually skipped locally. |
| E2E | 42 files in `tests/e2e/` | `npx playwright test` | One spec is permanently skipped. |
| Rust | Inline `#[cfg(test)]` in Cargo workspace | `cargo test` | `judge-worker-rs`: 81 tests passed. |

Coverage thresholds (`vitest.config.ts:36-54`):
- Global: statements 60%, branches 50%, **functions 40%**, lines 60%.
- `src/lib/security/**` and `src/lib/auth/**`: 90/85/90/90.

---

## Test Suite Health (verified during this review)

- `npm run test:unit` — **386 files, 3,040 tests passed**.
- `cargo test` in `judge-worker-rs` — **81 tests passed**.
- No `test.only` / `it.only` / `describe.only` discovered in any test directory.
- No `test.todo` / `it.todo` placeholders discovered.
- Component, integration, harness, and E2E suites were not executed locally because they require a built app, seeded database, and/or external toolchains.

---

## Findings

### F-01 — `hcaptcha.ts`: Configuration and verification helpers have zero unit tests

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `src/lib/security/hcaptcha.ts:1-89`; test file: none  

`isHcaptchaConfigured`, `getHcaptchaSiteKey`, `getHcaptchaSecret`, and `verifyHcaptchaToken` are mocked at every call site and never executed in tests.

Untested branches:
1. DB site-key/secret precedence over env (`hcaptcha.ts:29`, `34`).
2. Empty-string DB value falling back to env.
3. `verifyHcaptchaToken` HTTP-error path (`hcaptcha.ts:70-75`).
4. JSON parse failure path (`hcaptcha.ts:77-80`).
5. `allowPlaintextFallback: true` passed to `decrypt()` (`hcaptcha.ts:23`).

**Concrete failure scenario:** A refactor swaps DB/env priority or changes the plaintext fallback flag; all signup captcha flows silently break or run without verification.

**Fix:** Add `tests/unit/security/hcaptcha.test.ts` mocking `@/lib/system-settings` and `global.fetch`. Cover success/failure/HTTP-error/parse-error and precedence cases.

---

### F-02 — `production-config.ts`: `process.exit(1)` path never tested

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `src/lib/security/production-config.ts:54-89`; test file: none  

`assertProductionConfig()` is invoked from `src/instrumentation.ts` at Next.js boot. When `NODE_ENV=production` and any required variable is missing, it calls `process.exit(1)`. No test imports this module.

Untested:
- Exact required variable list (`PRODUCTION_REQUIRED_ENV_VARS`, lines 11-35).
- Distinction between fatal required and non-fatal recommended (`PRODUCTION_RECOMMENDED_ENV_VARS`, lines 43-52).
- The `process.exit(1)` call itself (`production-config.ts:88`).

**Concrete failure scenario:** A typo in a newly added required var name (e.g. `CRON_SECRETT`) passes the startup check, the app boots, and the first secret read throws a runtime 500.

**Fix:** Add `tests/unit/security/production-config.test.ts`. Spy `process.exit` to throw a safe error and verify: missing required → exit, partial missing → exit, all present → no exit, recommended missing → warn only.

---

### F-03 — `sensitive-settings.ts`: `SENSITIVE_SETTINGS_KEYS` completeness is not behavior-tested

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `src/lib/security/sensitive-settings.ts:19-61`; `tests/unit/actions/system-settings.test.ts` (only mocks the gate)  

The canonical security boundary is the key list at `SENSITIVE_SETTINGS_KEYS` (`sensitive-settings.ts:19-54`). It is mocked in every caller test; `touchesSensitiveSettingsKey()` itself is never exercised.

**Concrete failure scenario:** A developer adds a security-relevant setting such as `loginBotProtectionEnabled` but forgets to add it to the list. A stolen session can disable bot protection without password reconfirmation.

**Fix:** Add a unit test that imports `touchesSensitiveSettingsKey` directly and asserts it returns `true` for every key in the list and `false` for unknown keys. Optionally cross-reference the list against `src/lib/validators/system-settings.ts`.

---

### F-04 — `derive-key.ts`: HKDF key derivation has zero unit tests

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `src/lib/security/derive-key.ts:1-31`; test file: none  

`deriveEncryptionKey(domain)` and `legacyEncryptionKey()` are never imported by any test. None of these cryptographic contracts are verified:
- Different domains produce different 32-byte keys.
- Same domain is deterministic.
- `legacyEncryptionKey()` returns SHA-256 of the secret, not an HKDF-derived key.
- Missing `PLUGIN_CONFIG_ENCRYPTION_KEY` throws.

**Concrete failure scenario:** A refactor changes a domain string; all existing plugin-config secrets become undecryptable with no failing test.

**Fix:** Add `tests/unit/security/derive-key.test.ts` using `vi.resetModules()` + env manipulation (same pattern as `encryption.test.ts`).

---

### F-05 — `sandbox-gate.ts`: Partially tested; several critical branches remain uncovered

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed partial remediation, residual gap  
- **Files / Lines:** `src/lib/security/sandbox-gate.ts:9-16,47-55,77-81,97-101,104`; `tests/unit/security/sandbox-gate.test.ts:64-122`  

A unit test file was added since the last review and covers the unverified-student rejection, verified under quota, quota exceeded, and `system.settings` capability bypass.  It does **not** cover:
1. `SANDBOX_ALLOW_UNVERIFIED_EMAIL` env bypass (`sandbox-gate.ts:9-16`).
2. `emailVerificationRequired === false` DB override (`sandbox-gate.ts:47-55`).
3. `getSystemSettings()` failure fallback (`sandbox-gate.ts:52-55`).
4. Staff-role bypass for `assistant` (`sandbox-gate.ts:77-81`).
5. The quota bypass for staff without `system.settings` (they should still consume quota).

**Concrete failure scenario:** A fresh deployment without SMTP sets `SANDBOX_ALLOW_UNVERIFIED_EMAIL=true` but a typo in the env parsing (`" true\n"`) still blocks instructors, or a new `assistant` staff role is rejected because the hardcoded role list is never verified.

**Fix:** Extend `tests/unit/security/sandbox-gate.test.ts` to exercise all five remaining branches and assert exact status/error payloads.

---

### F-06 — E2E `contest-participant-audit.spec.ts`: Permanently dead assertions

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed dead test  
- **Files / Lines:** `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136,177,190,203`  

Every assertion branch uses unconditional `test.skip(true, "...")`. After `test.skip(true)` the test body is abandoned, so the participant audit flow (contest list → Submissions tab → participant link → audit sections) is never exercised.

**Concrete failure scenario:** A route rename (`/participant/` → `/audit/`), tab rename, or nav restructuring breaks the flow, yet CI reports green because the spec silently skips.

**Fix:** Seed data in `beforeAll` using the `runtime-admin.ts` helpers (same pattern as `contest-full-lifecycle.spec.ts`). Create a group, contest, and submission, then navigate and assert the audit sections without runtime data discovery.

---

### F-07 — `proxy.test.ts`: Live-clock fixtures reduce determinism

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Likely flaky pattern  
- **Files / Lines:** `tests/unit/proxy.test.ts:113,336,347,358,386,397,408,451,464,477,537,548,559,683,709,733,748,759`  

The proxy test creates token fixtures with `authenticatedAt: Math.trunc(Date.now() / 1000)` and uses the same live-clock value in mock helpers. The suite does not use `vi.useFakeTimers()`.

**Concrete failure scenario:** If `Date.now()` ticks across a second boundary between fixture creation and middleware invocation, cache keys or timestamp comparisons can diverge. This is low-probability per run but accumulates across hundreds of CI invocations.

**Fix:** Add `vi.useFakeTimers()` / `vi.setSystemTime(...)` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. Replace live `Date.now()` calls with the frozen timestamp. The pattern already exists in `tests/component/countdown-timer.test.tsx`.

---

### F-08 — `rate-limit-core.ts`: Direct `ON CONFLICT` / `upsertRateLimitEntry` path has no dedicated unit test

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Partially remediated; residual gap  
- **Files / Lines:** `src/lib/security/rate-limit-core.ts:89-138`; `tests/unit/security/rate-limit.test.ts:122-135`  

`insertRateLimitEntryIfAbsent()` and `upsertRateLimitEntry()` are now exercised indirectly through the consumer mock in `rate-limit.test.ts`, but there is no dedicated test for the core primitive itself. The `if (inserted) return;` guard at `rate-limit-core.ts:125-127` and the UPDATE fallback are not tested in isolation.

**Concrete failure scenario:** A refactor removes the `if (inserted) return` guard, always proceeding to UPDATE. On a genuine first insert the UPDATE path may undercount or misorder attempts; no test fails.

**Fix:** Add `tests/unit/security/rate-limit-core.test.ts` with a DB mock that returns `{ rowCount: 0 }` to exercise the conflict/fallthrough path and assert the subsequent UPDATE is issued.

---

### F-09 — `rate-limiter-rs`: Middleware, constant-time compare, and backoff cap are untested

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `rate-limiter-rs/src/main.rs:52-61,63-85,257-263`; inline tests at `main.rs:449-575`  

The existing Rust tests call handler functions directly and bypass the Axum stack. Missing coverage:
1. `constant_time_eq` (`main.rs:52-61`) — equal-length different-content inputs returning `false` are unverified.
2. `require_bearer` middleware (`main.rs:63-85`) — missing `Authorization` header, missing `"Bearer "` prefix, and wrong token paths are not exercised.
3. Exponential backoff cap (`main.rs:257-263`) — `MAX_CONSECUTIVE_BLOCKS_EXP = 4` caps the multiplier at 16×; existing tests only exercise 2 consecutive blocks.
4. The startup refusal when `RATE_LIMITER_AUTH_TOKEN` is unset (`main.rs:382-401`).

**Concrete failure scenario:** A refactor of `require_bearer` accidentally drops the `strip_prefix("Bearer ")` check and accepts any non-empty `Authorization` value. No test detects it because handlers are invoked directly.

**Fix:** Use Axum's test helpers to invoke the full router including middleware. Add direct tests for `constant_time_eq`, the backoff cap (call `record_failure` 6+ times), and the missing-token startup exit path.

---

### F-10 — `judge-worker-rs/src/runner.rs`: HTTP handler validation logic has no unit tests

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `judge-worker-rs/src/runner.rs:641-737`  

`runner.rs` contains the HTTP API including source-code size enforcement (`MAX_SOURCE_CODE_BYTES`, line 22), stdin size enforcement (`MAX_STDIN_BYTES`, line 23), Docker image validation on the incoming `docker_image` field (`runner.rs:680`), shell-command validation (`runner.rs:691-710`), and semaphore capacity enforcement (`runner.rs:713`). There are no `#[cfg(test)]` blocks for the HTTP layer in this file.

**Concrete failure scenario:** The `source_code.len() > MAX_SOURCE_CODE_BYTES` guard is removed in a refactor; a 1 MB source file reaches Docker and OOM-kills the container. No test catches the regression.

**Fix:** Add `#[cfg(test)]` blocks to `runner.rs` with unit tests for: oversized source code → 400, oversized stdin → 400, invalid `docker_image` → 400, invalid shell metacharacters → 400, semaphore exhausted → 503, missing/invalid auth → 401.

---

### F-11 — `revokeContestAccessTokensForGroup()` is only asserted via source scan

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Confirmed false-confidence  
- **Files / Lines:** `src/lib/assignments/contest-access-tokens.ts:69-91`; `tests/unit/api/group-member-delete-implementation.test.ts:28`; `tests/unit/assignments/contest-access-tokens.test.ts`  

The group-member-delete test verifies the function name appears in the route source. It does not verify execution, transaction scoping, argument order, or that tokens for other groups are untouched. `tests/unit/assignments/contest-access-tokens.test.ts` covers other helpers but not this function.

**Concrete failure scenario:** The `inArray` sub-select is changed to scope on the wrong column. The source-scan test still passes, but removing a member no longer revokes contest access.

**Fix:** Add a behavior test in `tests/unit/assignments/contest-access-tokens.test.ts` using a mock transaction. Assert tokens for the group's assignments are deleted and other groups' tokens remain.

---

### F-12 — `ip.ts`: `unwrapMappedIpv4()` edge cases lack direct tests

- **Severity:** Low / Medium  
- **Confidence:** Medium  
- **Status:** Risk needing validation  
- **Files / Lines:** `src/lib/security/ip.ts:33-44`; `tests/unit/security/ip.test.ts:106-133`  

`unwrapMappedIpv4` is exported but only exercised indirectly through `extractClientIp`. Direct edge cases not tested:
- Uppercase `::FFFF:192.0.2.1` (regex has `/i`, but untested).
- Empty string input.
- Trailing garbage after the IPv4 portion.
- Invalid octet > 255 (indirectly hit once, but not against the exported function).

**Concrete failure scenario:** `isValidIpv4` validation is weakened; `unwrapMappedIpv4("::ffff:999.1.1.1")` returns an invalid IP that flows into rate-limit keying or audit logs.

**Fix:** Add direct `unwrapMappedIpv4` cases to `tests/unit/security/ip.test.ts` importing the function by name.

---

### F-13 — ~162 implementation-checklist tests assert string presence instead of runtime behavior

- **Severity:** Medium  
- **Confidence:** High  
- **Status:** Confirmed false-confidence / maintenance hazard  
- **Files / Lines:** `tests/unit/*-implementation.test.ts` (90 files), plus `tests/unit/proxy-error-handling.test.ts`, `tests/unit/auto-review-implementation.test.ts`, `tests/unit/deployment-automation-docs.test.ts`, `tests/unit/admin-security-docs.test.ts`, etc.  

A grep for files containing both `readFileSync` and `toContain` returned **162 unit test files**. The 90 `*-implementation.test.ts` files in particular are source-scan checklists:

```typescript
// tests/unit/proxy-error-handling.test.ts:8-13
const source = readFileSync(join(process.cwd(), PROXY_PATH), "utf8");
expect(source).toContain("try {");
expect(source).toContain("catch (error)");
```

Problems:
- A behavior-preserving refactor (renaming a helper, extracting an error boundary) breaks the test.
- `toContain("try {")` passes even if the `try` is in dead code or a comment.
- The tests give high coverage numbers without proving the logic works at runtime.

**Concrete failure scenario:** A developer moves logic into a shared helper with the same behavior but different literal strings; dozens of "tests" fail while real regressions elsewhere go undetected. Conversely, a behavioral regression that does not change the searched strings passes the suite.

**Fix:** Treat source-scan tests as documentation/contract checks, not as behavioral coverage. For each critical checklist, add a corresponding runtime test that imports the function/module and exercises the behavior. Reduce the weight of implementation-checklist files in coverage reporting or exclude them from coverage thresholds.

---

### F-14 — Compiler local fallback Docker path is not behavior-tested

- **Severity:** High  
- **Confidence:** High  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `src/lib/compiler/execute.ts:716-850`; `tests/unit/compiler/execute.test.ts`; `tests/unit/compiler/execute-implementation.test.ts:6-34`  

`execute.ts` has ~950 lines. The existing tests (`execute.test.ts`) cover runner-token preference, shell-command rejection, and config errors. The local-fallback Docker path (workspace creation, `chmod 0o700`, `chown` to sandbox uid, container execution, output-limit teardown, cleanup) is only checked by source-scan assertions in `execute-implementation.test.ts:6-34`.

Untested runtime behavior:
- Temp workspace is created under `WORKSPACE_BASE` and removed after use.
- `chmod 0o700` / `chmod 0o600` are actually applied.
- `chown` failure triggers the fail-closed path.
- Compile-command success/failure propagation and `compileOutput` handling.
- Timeout/OOM detection from `docker inspect`.

**Concrete failure scenario:** A refactor changes the order of `chown` vs. `chmod`, or swallows a Docker error. The source-scan tests still pass, but the sandbox becomes world-readable or failures are silently reported as success.

**Fix:** Add behavior tests for the local fallback behind `ENABLE_COMPILER_LOCAL_FALLBACK=1` using `vi.mock` for `child_process.execFile`/`fs`/`docker`. Verify permissions, fail-closed chown errors, and result propagation without requiring a real Docker daemon.

---

### F-15 — `similarity-check` route lacks negative authorization and error-path tests

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Confirmed coverage gap  
- **Files / Lines:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-94`; `tests/unit/api/similarity-check.route.test.ts:86-193`  

The existing three tests cover the `not_run` reason, the timeout path, and the assistant authorization path. Missing:
- Forbidden response for non-managers / assistants without `anti_cheat.run_similarity` (`route.ts:37-41`).
- 404 for missing assignment or `examMode === "none"` (`route.ts:31-35`).
- Non-abort error rethrow path (`route.ts:51-63`).
- DB enrichment of pairs with usernames (`route.ts:67-87`).

**Concrete failure scenario:** A regression removes the `canManageContest` check or returns 200 for assistants assigned to a different group. No test fails because the authorization matrix is not exercised.

**Fix:** Extend `tests/unit/api/similarity-check.route.test.ts` with cases for 403 (unauthorized role, wrong group TA, no capability), 404 (missing assignment / `examMode: "none"`), non-abort error propagation, and pair username enrichment.

---

### F-16 — Integration tests are conditionally skipped and not guaranteed locally

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Confirmed missing layer  
- **Files / Lines:** `tests/integration/db/catalog-numbers.test.ts:23`, `tests/integration/db/user-crud.test.ts:15`, `tests/integration/db/submission-lifecycle.test.ts:28`, `tests/integration/db/judge-claim-reclaim.test.ts:28`, `tests/integration/api/health.test.ts:6`  

All integration suites use `describe.skipIf(!hasPostgresIntegrationSupport)`. They run in CI because `INTEGRATION_DATABASE_URL` is provided, but locally they silently skip unless the developer sets up Postgres. The most important reliability property — judge claim reclaim after worker death — lives only in this tier.

**Concrete failure scenario:** A developer running `npm run test:unit` believes the reliability logic is tested, but the reclaim semantics are never exercised on their machine. A regression introduced locally is only caught in CI, if at all.

**Fix:** Provide a `docker-compose.test-backends.yml` service or documented one-liner to spin up a test Postgres so integration tests run locally. Add a pre-test warning when they skip, and ensure CI runs them with the real service container.

---

### F-17 — Function-judging harness smoke tests are toolchain-gated

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Confirmed missing layer  
- **Files / Lines:** `tests/harness/adapters-smoke.test.ts:108,126,145,187,212,242,273`  

Every language in the harness suite is gated with `describe.skipIf(!py)`, `describe.skipIf(!nodeBin)`, etc. On a typical macOS/Linux dev machine, C# (Mono via Docker) and possibly others are skipped. CI runs the harness best-effort, but the test file itself cannot fail CI if a toolchain is missing.

**Concrete failure scenario:** A serialization regression in a rarely-installed language adapter is only discovered after deployment because the harness never ran in the local loop.

**Fix:** In CI, install or pull the required toolchains explicitly so every adapter runs. For local development, document how to install each toolchain or provide a dev container that includes them.

---

### F-18 — Deployment/infrastructure tests are source scans, not runtime validations

- **Severity:** Medium  
- **Confidence:** Medium  
- **Status:** Risk needing validation  
- **Files / Lines:** `tests/unit/infra/deploy-security.test.ts:9-251`, `tests/unit/infra/deploy-storage-safety.test.ts:21-143`, `tests/unit/infra/judge-report-nginx.test.ts:9-45`  

These tests assert that `deploy-docker.sh`, nginx configs, and compose files contain specific strings. They do not execute the scripts or validate that the produced artifacts actually satisfy the security contract.

**Concrete failure scenario:** A deployment script is syntactically valid and contains the expected strings, but a subtle quoting bug causes `.env.production` permissions to remain world-readable in practice. The source-scan test passes while production is misconfigured.

**Fix:** Complement string-presence checks with lightweight runtime smoke tests: run `bash -n` on scripts (CI already does this for some), spin up the compose stack in CI and assert the rate-limiter service has no host port, and validate nginx config with `nginx -t`.

---

### F-19 — Coverage thresholds are low and not enforced on the default unit gate

- **Severity:** Medium  
- **Confidence:** High  
- **Status:** Confirmed test-hygiene issue  
- **Files / Lines:** `vitest.config.ts:36-54`; `package.json:11-12`  

The default `npm run test:unit` command runs `vitest run` without `--coverage`. Coverage thresholds are only evaluated when `npm run test:unit:coverage` is invoked. The global thresholds are also permissive — **functions 40%** — and the per-module `src/lib/security/**` / `src/lib/auth/**` targets do not prevent untested files in those directories from dragging coverage below 90%, because uncovered files are included in the denominator.

**Concrete failure scenario:** A PR adds a new security-critical module with zero tests and still passes the default CI-style `npm run test:unit` gate. Coverage regressions are only caught if someone manually runs the coverage command.

**Fix:** Run `npm run test:unit:coverage` in CI (already done) and consider failing the gate on uncovered additions to `src/lib/security/**` or `src/lib/auth/**`. Raise the global function threshold over time and exclude implementation-checklist source-scan tests from coverage counting.

---

## TDD Opportunities (write these tests before the next refactor)

1. **`tests/unit/security/hcaptcha.test.ts`** — drive out DB/env precedence and verify HTTP paths (F-01).
2. **`tests/unit/security/production-config.test.ts`** — drive out the startup exit path (F-02).
3. **`tests/unit/security/sensitive-settings-keys.test.ts`** — drive out the complete key list contract (F-03).
4. **`tests/unit/security/derive-key.test.ts`** — drive out HKDF determinism and domain separation (F-04).
5. **Extend `tests/unit/security/sandbox-gate.test.ts`** — drive out the env bypass, DB override, settings failure fallback, and assistant staff branch (F-05).
6. **`tests/unit/security/rate-limit-core.test.ts`** — drive out the `ON CONFLICT DO NOTHING` UPDATE fallback (F-08).
7. **`rate-limiter-rs/src/main.rs` middleware + startup tests** — drive out bearer rejection, backoff cap, and missing-token fatal startup (F-09).
8. **`judge-worker-rs/src/runner.rs` `#[cfg(test)]` module** — drive out handler input validation (F-10).
9. **`tests/unit/assignments/contest-access-tokens.test.ts`** — drive out `revokeContestAccessTokensForGroup` behavior (F-11).
10. **`tests/unit/compiler/execute-local-fallback.test.ts`** — drive out workspace permission and fail-closed behavior without Docker (F-14).
11. **`tests/unit/api/similarity-check-authz.test.ts`** — drive out 403/404/error paths (F-15).
12. **Resurrect `tests/e2e/contest-participant-audit.spec.ts`** — replace runtime data discovery with seeded fixtures (F-06).

---

## Final Sweep Notes

- **Mock fragility:** No `vi.mock` cycles or unreset global stubs were found, but many unit tests use module-level `vi.mock` with shared mutable state. Ensure each test file resets mocks in `beforeEach`.
- **Flaky clock patterns:** Outside `proxy.test.ts`, `Date.now()` is used intentionally in tests that assert the absence of `Date.now()` in production code (`time-route-db-time.test.ts`, `judge-claim-db-time.test.ts`) and in factory fixtures that do not feed into time-bound assertions. These are acceptable.
- **No currently failing tests** in the unit or judge-worker Rust suites. E2E health was not verified locally because Playwright requires a built app and seeded database.
- **Source-scan dominance:** The largest single class of risk is the ~162 tests that read source files and assert string presence. They inflate confidence and should be complemented with behavioral tests for every security-relevant contract.
- **Positive trend:** The new `sandbox-gate.test.ts` and the conflict-aware mock in `rate-limit.test.ts` show the right direction — core security gates should continue to receive direct behavioral coverage rather than being mocked away in route tests.
