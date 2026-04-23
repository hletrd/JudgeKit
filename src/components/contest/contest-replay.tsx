"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const previousRowPositionsRef = useRef(new Map<string, number>());

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

  useLayoutEffect(() => {
    if (!selectedSnapshot) {
      previousRowPositionsRef.current.clear();
      return;
    }

    const nextPositions = new Map<string, number>();
    for (const entry of selectedSnapshot.entries) {
      const row = rowRefs.current.get(entry.userId);
      if (!row) continue;
      nextPositions.set(entry.userId, row.getBoundingClientRect().top);
    }

    for (const entry of selectedSnapshot.entries) {
      const row = rowRefs.current.get(entry.userId);
      if (!row) continue;

      const previousTop = previousRowPositionsRef.current.get(entry.userId);
      const nextTop = nextPositions.get(entry.userId);
      if (previousTop == null || nextTop == null) continue;

      const deltaY = previousTop - nextTop;
      if (Math.abs(deltaY) < 1) continue;

      row.style.transition = "none";
      row.style.transform = `translateY(${deltaY}px)`;
      row.getBoundingClientRect();

      requestAnimationFrame(() => {
        row.style.transition = "transform 450ms ease";
        row.style.transform = "";
      });
    }

    previousRowPositionsRef.current = nextPositions;
  }, [selectedSnapshot]);

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
              onChange={(event) => setCurrentIndex(parseInt(event.target.value, 10))}
              aria-valuetext={selectedSnapshot.label}
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
          <div className="space-y-2 text-sm">
            <Label>{speedLabel}</Label>
            <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v) as (typeof PLAYBACK_SPEEDS)[number])}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBACK_SPEEDS.map((value, index) => (
                  <SelectItem key={value} value={String(value)} label={speedOptions[index]}>
                    {speedOptions[index]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              <TableRow
                key={entry.userId}
                ref={(node) => {
                  if (node) {
                    rowRefs.current.set(entry.userId, node);
                  } else {
                    rowRefs.current.delete(entry.userId);
                  }
                }}
              >
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
