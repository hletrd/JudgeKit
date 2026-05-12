import Link from "next/link";
import { Check } from "lucide-react";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { formatScore } from "@/lib/formatting";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";
import { formatSubmissionIdPrefix } from "@/lib/submissions/format";
import type { ParticipantTimeline } from "@/lib/assignments/participant-timeline";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PROBLEM_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-indigo-500",
];

function problemColor(index: number) {
  return PROBLEM_COLORS[index % PROBLEM_COLORS.length];
}

function problemBorderColor(index: number) {
  return PROBLEM_COLORS[index % PROBLEM_COLORS.length].replace("bg-", "border-");
}

type FlatTimelineEvent = {
  at: Date;
  type: "submission" | "snapshot" | "first_ac";
  problemId: string;
  problemTitle: string;
  problemIndex: number;
  submissionId?: string;
  status?: string | null;
  score?: number | null;
  language?: string;
  executionTimeMs?: number | null;
  memoryUsedKb?: number | null;
  snapshotId?: string;
  charCount?: number;
};

type TimelineTranslations = {
  noSubmissions: string;
  pointsValue: (value: number) => string;
  attempts: (count: number) => string;
  snapshots: (count: number) => string;
  bestScore: string;
  timeToFirstSubmission: string;
  timeToSolve: string;
  wrongBeforeAc: (count: number) => string;
  relativeTime: (minutes: number, seconds: number) => string;
  firstAccepted: string;
  codeSnapshot: (chars: number) => string;
  view: string;
  tries: (count: number) => string;
  best: (score: string | number) => string;
};

type ParticipantTimelineBarProps = {
  participant: ParticipantTimeline["participant"];
  assignmentProblems: Array<{
    problemId: string;
    title: string;
    points: number | null;
    sortOrder: number | null;
  }>;
  timelineByProblem: Map<string, ParticipantTimeline["problems"][number]>;
  locale: string;
  timeZone: string;
  translations: TimelineTranslations;
  statusLabels: Record<string, string>;
};

export function ParticipantTimelineBar({
  participant,
  assignmentProblems,
  timelineByProblem,
  locale,
  timeZone,
  translations: tr,
  statusLabels,
}: ParticipantTimelineBarProps) {
  // Flatten all events across all problems
  const flatEvents: FlatTimelineEvent[] = [];
  let earliest: Date | null = null;
  let latest: Date | null = null;

  assignmentProblems.forEach((problem, idx) => {
    const timeline = timelineByProblem.get(problem.problemId);
    if (!timeline) return;

    for (const ev of timeline.timeline) {
      if (!ev.at) continue;
      const flat: FlatTimelineEvent = {
        at: ev.at,
        type: ev.type,
        problemId: problem.problemId,
        problemTitle: problem.title,
        problemIndex: idx,
      };
      if (ev.type === "submission") {
        flat.submissionId = ev.submissionId;
        flat.status = ev.status;
        flat.score = ev.score;
        flat.language = ev.language;
        flat.executionTimeMs = ev.executionTimeMs;
        flat.memoryUsedKb = ev.memoryUsedKb;
      } else if (ev.type === "snapshot") {
        flat.snapshotId = ev.snapshotId;
        flat.charCount = ev.charCount;
        flat.language = ev.language;
      } else if (ev.type === "first_ac") {
        flat.submissionId = ev.submissionId;
      }
      flatEvents.push(flat);

      if (!earliest || ev.at < earliest) earliest = ev.at;
      if (!latest || ev.at > latest) latest = ev.at;
    }
  });

  flatEvents.sort((a, b) => a.at.getTime() - b.at.getTime());

  const startTime = participant.examStartedAt
    ? new Date(participant.examStartedAt)
    : (earliest ?? new Date());
  const endTime = participant.personalDeadline
    ? new Date(participant.personalDeadline)
    : (latest ?? new Date(startTime.getTime() + 3600_000));
  const totalDurationMs = Math.max(endTime.getTime() - startTime.getTime(), 1);

  function percentFromStart(at: Date) {
    const elapsed = at.getTime() - startTime.getTime();
    return Math.max(0, Math.min(100, (elapsed / totalDurationMs) * 100));
  }

  function formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }

  const hasEvents = flatEvents.length > 0;

  if (!hasEvents) {
    return (
      <p className="text-sm text-muted-foreground">
        {tr.noSubmissions}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Problem color legend */}
      <div className="flex flex-wrap gap-3">
        {assignmentProblems.map((problem, index) => {
          const timeline = timelineByProblem.get(problem.problemId);
          const summary = timeline?.summary ?? null;
          return (
            <div key={problem.problemId} className="flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded-full ${problemColor(index)}`} />
              <span className="text-xs font-medium">{problem.title}</span>
              {summary ? (
                <span className="text-xs text-muted-foreground">
                  ({tr.attempts(summary.totalAttempts)}, {tr.best(summary.bestScore ?? "-")})
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Unified horizontal timeline */}
      <div className="relative">
        {/* Time axis labels */}
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>0m</span>
          <span>
            {formatDuration(Math.floor(totalDurationMs / 1000))}
          </span>
        </div>

        {/* Progress bar background */}
        <div className="relative h-10 bg-muted rounded-md overflow-visible">
          {/* Background track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-muted-foreground/20 rounded-full" />

          {/* Event markers */}
          {flatEvents.map((ev, i) => {
            const pct = percentFromStart(ev.at);
            const isFirstAc = ev.type === "first_ac";
            const isSnapshot = ev.type === "snapshot";

            return (
              <div
                key={`${ev.problemId}-${ev.type}-${ev.at.getTime()}`}
                className="absolute top-1/2 -translate-y-1/2 group"
                style={{ left: `${pct}%` }}
              >
                {isSnapshot ? (
                  <div
                    aria-label={`${ev.problemTitle} — ${formatDateTimeInTimeZone(ev.at, locale, timeZone)}`}
                    className="block -translate-x-1/2"
                  >
                    <div
                      className={`size-3 rounded-sm ${problemColor(ev.problemIndex)} opacity-60`}
                    />
                  </div>
                ) : (
                  <Link
                    href={ev.submissionId ? `/submissions/${ev.submissionId}` : "#"}
                    aria-label={`${ev.problemTitle} — ${ev.status ?? ev.type} — ${formatDateTimeInTimeZone(ev.at, locale, timeZone)}`}
                    className="block -translate-x-1/2"
                  >
                    {isFirstAc ? (
                      <div
                        className={`size-5 rounded-full ${problemColor(ev.problemIndex)} flex items-center justify-center shadow-sm ring-2 ring-white`}
                      >
                        <Check className="size-3 text-white" />
                      </div>
                    ) : (
                      <div
                        className={`size-4 rounded-full border-2 ${problemBorderColor(ev.problemIndex)} ${
                          ev.status === "accepted" || ev.status === "scored"
                            ? problemColor(ev.problemIndex)
                            : "bg-white"
                        }`}
                      />
                    )}
                  </Link>
                )}

                {/* Hover tooltip - CSS only */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[200px] hidden group-hover:block">
                  <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
                    <div className="font-medium mb-1">
                      {ev.problemTitle}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {formatDateTimeInTimeZone(ev.at, locale, timeZone)}
                      {" · "}
                      +{formatDuration(Math.floor((ev.at.getTime() - startTime.getTime()) / 1000))}
                    </div>
                    {ev.type === "submission" && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">
                            {ev.submissionId ? formatSubmissionIdPrefix(ev.submissionId) : "-"}
                          </span>
                          {ev.status ? (
                            <SubmissionStatusBadge
                              status={ev.status}
                              label={statusLabels[ev.status] ?? ev.status}
                              locale={locale}
                            />
                          ) : null}
                        </div>
                        {ev.score !== null && ev.score !== undefined ? (
                          <div>Score: {formatScore(ev.score, locale)}</div>
                        ) : null}
                        {ev.language ? (
                          <div className="text-xs text-muted-foreground">
                            {getLanguageDisplayLabel(ev.language)}
                          </div>
                        ) : null}
                      </div>
                    )}
                    {ev.type === "first_ac" && (
                      <div className="font-medium text-green-600">
                        {tr.firstAccepted}
                      </div>
                    )}
                    {ev.type === "snapshot" && (
                      <div className="text-xs text-muted-foreground">
                        {tr.codeSnapshot(ev.charCount ?? 0)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-problem summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assignmentProblems.map((problem, index) => {
          const timeline = timelineByProblem.get(problem.problemId);
          const summary = timeline?.summary ?? null;
          if (!summary) return null;

          const problemEvents = timeline?.timeline ?? [];

          return (
            <Card key={problem.problemId} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block size-3 rounded-full ${problemColor(index)}`} />
                  <CardTitle className="text-sm">
                    <Link
                      href={`/problems/${problem.problemId}`}
                      className="text-primary hover:underline"
                    >
                      {problem.title}
                    </Link>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {/* Mini timeline bar for this problem */}
                <div className="relative h-6">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-muted-foreground/15 rounded-full" />
                  {problemEvents.map((ev, i) => {
                    if (!ev.at) return null;
                    const pct = percentFromStart(ev.at);
                    const isAc =
                      ev.type === "first_ac" ||
                      (ev.type === "submission" &&
                        (ev.status === "accepted" || ev.status === "scored"));
                    return (
                      <div
                        key={`${ev.type}-${ev.at.getTime()}`}
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `${pct}%` }}
                      >
                        <div
                          className={`size-2.5 rounded-full -translate-x-1/2 ${
                            isAc
                              ? problemColor(index)
                              : "bg-white border border-muted-foreground/40"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">
                    {tr.tries(summary.totalAttempts)}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {tr.best(summary.bestScore ?? "-")}
                  </Badge>
                  {summary.firstAcAt ? (
                    <Badge variant="outline" className="text-xs text-green-600">
                      AC +{formatDuration(
                        Math.floor((new Date(summary.firstAcAt).getTime() - startTime.getTime()) / 1000)
                      )}
                    </Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
