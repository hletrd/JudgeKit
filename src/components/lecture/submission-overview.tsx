"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X, CheckCircle2, XCircle, AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildStatusLabels } from "@/lib/judge/status-labels";
import { apiFetch } from "@/lib/api/client";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";
import { formatNumber } from "@/lib/formatting";
import { useLocale } from "next-intl";

type SubmissionStats = {
  total: number;
  accepted: number;
  wrongAnswer: number;
  compileError: number;
  runtimeError: number;
  timeLimit: number;
  pending: number;
  other: number;
};

type RecentSubmission = {
  id: string;
  status: string;
  language: string;
  submittedAt: string;
  userId: string;
};

const POLL_INTERVAL_MS = 5000;

function categorize(status: string): keyof Omit<SubmissionStats, "total"> {
  switch (status) {
    case "accepted": return "accepted";
    case "wrong_answer": return "wrongAnswer";
    case "compile_error": return "compileError";
    case "runtime_error": return "runtimeError";
    case "time_limit": case "time_limit_exceeded": return "timeLimit";
    case "pending": case "queued": case "judging": return "pending";
    default: return "other";
  }
}

export function SubmissionOverview({
  assignmentId,
  problemId,
  open,
  onClose,
}: {
  assignmentId?: string | null;
  problemId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("lecture");
  const tSubmissions = useTranslations("submissions");
  const locale = useLocale();
  const [stats, setStats] = useState<SubmissionStats>({
    total: 0, accepted: 0, wrongAnswer: 0, compileError: 0,
    runtimeError: 0, timeLimit: 0, pending: 0, other: 0,
  });
  const [recent, setRecent] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const initialLoadDoneRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  const fetchStats = useCallback(async () => {
    // Guard: only fetch when the dialog is open
    if (!openRef.current) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        problemId,
        limit: "10",
        includeSummary: "1",
      });
      if (assignmentId) {
        params.set("assignmentId", assignmentId);
      }
      const res = await apiFetch(`/api/v1/submissions?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json().catch(() => ({ data: {} }));
      const submissions: Array<{ id: string; status: string; language: string; submittedAt: string; userId: string }> =
        json.data?.submissions ?? json.data ?? [];
      const summary = json.data?.summary as Record<string, number> | undefined;
      const total = typeof json.data?.total === "number" && Number.isFinite(json.data.total) ? json.data.total : submissions.length;

      const newStats: SubmissionStats = {
        total, accepted: 0, wrongAnswer: 0, compileError: 0,
        runtimeError: 0, timeLimit: 0, pending: 0, other: 0,
      };

      if (summary) {
        for (const [status, count] of Object.entries(summary)) {
          const cat = categorize(status);
          newStats[cat] += count;
        }
      } else {
        for (const sub of submissions) {
          const cat = categorize(sub.status);
          newStats[cat]++;
        }
      }
      setStats(newStats);
      setRecent(submissions.slice(0, 10));
    } catch {
      // Only show toast on the initial load — polling refreshes should fail
      // silently to avoid spamming the user with error toasts.
      if (!initialLoadDoneRef.current) {
        toast.error(t("fetchError"));
      }
    } finally {
      initialLoadDoneRef.current = true;
      setLoading(false);
    }
  }, [assignmentId, problemId, t]);

  useVisibilityPolling(() => { void fetchStats(); }, POLL_INTERVAL_MS, !open);

  // Reset initialLoadDoneRef when the dialog opens so error toasts work correctly
  // on the next initial load.
  useEffect(() => {
    if (open) {
      initialLoadDoneRef.current = false;
    }
  }, [open]);

  // Handle Escape key to close the dialog
  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const acceptedPct = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;
  const statusLabels = buildStatusLabels(tSubmissions);

  return (
    <div role="dialog" aria-modal="true" aria-label={t("submissionStats")} className="fixed right-4 top-16 z-50 w-80 rounded-lg border bg-background/95 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {t("submissionStats")}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("closeStats")}> 
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-3xl font-bold text-green-500">{formatNumber(acceptedPct, { locale, maximumFractionDigits: 0 })}%</span>
            <span className="text-sm text-muted-foreground">{t("acceptedSummary", { accepted: stats.accepted, total: stats.total })}</span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${acceptedPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-green-500" />
            <span>{t("acceptedCount", { count: stats.accepted })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="size-3.5 text-red-500" />
            <span>{t("wrongCount", { count: stats.wrongAnswer })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-orange-500" />
            <span>{t("compileRuntimeCount", { count: stats.compileError + stats.runtimeError })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock3 className="size-3.5 text-yellow-500" />
            <span>{t("timeLimitCount", { count: stats.timeLimit })}</span>
          </div>
          {stats.pending > 0 && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Clock3 className="size-3.5 text-blue-500 animate-pulse" />
              <span>{t("pendingCount", { count: stats.pending })}</span>
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">{t("recentLabel")}</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {recent.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <span className={cn(
                    "font-medium",
                    sub.status === "accepted" ? "text-green-500" :
                    sub.status === "pending" || sub.status === "judging" || sub.status === "queued" ? "text-blue-500" :
                    "text-red-500"
                  )}>
                    {statusLabels[sub.status] ?? sub.status}
                  </span>
                  <span className="text-muted-foreground">{sub.language}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
