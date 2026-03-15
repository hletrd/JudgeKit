import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommentSection } from "@/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section";
import { apiFetch } from "@/lib/api/client";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    if (namespace === "comments" && key === "by") {
      return `By ${values?.author ?? ""}`;
    }

    if (namespace === "comments" && key === "aiAssistant") {
      return "AI Assistant";
    }

    if (namespace === "common" && key.startsWith("roles.")) {
      return key.slice("roles.".length);
    }

    return key;
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/datetime", () => ({
  formatRelativeTimeFromNow: () => "just now",
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const apiFetchMock = vi.mocked(apiFetch);

describe("CommentSection", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders assistant comments as markdown and keeps human comments as plain text", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "human-comment",
            content: "**Human note**",
            createdAt: "2026-03-15T00:00:00.000Z",
            author: {
              name: "Ada",
              role: "admin",
            },
          },
          {
            id: "ai-comment",
            content: '**AI note**\nnext line <img src="x" alt="raw-html" />',
            createdAt: "2026-03-15T00:00:00.000Z",
            author: null,
          },
        ],
      }),
    } as Response);

    const { container } = render(
      <CommentSection submissionId="submission-1" canComment={false} />
    );

    await screen.findByText("By Ada");

    expect(screen.getByText("**Human note**")).toBeInTheDocument();
    expect(screen.getByText("AI note", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("next line")).toBeInTheDocument();
    expect(screen.queryByAltText("raw-html")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("<img");
  });

  it("loads comments for the provided submission id", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    render(<CommentSection submissionId="submission-42" canComment={false} />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/submissions/submission-42/comments");
    });
  });
});
