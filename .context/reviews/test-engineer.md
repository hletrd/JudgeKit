# Test-Engineer Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** test-engineer
**Scope:** Test coverage gaps, flaky tests, missing assertions

## Summary

Cycle-1 plan task E added 3 new tests for `getAuthSessionCookieNames`. Suite up from 2192 to 2210. Plan deferred AGG-5 (analytics tests) to cycle 2. Cycle 2 should add those tests.

## Findings

### TE2-1: [MEDIUM] No tests for analytics route staleness behavior or cooldown fallback
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:62-101`
**Confidence:** HIGH

Cycle-1 AGG-5 finding still open. Working-tree changes implement the staleness check and cooldown fallback paths but there are no automated tests covering:
- Cache hit + within TTL → no DB call for staleness, returns cached.
- Cache hit + stale → background refresh triggered exactly once.
- Background refresh failure → cooldown timestamp stored.
- Subsequent request within cooldown → no second refresh attempt.
- Subsequent request after cooldown → refresh re-triggered.
- DB call inside refresh-failure handler also fails → Date.now() fallback used.

**Fix:** Create `tests/unit/api/contests/analytics.test.ts` with mocked `computeContestAnalytics` and `getDbNowMs`. Use `vi.useFakeTimers()` to advance clock through staleness window. Assert call counts on the mocks.

### TE2-2: [LOW] `getAuthSessionCookieNames` test added in cycle 1, but no test for `proxy.clearAuthSessionCookies` integration
**File:** `tests/unit/proxy.test.ts`
**Confidence:** MEDIUM

The mock factory now exports `getAuthSessionCookieNames`, but no test specifically asserts that `clearAuthSessionCookies()` calls `set` with both names. Existing 401 / redirect tests indirectly exercise the path but don't assert cookie names.

**Fix:** Add a focused test that intercepts `response.cookies.set` and asserts the two expected cookie names are cleared with the right options.

### TE2-3: [LOW] Anti-cheat retry/backoff has only indirect test coverage
**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Confidence:** LOW

Anti-cheat tests cover the privacy notice flow and basic event reporting. The exponential backoff and the `scheduleRetryRef` contract documented in cycle 1 lack direct tests.

**Fix:** Add component tests using `vi.useFakeTimers()` + `apiFetch` mock to verify backoff timing. Defer to a dedicated cycle.

### TE2-4: [LOW] No regression test asserting `getAuthSessionCookieNames` HEAD failure mode
A test like "import this and call it returns the constants" already exists. No test verifies that `proxy.ts` would fail to start without the export. Such a test isn't really actionable — TypeScript compilation would catch it. Defer.

## Verification Notes

- `tests/unit/security/env.test.ts` increased from 48 → 51 tests as cycle-1 plan claims.
- `tests/unit/proxy.test.ts` mock factory updated as expected per `c915da0b` diff.
- All 2210 unit tests pass against working tree.

## Confidence

TE2-1 is the highest priority test gap.
