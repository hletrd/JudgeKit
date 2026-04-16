import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSubmissionStatus } from "@/app/(dashboard)/dashboard/submissions/[id]/_components/live-submission-status";

describe("LiveSubmissionStatus", () => {
  it("shows queue position for queued submissions", () => {
    render(
      <LiveSubmissionStatus
        status="queued"
        queuePosition={3}
        gradingTestCase={null}
        pollingError={false}
        liveUpdatesActiveLabel="Live updates active"
        queueAheadLabel="3 ahead"
        judgingProgressLabel="Judging 0/0"
        judgingInProgressLabel="Judging"
        liveUpdatesDelayedLabel="Delayed"
        retryLabel="Retry"
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText("Live updates active")).toBeInTheDocument();
    expect(screen.getByText("3 ahead")).toBeInTheDocument();
  });

  it("renders a progress bar for judging progress", () => {
    render(
      <LiveSubmissionStatus
        status="judging"
        queuePosition={0}
        gradingTestCase="3/10"
        pollingError={false}
        liveUpdatesActiveLabel="Live updates active"
        queueAheadLabel="3 ahead"
        judgingProgressLabel="Judging 3/10"
        judgingInProgressLabel="Judging"
        liveUpdatesDelayedLabel="Delayed"
        retryLabel="Retry"
        onRetry={vi.fn()}
      />
    );

    const progressBar = screen.getByRole("progressbar", { name: "Judging 3/10" });
    expect(progressBar).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByText("3/10")).toBeInTheDocument();
  });

  it("shows retry controls when polling is delayed", () => {
    const onRetry = vi.fn();

    render(
      <LiveSubmissionStatus
        status="judging"
        queuePosition={0}
        gradingTestCase={null}
        pollingError
        liveUpdatesActiveLabel="Live updates active"
        queueAheadLabel="3 ahead"
        judgingProgressLabel="Judging 3/10"
        judgingInProgressLabel="Judging"
        liveUpdatesDelayedLabel="Delayed"
        retryLabel="Retry"
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
