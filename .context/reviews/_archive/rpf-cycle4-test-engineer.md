# Test Engineer Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** test-engineer
**Base commit:** a717b371

## Inventory of Reviewed Test Files

- `tests/unit/security/` (env, ip, rate-limit, rate-limiter-client, timing, sanitize-html)
- `tests/unit/auth/` (generated-password, login-events, permissions, rate-limit-await, login-rate-limit-order)
- `tests/unit/api/` (handler, languages.route, admin-workers.route, and 10+ implementation tests)
- `tests/unit/assignments/` (contest-analytics, participant-audit)
- `tests/unit/db/` (schema-implementation, relations-implementation, pg-migration-drift)
- `tests/unit/realtime/` (realtime-coordination, realtime-route-implementation)
- `tests/unit/anti-cheat-*` (review-model, dashboard-implementation)
- `tests/component/` (comment-section, chat-widget, lecture-problem-view, etc.)
- `tests/integration/` (api/health, db/submission-lifecycle)
- `tests/e2e/` (multiple Playwright specs)
- `vitest.config.ts`, `vitest.config.component.ts`, `vitest.config.integration.ts`

## Test Coverage Assessment

### Well-Covered Areas

1. **Auth & Security**: Login rate limiting, token invalidation, permission checks, CSRF, IP extraction, password validation
2. **Rate Limiting**: Unit tests for in-memory rate limit, API rate limit, sidecar client, concurrent access
3. **Realtime Coordination**: SSE connection slot acquisition, heartbeat dedup, PostgreSQL advisory lock
4. **Anti-Cheat**: Review model tiers, dashboard rendering, public event types
5. **DB Schema**: Implementation verification, relation correctness, migration drift detection

### Test Gaps (Carry-Over)

1. **Concurrent recruiting token redemption** (TE-1, cycle 51): Missing integration test for atomic SQL UPDATE under concurrent redemption. Requires live DB. Deferred.

2. **Vitest parallel-contention flakes** (#21): `tests/unit/api/submissions.route.test.ts` fails under parallel vitest workers but passes in isolation. Sandbox CPU/IO contention. Deferred.

### New Observations

3. **Judge claim route**: The `getDbNowUncached()` fix in the claim route (line 126) should have a corresponding test that verifies DB-time consistency. Currently, the claim route is tested indirectly through the API route tests. A targeted test verifying that `claimCreatedAt` comes from DB time (not `Date.now()`) would catch regressions.

   **File:** `tests/unit/api/` — no dedicated claim route test
   **Severity:** LOW/MEDIUM
   **Confidence:** MEDIUM
   **Fix:** Add a test that mocks `getDbNowUncached` and verifies the claim route uses its return value.

## New Findings

**One new test gap** (TE-2): missing unit test for judge claim route's `getDbNowUncached()` usage. LOW/MEDIUM severity — would catch regressions of the recently-fixed clock-skew bug. This is the only new finding this cycle.
