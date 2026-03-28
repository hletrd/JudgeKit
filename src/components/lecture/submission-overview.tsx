"use client";

import { useCallback, useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  problemId,
  open,
  onClose,
}: {
  problemId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<SubmissionStats>({
    total: 0, accepted: 0, wrongAnswer: 0, compileError: 0,
    runtimeError: 0, timeLimit: 0, pending: 0, other: 0,
  });
  const [recent, setRecent] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/submissions?problemId=${problemId}&limit=100`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) return;
      const json = await res.json();
      const submissions: Array<{ id: string; status: string; language: string; submittedAt: string; userId: string }> =
        json.data?.submissions ?? json.data ?? [];

      const newStats: SubmissionStats = {
        total: submissions.length, accepted: 0, wrongAnswer: 0, compileError: 0,
        runtimeError: 0, timeLimit: 0, pending: 0, other: 0,
      };
      for (const sub of submissions) {
        const cat = categorize(sub.status);
        newStats[cat]++;
      }
      setStats(newStats);
      setRecent(submissions.slice(0, 10));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    if (!open) return;
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [open, fetchStats]);

  if (!open) return null;

  const acceptedPct = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;

  return (
    <div className="fixed right-4 top-16 z-50 w-80 rounded-lg border bg-background/95 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Submission Stats
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-3xl font-bold text-green-500">{acceptedPct}%</span>
            <span className="text-sm text-muted-foreground">{stats.accepted}/{stats.total} accepted</span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${acceptedPct}%` }} />
          </div>
        </div>

        {/* Status breakdown */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-green-500" />
            <span>Accepted: {stats.accepted}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="size-3.5 text-red-500" />
            <span>Wrong: {stats.wrongAnswer}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-orange-500" />
            <span>CE/RE: {stats.compileError + stats.runtimeError}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock3 className="size-3.5 text-yellow-500" />
            <span>TLE: {stats.timeLimit}</span>
          </div>
          {stats.pending > 0 && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Clock3 className="size-3.5 text-blue-500 animate-pulse" />
              <span>Pending: {stats.pending}</span>
            </div>
          )}
        </div>

        {/* Recent submissions */}
        {recent.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Recent</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {recent.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <span className={cn(
                    "font-medium",
                    sub.status === "accepted" ? "text-green-500" :
                    sub.status === "pending" || sub.status === "judging" || sub.status === "queued" ? "text-blue-500" :
                    "text-red-500"
                  )}>
                    {sub.status}
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
