"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AntiCheatMonitorProps {
  assignmentId: string;
  enabled: boolean;
  warningMessage?: string;
}

const STORAGE_KEY = "judgekit_anticheat_pending";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface PendingEvent {
  eventType: string;
  details?: string;
  timestamp: number;
  retries: number;
}

function isValidPendingEvent(entry: unknown): entry is PendingEvent {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return typeof e.eventType === "string" && typeof e.retries === "number" && typeof e.timestamp === "number";
}

function loadPendingEvents(assignmentId: string): PendingEvent[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${assignmentId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPendingEvent);
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
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(true);
  const lastEventRef = useRef<Record<string, number>>({});
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
      const lastEventAt = lastEventRef.current[eventType] ?? 0;
      if (now - lastEventAt < MIN_INTERVAL_MS) return;
      lastEventRef.current[eventType] = now;

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

  // Refs for stable access in event handlers — prevents listener re-registration
  const reportEventRef = useRef(reportEvent);
  const flushPendingEventsRef = useRef(flushPendingEvents);
  useEffect(() => { reportEventRef.current = reportEvent; }, [reportEvent]);
  useEffect(() => { flushPendingEventsRef.current = flushPendingEvents; }, [flushPendingEvents]);

  useEffect(() => {
    if (!enabled || showPrivacyNotice) return;
    void flushPendingEventsRef.current();
  }, [enabled, showPrivacyNotice]);

  useEffect(() => {
    if (!enabled || showPrivacyNotice) return;

    void reportEventRef.current("heartbeat");

    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleHeartbeat() {
      heartbeatTimer = setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await reportEventRef.current("heartbeat");
        }
        scheduleHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    }

    scheduleHeartbeat();

    return () => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
    };
  }, [enabled, showPrivacyNotice]);

  useEffect(() => {
    if (!enabled || showPrivacyNotice) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        void reportEventRef.current("tab_switch");
        toast.warning(resolvedWarningMessage);
      } else {
        void flushPendingEventsRef.current();
        void reportEventRef.current("heartbeat");
      }
    }

    function handleBlur() {
      void reportEventRef.current("blur");
    }

    function describeElement(el: HTMLElement | null): string {
      if (!el) return "unknown";
      const tag = el.tagName;
      // Code editor (CodeMirror / Monaco)
      if (el.closest(".cm-editor") || el.closest(".monaco-editor")) return "code-editor";
      // Problem description area
      if (el.closest(".problem-description")) return "problem-description";
      // Textarea / input
      if (tag === "TEXTAREA" || tag === "INPUT") return "input-field";
      // Code block in problem
      if (el.closest("pre") || el.closest("code")) return "code-block";
      // Headings, paragraphs, spans in content
      if (["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "A", "STRONG", "EM"].includes(tag)) {
        // Try to get a snippet of the content
        const text = (el.textContent ?? "").trim().slice(0, 80);
        const parent = el.closest("[class]") as HTMLElement | null;
        const parentClass = parent?.className?.split(" ")[0] ?? "";
        if (parentClass) return `${tag.toLowerCase()} in .${parentClass}${text ? `: "${text}"` : ""}`;
        return `${tag.toLowerCase()}${text ? `: "${text}"` : ""}`;
      }
      return tag.toLowerCase();
    }

    function handleCopy(e: ClipboardEvent) {
      void reportEventRef.current("copy", {
        target: describeElement(e.target as HTMLElement),
      });
    }

    function handlePaste(e: ClipboardEvent) {
      void reportEventRef.current("paste", {
        target: describeElement(e.target as HTMLElement),
      });
    }

    function handleContextMenu() {
      void reportEventRef.current("contextmenu");
    }

    function handleOnline() {
      void flushPendingEventsRef.current();
      void reportEventRef.current("heartbeat");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("online", handleOnline);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [enabled, resolvedWarningMessage, showPrivacyNotice]);

  if (!enabled) return null;

  if (showPrivacyNotice) {
    return (
      <Dialog open={true} onOpenChange={(open) => { if (!open) setShowPrivacyNotice(false); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-muted-foreground" />
              {t("privacyNoticeTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("privacyNoticeDescription")}
            </DialogDescription>
          </DialogHeader>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t("privacyNoticeTabSwitch")}</li>
            <li>{t("privacyNoticeCopyPaste")}</li>
            <li>{t("privacyNoticeIpAddress")}</li>
            <li>{t("privacyNoticeCodeSnapshots")}</li>
          </ul>
          <Button variant="default" className="w-full" onClick={() => setShowPrivacyNotice(false)}>
            {t("privacyNoticeAccept")}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
