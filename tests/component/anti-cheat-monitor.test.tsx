import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AntiCheatMonitor } from "@/components/exam/anti-cheat-monitor";
import { loadPendingEvents } from "@/components/exam/anti-cheat-storage";

const apiFetchMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe("AntiCheatMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for privacy acknowledgement before sending heartbeat and monitoring events", async () => {
    render(<AntiCheatMonitor assignmentId="assignment-1" enabled />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(apiFetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "privacyNoticeAccept" }));
      await Promise.resolve();
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/contests/assignment-1/anti-cheat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          eventType: "heartbeat",
          details: undefined,
        }),
      })
    );

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/contests/assignment-1/anti-cheat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          eventType: "blur",
          details: undefined,
        }),
      })
    );
  });

  // RPF cycle-3 AGG3-5: tri-state send result — permanent 4xx rejections
  // (forbidden/contestEnded/origin mismatch) must be dropped, not queued
  // through the whole retry ladder; transient failures keep the retry queue.
  describe("tri-state send result (AGG3-5)", () => {
    async function acceptNoticeAndRender(assignmentId: string) {
      render(<AntiCheatMonitor assignmentId={assignmentId} enabled />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "privacyNoticeAccept" }));
        await Promise.resolve();
      });
    }

    afterEach(() => {
      localStorage.clear();
    });

    it("does not queue an event the server rejected with a permanent 403", async () => {
      apiFetchMock.mockResolvedValue({ ok: false, status: 403 });

      await acceptNoticeAndRender("assignment-403");

      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        await Promise.resolve();
      });

      expect(loadPendingEvents("assignment-403")).toHaveLength(0);
    });

    it("still queues an event after a transient 500 for retry", async () => {
      apiFetchMock.mockResolvedValue({ ok: false, status: 500 });

      await acceptNoticeAndRender("assignment-500");

      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        await Promise.resolve();
      });

      const pending = loadPendingEvents("assignment-500");
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending.some((e) => e.eventType === "blur")).toBe(true);
    });

    it("still queues an event after a network error", async () => {
      apiFetchMock.mockRejectedValue(new Error("offline"));

      await acceptNoticeAndRender("assignment-offline");

      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        await Promise.resolve();
      });

      const pending = loadPendingEvents("assignment-offline");
      expect(pending.some((e) => e.eventType === "blur")).toBe(true);
    });

    it("treats 429 as retriable (rate-limit pressure is transient)", async () => {
      apiFetchMock.mockResolvedValue({ ok: false, status: 429 });

      await acceptNoticeAndRender("assignment-429");

      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        await Promise.resolve();
      });

      const pending = loadPendingEvents("assignment-429");
      expect(pending.some((e) => e.eventType === "blur")).toBe(true);
    });
  });
});
