"use client";

import { Button } from "@/components/ui/button";

type LiveSubmissionStatusProps = {
  status: string;
  queuePosition: number | null;
  gradingTestCase: string | null;
  pollingError: boolean;
  liveUpdatesActiveLabel: string;
  queueAheadLabel: string;
  judgingProgressLabel: string;
  judgingInProgressLabel: string;
  liveUpdatesDelayedLabel: string;
  retryLabel: string;
  onRetry: () => void;
};

function parseGradingProgress(gradingTestCase: string | null) {
  if (!gradingTestCase) {
    return null;
  }

  const match = gradingTestCase.match(/^(\d+)\/(\d+)$/);
  if (!match) {
    return null;
  }

  const completed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return {
    completed,
    total,
    percentage: Math.min(Math.max((completed / total) * 100, 0), 100),
  };
}

export function LiveSubmissionStatus({
  status,
  queuePosition,
  gradingTestCase,
  pollingError,
  liveUpdatesActiveLabel,
  queueAheadLabel,
  judgingProgressLabel,
  judgingInProgressLabel,
  liveUpdatesDelayedLabel,
  retryLabel,
  onRetry,
}: LiveSubmissionStatusProps) {
  const parsedProgress = parseGradingProgress(gradingTestCase);

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>{liveUpdatesActiveLabel}</p>
      {(status === "pending" || status === "queued") && queuePosition !== null && queuePosition > 0 ? (
        <p>{queueAheadLabel}</p>
      ) : null}
      {status === "judging" ? (
        <div className="space-y-2">
          <p>{gradingTestCase ? judgingProgressLabel : judgingInProgressLabel}</p>
          {parsedProgress ? (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  role="progressbar"
                  aria-label={judgingProgressLabel}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(parsedProgress.percentage)}
                  style={{ width: `${parsedProgress.percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {parsedProgress.completed}/{parsedProgress.total}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {pollingError ? (
        <div aria-live="polite" className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <p>{liveUpdatesDelayedLabel}</p>
          <Button variant="outline" size="xs" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
