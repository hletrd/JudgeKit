"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
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

export function AntiCheatMonitor({
  assignmentId,
  enabled,
  warningMessage,
}: AntiCheatMonitorProps) {
  const t = useTranslations("contests.antiCheat");
  const resolvedWarningMessage = warningMessage ?? t("warningTabSwitch");
  const lastEventRef = useRef<number>(0);
  const MIN_INTERVAL_MS = 1000;
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendEvent = useCallback(
    async (event: PendingEvent): Promise<boolean> => {
      try {
        const res = await apiFetch(`/api/v1/contests/${assignmentId}/anti-cheat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: event.eventType,
            details: event.details,
          }),
        });
        return res.ok;
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
      if (!ok && event.retries < MAX_RETRIES) {
        remaining.push({ ...event, retries: event.retries + 1 });
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
        const pending = loadPendingEvents(assignmentId);
        pending.push({ ...event, retries: 1 });
        savePendingEvents(assignmentId, pending);

        if (!retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void flushPendingEvents();
          }, RETRY_BASE_DELAY_MS * 2);
        }
      }
    },
    [assignmentId, sendEvent, flushPendingEvents]
  );

  useEffect(() => {
    if (!enabled) return;
    void flushPendingEvents();
  }, [enabled, flushPendingEvents]);

  useEffect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        void reportEvent("tab_switch");
        toast.warning(resolvedWarningMessage);
      }
    }

    function handleBlur() {
      void reportEvent("blur");
    }

    function handleCopy(e: ClipboardEvent) {
      void reportEvent("copy", {
        target: (e.target as HTMLElement)?.tagName,
      });
    }

    function handlePaste(e: ClipboardEvent) {
      void reportEvent("paste", {
        target: (e.target as HTMLElement)?.tagName,
      });
    }

    function handleContextMenu() {
      void reportEvent("contextmenu");
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
  }, [enabled, reportEvent, resolvedWarningMessage]);

  return null;
}
