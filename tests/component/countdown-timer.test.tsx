import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CountdownTimer } from "@/components/exam/countdown-timer";

// Mock Badge to render children in a span with className exposed
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

describe("CountdownTimer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("displays formatted countdown time (HH:MM:SS)", () => {
    // 2 hours, 30 minutes, 15 seconds from now
    const deadline = Date.now() + (2 * 3600 + 30 * 60 + 15) * 1000;
    render(<CountdownTimer deadline={deadline} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("02:30:15");
  });

  it("shows label when provided", () => {
    const deadline = Date.now() + 60 * 60 * 1000;
    render(<CountdownTimer deadline={deadline} label="Time remaining" />);
    expect(screen.getByText("Time remaining:")).toBeInTheDocument();
  });

  it("does not show label when not provided", () => {
    const deadline = Date.now() + 60 * 60 * 1000;
    const { container } = render(<CountdownTimer deadline={deadline} />);
    // No <span class="mr-1"> should be present
    expect(container.querySelector("span.mr-1")).not.toBeInTheDocument();
  });

  it("shows 00:00:00 when deadline is already in the past", () => {
    const deadline = Date.now() - 5000;
    render(<CountdownTimer deadline={deadline} />);
    expect(screen.getByTestId("badge")).toHaveTextContent("00:00:00");
  });

  it("calls onExpired when timer reaches zero", () => {
    const onExpired = vi.fn();
    // Set deadline 2 seconds in the future
    const deadline = Date.now() + 2000;
    render(<CountdownTimer deadline={deadline} onExpired={onExpired} />);

    expect(onExpired).not.toHaveBeenCalled();

    // Advance past the deadline
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("only calls onExpired once even after multiple ticks past deadline", () => {
    const onExpired = vi.fn();
    const deadline = Date.now() + 500;
    render(<CountdownTimer deadline={deadline} onExpired={onExpired} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("applies red color class when less than 5 minutes remaining", () => {
    // 4 minutes and 59 seconds remaining
    const deadline = Date.now() + (4 * 60 + 59) * 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("bg-red-500");
  });

  it("applies yellow color class when between 5 and 30 minutes remaining", () => {
    // 15 minutes remaining
    const deadline = Date.now() + 15 * 60 * 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("bg-yellow-500");
  });

  it("applies green color class when more than 30 minutes remaining", () => {
    // 45 minutes remaining
    const deadline = Date.now() + 45 * 60 * 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("bg-green-500");
  });

  it("applies dark red color class when expired", () => {
    const deadline = Date.now() - 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge.className).toContain("bg-red-600");
  });

  it("updates display as time progresses", () => {
    // Start with exactly 1 hour remaining
    const deadline = Date.now() + 3600 * 1000;
    render(<CountdownTimer deadline={deadline} />);

    expect(screen.getByTestId("badge")).toHaveTextContent("01:00:00");

    act(() => {
      vi.advanceTimersByTime(60 * 1000); // advance 1 minute
    });

    expect(screen.getByTestId("badge")).toHaveTextContent("00:59:00");
  });
});
