import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DiscussionThreadList } from "@/components/discussions/discussion-thread-list";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("DiscussionThreadList", () => {
  it("renders thread cards", () => {
    render(
      <DiscussionThreadList
        title="Community board"
        emptyLabel="No threads"
        openLabel="Open thread"
        pinnedLabel="Pinned"
        lockedLabel="Locked"
        threads={[
          {
            id: "thread-1",
            title: "Need help",
            content: "Question body",
            authorName: "User",
            replyCountLabel: "2 replies",
            locked: false,
            pinned: true,
            href: "/community/threads/thread-1",
          },
        ]}
      />
    );

    expect(screen.getByText("Community board")).toBeInTheDocument();
    expect(screen.getByText("Need help")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Open thread")).toBeInTheDocument();
  });

  it("supports a page-level heading when requested", () => {
    render(
      <DiscussionThreadList
        title="Community board"
        titleAs="h1"
        emptyLabel="No threads"
        openLabel="Open thread"
        pinnedLabel="Pinned"
        lockedLabel="Locked"
        threads={[]}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "Community board" })).toBeInTheDocument();
  });
});
