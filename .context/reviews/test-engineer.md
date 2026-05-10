# Test Engineer Review — Cycle 34

**Reviewer:** test-engineer
**Date:** 2026-05-10
**Scope:** Test coverage gaps, test infrastructure, flaky patterns

---

## Findings

### C34-TE-1: [MEDIUM] Rate limit eviction timer causes open handles in tests

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

The `startRateLimitEviction()` function starts a `setInterval` with no corresponding stop function. Tests that import this module (directly or transitively) will report open handles when Vitest exits. This was likely the cause of the `--detectOpenHandles` warnings seen in CI.

**Fix:** Export `stopRateLimitEviction()` and call it in `vitest.setup.ts` or equivalent teardown.

---

### C34-TE-2: [LOW] `apiFetchJson` parse failure path not tested

**File:** `src/lib/api/client.ts`
**Confidence:** MEDIUM

The `apiFetchJson` helper has tests for success paths and JSON parse failures (via `.catch()`), but there are no tests for:
- The `fetch()` throwing (network failure) — this was added in cycle 33
- Non-JSON response bodies (e.g., HTML 502 page)
- The development-only warning (when implemented)

**Fix:** Add tests for fetch-throw and non-JSON response scenarios.

---

### C34-TE-3: [LOW] `anti-cheat-monitor` timer logic not covered by unit tests

**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Confidence:** MEDIUM

The component has no unit tests for:
- Heartbeat scheduling and cleanup
- Retry backoff logic
- Event listener registration/cleanup
- Privacy notice acceptance flow

**Fix:** Add component tests using React Testing Library, mocking `localStorage` and `apiFetch`.

---

## Previously Deferred Test Items (re-validated)

- C33-TE-1 (submission-list-auto-refresh timer tests): Still uncovered
- C33-TE-2 (export-button blob download tests): Still uncovered
- C33-TE-3 (apiFetchJson network failure tests): Partially covered — fetch-throw path added but non-JSON path untested

## Positive Observations

1. Unit tests exist for password rules, assignment validation, late-penalty scoring.
2. Rate limit core has test coverage.
3. API handler wrapper has tests for auth, CSRF, and rate limiting.
4. E2E tests cover 55 languages and contest lifecycle.
