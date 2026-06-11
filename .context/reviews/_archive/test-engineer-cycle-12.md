# Test Engineer — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** test-engineer
**Scope:** Test coverage, gap analysis, flaky test detection, TDD opportunities

## Findings

### TE12-1: No unit test for `isEncryptedPluginSecret` prefix-only validation gap

**File:** `src/lib/plugins/secrets.ts:10-12`
**Severity:** MEDIUM / Confidence: HIGH

There is no test that verifies the behavior when a malformed `enc:v1:` value (e.g., `enc:v1:garbage`) is passed to `preparePluginConfigForStorage`. This is precisely the class of bug that CR11-1 exposed. The fix added the `isEncryptedPluginSecret` check before encryption, but no test validates that malformed `enc:v1:` values are rejected or handled correctly.

**Fix:** Add a test case in the secrets test suite:
- `enc:v1:garbage` should not be stored as-is
- `enc:v1:` (empty components) should not be stored as-is
- A properly structured `enc:v1:iv:tag:ciphertext` should be stored as-is (round-trip)

### TE12-2: No test for `decrypt()` plaintext fallback behavior in production mode

**File:** `src/lib/security/encryption.ts:79-88`
**Severity:** LOW / Confidence: MEDIUM

The `decrypt()` function has a plaintext fallback path when the value doesn't start with `enc:`. This is a security-relevant behavior that should have explicit test coverage, but there is no test that verifies what happens when `NODE_ENV=production` and `decrypt()` is called with a non-encrypted value.

**Fix:** Add a test that verifies:
- In production, calling `decrypt()` with a plaintext value logs a warning and returns the value
- In development, the same behavior occurs without the warning
- The `decryptPluginSecret()` path throws on malformed values (this may already be tested)

### TE12-3: SSE connection tracking tests missing for stale cleanup and max connections

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55, 76-115`
**Severity:** LOW / Confidence: MEDIUM

The SSE route has complex in-memory connection tracking with periodic cleanup, max global connections, and per-user limits. There are no visible unit tests for:
- The stale connection cleanup timer logic
- The `MAX_TRACKED_CONNECTIONS` eviction by age
- The `MAX_GLOBAL_SSE_CONNECTIONS` enforcement
- The per-user connection count tracking

**Fix:** Extract the connection tracking logic into a separate testable module and add unit tests.

## Test Coverage Summary

Existing test infrastructure:
- Unit tests: `tests/unit/` — 30+ test files covering API routes, security, assignments, formatting
- Component tests: `tests/component/` — 20+ test files covering UI components
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`
- Visual tests: `tests/visual/`

Gaps identified:
1. `secrets.ts` — missing edge case tests for `enc:v1:` prefix validation
2. `encryption.ts` — missing test for production plaintext fallback
3. SSE connection tracking — no unit tests for in-memory state management
4. `in-memory-rate-limit.ts` — eviction behavior under overflow not tested
