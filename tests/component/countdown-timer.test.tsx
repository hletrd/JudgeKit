import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CountdownTimer } from "@/components/exam/countdown-timer";

// Mock Badge to render children in a span with className exposed
vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    className,
    variant,
    role,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
    role?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} role={role} className={className}>
      {children}
    </span>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

describe("CountdownTimer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ timestamp: Date.now() }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(badge).toHaveAttribute("data-variant", "destructive");
  });

  it("applies yellow color class when between 5 and 30 minutes remaining", () => {
    // 15 minutes remaining
    const deadline = Date.now() + 15 * 60 * 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("applies green color class when more than 30 minutes remaining", () => {
    // 45 minutes remaining
    const deadline = Date.now() + 45 * 60 * 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "success");
  });

  it("applies dark red color class when expired", () => {
    const deadline = Date.now() - 1000;
    render(<CountdownTimer deadline={deadline} />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "destructive");
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

  it("aborts the server time-sync request if it hangs too long", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const deadline = Date.now() + 3600 * 1000;
    render(<CountdownTimer deadline={deadline} />);

    const signal = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined] | undefined
    )?.[1]?.signal as AbortSignal | undefined;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(signal?.aborted).toBe(true);
  });

  it("resets expired state when deadline is extended", () => {
    const onExpired = vi.fn();
    // Start with a deadline 2 seconds in the past (already expired)
    const { rerender } = render(
      <CountdownTimer deadline={Date.now() - 2000} onExpired={onExpired} />
    );

    expect(screen.getByTestId("badge")).toHaveTextContent("00:00:00");
    // onExpired does NOT fire on mount for already-expired deadlines;
    // it only fires on transition from non-expired to expired
    expect(onExpired).not.toHaveBeenCalled();

    // Extend deadline to 1 hour in the future
    act(() => {
      rerender(<CountdownTimer deadline={Date.now() + 3600 * 1000} onExpired={onExpired} />);
    });

    // Should show positive remaining time, not 00:00:00
    expect(screen.getByTestId("badge")).toHaveTextContent("01:00:00");
  });

  it("re-fires onExpired when extended deadline expires again", () => {
    const onExpired = vi.fn();
    // Start expired
    const { rerender } = render(
      <CountdownTimer deadline={Date.now() - 1000} onExpired={onExpired} />
    );

    expect(onExpired).not.toHaveBeenCalled();

    // Extend to 3 seconds in the future
    act(() => {
      rerender(<CountdownTimer deadline={Date.now() + 3000} onExpired={onExpired} />);
    });

    expect(screen.getByTestId("badge")).not.toHaveTextContent("00:00:00");

    // Advance past the new deadline
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("badge")).toHaveTextContent("00:00:00");
  });
});
