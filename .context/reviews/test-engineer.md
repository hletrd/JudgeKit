# Test Engineer Review — Cycle 3

**Date:** 2026-06-30
**Reviewer:** test-engineer agent
**Scope:** Full repository — test coverage gaps, flaky tests, missing assertions, gate reliability, TDD opportunities
**Findings count:** 22

---

## Executive Summary

The judgekit test suite is large (~527 test files across unit/component/integration/e2e/harness tiers) and demonstrates genuine investment in coverage. However, four security-critical library modules have **zero unit tests despite being called by production routes without any test-layer mocks protecting their behavior**, the e2e participant-audit spec is **silently dead** (unconditional `test.skip(true)`), the proxy middleware has **18 live-clock calls without fake timers**, roughly **30+ "tests" are source-file scanners** that assert string patterns in source rather than runtime behavior — giving false confidence without catching logic regressions — and **one unit test added in cycle 1 is currently failing** because its regex crosses nginx server-block boundaries.

---

## Inventory

| Tier | Files | Gate command |
|---|---|---|
| Unit | ~200 files in `tests/unit/` | `npm run test:unit` (vitest) |
| Component | ~90 files in `tests/component/` | `npm run test:component` (vitest + jsdom) |
| Integration | 5 files in `tests/integration/` | `npm run test:integration` |
| Harness | 1 file in `tests/harness/` | `npm run test:harness` |
| E2E | ~43 files in `tests/e2e/` | `npm run test:e2e` (Playwright) |
| Rust | Inline `#[cfg(test)]` in Cargo workspace | `cargo test` |

Coverage thresholds (unit, `vitest.config.ts`): statements 60%, branches 50%, **functions 40%**, lines 60%; security/auth modules target 90/85/90/90.

---

## Findings

### F-01 — `sandbox-gate.ts`: Critical security gate has zero unit tests (HIGH)

**File:** `src/lib/security/sandbox-gate.ts:37-84`
**Confidence:** CONFIRMED

`gateSandboxEndpoint()` is the sole gate protecting Docker-spawning endpoints (compiler run at `src/app/api/v1/compiler/run/route.ts:77` and playground run at `src/app/api/v1/playground/run/route.ts:54`). It enforces email verification and per-user daily quota. Every test that exercises those routes mocks it away entirely:

```typescript
// tests/unit/api/playground-run.route.test.ts
vi.mock("@/lib/security/sandbox-gate", () => ({
  gateSandboxEndpoint: vi.fn(async () => null),
}));
```

The following logic branches are **never exercised by any test**:

1. `SANDBOX_ALLOW_UNVERIFIED_EMAIL` env-var bypass (`sandbox-gate.ts:17-21`) — the hard override that skips ALL verification.
2. `settings.emailVerificationRequired === false` DB override (`sandbox-gate.ts:44-49`).
3. Staff role bypass for `instructor/admin/super_admin/assistant` roles (`sandbox-gate.ts:57-62`) — if the role list is wrong or incomplete, staff get a 403 on a fresh deployment without SMTP.
4. The `enforceEmailGate` DB-fallback-on-error path (`sandbox-gate.ts:48` catch block).

**Failure scenario:** A deployment without SMTP silently blocks all instructor sandbox access because no test has ever verified the `isStaff` check executes before the `emailVerified` check. Adding a new admin role (e.g. `"ta"`) to the system would fail to bypass the gate because the role list is hardcoded and never tested.

**Suggested fix:** Add `tests/unit/security/sandbox-gate.test.ts` with `vi.mock("@/lib/db")`, `vi.mock("@/lib/system-settings")`, and `vi.mock("@/lib/security/api-rate-limit")`. Test all five gate paths: env-bypass, DB-disabled, staff role, unverified student (403), and quota exhausted.

---

### F-02 — `hcaptcha.ts`: `verifyHcaptchaToken` and configuration helpers have zero unit tests (HIGH)

**File:** `src/lib/security/hcaptcha.ts:1-83`
**Confidence:** CONFIRMED

`isHcaptchaConfigured`, `getHcaptchaSecret`, `getHcaptchaSiteKey`, and `verifyHcaptchaToken` are all mocked at every call site and never executed in tests. Grep across all test directories confirms no file imports these from the actual module.

Untested behaviors:

- **DB vs. env precedence**: `getHcaptchaSiteKey()` returns `db.siteKey || envSiteKey()`. If the DB setting is an empty string, it falls back to env because `""` is falsy — this priority logic is never tested.
- **`verifyHcaptchaToken` HTTP error path** (`src/lib/security/hcaptcha.ts:63-68`): `if (!response.ok)` returns `{ success: false, errorCodes: ["http-${response.status}"] }` — never tested.
- **JSON parse failure** (`.catch(() => ({ success: false, "error-codes": ["parse-error"] }))`): never tested.
- **`allowPlaintextFallback: true` passed to `decrypt()`** for the DB secret (line 21): hcaptcha's specific usage of the migration-compat flag is not verified.

**Failure scenario:** A future refactor changes DB vs. env priority order. No test fails. Captcha silently uses the wrong secret, causing all signups to fail or succeed without verification.

**Suggested fix:** Add `tests/unit/security/hcaptcha.test.ts` mocking `@/lib/system-settings` and `global.fetch`. Cover: DB key wins over env, env fallback when DB is null, empty-string DB falls back to env, `verifyHcaptchaToken` success/failure/HTTP-error/parse-error cases.

---

### F-03 — `production-config.ts`: `assertProductionConfig` process.exit(1) path never tested (HIGH)

**File:** `src/lib/security/production-config.ts:61-93`
**Confidence:** CONFIRMED

`assertProductionConfig()` is called from `src/instrumentation.ts` at Next.js boot. When `NODE_ENV=production` and any of `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, or `NODE_ENCRYPTION_KEY` is missing, it calls `process.exit(1)`. No test exercises this module at all:

```bash
grep -r "production-config\|assertProductionConfig" tests/
# → zero output
```

Untested: the exact set of required vars, the distinction between the fatal required list and the non-fatal recommended list (`JUDGE_ALLOWED_IPS` → warns only), and the `process.exit(1)` call itself.

**Failure scenario:** A developer adds a required env var to `PRODUCTION_REQUIRED_ENV_VARS` with a typo in the `name` field (e.g. `"NODE_ENCRYPTOIN_KEY"`). The startup check silently passes for the misspelled var, the app boots, and the first encrypted-secret read throws a runtime 500. No test caught the mismatch.

**Suggested fix:** Add `tests/unit/security/production-config.test.ts`. Use `vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); })` to test the exit path without killing the vitest process. Verify required-var exit, partial-missing exit, all-present no-exit, and recommended-missing console.warn.

---

### F-04 — `sensitive-settings.ts`: `SENSITIVE_SETTINGS_KEYS` list completeness never behavior-tested (HIGH)

**File:** `src/lib/security/sensitive-settings.ts:18-48`
**Confidence:** CONFIRMED

`touchesSensitiveSettingsKey()` and `requireSettingsReconfirm()` are mocked in every caller test. The actual key list in `SENSITIVE_SETTINGS_KEYS` is the canonical security boundary — if any key that affects security posture is omitted from the list, password reconfirmation is silently skipped.

```typescript
// tests/unit/actions/system-settings.test.ts — only usage
vi.mock("@/lib/security/sensitive-settings", () => ({
  requireSettingsReconfirm: mocks.requireSettingsReconfirm,
  // touchesSensitiveSettingsKey never used in any test
}));
```

**Failure scenario:** A developer adds `"loginBotProtectionEnabled"` as a new system setting but forgets to add it to `SENSITIVE_SETTINGS_KEYS`. `touchesSensitiveSettingsKey({ loginBotProtectionEnabled: false })` returns `false`, the API route skips password reconfirmation, and a stolen session can silently disable bot protection. No test catches this.

**Suggested fix:** Add a unit test that imports `touchesSensitiveSettingsKey` directly (not mocked) and:
1. Asserts it returns `true` for each key in the list individually.
2. Asserts it returns `false` for an unknown key.
3. Cross-references the list against the Zod schema in `src/lib/validators/system-settings.ts` to verify every validated setting that changes security posture is present.

---

### F-05 — `derive-key.ts`: HKDF key derivation has zero unit tests (HIGH)

**File:** `src/lib/security/derive-key.ts:1-36`
**Confidence:** CONFIRMED

`deriveEncryptionKey(domain)` and `legacyEncryptionKey()` are never imported by any test file. The HKDF approach uses domain separation so each plugin-config domain gets a cryptographically independent key. None of these properties are verified:

- Two different `domain` strings must produce different 32-byte keys.
- The same `domain` string must be deterministic (same input → same key).
- `legacyEncryptionKey()` must produce the SHA-256 of the secret, not an HKDF-derived key.
- Missing `PLUGIN_CONFIG_ENCRYPTION_KEY` must throw in both functions.

**Failure scenario:** A typo in a domain string during a refactor causes `deriveEncryptionKey("plugin-config")` to map to a different key than what was used to encrypt existing configs. All plugin secrets silently become undecryptable. No test ever ran the function to detect the regression.

**Suggested fix:** Add `tests/unit/security/derive-key.test.ts`. Use the `vi.resetModules()` + env manipulation pattern from `encryption.test.ts` for isolation. Test: determinism, domain separation, legacy SHA-256 path, and missing-secret throw.

---

### F-06 — E2E `contest-participant-audit.spec.ts`: All assertion paths use `test.skip(true, ...)` — permanently dead (HIGH)

**File:** `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136,177,190,203`
**Confidence:** CONFIRMED

Every assertion branch in this spec ends in `test.skip(true, "...")`. These are unconditional — `test.skip(true)` always skips regardless of what precedes it:

```typescript
if (!isVisible) {
  test.skip(true, "No contests available to test");
  return;
}
```

After `test.skip(true)` the test body is abandoned. The spec emits 0 failures but exercises 0 assertions about participant audit behavior. The entire participant audit flow — navigation from contests list, Submissions tab, participant linking, and all four audit sections — is permanently excluded from CI.

**Failure scenario:** The participant audit page URL changes (`/participant/` → `/audit/`), the Submissions tab is renamed, or nav restructuring breaks the flow. The spec continues to "pass" (by skipping) and the regression is not detected.

**Suggested fix:** Seed the required data in `beforeAll` using the `runtime-admin.ts` API helpers (the same pattern used by `contest-full-lifecycle.spec.ts:65+`). Create a group, contest, and participant, then navigate and assert the audit sections without runtime data-discovery.

---

### F-07 — `proxy.test.ts`: 18 live `Date.now()` calls without fake timers — potential clock flake (MEDIUM)

**File:** `tests/unit/proxy.test.ts:113,336,347,358,386,397,408,451,464,477`
**Confidence:** CONFIRMED

The proxy test creates token fixtures with `authenticatedAt: Math.trunc(Date.now() / 1000)` to represent a "just logged in" session. The middleware compares this against a mocked `tokenInvalidatedAt` to decide if the session is revoked. Tests run under real wall-clock time with no `vi.useFakeTimers()`.

If a test machine's `Date.now()` ticks across a second boundary between fixture creation and the middleware invocation (e.g. under GC pause or heavy CPU load), `Math.trunc(Date.now() / 1000)` evaluates to a different integer in the fixture vs. the middleware's internal check, making a valid session appear revoked.

This is low-probability per individual run but accumulates to a measurable failure rate across hundreds of CI invocations.

**Failure scenario:** A slow CI runner causes 1–2 seconds of delay. `authenticatedAt` truncates to `T`, but the middleware checks `T < tokenInvalidatedAt` where `tokenInvalidatedAt` was set to `T+1`. The session is treated as revoked. The test fails intermittently with no code change.

**Suggested fix:** Add `vi.useFakeTimers()` / `vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))` in a `beforeEach` and `vi.useRealTimers()` in `afterEach`. Replace all `Math.trunc(Date.now() / 1000)` with the frozen timestamp. The pattern is already established in `tests/component/countdown-timer.test.tsx`.

---

### F-08 — `rate-limit-core.ts`: ON CONFLICT first-insert race path not directly tested (MEDIUM)

**File:** `src/lib/security/rate-limit-core.ts:75-121`
**Confidence:** CONFIRMED

`insertRateLimitEntryIfAbsent()` returns `true` when it wins the insert race, `false` when a concurrent transaction already inserted. On `false`, callers fall through to UPDATE. This is the AGG2-3 fix — without it, concurrent first-hits throw a unique-violation 500.

Tests in `tests/unit/security/api-rate-limit.test.ts:458` cover "first-insert race" conceptually, but the DB mock always returns as if the insert succeeded:

```typescript
// mock returns { rowCount: 1 } unconditionally — the conflict branch
// (rowCount: 0 → fall through to UPDATE) is never exercised
```

The conditional at `rate-limit-core.ts:98`:
```typescript
const inserted = await insertRateLimitEntryIfAbsent(tx, key, data);
if (inserted) return;
// UPDATE fallback — never executed in any test
```

**Failure scenario:** A refactor removes the `if (inserted) return` guard, always proceeding to UPDATE. On a genuine first insert this UPDATEs a row that may not yet be committed by the concurrent winner, silently losing the first attempt count. No test detects the regression because the UPDATE path was never exercised.

**Suggested fix:** Add dedicated tests for `insertRateLimitEntryIfAbsent` and `upsertRateLimitEntry` in a new `tests/unit/security/rate-limit-core.test.ts`. Use a DB mock that returns `{ rowCount: 0 }` to exercise the conflict/fallthrough path.

---

### F-09 — `rate-limiter-rs/src/main.rs`: `constant_time_eq`, bearer middleware, and backoff cap untested (MEDIUM)

**File:** `rate-limiter-rs/src/main.rs:51-57,62-89,196-213`
**Confidence:** CONFIRMED

The rate-limiter Rust sidecar has only two integration-style tests: `check_increments_and_blocks_at_limit` and `record_failure_blocks_and_reset_clears_entry`. Missing coverage:

1. **`constant_time_eq` (lines 51–57)**: The constant-time comparison used for bearer auth is never directly tested. Equal-length different-content inputs returning `false` is unverified.

2. **`require_bearer` middleware (lines 62–89)**: Tests call handler functions directly, bypassing the Axum middleware layer. Missing/short `Authorization` header → 401, `"Bearer "` prefix absent → 401, and wrong token → 401 paths are untested.

3. **Exponential backoff cap (lines 196–213)**: `MAX_CONSECUTIVE_BLOCKS_EXP = 4` caps the exponent at 4 (max 16× multiplier). The existing test exercises only 2 consecutive blocks. The cap at 5+ blocks is never verified, so a change to the constant could let block duration grow unboundedly.

**Failure scenario:** A refactor of `require_bearer` accidentally drops the `strip_prefix("Bearer ")` check, accepting any non-empty `Authorization` value. No test detects it because tests call handlers directly without the middleware.

**Suggested fix:** Use Axum's `axum::test` helpers or a lightweight `TestServer` wrapper to invoke the full router including middleware. Add a test for `constant_time_eq` directly. Add a backoff test that calls `record_failure` 6+ times to verify the `MAX_CONSECUTIVE_BLOCKS_EXP` cap applies.

---

### F-10 — `judge-worker-rs/src/runner.rs`: No Rust unit tests for HTTP handler validation logic (MEDIUM)

**File:** `judge-worker-rs/src/runner.rs`
**Confidence:** CONFIRMED

`runner.rs` (~350 lines) contains the judge-worker's HTTP API including source-code size enforcement (`MAX_SOURCE_CODE_BYTES = 64*1024`), stdin size enforcement (`MAX_STDIN_BYTES = 64*1024`), Docker image validation on incoming `docker_image` fields, semaphore capacity enforcement, and the `docker_capability_ok` AtomicBool gate. There are zero `#[cfg(test)]` blocks in this file.

The `validation.rs` module is well-tested; but the handler that *calls* `validate_docker_image` on the incoming request field — and the size checks — have no tests.

**Failure scenario:** The `source_code.len() > MAX_SOURCE_CODE_BYTES` guard is accidentally removed in a refactor. A 1 MB source file passes through to Docker, potentially OOM-killing the container. No test catches the regression.

**Suggested fix:** Add `#[cfg(test)]` blocks to `runner.rs` with unit tests for: oversized source code → error response, oversized stdin → error response, invalid docker image field → 400 bad request, `docker_capability_ok = false` → appropriate error.

---

### F-11 — `revokeContestAccessTokensForGroup()`: Only asserted via source-scan, not behavior-tested (MEDIUM)

**File:** `src/lib/assignments/contest-access-tokens.ts:60-82`
**Confidence:** CONFIRMED

The group-member-delete test verifies the function is *called* by scanning the route's source file:

```typescript
// tests/unit/api/group-member-delete-implementation.test.ts:28
expect(source).toContain("revokeContestAccessTokensForGroup(tx, id, userId)");
```

This verifies the function name appears in the source — not that it executes, uses the correct arguments, runs inside the transaction, or returns the correct row count for the audit record.

`tests/unit/assignments/contest-access-tokens.test.ts` covers `findValidContestAccessToken`, `contestAccessTokenExpiry`, and `syncContestAccessTokenExpiry` but does **not** test `revokeContestAccessTokensForGroup`.

**Failure scenario:** The function is renamed or the `inArray` sub-select is changed to a different pattern that doesn't scope revocation to the group's assignments. The source-scan test still passes (partially) but member removal no longer revokes contest access.

**Suggested fix:** Add a test case for `revokeContestAccessTokensForGroup` in `tests/unit/assignments/contest-access-tokens.test.ts` using a mock transaction. Verify tokens for the group's assignments are deleted, and tokens for other groups' assignments are not touched.

---

### F-12 — `ip.ts`: `unwrapMappedIpv4()` not directly tested as exported function (MEDIUM)

**File:** `src/lib/security/ip.ts:33-44`
**Confidence:** CONFIRMED

`unwrapMappedIpv4` is exported but only exercised indirectly via `extractClientIp`. The following edge cases have no direct test:

- `unwrapMappedIpv4("::FFFF:192.0.2.1")` — uppercase `FFFF` (regex is `/i` so it matches, but untested)
- `unwrapMappedIpv4("")` — empty string (regex won't match, returns `null`, untested)
- `unwrapMappedIpv4("::ffff:1.2.3.4:extra")` — trailing garbage after the IPv4 portion
- `unwrapMappedIpv4("::ffff:999.1.1.1")` — invalid octet > 255 (indirectly hit at `ip.test.ts:118` via `extractClientIp`, but the exported function itself is not called)

**Failure scenario:** `isValidIpv4` octet validation is weakened in a refactor. `unwrapMappedIpv4("::ffff:999.1.1.1")` now returns `"999.1.1.1"`, which passes through to rate-limit keying. No direct test for the exported function catches the regression.

**Suggested fix:** Add direct `unwrapMappedIpv4` test cases to `tests/unit/security/ip.test.ts`, importing the function by name. Cover valid, uppercase, invalid-octet, empty, and trailing-garbage inputs.

---

### F-13 — ~30+ source-scanning tests assert string presence instead of runtime behavior (LOW)

**Files:** `tests/unit/proxy-error-handling.test.ts`, `tests/unit/auth/login-rate-limit-order.test.ts`, `tests/unit/auth/rate-limit-await.test.ts`, `tests/unit/auto-review-implementation.test.ts`, `tests/unit/discussions-reply-count-implementation.test.ts`, `tests/unit/participant-audit-page-implementation.test.ts`, `tests/unit/submission-detail-time-limit-implementation.test.ts`, `tests/unit/problem-duplicate-implementation.test.ts`, `tests/unit/public-user-stats-implementation.test.ts`, and ~20 more
**Confidence:** CONFIRMED

These tests use `readFileSync` + `expect(source).toContain(...)` to assert specific strings appear in production source files:

```typescript
// tests/unit/proxy-error-handling.test.ts
it("wraps the proxy handler in a try/catch block", () => {
  const source = readFileSync(..., "utf8");
  expect(source).toContain("try {");
  expect(source).toContain("catch (error)");
});
```

Problems:
1. A refactor that renames `try/catch` to an error-boundary utility preserves behavior but breaks the test.
2. `toContain("try {")` passes even if the `try` block is in dead code or a comment.
3. These tests never execute the code path they claim to verify.
4. v8 coverage does not credit these as covering any source lines.

Approximately 416 `readFileSync` calls across 30+ `*-implementation.test.ts` files were identified.

**Suggested fix:** Prioritize converting the highest-risk source-scanners to behavioral tests:
- `proxy-error-handling.test.ts` → mock a handler that throws, assert middleware returns `{ error: "internalServerError" }` with status 500.
- `login-rate-limit-order.test.ts` → spy on `consumeRateLimitAttemptMulti` and assert it resolves before the credential check.
- `rate-limit-await.test.ts` → use a mock that returns a never-resolving promise until awaited to verify fire-and-forget is not used.

Lower-risk source-scanners covering deploy script patterns or UI layout assertions can remain as a secondary lint layer if behavioral tests are added alongside them.

---

### F-14 — `data-retention.ts`: `parseRetentionOverride()` invalid env values produce silent fallback — untested (LOW)

**File:** `src/lib/data-retention.ts`
**Confidence:** PLAUSIBLE

`parseRetentionOverride` is module-private and falls back to defaults when env values are `NaN` or `<= 0`. Tests in `tests/unit/data-retention.test.ts` cover pruning logic but do not exercise the parsing path with invalid values:

- `AUDIT_EVENT_RETENTION_DAYS="not-a-number"` → should use default 90; untested
- `AUDIT_EVENT_RETENTION_DAYS="-5"` → should use default 90; untested
- `AUDIT_EVENT_RETENTION_DAYS="0"` → should use default 90 (`> 0` condition); untested

**Failure scenario:** An operator sets `AUDIT_EVENT_RETENTION_DAYS="30d"` (human-readable string). `parseInt("30d", 10)` returns `30` (leading digits parsed), which is valid — data is retained 30 days as expected. But `parseInt("d30", 10)` returns `NaN` → falls back to 90 days, silently ignoring the operator's intent. No test validates this behavior.

**Suggested fix:** Export `parseRetentionOverride` for testing, or add a thin module wrapper. Add tests for NaN, zero, negative, and string-with-suffix inputs.

---

### F-15 — Coverage threshold (40% functions) too permissive; unimported security modules escape reporting entirely (LOW)

**File:** `vitest.config.ts:30`
**Confidence:** CONFIRMED

The unit coverage config sets `functions: 40` globally and 90% per-module for `src/lib/security/**` and `src/lib/auth/**`. However, v8 coverage only reports on files *actually imported* during the test run. The four modules with zero tests (F-01 through F-05: `sandbox-gate.ts`, `hcaptcha.ts`, `production-config.ts`, `derive-key.ts`) are **never imported**, so they do not appear in coverage output and contribute 0% to the threshold denominator.

This means the `src/lib/security/**` 90% threshold is satisfied by the tested files while silently ignoring the untested ones.

**Suggested fix:** Configure v8 coverage `include` to explicitly enumerate `src/lib/security/**` so that unimported files appear in the report with 0% and trip the threshold:

```typescript
// vitest.config.ts
coverage: {
  include: ["src/**"],  // or more targeted
  // ...existing config
}
```

---

### F-16 — E2E data-dependent `test.skip(true)` pattern hides absent data as passing (LOW)

**File:** `tests/e2e/contest-participant-audit.spec.ts:50-140` (extends F-06)
**Confidence:** CONFIRMED

Beyond the always-skip issue in F-06, the broader pattern of discovering data at runtime and conditionally skipping is fragile across multiple specs. When run against a freshly deployed server with no seeded contests, all three `describe` blocks in `contest-participant-audit.spec.ts` skip silently. The `npm run test:e2e` gate passes. No one notices the feature was never verified.

The same pattern appears in:
- `tests/e2e/student-submission-flow.spec.ts:183` — skips when no judge worker
- `tests/e2e/contest-full-lifecycle.spec.ts:297,319,378,399` — skips when no worker

Worker-dependent skips are reasonable and should stay. Data-dependent skips should be replaced with data seeding.

**Suggested fix:** Refactor data-discovery specs to seed data in `beforeAll` using the `runtime-admin.ts` API helper pattern. Keep worker-availability skips (`test.skip(!judgeWorkerAvailable, "requires judge worker")`) as they represent a genuine infrastructure constraint.

---

### F-17 — `judge-report-nginx.test.ts`: New regex assertion is overly broad and currently failing (HIGH)

**File:** `tests/unit/infra/judge-report-nginx.test.ts:27`
**Confidence:** CONFIRMED

Cycle 1 removed the global `client_max_body_size 50M;` from the nginx `server` blocks in `deploy-docker.sh` and added a test asserting the wider limit is no longer declared before the poll location:

```typescript
expect(deployDocker).not.toMatch(/server \{[\s\S]*?client_max_body_size 50M;[\s\S]*?location = \/api\/v1\/judge\/poll/);
```

The regex is not anchored to a single server block, so it matches across the HTTPS server block and into the local-fallback heredoc. Running the test produces:

```
FAIL tests/unit/infra/judge-report-nginx.test.ts > judge report nginx body-size guardrails > keeps a larger body limit only on the final judge result report endpoint
AssertionError: expected '#!/usr/bin/env bash\n# ==============…' not to match /server \{[\s\S]*?client_max_body_…
```

The production configuration is actually correct (50M only inside `location = /api/v1/judge/poll`), but the assertion rejects it because the pattern spans from the first `server {` through the poll location in the second heredoc.

**Failure scenario:** `npx vitest run` fails on this test in CI, blocking deploys and eroding confidence in the gate. The false negative may lead a developer to revert the hardening change rather than fix the test.

**Suggested fix:** Rewrite the assertion to operate on individual server blocks. For example, extract each `server { ... }` block from the heredoc content and assert that no block contains `client_max_body_size 50M;` outside a matching `location = /api/v1/judge/poll` block. Alternatively, assert that the directives appearing before the first `location` in each server block do not include `client_max_body_size 50M;`.

---

### F-18 — `similarity-check` route: New assistant authorization branches lack negative tests (MEDIUM)

**File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`, `tests/unit/api/similarity-check.route.test.ts:170-192`
**Confidence:** CONFIRMED

`canRunSimilarityCheck` introduces four authorization paths:

1. `canManageContest(user, assignment)` returns `true`.
2. Capability `anti_cheat.run_similarity` is absent → `false`.
3. `isGroupTA(assignment.groupId, user.id)` returns `true`.
4. `getAssignedTeachingGroupIds(user.id)` contains the assignment's group.

The existing test seeds `canManageContestMock.mockResolvedValue(true)` by default and adds one happy-path case for path 4. None of the following are exercised:

- A user with the capability who is **not** a TA and **not** assigned to the group → should receive 403.
- A user with the capability who **is** a TA but not assigned to the group → should receive 200.
- A user without the capability who happens to be assigned to the group → should receive 403.

**Failure scenario:** A refactor removes the `isGroupTA` early return or swaps the capability check with the TA check. The default test path (`canManageContest` = true) masks the regression, so the suite still passes while real assistants lose or gain inappropriate access.

**Suggested fix:** Add three tests to `tests/unit/api/similarity-check.route.test.ts` covering the missing branches above, asserting exact 200/403 status and that `runAndStoreSimilarityCheckMock` is called only when allowed.

---

### F-19 — `contests/join` route: Code-scoped rate-limit 429 path is not tested (MEDIUM)

**File:** `src/app/api/v1/contests/join/route.ts:28-36`, `tests/unit/api/contests.route.test.ts:297-325`
**Confidence:** CONFIRMED

Cycle 1 adds two `consumeUserApiRateLimit` calls after an invalid access-code redemption: one keyed by user ID and one keyed by the normalized code hash. The existing tests verify:

- Both rate limits are invoked with the expected keys on a 400 response.
- The **user-scoped** limit returning 429 produces a 429 response.

Missing:

- The **code-scoped** limit returning 429 produces a 429 response.
- Successful redemption does **not** consume either rate-limit bucket.

**Failure scenario:** A bug causes the code-scoped check to be skipped (e.g., the second `consumeUserApiRateLimit` call is deleted or uses the wrong scope). Distributed brute-force attempts against a single access code from many accounts are no longer throttled. No test fails.

**Suggested fix:** Add a test where `consumeUserApiRateLimitMock` returns null on the first call (user scope) and a 429 on the second call (code scope), asserting the route returns 429. Add another test for a successful join asserting `consumeUserApiRateLimitMock` is never called.

---

### F-20 — `compiler/execute.ts`: Validation-before-runner ordering is only partially tested (MEDIUM)

**File:** `src/lib/compiler/execute.ts:638-688`, `tests/unit/compiler/execute.test.ts:111-132`
**Confidence:** CONFIRMED

The cycle-1 refactor moves Docker-image, source-size, and shell-command validation **before** the Rust runner call so the API contract is identical between runner and local-fallback modes. `tests/unit/compiler/execute.test.ts` adds one test proving an invalid `runCommand` is rejected before `fetch` is invoked.

Missing tests for the same ordering guarantee:

- Invalid `options.language.dockerImage` → rejects before `fetch`.
- Source code larger than `MAX_SOURCE_CODE_BYTES` → rejects before `fetch`.
- Invalid `options.language.compileCommand` → rejects before `fetch`.

**Failure scenario:** A future refactor moves the Rust runner call ahead of one of these validations. The runner receives an oversized payload or an invalid Docker image reference. The local fallback still rejects it, but the runner path does not, creating an inconsistency that could be exploited or cause worker crashes.

**Suggested fix:** Extend `tests/unit/compiler/execute.test.ts` with three additional tests that set `COMPILER_RUNNER_URL` and `RUNNER_AUTH_TOKEN`, stub `global.fetch` with a spy, and assert that `fetchMock` is never called while the appropriate error message is returned.

---

### F-21 — `extractClientIp`: Non-numeric `TRUSTED_PROXY_HOPS` fallback is not directly tested (LOW)

**File:** `src/lib/security/ip.ts:11-16`, `tests/unit/security/ip.test.ts`
**Confidence:** CONFIRMED

`getTrustedProxyHops()` parses `TRUSTED_PROXY_HOPS` at call time and falls back to `1` when the value is missing or `NaN`. The test suite covers `0`, `2`, `3`, and the default (unset) but never a malformed value such as `"invalid"` or `"-1"`.

**Failure scenario:** An operator mistypes `TRUSTED_PROXY_HOPS=two` or `TRUSTED_PROXY_HOPS=-1`. The server silently treats it as `1`. If the intended value was `0` (no trusted proxies), client IP spoofing becomes possible; if the intended value was `3`, legitimate requests may be misclassified as spoofed and rate-limited coarsely.

**Suggested fix:** Add test cases in `tests/unit/security/ip.test.ts` for `TRUSTED_PROXY_HOPS="invalid"` and `"-1"`, asserting the effective hop count falls back to `1` (e.g., by observing that a single-hop XFF is trusted).

---

### F-22 — `static-site/nginx.conf` autoindex test is source-scan only (LOW)

**File:** `tests/unit/infra/deploy-security.test.ts:51-56`, `static-site/nginx.conf`
**Confidence:** CONFIRMED

The cycle-1 change disables directory listings in `static-site/nginx.conf` (`autoindex on` → `autoindex off`). The test only checks string presence:

```typescript
expect(staticSiteNginx).toContain("autoindex off;");
expect(staticSiteNginx).not.toContain("autoindex on;");
```

This does not verify that nginx actually rejects directory listing requests, nor does it detect an `autoindex on;` directive introduced by an included config or a later override.

**Failure scenario:** A future change adds an `include` that re-enables autoindex, or a deployment script accidentally overwrites the file. The string-in-file test passes while the static site leaks directory listings.

**Suggested fix:** Add a behavioral test that runs `nginx -t` against the config (or a parsed config tree) and verifies the effective directive for the root `/` location is `autoindex off`. At minimum, parse the server block and assert no active `autoindex on;` directive exists.


## Gate Reliability Notes

- **`npm run lint:bash`**: Covers `deploy-docker.sh` and `deploy.sh`. Does not cover `scripts/playwright-local-webserver.sh` or `scripts/check-migration-drift.sh`. Consider adding both to the gate.
- **`cargo test`**: Exercises `judge-worker-rs/src/validation.rs` (10 tests) and `judge-worker-rs/src/comparator.rs` (22 tests) — well-covered. `runner.rs`, `docker.rs`, and `executor.rs` have no tests. `rate-limiter-rs` has 2 basic tests. The gate passes but guards very little of the Rust worker logic.
- **`npm run db:check`**: Runs `scripts/check-migration-drift.sh` which verifies SQL ↔ journal bijection and detects un-generated schema changes. Well-structured and correctly gated.
- **`npm run test:integration`**: Skipped automatically when `DATABASE_URL` is unavailable. The 4 integration tests (`judge-claim-reclaim`, `submission-lifecycle`, `user-crud`, `catalog-numbers`) are well-structured chaos/regression tests. The gate is only meaningful in CI environments with Postgres configured.

---

## Final Sweep

**Confirmed not missing / in good shape:**
- `tests/unit/security/encryption.test.ts`: Covers plaintext rejection, key rotation, legacy format, tamper detection, redaction.
- `tests/unit/security/timing.test.ts`: Covers `safeTokenCompare` including empty strings, unicode, length mismatch.
- `tests/unit/auth/session-security.test.ts`: Thorough coverage of `getTokenAuthenticatedAtSeconds`, `isTokenInvalidated`, `clearAuthToken` including NaN, Infinity, zero edge cases.
- `tests/unit/assignments/contest-access-tokens.test.ts`: Covers `findValidContestAccessToken`, `contestAccessTokenExpiry`, `syncContestAccessTokenExpiry`.
- `judge-worker-rs/src/validation.rs` `#[cfg(test)]`: 10 well-structured tests covering docker image validation, extension validation, dockerfile path safety.
- `judge-worker-rs/src/comparator.rs` `#[cfg(test)]`: 22 tests including unicode, large output (10k lines), float NaN/Infinity edge cases, internal blank line preservation.
- Component suite correctly uses `cleanup()` in `afterEach` via `tests/component/setup.ts`. No fixture leak detected.
- `vi.useFakeTimers()` used correctly in `tests/component/countdown-timer.test.tsx` and `tests/component/anti-cheat-monitor.test.tsx`.

---

## Findings Summary

| ID | File / Region | Severity | Confidence | Category |
|----|---|---|---|---|
| F-01 | `src/lib/security/sandbox-gate.ts:37-84` | HIGH | CONFIRMED | Missing unit tests — security gate |
| F-02 | `src/lib/security/hcaptcha.ts:1-83` | HIGH | CONFIRMED | Missing unit tests — security |
| F-03 | `src/lib/security/production-config.ts:61-93` | HIGH | CONFIRMED | Missing unit tests — startup safety |
| F-04 | `src/lib/security/sensitive-settings.ts:18-48` | HIGH | CONFIRMED | Wrong assertion (only ever mocked) |
| F-05 | `src/lib/security/derive-key.ts:1-36` | HIGH | CONFIRMED | Missing unit tests — cryptographic |
| F-06 | `tests/e2e/contest-participant-audit.spec.ts:52,65,79,111,123,136` | HIGH | CONFIRMED | Dead tests — unconditional skip |
| F-07 | `tests/unit/proxy.test.ts:113,336,347,358,386,397,408,451,464,477` | MEDIUM | CONFIRMED | Brittle timing — live clock |
| F-08 | `src/lib/security/rate-limit-core.ts:75-121` | MEDIUM | CONFIRMED | Missing path — ON CONFLICT race |
| F-09 | `rate-limiter-rs/src/main.rs:51-57,62-89,196-213` | MEDIUM | CONFIRMED | Missing Rust unit tests |
| F-10 | `judge-worker-rs/src/runner.rs` | MEDIUM | CONFIRMED | Missing Rust unit tests |
| F-11 | `src/lib/assignments/contest-access-tokens.ts:60-82` | MEDIUM | CONFIRMED | Wrong assertion (source-scan only) |
| F-12 | `src/lib/security/ip.ts:33-44` | MEDIUM | CONFIRMED | Missing direct export tests |
| F-13 | ~30 `*-implementation.test.ts` files | LOW | CONFIRMED | Source-scanning anti-pattern |
| F-14 | `src/lib/data-retention.ts` | LOW | PLAUSIBLE | Missing edge-case coverage |
| F-15 | `vitest.config.ts:30` | LOW | CONFIRMED | Coverage threshold gap |
| F-16 | `tests/e2e/contest-participant-audit.spec.ts:50-140` | LOW | CONFIRMED | Data-dependent skip pattern |
| F-17 | `tests/unit/infra/judge-report-nginx.test.ts:27` | HIGH | CONFIRMED | Brittle regex — currently failing |
| F-18 | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` | MEDIUM | CONFIRMED | Missing negative authz tests |
| F-19 | `src/app/api/v1/contests/join/route.ts:28-36` | MEDIUM | CONFIRMED | Missing code-scoped rate-limit test |
| F-20 | `src/lib/compiler/execute.ts:638-688` | MEDIUM | CONFIRMED | Incomplete validation-order coverage |
| F-21 | `src/lib/security/ip.ts:11-16` | LOW | CONFIRMED | Missing malformed-env fallback test |
| F-22 | `tests/unit/infra/deploy-security.test.ts:51-56` | LOW | CONFIRMED | Source-scan only — no behavior verification |
