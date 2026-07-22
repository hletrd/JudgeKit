"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch, getApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Matches the backend `MAX_BACKFILL_WINDOW_DAYS`; blocked client-side too. */
const MAX_WINDOW_DAYS = 180;
/** Delay between resumable POSTs while draining the backlog. */
const LOOP_DELAY_MS = 1500;
/** Stop the auto-loop if `remaining` fails to drop for this many consecutive
 *  polls — protects against an endless loop when generation never produces a
 *  comment (e.g. the AI assistant is disabled), which the count can't ever
 *  reduce. The Stop button is the primary control; this is a safety net. */
const MAX_STALL_POLLS = 10;

/** Local YYYY-MM-DD for a Date (for <input type="date">). */
function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Range-scoped bulk backfill panel for AI code reviews. Defaults to the last
 * four weeks. Targets accepted submissions lacking an AI comment; the backend is
 * resumable, so this loops the POST (with a short delay) until `remaining` hits
 * 0 or the operator stops.
 */
export function AdminSubmissionsBackfill() {
  const t = useTranslations("admin.submissions");
  const tCommon = useTranslations("common");

  const now = new Date();
  const [from, setFrom] = useState(() => toDateInputValue(new Date(now.getTime() - 28 * DAY_MS)));
  const [to, setTo] = useState(() => toDateInputValue(now));
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [enqueuedTotal, setEnqueuedTotal] = useState(0);
  const stopRef = useRef(false);
  // Tracks whether the component is still mounted so the auto-loop can bail
  // out of setState after an unmount instead of warning/leaking. Unmount also
  // flips `stopRef`, which the loop already checks before every POST, so
  // navigating away halts further requests the same way the Stop button does.
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopRef.current = true;
    };
  }, []);

  // Span in days measured exactly like the backend (both bounds coerced from the
  // YYYY-MM-DD string to UTC midnight), so the client and server agree on the cap.
  const spanDays = (() => {
    const f = new Date(from);
    const tt = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(tt.getTime())) return null;
    return (tt.getTime() - f.getTime()) / DAY_MS;
  })();
  const rangeInvalid = spanDays === null || spanDays < 0;
  const rangeTooLarge = spanDays !== null && spanDays > MAX_WINDOW_DAYS;
  const canRun = !running && !rangeInvalid && !rangeTooLarge;

  async function runLoop() {
    setRunning(true);
    setEnqueuedTotal(0);
    stopRef.current = false;
    let lastRemaining = Number.POSITIVE_INFINITY;
    let stall = 0;

    try {
      while (!stopRef.current) {
        let response: Response;
        try {
          response = await apiFetch("/api/v1/admin/submissions/ai-review-backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from, to }),
          });
        } catch {
          toast.error(t("backfillFailed"));
          break;
        }

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          if (process.env.NODE_ENV === "development") {
            console.error("AI review backfill failed:", getApiError(errorBody));
          }
          toast.error(t("backfillFailed"));
          break;
        }

        const payload = (await response.json().catch(() => ({ data: null }))) as {
          data?: { enqueued?: number; remaining?: number } | null;
        };

        // The component may have unmounted while the request/JSON parsing
        // above was in flight. Bail before touching state (and before the
        // loop can queue another POST on its next iteration).
        if (!isMountedRef.current) {
          break;
        }

        const enqueued = typeof payload.data?.enqueued === "number" ? payload.data.enqueued : 0;
        const rem = typeof payload.data?.remaining === "number" ? payload.data.remaining : 0;
        setEnqueuedTotal((prev) => prev + enqueued);
        setRemaining(rem);

        if (rem <= 0) {
          toast.success(t("backfillComplete"));
          break;
        }

        // The count is measured before this batch's fire-and-forget generations
        // complete, so it can hold steady for a poll or two on a healthy run.
        // Only bail after it stays flat across many consecutive polls.
        if (rem >= lastRemaining) {
          stall += 1;
          if (stall >= MAX_STALL_POLLS) {
            toast.error(t("backfillStalled"));
            break;
          }
        } else {
          stall = 0;
        }
        lastRemaining = rem;

        await new Promise((resolve) => setTimeout(resolve, LOOP_DELAY_MS));
      }
    } finally {
      // Skip if unmounted during the last await above — nothing left to
      // update, and calling setState here would warn/leak.
      if (isMountedRef.current) {
        setRunning(false);
      }
      stopRef.current = false;
    }
  }

  function handleStop() {
    stopRef.current = true;
  }

  async function handleConfirm(): Promise<boolean> {
    if (!canRun) {
      toast.error(rangeTooLarge ? t("backfillRangeTooLarge", { days: MAX_WINDOW_DAYS }) : t("backfillRangeInvalid"));
      return false;
    }
    // Start the resumable loop and close the dialog immediately; live progress
    // and the Stop control live in the panel below.
    void runLoop();
    return true;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("backfillTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("backfillDescription")}</p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="backfill-from">{t("backfillFromLabel")}</Label>
            <Input
              id="backfill-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              disabled={running}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="backfill-to">{t("backfillToLabel")}</Label>
            <Input
              id="backfill-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              disabled={running}
            />
          </div>
          <div className="flex items-end gap-2">
            {running ? (
              <Button type="button" variant="outline" size="sm" onClick={handleStop}>
                {t("backfillStop")}
              </Button>
            ) : (
              <DestructiveActionDialog
                triggerLabel={t("backfillRun")}
                title={t("backfillConfirmTitle")}
                description={t("backfillConfirmDescription")}
                confirmLabel={t("backfillRun")}
                cancelLabel={tCommon("cancel")}
                onConfirmAction={handleConfirm}
                disabled={!canRun}
                triggerVariant="outline"
                triggerSize="sm"
              />
            )}
          </div>
        </div>

        {rangeTooLarge && (
          <p className="text-sm text-destructive" role="alert">
            {t("backfillRangeTooLarge", { days: MAX_WINDOW_DAYS })}
          </p>
        )}
        {rangeInvalid && !rangeTooLarge && (
          <p className="text-sm text-destructive" role="alert">
            {t("backfillRangeInvalid")}
          </p>
        )}

        {(running || remaining !== null) && (
          <div className="rounded-md border p-3 text-sm" role="status" aria-live="polite">
            <div className="flex items-center gap-2 font-medium">
              {running && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              <span>{t("backfillRemaining", { count: remaining ?? 0 })}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("backfillEnqueuedTotal", { count: enqueuedTotal })}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("backfillCostNote")}</p>
      </CardContent>
    </Card>
  );
}
