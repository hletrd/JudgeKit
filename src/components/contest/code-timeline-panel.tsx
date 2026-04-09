"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

type Snapshot = {
  id: string;
  problemId: string;
  problemTitle: string | null;
  language: string;
  sourceCode: string;
  charCount: number;
  createdAt: string;
};

export function CodeTimelinePanel({
  assignmentId,
  userId,
  userName,
}: {
  assignmentId: string;
  userId: string;
  userName: string;
}) {
  const t = useTranslations("contests.codeTimeline");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [filterProblem, setFilterProblem] = useState("all");

  const fetchSnapshots = useCallback(async () => {
    try {
      const query = filterProblem !== "all" ? `?problemId=${filterProblem}` : "";
      const res = await apiFetch(
        `/api/v1/contests/${assignmentId}/code-snapshots/${userId}${query}`
      );
      if (res.ok) {
        const json = await res.json();
        setSnapshots(json.data ?? []);
        setSelectedIdx(0);
      }
    } finally {
      setLoading(false);
    }
  }, [assignmentId, userId, filterProblem]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const problems = Array.from(
    new Map(snapshots.map((s) => [s.problemId, s.problemTitle ?? s.problemId])).entries()
  );

  const current = snapshots[selectedIdx];

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("noSnapshots")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{t("title", { name: userName })}</h3>
        {problems.length > 1 && (
          <Select value={filterProblem} onValueChange={(v) => { if (v) setFilterProblem(v); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={t("allProblems")}>{t("allProblems")}</SelectItem>
              {problems.map(([id, title]) => (
                <SelectItem key={id} value={id} label={title}>{title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Timeline scrubber */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={selectedIdx === 0}
          onClick={() => setSelectedIdx(selectedIdx - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center text-sm">
          <span className="font-medium">{selectedIdx + 1}</span>
          <span className="text-muted-foreground"> / {snapshots.length}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedIdx === snapshots.length - 1}
          onClick={() => setSelectedIdx(selectedIdx + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Snapshot mini-timeline */}
      <div className="flex gap-1 overflow-x-auto py-1">
        {snapshots.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setSelectedIdx(i)}
            className={`shrink-0 h-2 rounded-full transition-all ${
              i === selectedIdx
                ? "w-6 bg-primary"
                : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
            title={formatTime(s.createdAt)}
          />
        ))}
      </div>

      {/* Current snapshot */}
      {current && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatTime(current.createdAt)}</span>
                <Badge variant="outline">{current.language}</Badge>
                {current.problemTitle && (
                  <Badge variant="secondary">{current.problemTitle}</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {current.charCount} chars
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="overflow-auto max-h-[500px] p-4 text-sm font-mono bg-muted/30 rounded-b-lg">
              <code>{current.sourceCode}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
