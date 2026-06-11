"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { CountdownTimer } from "@/components/exam/countdown-timer";

export interface ExamDeadlineSyncProps {
  groupId: string;
  assignmentId: string;
  /** Server-rendered personal deadline (ms epoch) at page render time. */
  initialDeadline: number;
  label?: string;
}

/** ≥60s per the AGG2-4 plan: this is a safety net, not a live feed. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Live personal-deadline sync for windowed exams (RPF cycle-2 AGG2-4,
 * completes cycle-1 F12): a staff-granted time extension changes
 * `exam_sessions.personal_deadline` server-side immediately, but the
 * student's countdown was a render-time snapshot — the timer died at the
 * OLD deadline and the student stopped working even though the server
 * would accept their submissions. This wrapper refetches the session on a
 * slow interval and on tab refocus, and:
 *   - moves the countdown LATER when an extension is detected (never
 *     earlier — clock skew or a refetch race must not shrink time);
 *   - announces the extension (toast + persistent role="status" note);
 *   - router.refresh()es so the server-rendered expired-state gates
 *     (problem list visibility) recompute with the new deadline.
 */
export function ExamDeadlineSync({
  groupId,
  assignmentId,
  initialDeadline,
  label,
}: ExamDeadlineSyncProps) {
  const t = useTranslations("groups");
  const router = useRouter();
  const [deadline, setDeadline] = useState(initialDeadline);
  const [wasExtended, setWasExtended] = useState(false);
  const deadlineRef = useRef(initialDeadline);

  useEffect(() => {
    deadlineRef.current = deadline;
  }, [deadline]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await apiFetch(
          `/api/v1/groups/${groupId}/assignments/${assignmentId}/exam-session`
        );
        if (cancelled || !res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { data?: { personalDeadline?: string } | null }
          | null;
        const iso = json?.data?.personalDeadline;
        if (!iso) return;
        const next = new Date(iso).getTime();
        // Extension-only contract: ignore equal/earlier values.
        if (Number.isFinite(next) && next > deadlineRef.current) {
          setDeadline(next);
          setWasExtended(true);
          toast.info(t("examDeadlineExtended"));
          // Recompute the server-rendered expired-state gates (problem list,
          // expired panel) against the new deadline.
          router.refresh();
        }
      } catch {
        // Offline/transient failure: keep the current deadline. The next
        // interval tick or refocus retries; the server remains authoritative
        // for submission acceptance either way.
      } finally {
        inFlight = false;
      }
    }

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [groupId, assignmentId, router, t]);

  return (
    <div className="space-y-2">
      <CountdownTimer deadline={deadline} label={label} />
      {wasExtended && (
        <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t("examDeadlineExtended")}
        </p>
      )}
    </div>
  );
}
