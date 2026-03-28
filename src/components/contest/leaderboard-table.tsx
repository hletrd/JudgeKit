"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type LeaderboardProblemResult = {
  problemId: string;
  score: number;
  attempts: number;
  solved: boolean;
  firstAcAt: number | null;
  penalty: number;
};

type LeaderboardEntry = {
  userId: string;
  username: string;
  name: string;
  className: string | null;
  rank: number;
  totalScore: number;
  totalPenalty: number;
  problems: LeaderboardProblemResult[];
  isCurrentUser?: boolean;
};

type LeaderboardProblem = {
  problemId: string;
  title: string;
  points: number;
  sortOrder: number;
};

type LeaderboardData = {
  scoringModel: "ioi" | "icpc";
  frozen: boolean;
  frozenAt: number | null;
  startsAt: number | null;
  problems: LeaderboardProblem[];
  entries: LeaderboardEntry[];
};

interface LeaderboardTableProps {
  assignmentId: string;
  refreshInterval?: number;
  currentUserId?: string;
  canViewStudentDetails?: boolean;
}

function formatIcpcCell(result: LeaderboardProblemResult, contestStartMs: number): string {
  if (result.solved) {
    const minutes = result.firstAcAt
      ? Math.floor((result.firstAcAt - contestStartMs) / 60_000)
      : 0;
    const prefix = result.attempts > 1 ? `+${result.attempts - 1}` : "+";
    return `${prefix}\n${minutes}`;
  }
  if (result.attempts > 0) {
    return `-${result.attempts}`;
  }
  return "";
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Trophy className="size-4 text-yellow-500" />;
  if (rank === 2) return <Trophy className="size-4 text-slate-400" />;
  if (rank === 3) return <Trophy className="size-4 text-amber-600" />;
  return null;
}

function getPodiumRowClass(rank: number): string {
  if (rank === 1) return "bg-yellow-50 dark:bg-yellow-950/20";
  if (rank === 2) return "bg-gray-50 dark:bg-gray-900/20";
  if (rank === 3) return "bg-amber-50 dark:bg-amber-950/20";
  return "";
}

function getPodiumRankClass(rank: number): string {
  if (rank === 1) return "font-bold text-yellow-600 dark:text-yellow-400";
  if (rank === 2) return "font-bold text-slate-500 dark:text-slate-300";
  if (rank === 3) return "font-bold text-amber-700 dark:text-amber-500";
  return "font-medium";
}

interface SkeletonTableProps {
  numRows?: number;
  numProblemCols?: number;
}

function SkeletonTable({ numRows = 8, numProblemCols = 5 }: SkeletonTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">
                <Skeleton className="mx-auto h-4 w-8" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-24" />
              </TableHead>
              <TableHead className="text-center">
                <Skeleton className="mx-auto h-4 w-16" />
              </TableHead>
              {Array.from({ length: numProblemCols }).map((_, i) => (
                <TableHead key={i} className="text-center">
                  <Skeleton className="mx-auto h-4 w-10" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: numRows }).map((_, i) => (
              <TableRow key={i}>
                <TableCell className="text-center">
                  <Skeleton className="mx-auto h-4 w-6" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="mx-auto h-4 w-12" />
                </TableCell>
                {Array.from({ length: numProblemCols }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="mx-auto h-4 w-10" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * IOI cell renders with a dark-mode-aware gradient via CSS custom properties trick.
 * We use two sibling spans: one for light, one for dark (hidden via tailwind dark: variant).
 * But since inline style doesn't support dark mode, we use a data-theme approach instead —
 * simplest solution is to apply a CSS class that switches based on the html[class="dark"] selector.
 * We embed both styles via a wrapper that picks based on prefers-color-scheme / .dark class.
 */
function IoiCell({
  score,
  maxPoints,
}: {
  score: number;
  maxPoints: number;
}) {
  const ratio = maxPoints > 0 ? Math.min(score / maxPoints, 1) : 0;
  const hue = Math.round(ratio * 120);

  if (score <= 0) {
    return (
      <TableCell className="text-center text-sm text-muted-foreground transition-all duration-300">
        0
      </TableCell>
    );
  }

  return (
    <TableCell
      className="text-center text-sm font-medium transition-all duration-300 dark:[background-color:var(--ioi-bg-dark)] dark:[color:var(--ioi-text-dark)]"
      style={
        {
          "--ioi-bg-dark": `hsl(${hue}, 40%, 18%)`,
          "--ioi-text-dark": `hsl(${hue}, 60%, 65%)`,
          backgroundColor: `hsl(${hue}, 70%, ${90 - ratio * 10}%)`,
          color: `hsl(${hue}, 50%, 30%)`,
        } as React.CSSProperties
      }
    >
      {Math.round(score * 100) / 100}
    </TableCell>
  );
}

export function LeaderboardTable({
  assignmentId,
  refreshInterval = 30_000,
  currentUserId,
  canViewStudentDetails,
}: LeaderboardTableProps) {
  const t = useTranslations("contests.leaderboard");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchLeaderboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const res = await apiFetch(
          `/api/v1/contests/${assignmentId}/leaderboard`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        } else if (!isRefresh) {
          setError(true);
        }
      } catch {
        if (!isRefresh) {
          setError(true);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [assignmentId]
  );

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchLeaderboard(true);
    }, refreshInterval);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchLeaderboard(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchLeaderboard, refreshInterval]);

  if (loading && !data) {
    return <SkeletonTable />;
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-destructive">{t("fetchError")}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(false); fetchLeaderboard(); }}>
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("noEntries")}
        </CardContent>
      </Card>
    );
  }

  const isIcpc = data.scoringModel === "icpc";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-300",
        data.frozen && "border-blue-300 shadow-blue-100 dark:border-blue-700 dark:shadow-blue-950/20 shadow-md"
      )}
    >
      <CardHeader className={cn(
        "pb-3",
        data.frozen && "bg-blue-50/60 dark:bg-blue-950/20"
      )}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-5" />
            {t("title")}
            {refreshing && (
              <RefreshCw className="size-4 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.frozen && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                title={t("frozen")}
              >
                <span className="text-sm" aria-label="frozen">❄️</span>
                {t("frozen")}
              </span>
            )}
            <Badge variant="outline">
              {data.scoringModel.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-background shadow-sm">
              <TableHead className="sticky left-0 z-[5] w-16 bg-background text-center shadow-[1px_0_0_0_hsl(var(--border))]">
                {t("rank")}
              </TableHead>
              <TableHead className="sticky left-16 z-[5] min-w-[140px] bg-background shadow-[1px_0_0_0_hsl(var(--border))]">
                {t("name")}
              </TableHead>
              {isIcpc ? (
                <>
                  <TableHead className="min-w-[80px] text-center">{t("solved")}</TableHead>
                  <TableHead className="min-w-[80px] text-center">{t("penalty")}</TableHead>
                </>
              ) : (
                <TableHead className="min-w-[90px] text-center">{t("totalScore")}</TableHead>
              )}
              {data.problems.map((p) => (
                <TableHead
                  key={p.problemId}
                  className="min-w-[72px] text-center"
                  title={p.title}
                >
                  {p.title.length > 8 ? `${p.title.slice(0, 7)}…` : p.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((entry, idx) => (
              <TableRow
                key={entry.userId || `row-${idx}`}
                className={cn(
                  "transition-all duration-300",
                  getPodiumRowClass(entry.rank),
                  (entry.isCurrentUser || (currentUserId && entry.userId === currentUserId)) && "ring-2 ring-inset ring-primary/50 bg-primary/5"
                )}
              >
                <TableCell
                  className={cn(
                    "sticky left-0 z-[5] text-center shadow-[1px_0_0_0_hsl(var(--border))]",
                    getPodiumRowClass(entry.rank) || "bg-background",
                    getPodiumRankClass(entry.rank)
                  )}
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    {getRankIcon(entry.rank)}
                    {entry.rank}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "sticky left-16 z-[5] shadow-[1px_0_0_0_hsl(var(--border))]",
                    getPodiumRowClass(entry.rank) || "bg-background"
                  )}
                >
                  <div>
                    {canViewStudentDetails ? (
                      <Link href={`/dashboard/contests/${assignmentId}/students/${entry.userId}`}>
                        <span className="font-medium hover:underline cursor-pointer">{entry.name}</span>
                      </Link>
                    ) : (
                      <span className="font-medium">{entry.name}</span>
                    )}
                    {entry.className && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {entry.className}
                      </span>
                    )}
                  </div>
                </TableCell>
                {isIcpc ? (
                  <>
                    <TableCell className="text-center font-bold transition-all duration-300">
                      {entry.totalScore}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground transition-all duration-300">
                      {entry.totalPenalty}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="text-center font-bold transition-all duration-300">
                    {Math.round(entry.totalScore * 100) / 100}
                  </TableCell>
                )}
                {data.problems.map((p) => {
                  const result = entry.problems.find(
                    (pr) => pr.problemId === p.problemId
                  );

                  // Untried
                  if (!result || result.attempts === 0) {
                    return (
                      <TableCell
                        key={p.problemId}
                        className="text-center text-sm text-muted-foreground/40 transition-all duration-300"
                      >
                        –
                      </TableCell>
                    );
                  }

                  if (isIcpc) {
                    // ICPC: AC = green, pending (attempts > 0, not solved, no WA marker) = blue,
                    // WA (attempts > 0, not solved) = red
                    // We treat score > 0 && !solved as "pending" (still being judged)
                    const isPending = result.attempts > 0 && !result.solved && result.score > 0;
                    return (
                      <TableCell
                        key={p.problemId}
                        className={cn(
                          "text-center text-sm whitespace-pre-line font-medium transition-all duration-300",
                          result.solved
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : isPending
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        )}
                      >
                        {formatIcpcCell(result, data.startsAt ?? 0)}
                      </TableCell>
                    );
                  }

                  // IOI: gradient color cell
                  return (
                    <IoiCell
                      key={p.problemId}
                      score={result.score}
                      maxPoints={p.points}
                    />
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
