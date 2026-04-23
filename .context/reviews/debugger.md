# Debugger Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- Provider error sanitization: Verified (commit 93beb49d)
- useVisibilityPolling setTimeout: Verified (commit 60f24288)
- console.error gating: Verified
- All prior cycle findings verified as fixed

## DBG-1: Exam countdown timer `setInterval` catch-up in backgrounded tabs [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

**Failure mode:** When a student switches to another tab during an exam, browsers throttle `setInterval` to at most once per second (and often less frequently). When the student returns, the browser may fire all accumulated interval callbacks in rapid succession before the `visibilitychange` handler runs.

**Concrete failure scenario:**
1. Student has 5 minutes remaining on exam countdown
2. Student switches to another tab for 30 seconds
3. Browser throttles `setInterval` — only a few ticks fire during the 30 seconds
4. When student returns, the throttled `setInterval` fires multiple catch-up ticks rapidly
5. Each tick calls `setRemaining(diff)` — React batches these, but the intermediate values flash briefly
6. The `visibilitychange` handler fires and recalculates correctly, but the student may have seen an incorrect time display for a brief moment

This is a latent bug — it doesn't cause data corruption but can cause momentary display inconsistency in the most critical timer in the application.

**Fix:** Migrate to recursive `setTimeout` which inherently avoids catch-up behavior since the next tick is only scheduled after the current one completes.

---

## DBG-2: Rate-limiter client circuit breaker trip on non-JSON response [LOW/MEDIUM]

**File:** `src/lib/security/rate-limiter-client.ts:79`

**Failure mode:** If the rate-limiter sidecar returns a non-JSON body (e.g., an HTML error page from a reverse proxy like nginx), the `response.json()` call on line 79 throws `SyntaxError`. The outer catch (line 84) increments `consecutiveFailures` and opens the circuit breaker for 30 seconds. After 3 such failures, the circuit breaker stays open, and all rate-limit checks fall through to the DB-backed limiter.

This is incorrect behavior — a transient proxy error should not degrade the rate limiter. The circuit breaker should only open for genuine sidecar unreachability, not for parse errors on successful HTTP responses.

**Concrete failure scenario:**
1. Rate-limiter sidecar is behind nginx
2. nginx temporarily returns 502 HTML page instead of proxying to the sidecar
3. The `response.ok` check on line 74 fails, but wait — 502 means `response.ok` is `false`, so line 75-77 handles it correctly
4. However, if the sidecar returns a 200 with non-JSON body (misconfigured), line 79 throws
5. Circuit breaker opens for 30 seconds

**Fix:** Add `.catch()` to `.json()` and treat parse errors separately from network failures.

---

## Debugger Findings (carried/deferred)

### DBG-CARRIED-1: Sidebar interval re-entry — LOW/LOW, deferred from cycle 26
