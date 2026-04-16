import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContestClarifications } from "@/components/contest/contest-clarifications";

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

describe("ContestClarifications", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders clarifications and lets a participant submit a question", async () => {
    apiFetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { id: "clarification-2" } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "clarification-1",
              problemId: "problem-1",
              userId: "student-1",
              question: "Is this 1-indexed?",
              answer: "Yes",
              answerType: "yes",
              answeredBy: "admin-1",
              answeredAt: "2026-04-16T00:00:00.000Z",
              isPublic: true,
              createdAt: "2026-04-16T00:00:00.000Z",
            },
          ],
        }),
      });
    });

    render(
      <ContestClarifications
        assignmentId="assign-1"
        currentUserId="student-1"
        problems={[{ id: "problem-1", title: "A + B" }]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Is this 1-indexed?")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("questionLabel"), {
      target: { value: "Can I use recursion?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/contests/assign-1/clarifications",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
