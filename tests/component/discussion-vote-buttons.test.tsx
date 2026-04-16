import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscussionVoteButtons } from "@/components/discussions/discussion-vote-buttons";

const { apiFetchMock, refreshMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe("DiscussionVoteButtons", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refreshMock.mockReset();
  });

  it("submits a vote and refreshes the view", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          targetType: "thread",
          targetId: "thread-1",
          score: 3,
          currentUserVote: "up",
        },
      }),
    });

    render(
      <DiscussionVoteButtons
        targetType="thread"
        targetId="thread-1"
        score={2}
        currentUserVote={null}
        canVote
        upvoteLabel="Upvote"
        downvoteLabel="Downvote"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Upvote/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/community/votes",
        expect.objectContaining({ method: "POST" }),
      );
      expect(refreshMock).toHaveBeenCalled();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });
});
