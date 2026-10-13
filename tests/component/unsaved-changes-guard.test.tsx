import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

const WARNING = "아직 제출하지 않은 코드가 있어요. 이 페이지를 나갈까요?";

function GuardedPage({ isDirty }: { isDirty: boolean }) {
  useUnsavedChangesGuard({ isDirty, warningMessage: WARNING });
  return (
    <div>
      {/* Plain anchors stand in for BackLink / next/link. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/contests/c1" data-history-back="">
        Back
      </a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/contests/c1">Contest</a>
    </div>
  );
}

function setHistoryLength(length: number) {
  Object.defineProperty(window.history, "length", { configurable: true, get: () => length });
}

describe("useUnsavedChangesGuard", () => {
  let confirmMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.replaceState(null, "", "/practice/problems/p1?assignmentId=c1");
    confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    setHistoryLength(3);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window.history, "length");
  });

  it("asks with the caller's (localized) message", () => {
    render(<GuardedPage isDirty />);

    fireEvent.click(screen.getByText("Contest"));

    expect(confirmMock).toHaveBeenCalledWith(WARNING);
  });

  it("does not ask at all while the page is clean", () => {
    render(<GuardedPage isDirty={false} />);

    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Contest"));

    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("confirms a history-back link once and lets the traversal and unload through", () => {
    render(<GuardedPage isDirty />);

    const notPrevented = fireEvent.click(screen.getByText("Back"));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(true);

    // The back traversal may land on another document: no second, native prompt.
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it("keeps the user on the page when the history-back confirm is declined", () => {
    confirmMock.mockReturnValue(false);
    render(<GuardedPage isDirty />);

    const notPrevented = fireEvent.click(screen.getByText("Back"));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
});
