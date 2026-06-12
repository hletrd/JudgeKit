import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ParticipantAntiCheatTimeline } from "@/components/contest/participant-anti-cheat-timeline";
import { apiFetchJson } from "@/lib/api/client";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "contests.antiCheat") {
      switch (key) {
        case "heartbeatGaps.title":
          return "Monitor coverage gaps";
        case "heartbeatGaps.description":
          return "Periods with no heartbeat from the monitored browser (threshold 2 minutes).";
        case "heartbeatGaps.ongoing":
          return "ongoing";
        case "heartbeatGaps.now":
          return "now";
        case "durationMinutesSeconds":
          return `${values?.minutes}m ${values?.seconds}s`;
        case "durationSeconds":
          return `${values?.seconds}s`;
        case "eventCount":
          return `${values?.count} events`;
        case "signalsDisclaimer":
          return "These signals are review aids.";
        default:
          return `${namespace}.${key}`;
      }
    }
    if (namespace === "contests.participantAudit") {
      if (key === "antiCheatTimeline.title") return "Anti-cheat timeline";
      if (key === "antiCheatTimeline.noEvents") return "No events.";
      return `${namespace}.${key}`;
    }
    return `${namespace}.${key}`;
  },
  useLocale: () => "en",
}));

vi.mock("@/contexts/timezone-context", () => ({
  useSystemTimezone: () => "UTC",
}));

vi.mock("@/hooks/use-visibility-polling", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    useVisibilityPolling: (callback: () => void) => {
      const firedRef = useRef(false);
      useEffect(() => {
        if (!firedRef.current) {
          firedRef.current = true;
          callback();
        }
      }, [callback]);
    },
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
  apiFetchJson: vi.fn(),
}));

const apiFetchJsonMock = vi.mocked(apiFetchJson);

describe("ParticipantAntiCheatTimeline", () => {
  beforeEach(() => {
    apiFetchJsonMock.mockReset();
  });

  // RPF cycle-5 AGG5-3/AGG5-4: the timeline requests the opt-in gap scan and
  // renders the coverage-gap card, marking the ongoing absence distinctly.
  it("requests includeGaps=1 and renders heartbeat gaps with the ongoing badge", async () => {
    apiFetchJsonMock.mockResolvedValue({
      ok: true,
      data: {
        data: {
          events: [],
          total: 0,
          heartbeatGaps: [
            {
              userId: "user-1",
              gapStartedAt: "2026-04-12T10:01:00.000Z",
              gapEndedAt: "2026-04-12T10:30:00.000Z",
              gapSeconds: 1740,
            },
            {
              userId: "user-1",
              gapStartedAt: "2026-04-12T10:30:00.000Z",
              gapEndedAt: "2026-04-12T12:00:00.000Z",
              gapSeconds: 5400,
              ongoing: true,
            },
          ],
        },
      },
    });

    render(<ParticipantAntiCheatTimeline assignmentId="assignment-1" userId="user-1" />);

    expect(await screen.findByText("Monitor coverage gaps")).toBeInTheDocument();
    expect(screen.getByText("29m 0s")).toBeInTheDocument();
    expect(screen.getByText("90m 0s")).toBeInTheDocument();
    expect(screen.getByText("ongoing")).toBeInTheDocument();

    const firstCallUrl = String(apiFetchJsonMock.mock.calls[0][0]);
    expect(firstCallUrl).toContain("includeGaps=1");
  });

  it("renders no gap card when the server returns none", async () => {
    apiFetchJsonMock.mockResolvedValue({
      ok: true,
      data: { data: { events: [], total: 0 } },
    });

    render(<ParticipantAntiCheatTimeline assignmentId="assignment-1" userId="user-1" />);

    expect(await screen.findByText("Anti-cheat timeline")).toBeInTheDocument();
    expect(screen.queryByText("Monitor coverage gaps")).not.toBeInTheDocument();
  });

  // RPF cycle-6 AGG6-3: filter chips must be REAL buttons — reachable by
  // keyboard, exposing pressed state (WCAG 2.1.1 / 4.1.2).
  it("renders filter chips as keyboard-operable buttons with pressed semantics", async () => {
    apiFetchJsonMock.mockResolvedValue({
      ok: true,
      data: {
        data: {
          events: [
            {
              id: "evt-1",
              userId: "user-1",
              userName: "Alice",
              username: "alice",
              eventType: "tab_switch",
              details: null,
              ipAddress: null,
              createdAt: "2026-06-12T00:00:00.000Z",
            },
          ],
          total: 1,
        },
      },
    });

    const { fireEvent } = await import("@testing-library/react");
    render(<ParticipantAntiCheatTimeline assignmentId="assignment-1" userId="user-1" />);

    const allChip = await screen.findByRole("button", { name: "contests.antiCheat.allTypes" });
    expect(allChip).toHaveAttribute("aria-pressed", "true");

    const typeChip = screen.getByRole("button", { name: "tab_switch" });
    expect(typeChip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(typeChip);
    expect(typeChip).toHaveAttribute("aria-pressed", "true");
    expect(allChip).toHaveAttribute("aria-pressed", "false");
  });
});
