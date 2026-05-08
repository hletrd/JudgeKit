"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Shared hook for visibility-aware polling. Encapsulates the pattern of
 * starting/stopping a timer based on document visibility state.
 *
 * - Starts polling immediately when the page is visible.
 * - Pauses polling when the page is hidden.
 * - Resumes polling (with an immediate fetch) when the page becomes visible again.
 * - Always clears the existing timer before creating a new one to prevent duplicates.
 * - Uses recursive `setTimeout` instead of `setInterval` to avoid catch-up
 *   behavior when the browser throttles background tabs.
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

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let jitterTimerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function clearPollingTimer() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }

    function clearJitterTimer() {
      if (jitterTimerId !== null) {
        clearTimeout(jitterTimerId);
        jitterTimerId = null;
      }
    }

    function scheduleNext() {
      timerId = setTimeout(() => {
        if (cancelled) return;
        tick();
        scheduleNext();
      }, intervalMs);
    }

    function syncVisibility() {
      if (document.visibilityState === "visible") {
        // Add a small random jitter (0-500ms) to prevent all polling
        // components from firing simultaneously on tab switch.
        const jitter = Math.floor(Math.random() * 500);
        jitterTimerId = setTimeout(() => {
          if (!cancelled) tick();
        }, jitter);
        // Always clear before creating to prevent duplicate timers
        clearPollingTimer();
        scheduleNext();
      } else {
        clearPollingTimer();
        clearJitterTimer();
      }
    }

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", syncVisibility);
      clearPollingTimer();
      clearJitterTimer();
    };
  }, [tick, intervalMs, paused]);
}
