# Cycle 17 — Code Reviewer (Manual)

**Date:** 2026-05-09
**HEAD reviewed:** `32464e55`
**Agent status:** Agent tool unavailable; performed manually by orchestrator

---

## Focus Areas

- Correctness of cycle-16 timeout fixes (apiFetch + docker worker fetch)
- Code duplication (DRY violations)
- Edge cases in signal handling
- General code quality across changed files

---

## Findings

### C17-CR-1: `withTimeout` does not handle already-aborted signals [MEDIUM]

- **File:** `src/lib/api/client.ts:94-102`, `src/lib/docker/client.ts:104-112`
- **Confidence:** High
- **Problem:** If the caller passes a signal where `signal.aborted === true` (e.g., an AbortController that was already aborted), `withTimeout` sets up a timeout and an abort listener. Because the abort event has already fired, the listener never fires. The combined signal will only abort when the timeout fires — not immediately.
- **Failure Scenario:** A React component unmounts and aborts its AbortController. A cleanup function or another effect then calls `apiFetch` with the same (now-aborted) signal. The fetch hangs for up to 30s instead of failing immediately.
- **Fix:** Check `signal.aborted` before setting up listeners:
  ```typescript
  function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
    const combined = new AbortController();
    if (signal.aborted) {
      combined.abort();
      return combined.signal;
    }
    const timer = setTimeout(() => combined.abort(), ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      combined.abort();
    }, { once: true });
    return combined.signal;
  }
  ```

### C17-CR-2: `withTimeout` and `createTimeoutSignal` duplicated in two modules [LOW]

- **File:** `src/lib/api/client.ts`, `src/lib/docker/client.ts`
- **Confidence:** High
- **Problem:** The `withTimeout` function (12 lines) and `createTimeoutSignal` function (8 lines) are duplicated verbatim in both `api/client.ts` and `docker/client.ts`. This is a DRY violation that increases maintenance burden and risk of the two implementations diverging.
- **Fix:** Extract both functions to `src/lib/utils.ts` or a new `src/lib/abort.ts` module. Export them and import in both consumers.

### C17-CR-3: `withTimeout` abort listener leaks when timeout fires first [LOW]

- **File:** `src/lib/api/client.ts:94-102`, `src/lib/docker/client.ts:104-112`
- **Confidence:** Medium
- **Problem:** The abort event listener uses `{ once: true }`, which auto-removes only when the abort event fires. If the timeout fires first, the listener is never removed and remains registered on the source signal. For long-lived AbortControllers (e.g., held in React refs), this accumulates listeners over time.
- **Failure Scenario:** A component makes repeated `apiFetch` calls with the same AbortController.signal (uncommon but possible). Each call adds a listener that is never cleaned up if the timeout fires first.
- **Fix:** Store the listener function and remove it in the timeout handler:
  ```typescript
  function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
    const combined = new AbortController();
    if (signal.aborted) {
      combined.abort();
      return combined.signal;
    }
    let timer: ReturnType<typeof setTimeout>;
    function onAbort() {
      clearTimeout(timer);
      combined.abort();
    }
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      combined.abort();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
    return combined.signal;
  }
  ```

---

## Verified Fixed (from Cycle 16)

| Finding | Status | Evidence |
|---------|--------|----------|
| C16-1 apiFetch default timeout bypassed | FIXED | `withTimeout` now wraps caller-provided signals with 30s timeout |
| C16-2 AbortSignal.timeout without browser fallback | FIXED | `createTimeoutSignal` provides setTimeout fallback for older browsers |
| C16 test gap | FIXED | Tests updated to verify composite signal behavior (client.test.ts:81-101) |

---

## Areas Examined

- `src/lib/api/client.ts` — full read, verified cycle-16 fixes, found signal edge cases
- `src/lib/docker/client.ts` — full read, same `withTimeout` issues
- `tests/unit/api/client.test.ts` — verified tests cover new behavior
- `src/lib/plugins/chat-widget/chat-widget.tsx` — verified AbortController cleanup is correct
- `src/components/exam/countdown-timer.tsx` — verified timer cleanup is correct
- Grep sweeps for: empty catches, `as any`, `eval`, `innerHTML`, `Math.random`, `Date.now`, timer leaks, missing auth
