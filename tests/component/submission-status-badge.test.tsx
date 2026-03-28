import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubmissionStatusBadge } from "@/components/submission-status-badge";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  CheckCircle2: ({ className }: { className?: string }) => (
    <svg data-testid="icon-check" className={className} aria-hidden="true" />
  ),
  Clock3: ({ className }: { className?: string }) => (
    <svg data-testid="icon-clock" className={className} aria-hidden="true" />
  ),
  AlertTriangle: ({ className }: { className?: string }) => (
    <svg data-testid="icon-alert" className={className} aria-hidden="true" />
  ),
  Timer: ({ className }: { className?: string }) => (
    <svg data-testid="icon-timer" className={className} aria-hidden="true" />
  ),
  HardDrive: ({ className }: { className?: string }) => (
    <svg data-testid="icon-harddrive" className={className} aria-hidden="true" />
  ),
}));

// Mock Badge to render a simple span with variant exposed
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

// Mock Tooltip components — render children directly so tooltip trigger content is visible
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; render?: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode; className?: string; arrowClassName?: string }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

// Use real status functions — they're pure and fast
vi.mock("@/lib/submissions/status", async () => {
  const real = await vi.importActual<typeof import("@/lib/submissions/status")>("@/lib/submissions/status");
  return real;
});

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("SubmissionStatusBadge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the label text", () => {
    render(<SubmissionStatusBadge status="accepted" label="Accepted" />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("shows badge with default variant for accepted status", () => {
    render(<SubmissionStatusBadge status="accepted" label="Accepted" />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "default");
  });

  it("shows CheckCircle2 icon for accepted status", () => {
    render(<SubmissionStatusBadge status="accepted" label="Accepted" />);
    expect(screen.getByTestId("icon-check")).toBeInTheDocument();
  });

  it("shows badge with secondary variant for active status (judging)", () => {
    render(<SubmissionStatusBadge status="judging" label="Judging" />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("shows Clock3 icon for active status (pending)", () => {
    render(<SubmissionStatusBadge status="pending" label="Pending" />);
    expect(screen.getByTestId("icon-clock")).toBeInTheDocument();
  });

  it("shows Clock3 icon for active status (queued)", () => {
    render(<SubmissionStatusBadge status="queued" label="Queued" />);
    expect(screen.getByTestId("icon-clock")).toBeInTheDocument();
  });

  it("shows badge with destructive variant for error statuses", () => {
    render(<SubmissionStatusBadge status="wrong_answer" label="Wrong Answer" />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "destructive");
  });

  it("shows AlertTriangle icon for error statuses", () => {
    render(<SubmissionStatusBadge status="compile_error" label="Compile Error" />);
    expect(screen.getByTestId("icon-alert")).toBeInTheDocument();
  });

  it("does not render tooltip content when no detail data is provided", () => {
    render(<SubmissionStatusBadge status="wrong_answer" label="Wrong Answer" />);
    expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
  });

  it("renders tooltip content when executionTimeMs is provided for terminal status", () => {
    render(
      <SubmissionStatusBadge
        status="wrong_answer"
        label="Wrong Answer"
        executionTimeMs={123}
      />
    );
    expect(screen.getByTestId("tooltip-content")).toBeInTheDocument();
  });

  it("does not show pulse indicator when showLivePulse is false", () => {
    render(<SubmissionStatusBadge status="judging" label="Judging" showLivePulse={false} />);
    // The pulse span has animate-pulse class; it should not be present
    const { container } = render(<SubmissionStatusBadge status="judging" label="Judging" showLivePulse={false} />);
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("shows pulse indicator when showLivePulse is true and status is active", () => {
    const { container } = render(
      <SubmissionStatusBadge status="judging" label="Judging" showLivePulse={true} />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("does not show pulse indicator when showLivePulse is true but status is terminal", () => {
    const { container } = render(
      <SubmissionStatusBadge status="accepted" label="Accepted" showLivePulse={true} />
    );
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("respects explicit variant prop over computed variant", () => {
    render(<SubmissionStatusBadge status="accepted" label="Accepted" variant="secondary" />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });
});
