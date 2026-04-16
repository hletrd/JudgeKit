import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContestAnnouncements } from "@/components/contest/contest-announcements";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values && "value" in values ? `${key}:${values.value}` : key,
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe("ContestAnnouncements", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders fetched announcements and lets managers create a new one", async () => {
    apiFetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { id: "announcement-2" } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "announcement-1",
              title: "Rule update",
              content: "Please note the new tie-break rule.",
              isPinned: true,
              createdAt: "2026-04-16T00:00:00.000Z",
            },
          ],
        }),
      });
    });

    render(<ContestAnnouncements assignmentId="assign-1" canManage />);

    await waitFor(() => {
      expect(screen.getByText("Rule update")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("titleLabel"), {
      target: { value: "New notice" },
    });
    fireEvent.change(screen.getByLabelText("contentLabel"), {
      target: { value: "Updated schedule." },
    });
    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/contests/assign-1/announcements",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
