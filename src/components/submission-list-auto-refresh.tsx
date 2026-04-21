"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 10000;
const MAX_BACKOFF_MS = 60000;
const BACKOFF_MULTIPLIER = 2;

export function SubmissionListAutoRefresh({
  hasActiveSubmissions,
  activeIntervalMs = ACTIVE_INTERVAL_MS,
  idleIntervalMs = IDLE_INTERVAL_MS,
}: {
  hasActiveSubmissions: boolean;
  activeIntervalMs?: number;
  idleIntervalMs?: number;
}) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountRef = useRef(0);

  useEffect(() => {
    const baseInterval = hasActiveSubmissions ? activeIntervalMs : idleIntervalMs;

    function getBackoffInterval() {
      if (errorCountRef.current === 0) return baseInterval;
      return Math.min(baseInterval * Math.pow(BACKOFF_MULTIPLIER, errorCountRef.current), MAX_BACKOFF_MS);
    }

    // Use router.refresh() wrapped in startTransition to detect errors.
    // When router.refresh() throws or the page is unreachable, increment
    // error count for exponential backoff. Reset on success.
    function tick() {
      if (document.visibilityState === "hidden") return;

      try {
        router.refresh();
        // If we get here without throwing, reset backoff
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current += 1;
      }
    }

    // Initial tick
    tick();

    // Schedule subsequent ticks with backoff-aware interval
    function scheduleNext() {
      intervalRef.current = setInterval(() => {
        tick();
        // Reschedule with potentially changed interval after error
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          scheduleNext();
        }
      }, getBackoffInterval());
    }

    scheduleNext();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveSubmissions, activeIntervalMs, idleIntervalMs, router]);

  return null;
}
