"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface CountdownTimerProps {
  deadline: number; // ms timestamp
  label?: string;
  onExpired?: () => void;
}

const THRESHOLDS_MS = [15 * 60 * 1000, 5 * 60 * 1000, 1 * 60 * 1000] as const;

function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTimerColor(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "bg-red-600 text-white";
  if (ms < 5 * 60 * 1000) return "bg-red-500 text-white";
  if (ms < 30 * 60 * 1000) return "bg-yellow-500 text-white";
  return "bg-green-500 text-white";
}

function getTextColor(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1 * 60 * 1000) return "text-red-500 dark:text-red-400 animate-pulse";
  if (ms < 5 * 60 * 1000) return "text-orange-500 dark:text-orange-400";
  if (ms < 15 * 60 * 1000) return "text-yellow-500 dark:text-yellow-400";
  return "";
}

export function CountdownTimer({ deadline, label, onExpired }: CountdownTimerProps) {
  const offsetRef = useRef(0);
  const [remaining, setRemaining] = useState(() => deadline - Date.now());
  const [expired, setExpired] = useState(() => deadline - Date.now() <= 0);
  const expiredRef = useRef(expired);
  const firedThresholds = useRef<Set<number>>(new Set());
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
    const requestStart = Date.now();
    fetch("/api/v1/time")
      .then((res) => res.json())
      .then((data: { timestamp: number }) => {
        const roundTrip = Date.now() - requestStart;
        offsetRef.current = data.timestamp - (requestStart + roundTrip / 2);
      })
      .catch(() => {
        // keep offset at 0 on error
      });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
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
        }
      }

      if (diff <= 0) {
        handleExpired();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, handleExpired, t]);

  const textColor = getTextColor(remaining);

  return (
    <Badge className={`${getTimerColor(remaining)} font-mono text-sm`}>
      {label && <span className="mr-1">{label}:</span>}
      <span className={textColor || undefined}>
        {expired ? "00:00:00" : formatCountdown(remaining)}
      </span>
    </Badge>
  );
}
