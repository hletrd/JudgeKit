import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminSubmissionsBackfill } from "@/app/(dashboard)/dashboard/admin/submissions/admin-submissions-backfill";

const { apiFetchMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("lucide-react", () => ({
  Loader2: () => <span data-testid="loader-icon" />,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
  getApiError: (data: unknown) => JSON.stringify(data),
}));

// Same forwarding-mock pattern used by tests/component/destructive-action-dialog.test.tsx
// so the trigger/confirm/cancel buttons are plain DOM buttons we can click directly.
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    "data-testid"?: string;
  }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </button>
  ),
}));

// Renders dialog content unconditionally (ignoring `open`) so the confirm
// button is reachable without needing the real Dialog's portal/open state.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ render: renderProp }: { render?: React.ReactElement }) => renderProp ?? null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: async () => ({ data }),
  } as Response;
}

describe("AdminSubmissionsBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("halts the auto-loop and stops POSTing once the component unmounts mid-run", async () => {
    // Every poll reports the same non-zero `remaining`, so an un-halted loop
    // keeps firing a POST every ~1.5s indefinitely.
    apiFetchMock.mockImplementation(async () => jsonResponse({ enqueued: 1, remaining: 5 }));

    const user = userEvent.setup();
    const { unmount } = render(<AdminSubmissionsBackfill />);

    // Trigger and confirm both render the same "backfillRun" label (translations
    // are mocked to the raw key); the confirm button is the later one in the tree.
    const runButtons = screen.getAllByRole("button", { name: "backfillRun" });
    await user.click(runButtons[runButtons.length - 1]);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const callsAtUnmount = apiFetchMock.mock.calls.length;
    unmount();

    // Give a leaked loop enough time (> LOOP_DELAY_MS) to have fired again.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(apiFetchMock).toHaveBeenCalledTimes(callsAtUnmount);
  }, 10_000);
});
