import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CopyCodeButton } from "@/components/code/copy-code-button";

const copyToClipboardMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
}));

describe("CopyCodeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyToClipboardMock.mockResolvedValue(true);
  });

  it("shows copy icon initially", () => {
    render(<CopyCodeButton value="console.log(1)" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows checkmark after clicking copy", async () => {
    render(<CopyCodeButton value="console.log(1)" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByLabelText("copied")).toBeInTheDocument();
    });
  });

  it("keeps checkmark for full 2 seconds from last click on rapid clicks", async () => {
    render(<CopyCodeButton value="console.log(1)" />);

    // First click
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByLabelText("copied")).toBeInTheDocument();
    });

    // Second click after 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));
    fireEvent.click(screen.getByRole("button"));

    // Should still show "copied" at 1500ms from first click (1000ms from second)
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(screen.getByLabelText("copied")).toBeInTheDocument();

    // Should reset after 2000ms from second click (total ~2500ms from start)
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(screen.getByLabelText("copyCode")).toBeInTheDocument();
  });

  it("calls copyToClipboard with the value", async () => {
    render(<CopyCodeButton value="hello world" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledWith("hello world");
    });
  });

  it("shows error toast when copy fails", async () => {
    const { toast } = await import("sonner");
    copyToClipboardMock.mockResolvedValue(false);
    render(<CopyCodeButton value="fail" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("copyFailed");
    });
  });
});
