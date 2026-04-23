# RPF Cycle 28 — Test Engineer Review

**Reviewer**: test-engineer agent
**Date**: 2026-04-23
**HEAD**: ca62a45d
**Scope**: Full repository test coverage audit

---

## Executive Summary

The repository has **~105 unit tests**, **~60 component tests**, and **~38 E2E specs** — a solid baseline. However, critical security modules, server actions, hooks, and API routes have significant coverage gaps. Several existing tests have environment-dependent patterns that could cause flakiness in CI. The highest-priority gaps are in encryption key derivation, in-memory rate limiting, judge authentication, and the `use-unsaved-changes-guard` hook.

---

## 1. Coverage Inventory

### 1.1 Source File Count by Category

| Category | Source Files | Test Files | Coverage % |
|---|---|---|---|
| `src/lib/security/` | 17 | 10 | 59% |
| `src/lib/actions/` | 9 | 8 | 89% |
| `src/lib/judge/` | 5 | 2 | 40% |
| `src/hooks/` | 7 | 1 | 14% |
| `src/app/api/v1/` routes | ~90 | ~68 | ~76% |
| `src/components/` | ~95 | ~60 | ~63% |
| `src/lib/db/` | 6 | 4 | 67% |
| `src/lib/realtime/` | 1 | 1 | 100% |

### 1.2 Security Module Detail

| Source File | Has Test? |
|---|---|
| `security/password-hash.ts` | **NO** |
| `security/derive-key.ts` | **NO** |
| `security/encryption.ts` | **NO** |
| `security/in-memory-rate-limit.ts` | **NO** |
| `security/request-context.ts` | **NO** |
| `security/hcaptcha.ts` | **NO** |
| `security/server-actions.ts` | **NO** |
| `security/password.ts` | Yes |
| `security/csrf.ts` | Yes |
| `security/sanitize-html.ts` | Yes |
| `security/timing.ts` | Yes |
| `security/ip.ts` | Yes |
| `security/env.ts` | Yes |
| `security/rate-limit.ts` | Yes |
| `security/rate-limiter-client.ts` | Yes |
| `security/api-rate-limit.ts` | Yes |
| `security/constants.ts` | Yes |

### 1.3 Hooks Coverage Detail

| Hook | Has Test? |
|---|---|
| `use-submission-polling.ts` | **NO** |
| `use-visibility-polling.ts` | **NO** |
| `use-unsaved-changes-guard.ts` | **NO** |
| `use-keyboard-shortcuts.ts` | **NO** |
| `use-editor-compartments.ts` | **NO** |
| `use-source-draft.ts` | Yes |
| `use-mobile.ts` | **NO** |

### 1.4 Server Actions Coverage

| Action | Has Test? |
|---|---|
| `actions/plugins.ts` | **NO** |
| `actions/update-preferences.ts` | **NO** |
| `actions/public-signup.ts` | Yes |
| `actions/tag-management.ts` | Yes |
| `actions/change-password.ts` | Yes |
| `actions/user-management.ts` | Yes |
| `actions/language-configs.ts` | Yes |
| `actions/system-settings.ts` | Yes |
| `actions/update-profile.ts` | Yes |

### 1.5 API Routes Without Direct Tests

The following API routes have no corresponding test file:

- `api/v1/time/route.ts`
- `api/v1/contests/join/route.ts`
- `api/v1/files/bulk-delete/route.ts`
- `api/v1/contests/[assignmentId]/access-code/route.ts`
- `api/v1/submissions/[id]/comments/route.ts`
- `api/v1/admin/tags/route.ts`
- `api/v1/admin/tags/[id]/route.ts`
- `api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/route.ts`
- `api/v1/admin/workers/stats/route.ts`
- `api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts`
- `api/v1/problems/import/route.ts`
- `api/v1/submissions/[id]/queue-status/route.ts`
- `api/v1/groups/[id]/instructors/route.ts`
- `api/v1/groups/[id]/members/[userId]/route.ts`
- `api/v1/problem-sets/[id]/groups/route.ts`
- `api/v1/admin/docker/images/prune/route.ts`
- `api/v1/admin/migrate/validate/route.ts`
- `api/v1/admin/migrate/import/route.ts`
- `api/v1/admin/migrate/export/route.ts`
- `api/v1/admin/restore/route.ts`
- `api/v1/contests/[assignmentId]/invite/route.ts`
- `api/v1/judge/claim/route.ts`
- `api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`
- `api/v1/groups/[id]/members/bulk/route.ts`
- `api/v1/contests/[assignmentId]/announcements/[announcementId]/route.ts`
- `api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route.ts`
- `api/v1/admin/api-keys/[id]/route.ts`
- `api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`
- `api/v1/contests/[assignmentId]/stats/route.ts`
- `api/internal/cleanup/route.ts`
- `api/v1/test/seed/route.ts`

---

## 2. Critical Findings

### Finding 1: `security/encryption.ts` — Zero test coverage for AES-256-GCM encrypt/decrypt

**File**: `src/lib/security/encryption.ts:1-116`
**Confidence**: High

The `encrypt()` and `decrypt()` functions handle all plugin config secrets and potentially other sensitive data using AES-256-GCM. There are no tests verifying:
- Encrypt-decrypt round-trip correctness
- Plaintext fallback (non-`enc:` prefixed values)
- Invalid format rejection (wrong number of `:`-delimited parts)
- Tampered auth tag detection (GCM integrity failure)
- Production mode throwing when `NODE_ENCRYPTION_KEY` is missing
- Dev key fallback behavior
- `redactSecret()` returning bullet characters

**Failure scenario**: A bug in the `decrypt()` function that fails to validate the auth tag before calling `decipher.final()` would cause silent data corruption — tampered ciphertext would "decrypt" to garbage instead of throwing. No test catches this.

**Suggested test**:
```ts
describe("encryption", () => {
  it("round-trips encrypt/decrypt", () => { ... });
  it("returns plaintext for non-enc: values", () => { ... });
  it("throws on invalid format", () => { ... });
  it("throws on tampered auth tag", () => { ... });
  it("throws in production without NODE_ENCRYPTION_KEY", () => { ... });
  it("redactSecret returns bullets", () => { ... });
});
```

---

### Finding 2: `security/derive-key.ts` — Zero test coverage for HKDF key derivation

**File**: `src/lib/security/derive-key.ts:1-32`
**Confidence**: High

`deriveEncryptionKey()` and `legacyEncryptionKey()` produce the cryptographic keys used by `encryption.ts`. No tests verify:
- That different domains produce different keys (domain separation)
- That the same domain + same secret produces the same key (determinism)
- That `legacyEncryptionKey()` matches the old SHA-256 behavior
- That missing `PLUGIN_CONFIG_ENCRYPTION_KEY` throws

**Failure scenario**: If `domain` parameter is accidentally omitted from a call site, two different encryption contexts would share the same key, violating domain separation and potentially allowing cross-context decryption.

**Suggested test**:
```ts
describe("deriveEncryptionKey", () => {
  it("produces different keys for different domains", () => { ... });
  it("is deterministic for same inputs", () => { ... });
  it("throws without PLUGIN_CONFIG_ENCRYPTION_KEY", () => { ... });
  it("legacyEncryptionKey matches SHA-256 hash", () => { ... });
});
```

---

### Finding 3: `security/in-memory-rate-limit.ts` — Zero test coverage

**File**: `src/lib/security/in-memory-rate-limit.ts:1-158`
**Confidence**: High

This module implements the hot-path rate limiting for login and other sensitive actions. It has exponential backoff with `consecutiveBlocks`, capacity-based eviction, and periodic cleanup. No tests verify:
- Correct blocking after `maxAttempts` failures
- Exponential backoff duration calculation
- Window reset after expiry
- Eviction under `MAX_ENTRIES` pressure
- `consumeInMemoryRateLimit()` IP key construction

**Failure scenario**: The exponential backoff calculation `Math.min(blockMs * Math.pow(2, entry.consecutiveBlocks), MAX_BLOCK)` could overflow for large `consecutiveBlocks` values if `blockMs` is set to an unexpectedly large value. No test checks integer overflow behavior.

**Suggested test**:
```ts
describe("in-memory rate limit", () => {
  it("blocks after maxAttempts failures", () => { ... });
  it("resets after window expires", () => { ... });
  it("exponential backoff caps at MAX_BLOCK", () => { ... });
  it("evicts oldest entries at MAX_ENTRIES", () => { ... });
  it("consumeInMemoryRateLimit keys by IP", () => { ... });
});
```

---

### Finding 4: `security/password-hash.ts` — Zero test coverage for Argon2id hashing

**File**: `src/lib/security/password-hash.ts:1-37`
**Confidence**: High

`hashPassword()` and `verifyPassword()` are the core password storage functions. No tests verify:
- That `hashPassword()` produces an argon2id hash
- That `verifyPassword()` correctly validates argon2id hashes
- That `verifyPassword()` falls back to bcrypt for legacy hashes
- That `verifyPassword().needsRehash` is `true` for bcrypt and `false` for argon2id
- The `isBcryptHash()` detection logic

**Failure scenario**: If the argon2 import fails silently (e.g., native module build issue), `hashPassword()` would throw at runtime. No test catches this before deployment.

**Suggested test**:
```ts
describe("password-hash", () => {
  it("hashes with argon2id", async () => { ... });
  it("verifies argon2id hash correctly", async () => { ... });
  it("verifies bcrypt hash with needsRehash", async () => { ... });
  it("rejects wrong password", async () => { ... });
  it("detects bcrypt hashes", () => { ... });
});
```

---

### Finding 5: `security/server-actions.ts` — Zero test coverage for origin validation

**File**: `src/lib/security/server-actions.ts:1-40`
**Confidence**: High

`isTrustedServerActionOrigin()` is the gatekeeper for all server action invocations. No tests verify:
- Trusted host matching
- Dev-mode bypass when origin is missing
- Dev-mode bypass when no trusted hosts configured
- Malformed origin URL handling
- Production rejection when origin doesn't match

**Failure scenario**: A configuration error that leaves `TRUSTED_AUTH_HOSTS` empty in production would cause the function to return `true` (bypassing origin checks) — but only if `NODE_ENV !== "production"`. In production it returns `false` for all requests, breaking all server actions. No test catches either misconfiguration.

**Suggested test**:
```ts
describe("isTrustedServerActionOrigin", () => {
  it("accepts trusted host", async () => { ... });
  it("rejects untrusted host in production", async () => { ... });
  it("bypasses in dev when origin missing", async () => { ... });
  it("bypasses in dev when no trusted hosts", async () => { ... });
  it("rejects malformed origin URL", async () => { ... });
});
```

---

### Finding 6: `security/hcaptcha.ts` — Zero test coverage

**File**: `src/lib/security/hcaptcha.ts:1-85`
**Confidence**: Medium

`verifyHcaptchaToken()` makes an external HTTP call to hCaptcha's API. No tests verify the response parsing, error handling, or configuration fallback logic.

**Failure scenario**: If hCaptcha returns a non-200 status, the function returns `{ success: false, errorCodes: ['http-<status>'] }`. If the JSON body has an unexpected shape, `payload.success` would be `undefined` and `=== true` would correctly return `false`. But if `error-codes` key changes to `errors`, the error codes would silently be lost.

**Suggested test**: Mock `fetch` and test success, HTTP error, malformed response, and missing configuration scenarios.

---

### Finding 7: `use-unsaved-changes-guard.ts` — Zero test coverage, fragile by design

**File**: `src/hooks/use-unsaved-changes-guard.ts:1-325`
**Confidence**: High

This hook monkey-patches `window.history.pushState` and `window.history.replaceState` (the file itself warns: "known fragile pattern"). It has complex state management across 5 `useEffect` hooks. No tests verify:
- `beforeunload` event handler registration/deregistration
- PopState navigation blocking with `history.go(direction)`
- Anchor click interception
- History API monkey-patching and cleanup
- `allowNextNavigation()` bypass mechanism
- `isDirty` toggle correctly enabling/disabling all guards

**Failure scenario**: The `direction` calculation on line 201 uses `nextIndex < historyIndexRef.current` to determine back vs forward. If indices are null or equal, it defaults to `1` (back), which could push the user to the wrong history entry. No test verifies correct direction resolution.

**Suggested test**: Use `@testing-library/react` with mocked `window.history`, `window.confirm`, and `document.addEventListener` to test each guard mechanism in isolation.

---

### Finding 8: `use-submission-polling.ts` — Zero test coverage

**File**: `src/hooks/use-submission-polling.ts:1-292`
**Confidence**: High

This hook implements SSE + fetch polling fallback with exponential backoff, visibility-aware pausing, and abort controller cleanup. No tests verify:
- SSE connection establishment and result parsing
- SSE error fallback to fetch polling
- Fetch polling exponential backoff (`delayMs * 2`, capped at 30s)
- Visibility change pause/resume
- AbortController cleanup on unmount
- `normalizeSubmission()` data normalization

**Failure scenario**: If `normalizeSubmission()` receives a `submittedAt` as a string (e.g., `"2024-01-01T00:00:00Z"`), it calls `Date.parse()` on line 77, which returns `NaN` for invalid dates, but `Number.isFinite(NaN)` is `false`, so it falls back to `null`. This is correct but untested — a refactor could break this subtle normalization path.

**Suggested test**: Extract `normalizeSubmission()` as a pure function and test it independently, then test the hook's SSE/polling behavior with mocked timers and EventSource.

---

### Finding 9: `judge/auth.ts` — Partial coverage, worker-scoped auth untested

**File**: `src/lib/judge/auth.ts:1-91`
**Confidence**: Medium

`isJudgeAuthorized()` is tested via route tests, but `isJudgeAuthorizedForWorker()` has critical untested paths:
- Worker with `secretTokenHash` — token hashing and comparison
- Worker without `secretTokenHash` — rejection with `workerSecretNotMigrated` error
- Worker not found — fallback to shared JUDGE_AUTH_TOKEN
- `hashToken()` SHA-256 correctness

**Failure scenario**: If `hashToken()` produces incorrect hashes, worker-specific auth would always fail with `invalidWorkerToken`, forcing fallback to the shared token — a security degradation that would go undetected.

**Suggested test**:
```ts
describe("isJudgeAuthorizedForWorker", () => {
  it("accepts correct worker token hash", async () => { ... });
  it("rejects incorrect worker token", async () => { ... });
  it("rejects worker without secretTokenHash", async () => { ... });
  it("falls back to shared token for unknown worker", async () => { ... });
});
```

---

### Finding 10: `actions/plugins.ts` — Zero test coverage

**File**: `src/lib/actions/plugins.ts:1-150`
**Confidence**: Medium

`togglePlugin()` and `updatePluginConfig()` handle plugin enable/disable and configuration with encryption. No tests verify:
- Origin validation enforcement
- Role capability check (`system.plugins`)
- Rate limiting
- Config schema validation
- Audit event recording
- Encryption of stored config via `preparePluginConfigForStorage()`

**Failure scenario**: A malformed `rawConfig` that passes `safeParse` but contains unencrypted secrets would be stored in plaintext in the database. No test verifies that secrets are encrypted before storage.

**Suggested test**: Mock `isTrustedServerActionOrigin`, `auth`, `resolveCapabilities`, `checkServerActionRateLimit`, and DB operations. Test each authorization gate and the config storage path.

---

## 3. Flaky Test Patterns

### 3.1 Environment-dependent tests without proper isolation

**Files**: Multiple tests under `tests/unit/` that manipulate `process.env` directly

**Confidence**: High

Multiple test files mutate `process.env` without `beforeEach`/`afterEach` restoration:
- `tests/unit/plugins.data.test.ts:25-26` — Sets `AUTH_SECRET` and `PLUGIN_CONFIG_ENCRYPTION_KEY` at module level (never cleaned up)
- `tests/unit/plugins.secrets.test.ts:10-11` — Same pattern
- `tests/unit/docker/client.test.ts` — Sets/deletes env vars in individual tests without guaranteed cleanup
- `tests/unit/compiler/execute.test.ts` — Same pattern

**Failure scenario**: If tests run in parallel or in a different order, the module-level env var mutations leak between test files. `plugins.data.test.ts` sets `AUTH_SECRET` at import time — any test running after it in the same process sees a non-empty `AUTH_SECRET`.

**Suggested fix**: Use `vi.stubEnv()` / `vi.unstubAllEnvs()` for controlled env var management, or wrap each test in `beforeEach`/`afterEach` that saves and restores `process.env`.

### 3.2 Timing-dependent `setInterval` eviction test

**File**: `tests/unit/security/rate-limit.test.ts:219-237`
**Confidence**: Medium

This test spies on `globalThis.setInterval` to verify periodic eviction is registered. The actual eviction logic is not tested — only that `setInterval` was called with the right arguments. If the eviction callback has a bug (e.g., wrong eviction age comparison), this test would not catch it.

**Suggested improvement**: Call the eviction callback directly and verify entries are actually evicted.

### 3.3 15-second timeouts in route metadata tests

**File**: `tests/unit/public-route-metadata.test.ts:69,80`
**Confidence**: Low

Two tests use `{ timeout: 15000 }` — these likely import and scan the route tree, which could be slow in CI with cold caches. Not flaky per se, but indicates the tests may be doing expensive filesystem work that could fail under resource pressure.

---

## 4. Weak Assertion Patterns

### 4.1 No shallow assertion problems found

No instances of `expect(true).toBe(true)` or assertion-free tests were found. The codebase generally has meaningful assertions.

### 4.2 `mockResolvedValue(undefined)` pattern

**Files**: `tests/unit/audit/events.test.ts:65`, `tests/unit/auth/login-events.test.ts:46`, `tests/unit/api/community-votes.route.test.ts:42-45`

These mocks return `undefined` for DB write operations. This is acceptable for "fire and forget" audit logging, but for core data mutations, a mock that returns `undefined` could hide bugs where the code depends on the return value (e.g., checking `insertResult.rowsAffected`).

**Confidence**: Low — these are probably fine but worth auditing.

---

## 5. TDD Opportunities — Critical Paths

### Priority 1: Security (do first)

| # | Module | Risk | Effort | Rationale |
|---|---|---|---|---|
| TDD-1 | `encryption.ts` | Critical | S | Cryptographic correctness must be verified |
| TDD-2 | `derive-key.ts` | Critical | S | Domain separation is a security property |
| TDD-3 | `password-hash.ts` | Critical | S | Password storage is highest-stakes |
| TDD-4 | `in-memory-rate-limit.ts` | High | M | Brute-force protection |
| TDD-5 | `server-actions.ts` | High | S | Origin validation gatekeeper |

### Priority 2: Core Business Logic

| # | Module | Risk | Effort | Rationale |
|---|---|---|---|---|
| TDD-6 | `use-unsaved-changes-guard.ts` | High | L | 325-line hook with 5 effects, fragile by design |
| TDD-7 | `use-submission-polling.ts` | High | M | SSE + polling + backoff, normalizeSubmission |
| TDD-8 | `judge/auth.ts` worker-scoped | Medium | M | Worker-specific token hashing |
| TDD-9 | `actions/plugins.ts` | Medium | M | Config encryption + audit trail |
| TDD-10 | `hcaptcha.ts` | Medium | S | External service integration |

### Priority 3: API Route Coverage

| # | Route | Risk | Effort | Rationale |
|---|---|---|---|---|
| TDD-11 | `contests/join` | Medium | M | Public contest entry point |
| TDD-12 | `submissions/[id]/comments` | Medium | S | Mutation with auth |
| TDD-13 | `problems/import` | Medium | M | Admin-only, file parsing |
| TDD-14 | `admin/migrate/*` | Medium | M | Data import/export integrity |
| TDD-15 | `admin/restore` | High | M | Database restore — destructive if wrong |

---

## 6. Positive Findings

1. **Security test suite is generally strong** — `csrf.test.ts` (306 lines), `sanitize-html.test.ts` (222 lines with OWASP vectors), and `password.test.ts` (152 lines) are comprehensive and well-structured.

2. **No skipped/TODO tests** — The codebase has zero `.skip()`, `xtest()`, or `.todo()` patterns.

3. **No `.only()` left in codebase** — No risk of accidentally running a single test in CI.

4. **E2E coverage is broad** — 38 Playwright specs covering auth flows, contest lifecycle, admin operations, and mobile layout.

5. **Component test coverage is solid** — ~60 component tests covering most user-facing features.

---

## 7. Summary of Action Items

| Priority | Action | Impact |
|---|---|---|
| P0 | Add tests for `encryption.ts`, `derive-key.ts`, `password-hash.ts` | Prevents silent crypto failures |
| P0 | Add tests for `in-memory-rate-limit.ts` | Prevents brute-force protection bypass |
| P1 | Add tests for `server-actions.ts` | Prevents server action auth bypass |
| P1 | Add tests for `use-unsaved-changes-guard.ts` | Prevents data loss on navigation |
| P1 | Fix env var leakage in `plugins.data.test.ts`, `plugins.secrets.test.ts` | Prevents CI flakiness |
| P2 | Add tests for `judge/auth.ts` worker-scoped paths | Prevents auth degradation |
| P2 | Add tests for `actions/plugins.ts` | Prevents unencrypted secrets in DB |
| P2 | Add tests for `use-submission-polling.ts` | Prevents polling deadlocks |
| P3 | Add API route tests for uncovered critical routes | Improves mutation coverage |
