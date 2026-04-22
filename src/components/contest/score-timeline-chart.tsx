"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StudentProgression = {
  userId: string;
  name: string;
  points: Array<{ timestamp: number; totalScore: number }>;
};

type ScoreTimelineChartProps = {
  title: string;
  participantLabel: string;
  noDataLabel: string;
  scoreLabel: string;
  progressions: StudentProgression[];
};

export function ScoreTimelineChart({
  title,
  participantLabel,
  noDataLabel,
  scoreLabel,
  progressions,
}: ScoreTimelineChartProps) {
  const [selectedUserId, setSelectedUserId] = useState(progressions[0]?.userId ?? "");
  const selected = useMemo(
    () => progressions.find((progression) => progression.userId === selectedUserId) ?? progressions[0] ?? null,
    [progressions, selectedUserId]
  );

  if (!selected || selected.points.length === 0) {
    return <p className="text-sm text-muted-foreground">{noDataLabel}</p>;
  }

  const width = 420;
  const height = 180;
  const padding = 24;
  const maxScore = Math.max(...selected.points.map((point) => point.totalScore), 1);
  const minTimestamp = selected.points[0]?.timestamp ?? 0;
  const maxTimestamp = selected.points[selected.points.length - 1]?.timestamp ?? minTimestamp + 1;
  const timeRange = Math.max(maxTimestamp - minTimestamp, 1);

  const polyline = selected.points
    .map((point, index) => {
      const x = padding + (index === 0 ? 0 : ((point.timestamp - minTimestamp) / timeRange) * (width - padding * 2));
      const y = height - padding - (point.totalScore / maxScore) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="score-timeline-participant">{participantLabel}</Label>
        <Select value={selected.userId} onValueChange={(v) => { if (v) setSelectedUserId(v); }}>
          <SelectTrigger id="score-timeline-participant" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {progressions.map((progression) => (
              <SelectItem key={progression.userId} value={progression.userId} label={progression.name}>
                {progression.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border p-3">
        <p className="mb-2 text-sm font-medium">{title}</p>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={title}>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="stroke-border" />
          <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" points={polyline} />
          {selected.points.map((point, index) => {
            const x = padding + (index === 0 ? 0 : ((point.timestamp - minTimestamp) / timeRange) * (width - padding * 2));
            const y = height - padding - (point.totalScore / maxScore) * (height - padding * 2);
            return (
              <g key={`${point.timestamp}-${point.totalScore}`}>
                <circle cx={x} cy={y} r="3" className="fill-primary" />
                <title>{`${scoreLabel}: ${point.totalScore}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
