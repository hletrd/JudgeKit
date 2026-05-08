"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorCountRef = useRef(0);
  const isRunningRef = useRef(false);

  useEffect(() => {
    const baseInterval = hasActiveSubmissions ? activeIntervalMs : idleIntervalMs;

    function getBackoffInterval() {
      if (errorCountRef.current === 0) return baseInterval;
      return Math.min(baseInterval * Math.pow(BACKOFF_MULTIPLIER, errorCountRef.current), MAX_BACKOFF_MS);
    }

    async function tick() {
      // Guard against concurrent ticks
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      try {
        if (document.visibilityState === "hidden") return;

        // Use apiFetch for consistent CSRF header handling.
        // router.refresh() never throws on errors, so we cannot rely on it
        // for backoff. We fetch /api/v1/time (a tiny endpoint) first; only
        // on success do we trigger the actual page revalidation.
        // Note: /api/v1/time is unauthenticated, so this backoff only
        // activates for network/server errors, not session expiry. Session
        // expiry is correctly handled by the middleware redirect.
        const res = await apiFetch("/api/v1/time", { cache: "no-store" });
        if (!res.ok) throw new Error(`time endpoint returned ${res.status}`);
        router.refresh();
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current += 1;
      } finally {
        isRunningRef.current = false;
      }
    }

    async function start() {
      await tick();
      scheduleNext();
    }

    function scheduleNext() {
      timerRef.current = setTimeout(async () => {
        await tick();
        // Reschedule with potentially changed interval after error,
        // but only if cleanup has not run (timerRef cleared on unmount)
        if (timerRef.current !== null) {
          scheduleNext();
        }
      }, getBackoffInterval());
    }

    // Await the initial tick before scheduling the next one
    void start();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hasActiveSubmissions, activeIntervalMs, idleIntervalMs, router]);

  return null;
}
