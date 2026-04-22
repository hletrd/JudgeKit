"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Shared hook for visibility-aware polling. Encapsulates the pattern of
 * starting/stopping an interval based on document visibility state.
 *
 * - Starts polling immediately when the page is visible.
 * - Pauses polling when the page is hidden.
 * - Resumes polling (with an immediate fetch) when the page becomes visible again.
 * - Always clears the existing interval before creating a new one to prevent duplicates.
 *
 * Note: The callback must handle its own errors (e.g., try/catch with toast).
 * The hook does not catch errors thrown by the callback.
 */
export function useVisibilityPolling(
  callback: () => void,
  intervalMs: number,
  paused = false,
) {
  const savedCallback = useRef(callback);

  // Update the saved callback whenever it changes, without re-triggering the effect.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const tick = useCallback(() => {
    savedCallback.current();
  }, []);

  useEffect(() => {
    if (paused) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function clearPollingInterval() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function syncVisibility() {
      if (document.visibilityState === "visible") {
        // Add a small random jitter (0-500ms) to prevent all polling
        // components from firing simultaneously on tab switch.
        const jitter = Math.floor(Math.random() * 500);
        setTimeout(() => {
          void tick();
        }, jitter);
        // Always clear before creating to prevent duplicate intervals
        clearPollingInterval();
        intervalId = setInterval(tick, intervalMs);
      } else {
        clearPollingInterval();
      }
    }

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      clearPollingInterval();
    };
  }, [tick, intervalMs, paused]);
}
