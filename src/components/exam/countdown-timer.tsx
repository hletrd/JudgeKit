"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { formatDuration } from "@/lib/formatting";
import { Badge } from "@/components/ui/badge";

interface CountdownTimerProps {
  deadline: number; // ms timestamp
  label?: string;
  onExpired?: () => void;
}

const THRESHOLDS_MS = [15 * 60 * 1000, 5 * 60 * 1000, 1 * 60 * 1000] as const;

function getTimerVariant(ms: number): "destructive" | "secondary" | "success" {
  if (!Number.isFinite(ms) || ms <= 0) return "destructive";
  if (ms < 5 * 60 * 1000) return "destructive";
  if (ms < 30 * 60 * 1000) return "secondary";
  return "success";
}

function getTextColor(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1 * 60 * 1000) return "text-destructive animate-pulse";
  if (ms < 5 * 60 * 1000) return "text-destructive";
  if (ms < 15 * 60 * 1000) return "text-muted-foreground";
  return "";
}

/** Pre-populate thresholds already passed at mount time to avoid spurious warnings. */
function prePopulateThresholds(remaining: number): Set<number> {
  const set = new Set<number>();
  for (const threshold of THRESHOLDS_MS) {
    if (remaining <= threshold) {
      set.add(threshold);
    }
  }
  return set;
}

export function CountdownTimer({ deadline, label, onExpired }: CountdownTimerProps) {
  const offsetRef = useRef(0);
  const [remaining, setRemaining] = useState(() => deadline - Date.now());
  const [expired, setExpired] = useState(() => deadline - Date.now() <= 0);
  const expiredRef = useRef(expired);
  const firedThresholds = useRef<Set<number>>(prePopulateThresholds(deadline - Date.now()));
  const [thresholdAnnouncement, setThresholdAnnouncement] = useState("");
  const [thresholdUrgent, setThresholdUrgent] = useState(false);
  const t = useTranslations("groups");
  const lastHiddenAtRef = useRef<number | null>(null);
  const syncCleanupRef = useRef<(() => void) | null>(null);

  const handleExpired = useCallback(() => {
    if (!expiredRef.current) {
      expiredRef.current = true;
      setExpired(true);
      onExpired?.();
    }
  }, [onExpired]);

  useEffect(() => {
    expiredRef.current = expired;
  }, [expired]);

  // Reset derived state when the deadline prop changes (e.g., exam extension).
  useEffect(() => {
    const newRemaining = deadline - (Date.now() + offsetRef.current);
    const newExpired = newRemaining <= 0;
    setRemaining(newRemaining);
    setExpired(newExpired);
    expiredRef.current = newExpired;
    firedThresholds.current = prePopulateThresholds(newRemaining);
    setThresholdAnnouncement("");
    setThresholdUrgent(false);
  }, [deadline]);

  // Sync local clock offset with the server. Called at mount and on every
  // tab refocus to prevent timer drift from background tab throttling.
  const syncTime = useCallback(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const requestStart = Date.now();
    apiFetch("/api/v1/time", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (!data || typeof data !== "object" || !("timestamp" in data)) return;
        const timestamp = data.timestamp;
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return;
        const roundTrip = Date.now() - requestStart;
        offsetRef.current = timestamp - (requestStart + roundTrip / 2);
      })
      .catch(() => {
        // keep existing offset on error
      });
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const cleanup = syncTime();
    return () => {
      cleanup();
      syncCleanupRef.current?.();
      syncCleanupRef.current = null;
    };
  }, [syncTime]);

  useEffect(() => {
    function recalculate(staggerToasts = false) {
      const diff = deadline - (Date.now() + offsetRef.current);
      setRemaining(diff);

      const newlyFired: number[] = [];
      for (const threshold of THRESHOLDS_MS) {
        if (diff <= threshold && !firedThresholds.current.has(threshold)) {
          firedThresholds.current.add(threshold);
          newlyFired.push(threshold);
        }
      }

      if (staggerToasts && newlyFired.length > 1) {
        // When the tab regains focus after being backgrounded, multiple
        // thresholds may fire simultaneously. Only show the most urgent
        // (smallest threshold = closest to expiration) to avoid toast spam.
        const mostUrgent = Math.min(...newlyFired);
        const messageKey =
          mostUrgent === 15 * 60 * 1000
            ? "examWarning15Min"
            : mostUrgent === 5 * 60 * 1000
              ? "examWarning5Min"
              : "examWarning1Min";
        toast.warning(t(messageKey));
        setThresholdAnnouncement(t(messageKey));
        setThresholdUrgent(mostUrgent === 1 * 60 * 1000);
      } else {
        // Normal tick path: fire all toasts immediately (at most one per tick)
        for (const threshold of newlyFired) {
          const messageKey =
            threshold === 15 * 60 * 1000
              ? "examWarning15Min"
              : threshold === 5 * 60 * 1000
                ? "examWarning5Min"
                : "examWarning1Min";
          toast.warning(t(messageKey));
          setThresholdAnnouncement(t(messageKey));
          setThresholdUrgent(threshold === 1 * 60 * 1000);
        }
      }

      if (diff <= 0) {
        handleExpired();
      }
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function scheduleNext() {
      timerId = setTimeout(() => {
        if (cancelled) return;
        recalculate();
        scheduleNext();
      }, 1000);
    }

    // Immediately recalculate when the tab becomes visible to prevent
    // timer drift caused by browser throttling of setInterval in
    // background tabs. Students rely on accurate countdown during exams.
    // Re-syncs with server time on every refocus and suppresses toast
    // spam when the tab was backgrounded for more than 30 seconds.
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        lastHiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        // Abort any in-flight sync before starting a new one to prevent
        // queuing multiple concurrent /api/v1/time requests on rapid tab switches.
        syncCleanupRef.current?.();
        syncCleanupRef.current = syncTime();

        const hiddenDurationMs =
          lastHiddenAtRef.current !== null ? Date.now() - lastHiddenAtRef.current : 0;
        const wasHiddenLong = hiddenDurationMs > 30_000;

        // If the tab was hidden for >30s, suppress threshold toasts
        // entirely — the student already knows they were away.
        // Otherwise, only show the most urgent crossed threshold.
        recalculate(!wasHiddenLong);
        lastHiddenAtRef.current = null;
      }
    }

    scheduleNext();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
      syncCleanupRef.current?.();
      syncCleanupRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deadline, handleExpired, t]);

  const textColor = getTextColor(remaining);

  return (
    <>
      <Badge role="timer" className={`font-mono text-sm`} variant={getTimerVariant(remaining)}>
        {label && <span className="mr-1">{label}:</span>}
        <span className={textColor || undefined}>
          {expired ? "00:00:00" : formatDuration(remaining)}
        </span>
      </Badge>
      <span aria-live={thresholdUrgent ? "assertive" : "polite"} className="sr-only">
        {thresholdAnnouncement}
      </span>
    </>
  );
}
