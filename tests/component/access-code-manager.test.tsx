import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessCodeManager } from "@/components/contest/access-code-manager";
import { toast } from "sonner";

const apiFetchMock = vi.fn();

const translations: Record<string, string> = {
  title: "Access Code",
  generate: "Generate Access Code",
  revoke: "Revoke Access Code",
  copy: "Copy Code",
  copied: "Copied!",
  shareLink: "Share Link",
  noCode: "No access code set",
  generateSuccess: "Access code generated",
  copyFailed: "Could not copy to your clipboard",
  revokeSuccess: "Access code revoked",
  revokeConfirm: "Are you sure?",
  error: "Error",
};

vi.mock("next-intl", () => ({
  useTranslations: (_namespace: string) => (key: string) => translations[key] ?? key,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AccessCodeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("automatically copies the new access code after generation", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { accessCode: null } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { accessCode: "ABCD1234" } }),
      });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(<AccessCodeManager assignmentId="assignment-1" />);

    expect(await screen.findByText("No access code set")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Generate Access Code" }));

    await waitFor(() => {
      expect(screen.getByText("ABCD1234")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copied!/i })).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith("Access code generated");
    });
  });

  it("shows an error toast when clipboard access fails", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { accessCode: "ABCD1234" } }),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")),
      },
    });

    render(<AccessCodeManager assignmentId="assignment-1" />);

    expect(await screen.findByText("ABCD1234")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy Code" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not copy to your clipboard");
    });
    expect(screen.getByRole("button", { name: "Copy Code" })).toBeInTheDocument();
  });
});
