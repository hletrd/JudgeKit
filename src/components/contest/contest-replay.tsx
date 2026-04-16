"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ContestReplaySnapshotView = {
  label: string;
  entries: Array<{
    userId: string;
    name: string;
    rank: number;
    totalScoreLabel: string;
    penaltyLabel: string | null;
  }>;
};

type ContestReplayProps = {
  title: string;
  description: string;
  noDataLabel: string;
  timelineLabel: string;
  playLabel: string;
  pauseLabel: string;
  speedLabel: string;
  rankLabel: string;
  nameLabel: string;
  totalScoreLabel: string;
  penaltyLabel: string | null;
  snapshots: ContestReplaySnapshotView[];
};

const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;

export function ContestReplay({
  title,
  description,
  noDataLabel,
  timelineLabel,
  playLabel,
  pauseLabel,
  speedLabel,
  rankLabel,
  nameLabel,
  totalScoreLabel,
  penaltyLabel,
  snapshots,
}: ContestReplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);

  const safeIndex = Math.min(currentIndex, Math.max(snapshots.length - 1, 0));
  const selectedSnapshot = snapshots[safeIndex] ?? null;

  useEffect(() => {
    if (!isPlaying || snapshots.length <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentIndex((previousIndex) => {
        if (previousIndex >= snapshots.length - 1) {
          setIsPlaying(false);
          return previousIndex;
        }
        return previousIndex + 1;
      });
    }, 1400 / speed);

    return () => window.clearInterval(timer);
  }, [isPlaying, snapshots.length, speed]);

  const speedOptions = useMemo(
    () => PLAYBACK_SPEEDS.map((value) => `${value}x`),
    [],
  );

  if (snapshots.length === 0 || !selectedSnapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{noDataLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <Label htmlFor="contest-replay-slider">{timelineLabel}</Label>
              <span className="text-muted-foreground">{selectedSnapshot.label}</span>
            </div>
            <input
              id="contest-replay-slider"
              type="range"
              min={0}
              max={Math.max(snapshots.length - 1, 0)}
              step={1}
              value={safeIndex}
              onChange={(event) => setCurrentIndex(Number(event.target.value))}
              className="w-full"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (safeIndex >= snapshots.length - 1) {
                setCurrentIndex(0);
              }
              setIsPlaying((playing) => !playing);
            }}
          >
            {isPlaying ? pauseLabel : playLabel}
          </Button>
          <label className="space-y-2 text-sm">
            <span className="block">{speedLabel}</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value) as (typeof PLAYBACK_SPEEDS)[number])}
            >
              {PLAYBACK_SPEEDS.map((value, index) => (
                <option key={value} value={value}>
                  {speedOptions[index]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">{rankLabel}</TableHead>
              <TableHead>{nameLabel}</TableHead>
              <TableHead className="w-28 text-center">{totalScoreLabel}</TableHead>
              {penaltyLabel ? <TableHead className="w-28 text-center">{penaltyLabel}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedSnapshot.entries.map((entry) => (
              <TableRow key={`${selectedSnapshot.label}-${entry.userId}`}>
                <TableCell className="text-center font-medium">{entry.rank}</TableCell>
                <TableCell>{entry.name}</TableCell>
                <TableCell className="text-center">{entry.totalScoreLabel}</TableCell>
                {penaltyLabel ? (
                  <TableCell className="text-center">{entry.penaltyLabel ?? "-"}</TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
