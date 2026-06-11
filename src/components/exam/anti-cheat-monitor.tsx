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
import {
  clearInflightEvent,
  loadInflightEvent,
  loadPendingEvents,
  saveInflightEvent,
  savePendingEvents,
  type PendingEvent,
} from "./anti-cheat-storage";

interface AntiCheatMonitorProps {
  assignmentId: string;
  enabled: boolean;
  warningMessage?: string;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export function AntiCheatMonitor({
  assignmentId,
  enabled,
  warningMessage,
}: AntiCheatMonitorProps) {
  const t = useTranslations("contests.antiCheat");
  const resolvedWarningMessage = warningMessage ?? t("warningTabSwitch");
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(() => {
    try {
      return sessionStorage.getItem(`judgekit_anticheat_notice_${assignmentId}`) !== "accepted";
    } catch {
      return true;
    }
  });
  const lastEventRef = useRef<Record<string, number>>({});
  const MIN_INTERVAL_MS = 1000;
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabSwitchGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TAB_SWITCH_GRACE_MS = 3000;

  const sendEvent = useCallback(
    /**
     * Tri-state send result (RPF cycle-3 AGG3-5):
     *  - "ok"        — delivered.
     *  - "permanent" — the server REJECTED the event with a non-retriable
     *                  4xx (forbidden, contestEnded, origin mismatch, …).
     *                  Retrying can never succeed; queueing such events
     *                  burned the whole retry ladder and head-of-line
     *                  delayed genuinely retriable events behind them.
     *  - "retry"     — transient (network error, 5xx, 408 timeout,
     *                  429 rate-limited): keep the existing queue+backoff.
     */
    async (event: PendingEvent): Promise<"ok" | "permanent" | "retry"> => {
      try {
        const res = await apiFetch(`/api/v1/contests/${assignmentId}/anti-cheat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: event.eventType,
            details: event.details,
          }),
        });
        if (res.ok) return "ok";
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          return "permanent";
        }
        return "retry";
      } catch {
        return "retry";
      }
    },
    [assignmentId]
  );

  // Single-flight guard: mount, refocus, and "online" can all trigger a flush;
  // a second loop running alongside the first would re-send events the first
  // already loaded (RPF cycle-4 AGG4-3).
  const isFlushingRef = useRef(false);

  // Core flush logic extracted to a standalone async function so that both
  // flushPendingEvents and the retry timer callback can share the same
  // implementation. This avoids duplicating the load-send-save cycle, which
  // was a maintenance risk (bug fixes to one copy could be missed in the other).
  //
  // CLAIM LOOP (RPF cycle-4 AGG4-3): the previous load-all → send-all →
  // save-remaining shape held an in-memory copy of the queue across `await`
  // boundaries, so a `reportEvent` enqueue that interleaved with the sends was
  // clobbered by the final save (lost telemetry). Each iteration now claims
  // exactly ONE event in a synchronous load → save-without-it block before
  // awaiting the send, and re-loads the queue when requeueing a transient
  // failure — concurrent appends are never overwritten. The iteration count is
  // capped at the initial queue length so a requeued event waits for the
  // backoff timer instead of being retried in a tight loop within one flush.
  const performFlush = useCallback(async (): Promise<PendingEvent[]> => {
    if (isFlushingRef.current) return loadPendingEvents(assignmentId);
    isFlushingRef.current = true;
    try {
      // CRASH RECOVERY (RPF cycle-5 AGG5-4): an event claimed by a previous
      // flush whose send never completed (hard navigation/tab close mid-send)
      // sits in the in-flight slot. Re-queue it at the head — a bounded
      // duplicate beats silently losing evidence telemetry.
      const orphan = loadInflightEvent(assignmentId);
      if (orphan) {
        const recovered = loadPendingEvents(assignmentId);
        recovered.unshift(orphan);
        savePendingEvents(assignmentId, recovered);
        clearInflightEvent(assignmentId);
      }

      const initialLength = loadPendingEvents(assignmentId).length;
      for (let i = 0; i < initialLength; i++) {
        const queue = loadPendingEvents(assignmentId);
        if (queue.length === 0) break;
        const [event, ...rest] = queue;
        // Claim order matters: write the in-flight slot BEFORE removing the
        // event from the queue, so no unload window sees the event in
        // neither place (worst case is a duplicate, never a loss).
        saveInflightEvent(assignmentId, event);
        savePendingEvents(assignmentId, rest); // claim before awaiting
        try {
          const result = await sendEvent(event);
          // "ok" and "permanent" both leave the queue; only transient failures
          // ("retry") are requeued, up to MAX_RETRIES (AGG3-5).
          if (result === "retry" && event.retries < MAX_RETRIES) {
            const current = loadPendingEvents(assignmentId);
            current.push({ ...event, retries: event.retries + 1 });
            savePendingEvents(assignmentId, current);
          }
        } finally {
          clearInflightEvent(assignmentId);
        }
      }
      return loadPendingEvents(assignmentId);
    } finally {
      isFlushingRef.current = false;
    }
  }, [assignmentId, sendEvent]);

  // Schedule a retry via setTimeout if the remaining events contain retriable ones.
  // Uses performFlushRef (instead of directly referencing performFlush) to break
  // the circular dependency that would otherwise trigger react-hooks/immutability.
  //
  // Contract: the `remaining` argument is informational for backoff calculation
  // only — the timer always reloads the latest pending events from localStorage
  // via `performFlush`. Both flushPendingEvents and reportEvent are allowed to
  // pass either the just-failed subset or the full pending list; the resulting
  // backoff is `min(2^maxRetry * RETRY_BASE_DELAY_MS, 30s)`. With the current
  // MAX_RETRIES=3 the worst-case backoff is 8000ms (2^3 * 1000ms), so the
  // 30000ms clamp is unreachable today and remains as defensive code in case
  // MAX_RETRIES is increased in the future. The `!retryTimerRef.current` guard
  // inside the body prevents duplicate timers.
  const scheduleRetryRef = useRef<(remaining: PendingEvent[]) => void>(() => {});

  const flushPendingEvents = useCallback(async () => {
    const remaining = await performFlush();
    // Delegate retry scheduling to scheduleRetryRef, which encapsulates the
    // exponential backoff logic in a single place. This avoids duplicating
    // the scheduling code between this callback and the useEffect below.
    scheduleRetryRef.current(remaining);
  }, [performFlush]);

  // Keep scheduleRetryRef in sync so the retry timer always calls the latest version.
  // This is the single source of truth for retry scheduling logic — both
  // flushPendingEvents and reportEvent delegate here instead of duplicating
  // the has-retriable check, backoff calculation, and timer setup.
  useEffect(() => {
    scheduleRetryRef.current = (remaining: PendingEvent[]) => {
      const hasRetriable = remaining.some((e) => e.retries < MAX_RETRIES);
      if (hasRetriable && !retryTimerRef.current) {
        const maxRetry = remaining.reduce((max, e) => Math.max(max, e.retries), 0);
        const backoffDelay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, maxRetry), 30_000);
        retryTimerRef.current = setTimeout(async () => {
          retryTimerRef.current = null;
          const retryRemaining = await performFlush();
          scheduleRetryRef.current(retryRemaining);
        }, backoffDelay);
      }
    };
  }, [performFlush]);

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

      const result = await sendEvent(event);
      if (result === "retry") {
        const pending = loadPendingEvents(assignmentId);
        pending.push({ ...event, retries: 1 });
        savePendingEvents(assignmentId, pending);

        // Delegate retry scheduling to scheduleRetryRef instead of duplicating
        // the timer logic. This ensures the backoff formula stays consistent.
        scheduleRetryRef.current(pending);
      }
    },
    // `flushPendingEvents` was previously listed here but is no longer called
    // in this body — retry scheduling is delegated to scheduleRetryRef.current.
    // Removing it prevents needless re-creation of `reportEvent` whenever
    // performFlush identity changes.
    [assignmentId, sendEvent]
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

  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHeartbeatActiveRef = useRef(false);

  useEffect(() => {
    if (!enabled || showPrivacyNotice) return;

    isHeartbeatActiveRef.current = true;
    void reportEventRef.current("heartbeat");

    function scheduleHeartbeat() {
      if (!isHeartbeatActiveRef.current) return;
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setTimeout(async () => {
        if (!isHeartbeatActiveRef.current) return;
        if (document.visibilityState === "visible") {
          await reportEventRef.current("heartbeat");
        }
        scheduleHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    }

    scheduleHeartbeat();

    return () => {
      isHeartbeatActiveRef.current = false;
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [enabled, showPrivacyNotice]);

  useEffect(() => {
    if (!enabled || showPrivacyNotice) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        // Start a grace-period timer before reporting tab_switch.
        // This avoids false positives from accidental brief switches
        // (Alt+Tab slip, notification clicks, Spotlight, etc.).
        tabSwitchGraceTimerRef.current = setTimeout(() => {
          void reportEventRef.current("tab_switch");
          toast.warning(resolvedWarningMessage);
        }, TAB_SWITCH_GRACE_MS);
      } else {
        // Tab became visible — cancel any pending grace-period report.
        if (tabSwitchGraceTimerRef.current) {
          clearTimeout(tabSwitchGraceTimerRef.current);
          tabSwitchGraceTimerRef.current = null;
        }
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
      // Note: text content is intentionally NOT captured to avoid storing
      // copyrighted exam problem text in the audit log.
      if (["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "A", "STRONG", "EM"].includes(tag)) {
        const parent = el.closest("[class]");
        // getAttribute, not .className: on SVG elements className is an
        // SVGAnimatedString without .split — e.g. copying an SVG <a> inside a
        // classed <svg> threw and silently dropped the event (AGG5-6).
        const parentClass = parent?.getAttribute("class")?.split(" ")[0] ?? "";
        if (parentClass) return `${tag.toLowerCase()} in .${parentClass}`;
        return tag.toLowerCase();
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
      if (tabSwitchGraceTimerRef.current) {
        clearTimeout(tabSwitchGraceTimerRef.current);
        tabSwitchGraceTimerRef.current = null;
      }
    };
  }, [enabled, resolvedWarningMessage, showPrivacyNotice]);

  if (!enabled) return null;

  if (showPrivacyNotice) {
    return (
      <Dialog open={true} onOpenChange={() => { /* prevent closing — notice must be accepted */ }} disablePointerDismissal>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-muted-foreground" aria-hidden="true" />
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
          <Button
            variant="default"
            className="w-full"
            onClick={() => {
              setShowPrivacyNotice(false);
              try {
                sessionStorage.setItem(`judgekit_anticheat_notice_${assignmentId}`, "accepted");
              } catch {
                // sessionStorage unavailable
              }
            }}
          >
            {t("privacyNoticeAccept")}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
