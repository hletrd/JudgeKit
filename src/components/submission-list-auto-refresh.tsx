"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";

const ACTIVE_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 10000;
const MAX_BACKOFF_MS = 60000;
const BACKOFF_MULTIPLIER = 2;
// A router.refresh() dispatched while a client-side navigation is still in
// flight is queued behind it, and React commits both in one pass. Next.js then
// REPLACES the history entry instead of pushing a new one, so "back" on the
// next page skips this one entirely. Refreshes are held for this long after the
// user clicks an in-app link; a navigation that completes unmounts this
// component anyway, and one that never happens only delays a refresh.
const NAVIGATION_HOLD_MS = 10000;

function isInAppNavigationClick(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;

  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }

  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) {
    return false;
  }

  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(anchor.href, currentUrl);

  return (
    nextUrl.origin === currentUrl.origin &&
    (nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search)
  );
}

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
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const navigationStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (isInAppNavigationClick(event)) {
        navigationStartedAtRef.current = Date.now();
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const baseInterval = hasActiveSubmissions ? activeIntervalMs : idleIntervalMs;

    function isNavigating() {
      const startedAt = navigationStartedAtRef.current;
      return startedAt !== null && Date.now() - startedAt < NAVIGATION_HOLD_MS;
    }

    function getBackoffInterval() {
      if (errorCountRef.current === 0) return baseInterval;
      return Math.min(baseInterval * Math.pow(BACKOFF_MULTIPLIER, errorCountRef.current), MAX_BACKOFF_MS);
    }

    async function tick() {
      // Guard against concurrent ticks
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      // Abort any previous in-flight request before starting a new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (document.visibilityState === "hidden" || isNavigating()) return;

        // Use apiFetch for consistent CSRF header handling.
        // router.refresh() never throws on errors, so we cannot rely on it
        // for backoff. We fetch /api/v1/time (a tiny endpoint) first; only
        // on success do we trigger the actual page revalidation.
        // Note: /api/v1/time is unauthenticated, so this backoff only
        // activates for network/server errors, not session expiry. Session
        // expiry is correctly handled by the middleware redirect.
        const res = await apiFetch("/api/v1/time", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`time endpoint returned ${res.status}`);
        // Re-check: the user may have clicked a link while the probe was out.
        if (isNavigating()) return;
        router.refresh();
        errorCountRef.current = 0;
      } catch (err) {
        // Ignore abort errors — they are intentional cancellations
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        errorCountRef.current += 1;
      } finally {
        isRunningRef.current = false;
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    }

    async function start() {
      await tick();
      if (mountedRef.current) {
        scheduleNext();
      }
    }

    function scheduleNext() {
      timerRef.current = setTimeout(async () => {
        await tick();
        // Reschedule with potentially changed interval after error,
        // but only if cleanup has not run (timerRef cleared on unmount)
        if (timerRef.current !== null && mountedRef.current) {
          scheduleNext();
        }
      }, getBackoffInterval());
    }

    // Await the initial tick before scheduling the next one
    void start();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [hasActiveSubmissions, activeIntervalMs, idleIntervalMs, router]);

  return null;
}
