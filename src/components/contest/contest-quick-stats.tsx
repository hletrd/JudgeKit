"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, BarChart3, Trophy } from "lucide-react";

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

type LeaderboardEntry = {
  totalScore: number;
  problems: Array<{
    score: number;
    solved: boolean;
  }>;
};

type LeaderboardData = {
  problems: Array<{ points: number }>;
  entries: LeaderboardEntry[];
};

export function ContestQuickStats({
  assignmentId,
  problemCount,
  refreshInterval = 15000,
  initialStats,
}: ContestQuickStatsProps) {
  const t = useTranslations("contests");
  const [stats, setStats] = useState(initialStats ?? {
    participantCount: 0,
    submittedCount: 0,
    avgScore: 0,
    problemsSolvedCount: 0,
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/contests/${assignmentId}/leaderboard`);
      if (!res.ok) return;
      const json = await res.json();
      const data: LeaderboardData = json.data;
      if (!data?.entries) return;

      const participantCount = data.entries.length;
      const submittedCount = data.entries.filter(
        (e) => e.problems.some((p) => p.score > 0 || p.solved)
      ).length;
      const avgScore =
        submittedCount > 0
          ? Math.round(
              (data.entries
                .filter((e) => e.problems.some((p) => p.score > 0 || p.solved))
                .reduce((sum, e) => sum + e.totalScore, 0) /
                submittedCount) *
                10
            ) / 10
          : 0;
      const problemsSolvedCount = data.problems.filter((_, pi) =>
        data.entries.some((e) => e.problems[pi]?.solved || (e.problems[pi]?.score ?? 0) >= data.problems[pi].points)
      ).length;

      setStats({ participantCount, submittedCount, avgScore, problemsSolvedCount });
    } catch {
      // ignore
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchStats, refreshInterval]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <Users className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.participantCount}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.participants")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <FileText className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.submittedCount}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.submissions")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <BarChart3 className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.avgScore}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.avgScore")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <Trophy className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.problemsSolvedCount}/{problemCount}</p>
            <p className="text-xs text-muted-foreground">{t("quickStats.problemsSolved")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
