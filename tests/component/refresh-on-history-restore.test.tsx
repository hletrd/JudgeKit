import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshOnHistoryRestore } from "@/components/refresh-on-history-restore";

const refreshMock = vi.fn();
const routerMock = { refresh: refreshMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

async function flushTimers() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}

describe("RefreshOnHistoryRestore", () => {
  // The module remembers the last traversal across tests, so every test starts
  // on a fake clock well past anything an earlier test recorded.
  let clock = Date.now();

  beforeEach(() => {
    vi.useFakeTimers();
    clock += 60_000;
    vi.setSystemTime(clock);
    refreshMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not refresh a page reached by a normal navigation", async () => {
    render(<RefreshOnHistoryRestore />);
    await flushTimers();

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes once when the page is restored with back/forward", async () => {
    window.dispatchEvent(new PopStateEvent("popstate"));
    render(<RefreshOnHistoryRestore />);
    await flushTimers();

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("still refreshes when the router mounts the page inside its own popstate handler", async () => {
    // The App Router renders the restored page synchronously while handling
    // popstate, before later listeners (this module's) see the event.
    const mountDuringPopstate = () => {
      render(<RefreshOnHistoryRestore />);
    };
    window.addEventListener("popstate", mountDuringPopstate, { once: true, capture: true });
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flushTimers();

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale traversal from long before the mount", async () => {
    window.dispatchEvent(new PopStateEvent("popstate"));
    clock += 10_000;
    vi.setSystemTime(clock);
    render(<RefreshOnHistoryRestore />);
    await flushTimers();

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes when the whole document comes back from the back/forward cache", async () => {
    render(<RefreshOnHistoryRestore />);
    await flushTimers();

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
