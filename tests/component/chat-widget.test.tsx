import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatWidget from "@/lib/plugins/chat-widget/chat-widget";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/problems/problem-1",
  useSearchParams: () => new URLSearchParams(),
}));

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }
  );
}

describe("ChatWidget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the message container to the actual bottom while streaming replies", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createStreamResponse(["**main**", "\nnext line"]))
      ;
    const scrollToMock = vi.fn();
    const user = userEvent.setup();

    const { container } = render(<ChatWidget />);

    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByText("loggingNotice")).toBeInTheDocument();

    const messagesContainer = container.querySelector(".overflow-y-auto") as HTMLDivElement;
    Object.defineProperty(messagesContainer, "scrollHeight", {
      configurable: true,
      value: 480,
    });
    messagesContainer.scrollTo = scrollToMock;

    await user.type(screen.getByPlaceholderText("placeholder"), "Why is this broken?");
    await user.click(screen.getByRole("button", { name: "send" }));

    await screen.findByText("main", { selector: "strong" });

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 480,
        behavior: "auto",
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("next line")).toBeInTheDocument();
  });
});
