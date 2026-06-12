import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AntiCheatMonitor } from "@/components/exam/anti-cheat-monitor";
import {
  loadInflightEvent,
  loadPendingEvents,
  saveInflightEvent,
  savePendingEvents,
} from "@/components/exam/anti-cheat-storage";

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

      // Queue-first reportEvent (AGG6-2) leaves the mount heartbeat queued
      // behind the in-flight flush; the backoff timer drains it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      const copySends = apiFetchMock.mock.calls.filter((call) => eventTypeOf(call) === "copy");
      expect(copySends).toHaveLength(1);
      expect(loadPendingEvents("assignment-doubleflush")).toHaveLength(0);
    });
  });

  // RPF cycle-5 AGG5-4: the claim loop must never create an unload window in
  // which an event exists in neither the queue nor storage. The claimed event
  // sits in a crash-recovery slot during the send; a slot orphaned by a hard
  // navigation is re-queued and re-sent on the next flush.
  describe("in-flight crash recovery (AGG5-4)", () => {
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

    it("re-queues and re-sends an event orphaned in the in-flight slot by a previous unload", async () => {
      // Simulate a prior session that claimed "copy" and died mid-send.
      saveInflightEvent("assignment-orphan", {
        eventType: "copy",
        timestamp: 1,
        retries: 1,
      });

      await acceptNoticeAndRender("assignment-orphan");

      // Queue-first reportEvent (AGG6-2): the mount heartbeat may still be
      // queued behind the recovery flush; the backoff timer drains it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      const copySends = apiFetchMock.mock.calls.filter((call) => eventTypeOf(call) === "copy");
      expect(copySends).toHaveLength(1);
      expect(loadInflightEvent("assignment-orphan")).toBeNull();
      expect(loadPendingEvents("assignment-orphan")).toHaveLength(0);
    });

    it("keeps the claimed event in the slot for the whole send window, then clears it", async () => {
      savePendingEvents("assignment-window", [
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

      await acceptNoticeAndRender("assignment-window");

      // Mid-send: the claimed copy has left the queue but MUST be in the
      // slot — an unload here loses nothing. (The mount heartbeat may sit
      // queued behind the held send — queue-first reportEvent, AGG6-2.)
      expect(loadPendingEvents("assignment-window").some((e) => e.eventType === "copy")).toBe(false);
      expect(loadInflightEvent("assignment-window")?.eventType).toBe("copy");

      await act(async () => {
        resolveCopySend?.({ ok: true });
        await Promise.resolve();
      });

      // Drain the queue-first mount heartbeat (AGG6-2) so the slot's
      // terminal state is asserted after ALL sends completed.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(loadInflightEvent("assignment-window")).toBeNull();
      expect(loadPendingEvents("assignment-window")).toHaveLength(0);
    });
  });

  // RPF cycle-6 AGG6-2: reportEvent is QUEUE-FIRST — the first transmission
  // of every event must flow through the queue + in-flight slot so no unload
  // window can silently lose it (the cycle-5 slot covered only retries).
  describe("queue-first reportEvent (AGG6-2)", () => {
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

    it("keeps a first-transmission event in the in-flight slot for the whole send window", async () => {
      let resolveBlurSend: ((value: { ok: boolean }) => void) | undefined;
      apiFetchMock.mockImplementation(async (_url: unknown, init: unknown) => {
        const { eventType } = JSON.parse((init as { body: string }).body) as { eventType: string };
        if (eventType === "blur") {
          return new Promise<{ ok: boolean }>((resolve) => {
            resolveBlurSend = resolve;
          });
        }
        return { ok: true };
      });

      await acceptNoticeAndRender("assignment-first-tx");

      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        await Promise.resolve();
      });

      // Mid-send: the blur event MUST be recoverable — in the slot, not in
      // limbo. An unload here loses nothing (the old direct-send shape did).
      expect(loadInflightEvent("assignment-first-tx")?.eventType).toBe("blur");

      await act(async () => {
        resolveBlurSend?.({ ok: true });
        await Promise.resolve();
      });

      const blurSends = apiFetchMock.mock.calls.filter((call) => {
        const init = call[1] as { body: string };
        return (JSON.parse(init.body) as { eventType: string }).eventType === "blur";
      });
      expect(blurSends).toHaveLength(1);
      expect(loadInflightEvent("assignment-first-tx")).toBeNull();
      expect(loadPendingEvents("assignment-first-tx")).toHaveLength(0);
    });
  });

  // RPF cycle-5 AGG5-6: copying HTML content whose nearest CLASSED ancestor
  // is an SVG element (e.g. a label inside <foreignObject> of a classed
  // chart) must not crash the copy listener — SVG `className` is an
  // SVGAnimatedString without `.split`.
  it("reports a copy event when the nearest classed ancestor is an SVG element", async () => {
    render(<AntiCheatMonitor assignmentId="assignment-svg" enabled />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "privacyNoticeAccept" }));
      await Promise.resolve();
    });
    apiFetchMock.mockClear();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chart primary");
    const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    const span = document.createElement("span"); // tagName "SPAN" → classed-ancestor branch
    span.textContent = "axis label";
    foreignObject.appendChild(span);
    svg.appendChild(foreignObject);
    document.body.appendChild(svg);

    await act(async () => {
      fireEvent.copy(span);
      await Promise.resolve();
    });

    const copyCalls = apiFetchMock.mock.calls.filter((call) => {
      const init = call[1] as { body: string };
      return (JSON.parse(init.body) as { eventType: string }).eventType === "copy";
    });
    expect(copyCalls).toHaveLength(1);
    const details = JSON.parse(
      (JSON.parse((copyCalls[0][1] as { body: string }).body) as { details: string }).details
    ) as { target: string };
    expect(details.target).toBe("span in .chart");

    svg.remove();
  });
});
