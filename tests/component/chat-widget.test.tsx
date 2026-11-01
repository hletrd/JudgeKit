import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatWidget from "@/lib/plugins/chat-widget/chat-widget";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const navigation = vi.hoisted(() => ({ pathname: "/practice/problems/problem-1" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
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
    navigation.pathname = "/practice/problems/problem-1";
    document.title = "";
    document.body.innerHTML = "";
    // jsdom does not implement element scrolling
    Element.prototype.scrollTo = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
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

  async function sendAndGetBody(text: string) {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createStreamResponse(["ok"]));
    const user = userEvent.setup();
    render(<ChatWidget />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.type(screen.getByPlaceholderText("placeholder"), text);
    await user.click(screen.getByRole("button", { name: "send" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  it("sends the problem and a snapshot of the visible page", async () => {
    const main = document.createElement("main");
    main.id = "main-content";
    main.textContent = "A + B\nRead two integers and print their sum.";
    document.body.appendChild(main);
    document.title = "A + B | JudgeKit";

    const body = await sendAndGetBody("Explain the problem");

    expect(body.context.problemId).toBe("problem-1");
    expect(body.context.page).toEqual({
      path: "/",
      title: "A + B | JudgeKit",
      text: "A + B\nRead two integers and print their sum.",
    });
  });

  it("sends the submission id on a submission detail page", async () => {
    navigation.pathname = "/submissions/sub-42";

    const body = await sendAndGetBody("Why wrong answer?");

    expect(body.context.submissionId).toBe("sub-42");
    expect(body.context.problemId).toBeUndefined();
  });

  it("caps the page text sent with a message", async () => {
    const main = document.createElement("main");
    main.id = "main-content";
    main.textContent = "x".repeat(20_000);
    document.body.appendChild(main);

    const body = await sendAndGetBody("Summarize");

    expect(body.context.page.text).toHaveLength(8000);
  });

  it("explains when the assistant is unavailable on the page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "aiDisabledForProblem" }), { status: 403 })
    );
    const user = userEvent.setup();
    render(<ChatWidget />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.type(screen.getByPlaceholderText("placeholder"), "Help");
    await user.click(screen.getByRole("button", { name: "send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("errorUnavailable");
  });

  it("waits for the widget to open before sending the proactive analysis", async () => {
    navigation.pathname = "/submissions/sub-42";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createStreamResponse(["Look at line 3."]));
    const user = userEvent.setup();
    render(<ChatWidget />);

    act(() => {
      window.dispatchEvent(new CustomEvent("oj:submission-result", {
        detail: { status: "wrong_answer", problemId: "problem-1", submissionId: "sub-42" },
      }));
    });
    // Closed widget: nothing goes to the LLM
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Chat" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.context).toMatchObject({ problemId: "problem-1", submissionId: "sub-42" });
    expect(await screen.findByText("autoAnalysisError")).toBeInTheDocument();
  });
});
