"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
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

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/contests/${assignmentId}/stats`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data && typeof json.data === "object") {
        setStats((prev) => ({
          participantCount: Number.isFinite(Number(json.data.participantCount)) ? Number(json.data.participantCount) : prev.participantCount,
          submittedCount: Number.isFinite(Number(json.data.submittedCount)) ? Number(json.data.submittedCount) : prev.submittedCount,
          avgScore: Number.isFinite(Number(json.data.avgScore)) ? Number(json.data.avgScore) : prev.avgScore,
          problemsSolvedCount: Number.isFinite(Number(json.data.problemsSolvedCount)) ? Number(json.data.problemsSolvedCount) : prev.problemsSolvedCount,
        }));
      }
    } catch {
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
