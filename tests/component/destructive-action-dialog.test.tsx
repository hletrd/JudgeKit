import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

// Mock Button to render a real button element, forwarding relevant props
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    variant,
    size,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    variant?: string;
    size?: string;
    "data-testid"?: string;
  }) => (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      data-testid={testId}
    >
      {children}
    </button>
  ),
}));

// Mock Dialog components so that dialog content is always rendered in the DOM
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="dialog-root" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  DialogTrigger: ({ render: renderProp }: { render?: React.ReactElement }) =>
    renderProp ?? null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

const defaultProps = {
  triggerLabel: "Delete item",
  title: "Confirm deletion",
  description: "This action cannot be undone.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  onConfirmAction: vi.fn().mockResolvedValue(true),
};

describe("DestructiveActionDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders trigger button with correct label", () => {
    render(<DestructiveActionDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Delete item" })).toBeInTheDocument();
  });

  it("trigger button is disabled when disabled prop is true", () => {
    render(<DestructiveActionDialog {...defaultProps} disabled={true} />);
    expect(screen.getByRole("button", { name: "Delete item" })).toBeDisabled();
  });

  it("trigger button is enabled when disabled prop is false", () => {
    render(<DestructiveActionDialog {...defaultProps} disabled={false} />);
    expect(screen.getByRole("button", { name: "Delete item" })).not.toBeDisabled();
  });

  it("trigger button renders with provided triggerTestId", () => {
    render(
      <DestructiveActionDialog
        {...defaultProps}
        triggerTestId="delete-trigger"
      />
    );
    expect(screen.getByTestId("delete-trigger")).toBeInTheDocument();
  });

  it("confirm button renders with provided confirmTestId", () => {
    render(
      <DestructiveActionDialog
        {...defaultProps}
        confirmTestId="delete-confirm"
      />
    );
    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
  });

  it("renders dialog title and description", () => {
    render(<DestructiveActionDialog {...defaultProps} />);
    expect(screen.getByTestId("dialog-title")).toHaveTextContent("Confirm deletion");
    expect(screen.getByTestId("dialog-description")).toHaveTextContent("This action cannot be undone.");
  });

  it("renders cancel and confirm buttons in dialog footer", () => {
    render(<DestructiveActionDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onConfirmAction when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirmAction = vi.fn().mockResolvedValue(true);
    render(<DestructiveActionDialog {...defaultProps} onConfirmAction={onConfirmAction} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onConfirmAction).toHaveBeenCalledTimes(1);
    });
  });

  it("trigger renders with destructive variant by default", () => {
    render(<DestructiveActionDialog {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: "Delete item" });
    expect(trigger).toHaveAttribute("data-variant", "destructive");
  });

  it("trigger renders with provided triggerVariant", () => {
    render(<DestructiveActionDialog {...defaultProps} triggerVariant="outline" />);
    const trigger = screen.getByRole("button", { name: "Delete item" });
    expect(trigger).toHaveAttribute("data-variant", "outline");
  });

  it("confirm button has destructive variant", () => {
    render(
      <DestructiveActionDialog
        {...defaultProps}
        confirmTestId="confirm-btn"
      />
    );
    const confirmBtn = screen.getByTestId("confirm-btn");
    expect(confirmBtn).toHaveAttribute("data-variant", "destructive");
  });
});
