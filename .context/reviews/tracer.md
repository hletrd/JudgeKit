# Tracer Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- Clarification i18n: Fixed (commit 7e0b3bb8)
- Provider error sanitization: Fixed (commit 93beb49d)
- useVisibilityPolling setTimeout: Fixed (commit 60f24288)

## TR-1: Exam countdown timer `setInterval` catch-up flow [MEDIUM/MEDIUM]

**Causal trace of the catch-up flow:**

1. Student has exam countdown running with 5 minutes remaining
2. Student switches to another browser tab
3. Browser throttles `setInterval` — instead of firing every 1000ms, it may fire every 1000ms minimum or slower depending on browser policy
4. Time passes (e.g., 30 seconds in background)
5. Student switches back to exam tab
6. **Race condition:** Between the tab becoming visible and the `visibilitychange` event handler firing, the throttled `setInterval` may fire one or more accumulated ticks
7. Each tick calls `recalculate()` which calls `setRemaining(diff)`
8. These stale/accumulated ticks produce incorrect intermediate `remaining` values
9. React batches the state updates, but the intermediate values may briefly render
10. The `visibilitychange` handler then fires, calling `recalculate()` with the correct current time
11. The display corrects itself

**Competing hypotheses for the severity:**

H1 (confirmed): The catch-up window is real but brief — typically milliseconds. However, for an exam countdown timer, any momentary inaccuracy is undesirable.

H2 (unlikely): The browser fires `visibilitychange` before any accumulated intervals. This is browser-dependent and not guaranteed.

**Fix:** Migrate to recursive `setTimeout` which eliminates the catch-up window entirely because the next tick is only scheduled after the current one completes.

---

## TR-2: Rate-limiter client circuit breaker flow on parse error [LOW/MEDIUM]

**Causal trace:**

1. Rate-limiter sidecar returns a 200 response with non-JSON body (e.g., misconfigured)
2. `response.ok` is `true` — execution continues past line 74
3. `await response.json()` on line 79 throws `SyntaxError`
4. The catch block (line 84) increments `consecutiveFailures++` and sets `circuitOpenUntil`
5. After 3 such errors, the circuit breaker opens for 30 seconds
6. All subsequent rate-limit checks return `null` (fall through to DB limiter) for 30 seconds

The circuit breaker is designed for network failures, not parse errors. A parse error on a successful HTTP response should be logged but should not trip the circuit breaker.

**Fix:** Add `.catch()` to `.json()` and handle parse errors differently from network errors.

---

## Tracer Findings (carried/deferred)

### TR-CARRIED-1: Contest layout forced navigation — carried from DEFER-18
