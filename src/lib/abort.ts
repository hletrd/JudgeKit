/**
 * Create an AbortSignal that aborts after `ms` milliseconds.
 * Uses AbortSignal.timeout when available (modern browsers + Node.js),
 * with a fallback for older browsers (Safari < 16.4, Chrome < 103).
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal?.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * WeakMap that stores cleanup functions for combined signals created by
 * `withTimeout`. The cleanup only clears the timeout timer — the abort
 * listener is intentionally left in place so that if the caller aborts
 * the source signal after the underlying operation completes, the combined
 * signal still reflects that state. The once: true option auto-removes
 * the listener when it fires.
 */
const timeoutCleanups = new WeakMap<AbortSignal, () => void>();

/**
 * Clean up the timeout timer associated with a combined signal created
 * by `withTimeout`. Call this when the underlying operation (e.g., fetch)
 * completes before the timeout fires to prevent dangling timers.
 *
 * Does NOT remove the abort listener on the source signal — the caller
 * may still abort the source signal after the operation completes.
 */
export function cleanupWithTimeout(signal: AbortSignal): void {
  const cleanup = timeoutCleanups.get(signal);
  if (cleanup) {
    cleanup();
    timeoutCleanups.delete(signal);
  }
}

/**
 * Combine an existing AbortSignal with a timeout.
 * Returns a new AbortSignal that aborts when EITHER the original signal
 * aborts OR the timeout fires. Cleans up the timeout if the original
 * signal aborts first to avoid dangling timers, and cleans up the
 * listener if the timeout fires first to avoid listener leaks.
 *
 * If the source signal is already aborted at call time, the combined
 * signal is immediately aborted without starting a timer.
 *
 * **IMPORTANT:** When the underlying operation completes before the timeout,
 * call `cleanupWithTimeout(combinedSignal)` to clear the timer and avoid
 * a timer leak.
 */
export function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  const combined = new AbortController();
  if (signal.aborted) {
    combined.abort();
    return combined.signal;
  }

  const timer = setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    combined.abort();
    timeoutCleanups.delete(combined.signal);
  }, ms);

  function onAbort() {
    clearTimeout(timer);
    combined.abort();
    timeoutCleanups.delete(combined.signal);
  }

  signal.addEventListener("abort", onAbort, { once: true });
  // Only clear the timer on cleanup — leave the abort listener in place
  // so the combined signal still responds to caller aborts after fetch.
  timeoutCleanups.set(combined.signal, () => {
    clearTimeout(timer);
  });
  return combined.signal;
}
