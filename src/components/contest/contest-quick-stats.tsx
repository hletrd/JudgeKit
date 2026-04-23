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
    avgScore: number;
    problemsSolvedCount: number;
  };
}

type ContestStats = {
  participantCount: number;
  submittedCount: number;
  avgScore: number;
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
    avgScore: 0,
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
        setStats((prev) => ({
          participantCount: Number.isFinite(Number(data.data!.participantCount)) ? Number(data.data!.participantCount) : prev.participantCount,
          submittedCount: Number.isFinite(Number(data.data!.submittedCount)) ? Number(data.data!.submittedCount) : prev.submittedCount,
          avgScore: data.data!.avgScore !== null && data.data!.avgScore !== undefined && Number.isFinite(Number(data.data!.avgScore)) ? Number(data.data!.avgScore) : prev.avgScore,
          problemsSolvedCount: Number.isFinite(Number(data.data!.problemsSolvedCount)) ? Number(data.data!.problemsSolvedCount) : prev.problemsSolvedCount,
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
            <p className="text-2xl font-bold">{formatNumber(stats.avgScore, { locale, maximumFractionDigits: 1 })}</p>
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
