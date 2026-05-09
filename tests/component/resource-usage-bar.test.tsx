import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { ResourceUsageBar } from "@/components/resource-usage-bar";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Timer: ({ className }: { className?: string }) => (
    <svg data-testid="icon-timer" className={className} aria-hidden="true" />
  ),
  HardDrive: ({ className }: { className?: string }) => (
    <svg data-testid="icon-memory" className={className} aria-hidden="true" />
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("ResourceUsageBar", () => {
  it("renders compact mode with percentage bar", () => {
    render(
      <ResourceUsageBar current={500} limit={1000} unit="ms" compact />
    );
    // Bar width should be 50%
    const bar = document.querySelector("[style*='width: 50%']");
    expect(bar).toBeInTheDocument();
  });

  it("renders full mode with label and value", () => {
    render(
      <ResourceUsageBar
        current={500}
        limit={1000}
        label="Time"
        unit="ms"
      />
    );
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("500ms")).toBeInTheDocument();
  });

  it("uses green color for percentage below 50%", () => {
    render(
      <ResourceUsageBar current={400} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector(".bg-green-500");
    expect(bar).toBeInTheDocument();
  });

  it("uses yellow color for percentage between 50% and 80%", () => {
    render(
      <ResourceUsageBar current={600} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector(".bg-yellow-500");
    expect(bar).toBeInTheDocument();
  });

  it("uses orange color for percentage between 80% and 100%", () => {
    render(
      <ResourceUsageBar current={850} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector(".bg-orange-500");
    expect(bar).toBeInTheDocument();
  });

  it("uses red color when percentage exceeds 100%", () => {
    render(
      <ResourceUsageBar current={1200} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector(".bg-red-500");
    expect(bar).toBeInTheDocument();
  });

  it("uses red color when exceeded prop is true", () => {
    render(
      <ResourceUsageBar
        current={500}
        limit={1000}
        unit="ms"
        compact
        exceeded
      />
    );
    const bar = document.querySelector(".bg-red-500");
    expect(bar).toBeInTheDocument();
  });

  it("clamps bar width to 100% when percentage exceeds 100%", () => {
    render(
      <ResourceUsageBar current={1500} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector("[style*='width: 100%']");
    expect(bar).toBeInTheDocument();
  });

  it("shows zero-width bar when limit is 0", () => {
    render(
      <ResourceUsageBar current={500} limit={0} unit="ms" compact />
    );
    const bar = document.querySelector("[style*='width: 0%']");
    expect(bar).toBeInTheDocument();
  });

  it("formats ms values >= 1000 as seconds", () => {
    render(
      <ResourceUsageBar
        current={2500}
        limit={5000}
        label="Time"
        unit="ms"
      />
    );
    expect(screen.getByText("2.5s")).toBeInTheDocument();
  });

  it("formats KB values >= 1024 as MB", () => {
    render(
      <ResourceUsageBar
        current={2048}
        limit={4096}
        label="Memory"
        unit="KB"
      />
    );
    expect(screen.getByText("2MB")).toBeInTheDocument();
  });

  it("formats MB values >= 1024 as GB", () => {
    render(
      <ResourceUsageBar
        current={1536}
        limit={2048}
        label="Memory"
        unit="MB"
      />
    );
    expect(screen.getByText("1.5GB")).toBeInTheDocument();
  });

  it("renders timer icon when icon prop is 'timer'", () => {
    render(
      <ResourceUsageBar
        current={500}
        limit={1000}
        unit="ms"
        compact
        icon="timer"
      />
    );
    expect(screen.getByTestId("icon-timer")).toBeInTheDocument();
  });

  it("renders memory icon when icon prop is 'memory'", () => {
    render(
      <ResourceUsageBar
        current={500}
        limit={1000}
        unit="KB"
        compact
        icon="memory"
      />
    );
    expect(screen.getByTestId("icon-memory")).toBeInTheDocument();
  });

  it("handles NaN current by treating it as 0", () => {
    render(
      <ResourceUsageBar current={NaN} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector("[style*='width: 0%']");
    expect(bar).toBeInTheDocument();
  });

  it("handles negative current by treating it as 0", () => {
    render(
      <ResourceUsageBar current={-100} limit={1000} unit="ms" compact />
    );
    const bar = document.querySelector("[style*='width: 0%']");
    expect(bar).toBeInTheDocument();
  });

  it("handles NaN limit by treating it as 0", () => {
    render(
      <ResourceUsageBar current={500} limit={NaN} unit="ms" compact />
    );
    const bar = document.querySelector("[style*='width: 0%']");
    expect(bar).toBeInTheDocument();
  });

  it("handles negative limit by treating it as 0", () => {
    render(
      <ResourceUsageBar current={500} limit={-100} unit="ms" compact />
    );
    const bar = document.querySelector("[style*='width: 0%']");
    expect(bar).toBeInTheDocument();
  });

  it("uses locale-aware number formatting when locale is provided", () => {
    render(
      <ResourceUsageBar
        current={1234}
        limit={5000}
        label="Time"
        unit="ms"
        locale="ko-KR"
      />
    );
    // current=1234 >= 1000, so it converts to seconds: 1.23s
    expect(screen.getByText("1.23s")).toBeInTheDocument();
  });
});
