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
 * Combine an existing AbortSignal with a timeout.
 * Returns a new AbortSignal that aborts when EITHER the original signal
 * aborts OR the timeout fires. Cleans up the timeout if the original
 * signal aborts first to avoid dangling timers, and cleans up the
 * listener if the timeout fires first to avoid listener leaks.
 *
 * If the source signal is already aborted at call time, the combined
 * signal is immediately aborted without starting a timer.
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
  }, ms);

  function onAbort() {
    clearTimeout(timer);
    combined.abort();
  }

  signal.addEventListener("abort", onAbort, { once: true });
  return combined.signal;
}
