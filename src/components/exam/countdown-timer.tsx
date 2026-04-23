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

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const requestStart = Date.now();
    apiFetch("/api/v1/time", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null) as Promise<{ timestamp: number } | null>;
      })
      .then((data) => {
        if (!data) return;
        // Validate that the timestamp is a finite number before using it.
        // A malformed response (e.g., { timestamp: null }) would produce NaN,
        // causing the countdown to show "00:00:00" in red without actually
        // triggering the onExpired callback (since NaN <= 0 is false).
        if (Number.isFinite(data.timestamp)) {
          const roundTrip = Date.now() - requestStart;
          offsetRef.current = data.timestamp - (requestStart + roundTrip / 2);
        }
      })
      .catch(() => {
        // keep offset at 0 on error
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  useEffect(() => {
    function recalculate() {
      const diff = deadline - (Date.now() + offsetRef.current);
      setRemaining(diff);

      for (const threshold of THRESHOLDS_MS) {
        if (diff <= threshold && !firedThresholds.current.has(threshold)) {
          firedThresholds.current.add(threshold);
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

    const interval = setInterval(recalculate, 1000);

    // Immediately recalculate when the tab becomes visible to prevent
    // timer drift caused by browser throttling of setInterval in
    // background tabs. Students rely on accurate countdown during exams.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        recalculate();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
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
