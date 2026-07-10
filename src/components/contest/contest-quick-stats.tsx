"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api/client";
import { formatNumber } from "@/lib/formatting";
import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, BarChart3, Trophy } from "lucide-react";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";

interface ContestQuickStatsProps {
  assignmentId: string;
  problemCount: number;
  refreshInterval?: number;
  initialStats?: {
    participantCount: number;
    submittedCount: number;
    avgScore: number | null;
    problemsSolvedCount: number;
  };
}

type ContestStats = {
  participantCount: number;
  submittedCount: number;
  avgScore: number | null;
  problemsSolvedCount: number;
};

export function ContestQuickStats({
  assignmentId,
  problemCount,
  refreshInterval = 15000,
  initialStats,
}: ContestQuickStatsProps) {
  const t = useTranslations("contests");
  const locale = useLocale();
  const [stats, setStats] = useState<ContestStats>(initialStats ?? {
    participantCount: 0,
    submittedCount: 0,
    avgScore: null,
    problemsSolvedCount: 0,
  });

  const initialLoadDoneRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { ok, data } = await apiFetchJson<{ data?: { participantCount?: number; submittedCount?: number; avgScore?: number | null; problemsSolvedCount?: number } }>(
        `/api/v1/contests/${assignmentId}/stats`,
        { signal: controller.signal },
        { data: undefined }
      );
      if (ok && data.data && typeof data.data === "object") {
        const d = data.data;
        setStats((prev) => ({
          participantCount: typeof d.participantCount === "number" && Number.isFinite(d.participantCount) ? d.participantCount : prev.participantCount,
          submittedCount: typeof d.submittedCount === "number" && Number.isFinite(d.submittedCount) ? d.submittedCount : prev.submittedCount,
          // Keep the previous average on a malformed/absent field (matching
          // the other three stats); only blank it when the server explicitly
          // returns null (no submitters yet).
          avgScore:
            typeof d.avgScore === "number" && Number.isFinite(d.avgScore)
              ? d.avgScore
              : d.avgScore === null
                ? null
                : prev.avgScore,
          problemsSolvedCount: typeof d.problemsSolvedCount === "number" && Number.isFinite(d.problemsSolvedCount) ? d.problemsSolvedCount : prev.problemsSolvedCount,
        }));
      }
    } catch (err) {
      // AbortError means the request was cancelled — not a real error
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Only show toast on the initial load — polling refreshes should fail
      // silently to avoid spamming the user with error toasts.
      if (!initialLoadDoneRef.current) {
        toast.error(t("fetchError"));
      }
    } finally {
      initialLoadDoneRef.current = true;
    }
  }, [assignmentId, t]);

  useVisibilityPolling(() => { void fetchStats(); }, refreshInterval);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <Users className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{formatNumber(stats.participantCount, locale)}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.participants")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <FileText className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{formatNumber(stats.submittedCount, locale)}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.submissions")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <BarChart3 className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.avgScore !== null ? formatNumber(stats.avgScore, { locale, maximumFractionDigits: 1 }) : "---"}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.avgScore")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <Trophy className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{formatNumber(stats.problemsSolvedCount, locale)}/{formatNumber(problemCount, locale)}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.problemsSolved")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
