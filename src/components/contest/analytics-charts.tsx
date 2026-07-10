"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetchJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreTimelineChart } from "@/components/contest/score-timeline-chart";

type HistogramBucket = { label: string; count: number };
type ProblemSolveRate = {
  problemId: string;
  title: string;
  solvedPercent: number;
  partialPercent: number;
  zeroPercent: number;
  solved: number;
  partial: number;
  zero: number;
  total: number;
};
type ProblemSolveTime = {
  problemId: string;
  title: string;
  medianMinutes: number;
  meanMinutes: number;
  solveCount: number;
};
type CheatSummary = {
  totalEvents: number;
  byType: Record<string, number>;
  flaggedStudents: Array<{
    userId: string;
    name: string;
    username: string;
    eventCount: number;
  }>;
};

type AnalyticsData = {
  scoreDistribution: HistogramBucket[];
  problemSolveRates: ProblemSolveRate[];
  problemSolveTimes: ProblemSolveTime[];
  cheatSummary: CheatSummary;
  studentProgressions?: Array<{
    userId: string;
    name: string;
    points: Array<{ timestamp: number; totalScore: number }>;
  }>;
};

interface AnalyticsChartsProps {
  assignmentId: string;
}

// SVG vertical bar chart for score distribution
function SVGBarChart({
  data,
  xLabel,
  yLabel,
}: {
  data: { label: string; value: number }[];
  xLabel: string;
  yLabel: string;
}) {
  const paddingLeft = 40;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 48;
  const width = 500;
  const height = 200;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVal = data.map((d) => d.value).reduce((max, v) => Math.max(max, v), 1);
  // Nice round Y axis max
  const yMax = Math.ceil(maxVal / 5) * 5 || 5;
  const gridLines = 5;

  const barCount = data.length;
  const barGap = 4;
  const barWidth = barCount > 0 ? Math.max((chartWidth - barGap * (barCount + 1)) / barCount, 4) : 20;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      aria-label="Score distribution bar chart"
    >
      {/* Y grid lines and labels */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const val = Math.round((yMax * i) / gridLines);
        const y = paddingTop + chartHeight - (chartHeight * i) / gridLines;
        return (
          <g key={i}>
            <line
              x1={paddingLeft}
              y1={y}
              x2={paddingLeft + chartWidth}
              y2={y}
              className="stroke-border"
              strokeWidth={i === 0 ? 1.5 : 0.5}
              strokeDasharray={i === 0 ? undefined : "3 3"}
            />
            <text
              x={paddingLeft - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              className="fill-muted-foreground"
            >
              {val}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH = yMax > 0 ? (d.value / yMax) * chartHeight : 0;
        const x = paddingLeft + barGap + i * (barWidth + barGap);
        const y = paddingTop + chartHeight - barH;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barH, 0)}
              rx={2}
              ry={2}
              className="fill-primary opacity-85 hover:opacity-100 transition-opacity"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          </g>
        );
      })}

      {/* X axis labels */}
      {data.map((d, i) => {
        const x = paddingLeft + barGap + i * (barWidth + barGap) + barWidth / 2;
        return (
          <text
            key={d.label}
            x={x}
            y={paddingTop + chartHeight + 14}
            textAnchor="middle"
            fontSize={8}
            className="fill-muted-foreground"
          >
            {d.label}
          </text>
        );
      })}

      {/* Axis labels */}
      <text
        x={paddingLeft + chartWidth / 2}
        y={height - 4}
        textAnchor="middle"
        fontSize={9}
        className="fill-muted-foreground"
      >
        {xLabel}
      </text>
      <text
        x={8}
        y={paddingTop + chartHeight / 2}
        textAnchor="middle"
        fontSize={9}
        className="fill-muted-foreground"
        transform={`rotate(-90, 8, ${paddingTop + chartHeight / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  );
}

// SVG horizontal stacked bar with rounded outer edges, tooltips, and inline labels
function SVGStackedBar({
  solved,
  partial,
  zero,
  solvedLabel,
  partialLabel,
  zeroLabel,
}: {
  solved: number;
  partial: number;
  zero: number;
  solvedLabel: string;
  partialLabel: string;
  zeroLabel: string;
}) {
  const clipId = React.useId();
  const total = solved + partial + zero;
  if (total === 0) {
    return (
      <svg viewBox="0 0 400 24" className="w-full h-6">
        <rect x={0} y={0} width={400} height={24} rx={4} ry={4} className="fill-muted" />
      </svg>
    );
  }

  const svgW = 400;
  const svgH = 24;
  const r = 4;

  const solvedW = (solved / total) * svgW;
  const partialW = (partial / total) * svgW;
  const zeroW = (zero / total) * svgW;

  const solvedPct = Math.round((solved / total) * 100);
  const partialPct = Math.round((partial / total) * 100);
  const zeroPct = Math.round((zero / total) * 100);

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-6" role="img">
      <defs>
        <clipPath id={`clip-${clipId}`}>
          <rect x={0} y={0} width={svgW} height={svgH} rx={r} ry={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${clipId})`}>
        {/* Solved segment */}
        {solved > 0 && (
          <rect x={0} y={0} width={solvedW} height={svgH} className="fill-green-500 dark:fill-green-600">
            <title>{`${solvedLabel}: ${solved} (${solvedPct}%)`}</title>
          </rect>
        )}
        {/* Partial segment */}
        {partial > 0 && (
          <rect x={solvedW} y={0} width={partialW} height={svgH} className="fill-yellow-500 dark:fill-yellow-600">
            <title>{`${partialLabel}: ${partial} (${partialPct}%)`}</title>
          </rect>
        )}
        {/* Zero segment */}
        {zero > 0 && (
          <rect
            x={solvedW + partialW}
            y={0}
            width={zeroW}
            height={svgH}
            className="fill-red-300 dark:fill-red-800"
          >
            <title>{`${zeroLabel}: ${zero} (${zeroPct}%)`}</title>
          </rect>
        )}

        {/* Inline percentage labels when wide enough (>15%) */}
        {solvedPct > 15 && (
          <text
            x={solvedW / 2}
            y={svgH / 2 + 4}
            textAnchor="middle"
            fontSize={9}
            className="fill-white font-medium"
            style={{ pointerEvents: "none" }}
          >
            {solvedPct}%
          </text>
        )}
        {partialPct > 15 && (
          <text
            x={solvedW + partialW / 2}
            y={svgH / 2 + 4}
            textAnchor="middle"
            fontSize={9}
            className="fill-white font-medium"
            style={{ pointerEvents: "none" }}
          >
            {partialPct}%
          </text>
        )}
        {zeroPct > 15 && (
          <text
            x={solvedW + partialW + zeroW / 2}
            y={svgH / 2 + 4}
            textAnchor="middle"
            fontSize={9}
            className="fill-white font-medium"
            style={{ pointerEvents: "none" }}
          >
            {zeroPct}%
          </text>
        )}
      </g>
    </svg>
  );
}

// Horizontal bar chart for solve times showing median and mean
function SolveTimeChart({
  data,
  medianLabel,
  meanLabel,
}: {
  data: ProblemSolveTime[];
  medianLabel: string;
  meanLabel: string;
}) {
  if (data.length === 0) return null;

  const maxMinutes = data.flatMap((p) => [p.medianMinutes, p.meanMinutes]).reduce((max, v) => Math.max(max, v), 1);
  const rowHeight = 40;
  const labelWidth = 120;
  const barAreaWidth = 260;
  const paddingRight = 60;
  const svgWidth = labelWidth + barAreaWidth + paddingRight;
  const svgHeight = data.length * rowHeight + 20;
  const barTrackH = 10;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-auto"
      aria-label="Problem solve times chart"
    >
      {data.map((p, i) => {
        const y = 10 + i * rowHeight;
        const medW = (p.medianMinutes / maxMinutes) * barAreaWidth;
        const meanW = (p.meanMinutes / maxMinutes) * barAreaWidth;
        return (
          <g key={p.problemId}>
            {/* Problem label */}
            <text
              x={labelWidth - 8}
              y={y + rowHeight / 2 + 4}
              textAnchor="end"
              fontSize={10}
              className="fill-foreground font-medium"
            >
              {p.title.length > 14 ? p.title.slice(0, 13) + "…" : p.title}
            </text>

            {/* Track background */}
            <rect
              x={labelWidth}
              y={y + rowHeight / 2 - barTrackH}
              width={barAreaWidth}
              height={barTrackH * 2}
              rx={3}
              ry={3}
              className="fill-muted"
            />

            {/* Mean bar (background) */}
            {meanW > 0 && (
              <rect
                x={labelWidth}
                y={y + rowHeight / 2 - barTrackH + 2}
                width={meanW}
                height={barTrackH * 2 - 4}
                rx={2}
                ry={2}
                className="fill-primary opacity-35"
              >
                <title>{`${meanLabel}: ${p.meanMinutes}m`}</title>
              </rect>
            )}

            {/* Median bar (foreground) */}
            {medW > 0 && (
              <rect
                x={labelWidth}
                y={y + rowHeight / 2 - barTrackH + 2}
                width={medW}
                height={barTrackH * 2 - 4}
                rx={2}
                ry={2}
                className="fill-primary opacity-85"
              >
                <title>{`${medianLabel}: ${p.medianMinutes}m`}</title>
              </rect>
            )}

            {/* Value labels */}
            <text
              x={labelWidth + Math.max(medW, meanW) + 6}
              y={y + rowHeight / 2 - 1}
              fontSize={8}
              className="fill-muted-foreground"
            >
              {medianLabel.slice(0, 3)}: {p.medianMinutes}m
            </text>
            <text
              x={labelWidth + Math.max(medW, meanW) + 6}
              y={y + rowHeight / 2 + 9}
              fontSize={8}
              className="fill-muted-foreground"
            >
              {meanLabel.slice(0, 3)}: {p.meanMinutes}m
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Anti-cheat visual bar breakdown
function CheatTypeBar({
  byType,
  totalEvents,
}: {
  byType: Record<string, number>;
  totalEvents: number;
}) {
  const clipId = React.useId();
  const entries = Object.entries(byType);
  if (entries.length === 0 || totalEvents === 0) return null;

  // Palette of muted colors for different event types
  const colors = [
    "fill-orange-500 dark:fill-orange-600",
    "fill-red-500 dark:fill-red-600",
    "fill-purple-500 dark:fill-purple-600",
    "fill-pink-500 dark:fill-pink-600",
    "fill-amber-500 dark:fill-amber-600",
    "fill-rose-600 dark:fill-rose-700",
  ];

  const svgW = 400;
  const svgH = 28;
  const r = 4;

  let offsetX = 0;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-7" role="img">
        <defs>
          <clipPath id={`cheat-clip-${clipId}`}>
            <rect x={0} y={0} width={svgW} height={svgH} rx={r} ry={r} />
          </clipPath>
        </defs>
        <g clipPath={`url(#cheat-clip-${clipId})`}>
          {entries.map(([type, count], i) => {
            const segW = (count / totalEvents) * svgW;
            const x = offsetX;
            offsetX += segW;
            const pct = Math.round((count / totalEvents) * 100);
            return (
              <g key={type}>
                <rect x={x} y={0} width={segW} height={svgH} className={colors[i % colors.length]}>
                  <title>{`${type}: ${count} (${pct}%)`}</title>
                </rect>
                {pct > 12 && (
                  <text
                    x={x + segW / 2}
                    y={svgH / 2 + 4}
                    textAnchor="middle"
                    fontSize={9}
                    className="fill-white font-medium"
                    style={{ pointerEvents: "none" }}
                  >
                    {pct}%
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.map(([type, count], i) => (
          <span key={type} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={`inline-block size-2.5 rounded-sm ${colors[i % colors.length].replace("fill-", "bg-")}`}
            />
            {type}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// Loading skeleton
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AnalyticsCharts({ assignmentId }: AnalyticsChartsProps) {
  const t = useTranslations("contests.analytics");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      const { ok, data: json } = await apiFetchJson<{ data: AnalyticsData }>(
        `/api/v1/contests/${assignmentId}/analytics`,
        undefined,
        { data: null as unknown as AnalyticsData }
      );
      if (ok && json.data && typeof json.data === "object") {
        // Normalize each field: the render paths .map over these directly,
        // and a 200 payload missing one field must degrade to empty charts
        // instead of crashing the whole analytics tab.
        const d = json.data;
        setData({
          scoreDistribution: Array.isArray(d.scoreDistribution) ? d.scoreDistribution : [],
          problemSolveRates: Array.isArray(d.problemSolveRates) ? d.problemSolveRates : [],
          problemSolveTimes: Array.isArray(d.problemSolveTimes) ? d.problemSolveTimes : [],
          cheatSummary:
            d.cheatSummary && typeof d.cheatSummary === "object"
              ? d.cheatSummary
              : { totalEvents: 0, byType: {}, flaggedStudents: [] },
          studentProgressions: Array.isArray(d.studentProgressions) ? d.studentProgressions : [],
        });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-destructive">{t("fetchError")}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(false); fetchAnalytics(); }}>
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("noData")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top row: Score Distribution + Solve Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution - SVG vertical bar chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("scoreDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SVGBarChart
              data={data.scoreDistribution.map((b) => ({ label: b.label, value: b.count }))}
              xLabel={t("score")}
              yLabel={t("count")}
            />
          </CardContent>
        </Card>

        {/* Per-Problem Solve Rates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("solveRates")}</CardTitle>
            <div className="flex gap-3 text-xs mt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded bg-green-500 dark:bg-green-600" />
                {t("solved")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded bg-yellow-500 dark:bg-yellow-600" />
                {t("partial")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded bg-red-300 dark:bg-red-800" />
                {t("zero")}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.problemSolveRates.map((p) => (
              <div key={p.problemId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {p.solvedPercent}% / {p.partialPercent}% / {p.zeroPercent}%
                  </span>
                </div>
                <SVGStackedBar
                  solved={p.solved}
                  partial={p.partial}
                  zero={p.zero}
                  solvedLabel={t("solved")}
                  partialLabel={t("partial")}
                  zeroLabel={t("zero")}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Solve Times + Anti-Cheat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Problem Solve Times - horizontal bar chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("solveTime")}</CardTitle>
            <div className="flex gap-3 text-xs mt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-3 rounded-sm bg-primary opacity-85" />
                {t("median")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-3 rounded-sm bg-primary opacity-35" />
                {t("mean")}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {data.problemSolveTimes.length > 0 ? (
              <div className="space-y-1">
                <SolveTimeChart
                  data={data.problemSolveTimes}
                  medianLabel={t("median")}
                  meanLabel={t("mean")}
                />
                <div className="space-y-1 mt-2">
                  {data.problemSolveTimes.map((p) => (
                    <div key={p.problemId} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{p.title}</span>
                      <div className="flex items-center gap-2">
                        <span>{t("median")}: {p.medianMinutes}m</span>
                        <span>{t("mean")}: {p.meanMinutes}m</span>
                        <Badge variant="secondary" className="text-xs">{p.solveCount} AC</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noData")}</p>
            )}
          </CardContent>
        </Card>

        {/* Anti-Cheat Summary */}
        {data.cheatSummary.totalEvents > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("cheatSummary")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {data.cheatSummary.totalEvents} {t("count").toLowerCase()}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <CheatTypeBar
                byType={data.cheatSummary.byType}
                totalEvents={data.cheatSummary.totalEvents}
              />
              {data.cheatSummary.flaggedStudents.length > 0 && (
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t("students")} ({data.cheatSummary.flaggedStudents.length})
                  </p>
                  {data.cheatSummary.flaggedStudents.map((s) => (
                    <div key={s.userId} className="flex items-center justify-between text-sm">
                      <span>
                        {s.name}{" "}
                        <span className="text-muted-foreground">({s.username})</span>
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        {s.eventCount}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("cheatSummary")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("noData")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {data.studentProgressions && data.studentProgressions.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("scoreProgression")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreTimelineChart
              title={t("scoreProgression")}
              participantLabel={t("students")}
              noDataLabel={t("noData")}
              scoreLabel={t("score")}
              progressions={data.studentProgressions}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
