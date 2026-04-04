"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";

interface AntiCheatMonitorProps {
  assignmentId: string;
  enabled: boolean;
  warningMessage?: string;
}

const STORAGE_KEY = "judgekit_anticheat_pending";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

interface PendingEvent {
  eventType: string;
  details?: string;
  timestamp: number;
  retries: number;
}

function loadPendingEvents(assignmentId: string): PendingEvent[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${assignmentId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingEvents(assignmentId: string, events: PendingEvent[]) {
  try {
    if (events.length === 0) {
      localStorage.removeItem(`${STORAGE_KEY}_${assignmentId}`);
    } else {
      localStorage.setItem(`${STORAGE_KEY}_${assignmentId}`, JSON.stringify(events));
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Client-side anti-cheat monitor.
 * Detects tab switches, copy, paste, blur, and contextmenu events.
 * Reports events to the server API with retry and localStorage persistence.
 */
export function AntiCheatMonitor({
  assignmentId,
  enabled,
  warningMessage = "Tab switch detected. This event has been recorded.",
}: AntiCheatMonitorProps) {
  const lastEventRef = useRef<number>(0);
  const MIN_INTERVAL_MS = 1000; // Rate limit client-side events
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendEvent = useCallback(
    async (event: PendingEvent): Promise<boolean> => {
      try {
        await apiFetch(`/api/v1/contests/${assignmentId}/anti-cheat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: event.eventType,
            details: event.details,
          }),
        });
        return true;
      } catch {
        return false;
      }
    },
    [assignmentId]
  );

  const flushPendingEvents = useCallback(async () => {
    const pending = loadPendingEvents(assignmentId);
    if (pending.length === 0) return;

    const remaining: PendingEvent[] = [];
    for (const event of pending) {
      const ok = await sendEvent(event);
      if (!ok) {
        if (event.retries < MAX_RETRIES) {
          remaining.push({ ...event, retries: event.retries + 1 });
        }
        // Drop events that exceeded MAX_RETRIES
      }
    }
    savePendingEvents(assignmentId, remaining);
  }, [assignmentId, sendEvent]);

  const reportEvent = useCallback(
    async (eventType: string, details?: Record<string, unknown>) => {
      const now = Date.now();
      if (now - lastEventRef.current < MIN_INTERVAL_MS) return;
      lastEventRef.current = now;

      const event: PendingEvent = {
        eventType,
        details: details ? JSON.stringify(details) : undefined,
        timestamp: now,
        retries: 0,
      };

      const ok = await sendEvent(event);
      if (!ok) {
        // Queue for retry
        const pending = loadPendingEvents(assignmentId);
        pending.push({ ...event, retries: 1 });
        savePendingEvents(assignmentId, pending);

        // Schedule retry with exponential backoff
        if (!retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            flushPendingEvents();
          }, RETRY_BASE_DELAY_MS * 2);
        }
      }
    },
    [assignmentId, sendEvent, flushPendingEvents]
  );

  // Flush any events persisted from a previous session on mount
  useEffect(() => {
    if (!enabled) return;
    flushPendingEvents();
  }, [enabled, flushPendingEvents]);

  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        reportEvent("tab_switch");
        toast.warning(warningMessage);
      }
    }

    function handleBlur() {
      reportEvent("blur");
    }

    function handleCopy(e: ClipboardEvent) {
      reportEvent("copy", {
        target: (e.target as HTMLElement)?.tagName,
      });
    }

    function handlePaste(e: ClipboardEvent) {
      reportEvent("paste", {
        target: (e.target as HTMLElement)?.tagName,
      });
    }

    function handleContextMenu(_e: MouseEvent) {
      // Log the event but do not prevent default — preserves accessibility
      reportEvent("contextmenu");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [enabled, reportEvent, warningMessage]);

  // This component renders nothing — it's purely side-effect based
  return null;
}
