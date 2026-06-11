import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AntiCheatMonitor } from "@/components/exam/anti-cheat-monitor";
import { loadPendingEvents, savePendingEvents } from "@/components/exam/anti-cheat-storage";

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

  // RPF cycle-4 AGG4-3: the flush claims one event at a time (synchronous
  // load → save-without-it before each await) and is single-flight, so a
  // reportEvent enqueue interleaving with a flush is never clobbered and a
  // queued event is never sent twice by overlapping flush triggers.
  describe("pending-queue serialization (AGG4-3)", () => {
    async function acceptNoticeAndRender(assignmentId: string) {
      render(<AntiCheatMonitor assignmentId={assignmentId} enabled />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "privacyNoticeAccept" }));
        await Promise.resolve();
      });
    }

    function eventTypeOf(call: unknown[]): string {
      const init = call[1] as { body: string };
      return (JSON.parse(init.body) as { eventType: string }).eventType;
    }

    afterEach(() => {
      localStorage.clear();
    });

    it("does not lose an event reported while a flush is in flight", async () => {
      savePendingEvents("assignment-race", [
        { eventType: "copy", timestamp: 1, retries: 1 },
      ]);

      let resolveCopySend: ((value: { ok: boolean }) => void) | undefined;
      apiFetchMock.mockImplementation(async (_url: unknown, init: unknown) => {
        const { eventType } = JSON.parse((init as { body: string }).body) as { eventType: string };
        if (eventType === "copy") {
          // Hold the mount-flush send open so we can interleave a report.
          return new Promise<{ ok: boolean }>((resolve) => {
            resolveCopySend = resolve;
          });
        }
        if (eventType === "blur") {
          throw new Error("offline"); // transient → blur must be queued
        }
        return { ok: true };
      });

      await acceptNoticeAndRender("assignment-race");

      // The mount flush has claimed "copy" and is awaiting its send. A blur
      // arriving now fails transiently and is appended to the queue.
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        await Promise.resolve();
      });

      // Complete the in-flight copy send; the flush loop finishes its single
      // claimed iteration without overwriting the concurrent append.
      await act(async () => {
        resolveCopySend?.({ ok: true });
        await Promise.resolve();
      });

      const pending = loadPendingEvents("assignment-race");
      expect(pending.some((e) => e.eventType === "blur")).toBe(true);
      expect(pending.some((e) => e.eventType === "copy")).toBe(false);
    });

    it("does not send a queued event twice when flush triggers overlap", async () => {
      savePendingEvents("assignment-doubleflush", [
        { eventType: "copy", timestamp: 1, retries: 1 },
      ]);

      let resolveCopySend: ((value: { ok: boolean }) => void) | undefined;
      apiFetchMock.mockImplementation(async (_url: unknown, init: unknown) => {
        const { eventType } = JSON.parse((init as { body: string }).body) as { eventType: string };
        if (eventType === "copy") {
          return new Promise<{ ok: boolean }>((resolve) => {
            resolveCopySend = resolve;
          });
        }
        return { ok: true };
      });

      await acceptNoticeAndRender("assignment-doubleflush");

      // First flush (mount) holds the copy send open; a second flush trigger
      // (online) must not re-send the already-claimed event.
      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await Promise.resolve();
      });

      await act(async () => {
        resolveCopySend?.({ ok: true });
        await Promise.resolve();
      });

      const copySends = apiFetchMock.mock.calls.filter((call) => eventTypeOf(call) === "copy");
      expect(copySends).toHaveLength(1);
      expect(loadPendingEvents("assignment-doubleflush")).toHaveLength(0);
    });
  });
});
