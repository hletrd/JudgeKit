"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";

interface CountdownTimerProps {
  deadline: number; // ms timestamp
  label?: string;
  onExpired?: () => void;
}

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

export function CountdownTimer({ deadline, label, onExpired }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => deadline - Date.now());
  const [expired, setExpired] = useState(() => deadline - Date.now() <= 0);
  const expiredRef = useRef(expired);

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
    const interval = setInterval(() => {
      const diff = deadline - Date.now();
      setRemaining(diff);
      if (diff <= 0) {
        handleExpired();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, handleExpired]);

  return (
    <Badge className={`${getTimerColor(remaining)} font-mono text-sm`}>
      {label && <span className="mr-1">{label}:</span>}
      {expired ? "00:00:00" : formatCountdown(remaining)}
    </Badge>
  );
}
