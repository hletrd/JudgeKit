import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubmissionListAutoRefresh } from "@/components/submission-list-auto-refresh";

const refreshMock = vi.fn();
const routerMock = { refresh: refreshMock };
const apiFetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

/** Let the awaited /api/v1/time probe and the follow-up refresh settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderWithLinks() {
  return render(
    <div>
      <SubmissionListAutoRefresh hasActiveSubmissions={false} idleIntervalMs={1000} />
      {/* Plain anchors stand in for the next/link anchors on the page. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/practice/problems/p1?assignmentId=c1">Problem 1</a>
      <a href="/practice/problems/p1?assignmentId=c1" target="_blank" rel="noreferrer">
        Problem 1 (new tab)
      </a>
    </div>,
  );
}

describe("SubmissionListAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshMock.mockClear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ ok: true });
    window.history.replaceState(null, "", "/contests/c1");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes on mount and then on every interval while the page is idle", async () => {
    renderWithLinks();
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await advance(1000);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("holds refreshes once an in-app link is clicked, so the navigation is pushed rather than replaced", async () => {
    const { getByText } = renderWithLinks();
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // The click itself is what starts the client-side navigation.
    fireEvent.click(getByText("Problem 1"), { button: 0 });

    await advance(5000);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await advance(4000);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // A navigation that never happened only delays polling: the next tick
    // after the hold window refreshes again.
    await advance(1000);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("skips the refresh when the link is clicked while the time probe is in flight", async () => {
    let resolveProbe: (value: { ok: boolean }) => void = () => {};
    apiFetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveProbe = resolve; }));

    const { getByText } = renderWithLinks();
    fireEvent.click(getByText("Problem 1"), { button: 0 });
    resolveProbe({ ok: true });
    await flush();

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps polling for clicks that do not navigate this tab", async () => {
    const { getByText } = renderWithLinks();
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText("Problem 1 (new tab)"), { button: 0 });
    fireEvent.click(getByText("Problem 1"), { button: 0, metaKey: true });

    await advance(1000);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });
});
