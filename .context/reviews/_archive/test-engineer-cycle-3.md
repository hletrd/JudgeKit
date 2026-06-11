# Test-Engineer Pass — RPF Cycle 3/100

**Date:** 2026-04-27
**Lane:** test-engineer
**Scope:** Test coverage gaps, flakiness, TDD opportunities, with emphasis on cycle-2 added tests (analytics route)

## Summary

Cycle 2 added 7 unit tests for the analytics route in `tests/unit/api/contests-analytics-route.test.ts`. They cover the cache-miss, cache-hit, stale, dedup, cooldown, and DB-time-fallback paths. Suite total is now 2217 (was 2210). All pass.

The remaining test gaps are mostly carried forward (anti-cheat retry/backoff timing, AGG-13). Cycle 3 has small actionable test additions: a `getAuthSessionCookieNames` literal-value test (DBG3-4) and possibly a stress test for the analytics dedup guard.

## Findings

### TE3-1: [MEDIUM] No test for `getAuthSessionCookieNames()` literal-value contract

**File:** `tests/unit/security/env.test.ts`, `src/lib/security/env.ts:178-180`
**Confidence:** MEDIUM

Cycle-2 commit `000bdfe5` added a "shape" test verifying `getAuthSessionCookieNames()` returns `{ name: string, secureName: string }`. There's no test asserting the literal values — i.e., that `name === "authjs.session-token"` and `secureName === "__Secure-authjs.session-token"`.

A future refactor that swaps the two names (or accidentally renames one) would not be caught by tests. The proxy would clear the wrong cookie, leaving sessions valid on logout.

**Failure scenario:** Refactor risk — if a future contributor changes the `name` constant in `env.ts` (e.g., for next-auth migration), the proxy would clear the new name but expect the old. Tests would still pass under the shape-only assertion.

**Fix:** Add a literal-value assertion:
```ts
it("returns the documented session cookie names", () => {
  expect(getAuthSessionCookieNames()).toEqual({
    name: "authjs.session-token",
    secureName: "__Secure-authjs.session-token",
  });
});
```

This pins the contract.

---

### TE3-2: [LOW] Anti-cheat retry/backoff has only indirect test coverage (carried from cycle 2 AGG-13)

**File:** `src/components/exam/anti-cheat-monitor.tsx`
**Confidence:** LOW

No unit tests for the exponential backoff timing. Component-level testing requires `vi.useFakeTimers` + `apiFetch` mock + simulated `localStorage`. Non-trivial setup.

**Fix:** Defer. Pick up in a dedicated testing-focused cycle.

---

### TE3-3: [LOW] Analytics route lacks a test for "stale-but-with-pending-refresh" → returns the in-flight refreshed value

**File:** `tests/unit/api/contests-analytics-route.test.ts`
**Confidence:** LOW

The current "triggers exactly one background refresh" test verifies that two concurrent stale GETs only trigger one refresh. But it doesn't verify that subsequent GETs (after the refresh completes) see the freshly-cached value. The `mockReturnValueOnce(slowPromise)` is resolved at the end with `resolveCompute?.({ summary: "fresh" })`, but the assertion is only that compute was called once — not that the cache contains the new value.

**Failure scenario:** Refactor risk — if `refreshAnalyticsCacheInBackground` accidentally drops the `analyticsCache.set` call, the cache would never update, and the test would still pass.

**Fix:** Extend the dedup test to assert the cache contains the new value after the slow refresh resolves:
```ts
resolveCompute?.({ summary: "fresh" });
await vi.runAllTimersAsync();

vi.setSystemTime(new Date("2026-04-26T12:00:35.000Z"));
const r3 = await GET(makeReq(), makeCtx());
const body3 = await r3.json();
expect(body3.data.summary).toBe("fresh"); // verifies cache was updated
```

LOW priority; pick up if cycle 3 has slack.

---

### TE3-4: [INFO] No `vi.useFakeTimers` warnings about leaked timers

**Confidence:** N/A (informational)

The cycle-2 test file properly uses `afterEach(() => vi.useRealTimers())`. No leaked timers between tests.

---

### TE3-5: [LOW] Test file uses `any` in the handler mock signature

**File:** `tests/unit/api/contests-analytics-route.test.ts:22`
**Confidence:** LOW

```ts
handler: (req: NextRequest, ctx: { user: any; params: any }) => Promise<Response>
```

`user: any` and `params: any` would be cleaner as `user: unknown` or the proper shape. Linting allows this in tests but it's a reach for stricter type-narrowing.

**Fix:** Optional. Defer; cosmetic.

## Verification Notes

- Ran `npm run test:unit -- tests/unit/api/contests-analytics-route.test.ts`: 7/7 pass in 79ms.
- No flaky timing assertions (system-time is mocked deterministically).
- Mocks are reset properly in `beforeEach`.

## Confidence

- MEDIUM: TE3-1 (literal-value cookie names test).
- LOW: TE3-2 (carried), TE3-3 (extra dedup assertion), TE3-5 (cosmetic).

No HIGH severity. Cycle-3 actionable test work: TE3-1 (small, high-value) and optionally TE3-3.
