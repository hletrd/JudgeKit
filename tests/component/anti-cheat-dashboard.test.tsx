import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AntiCheatDashboard } from "@/components/contest/anti-cheat-dashboard";
import { apiFetch, apiFetchJson } from "@/lib/api/client";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    if (namespace === "contests.antiCheat" && key === "signalsDisclaimer") {
      return "These signals are review aids, not proof of misconduct on their own.";
    }
    if (namespace === "contests.antiCheat" && key === "fetchError") return "Fetch error";
    if (namespace === "contests.antiCheat" && key === "retry") return "Retry";
    if (namespace === "contests.antiCheat" && key === "dashboard") return "Anti-Cheat Signals Dashboard";
    if (namespace === "contests.antiCheat" && key === "eventCount") return "{count} events";
    if (namespace === "contests.antiCheat" && key === "noEvents") return "No anti-cheat signals recorded.";
    if (namespace === "contests.antiCheat" && key === "eventTypes.submission_stale_heartbeat") {
      return "Submission while monitor inactive";
    }
    if (namespace === "common" && key === "error") return "Error";
    // Missing-message behavior mirrors next-intl: return the key path —
    // never nullish. The shared label helper must detect this (AGG5-2).
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
    // Test double: fire the polling callback exactly once on mount (the real
    // hook does an immediate tick + interval; the interval is irrelevant here).
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
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
  apiFetchJson: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const apiFetchJsonMock = vi.mocked(apiFetchJson);

function mockEventResponses(events: unknown[]) {
  apiFetchJsonMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("report=ipOverlap")) {
      return { ok: true, data: { data: { sharedIps: [], multiIpUsers: [] } } };
    }
    return { ok: true, data: { data: { events, total: events.length } } };
  });
}

describe("AntiCheatDashboard", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchJsonMock.mockReset();
  });

  it("renders the signals disclaimer", async () => {
    mockEventResponses([]);

    render(<AntiCheatDashboard assignmentId="assignment-1" />);

    expect(
      await screen.findByText(
        "These signals are review aids, not proof of misconduct on their own."
      )
    ).toBeInTheDocument();
  });

  // RPF cycle-5 AGG5-2: the escalate flag must render a translated label
  // (not a raw i18n key path) with red severity styling.
  it("renders a submission_stale_heartbeat event with its translated label and red styling", async () => {
    mockEventResponses([
      {
        id: "evt-1",
        userId: "user-1",
        userName: "Alice",
        username: "alice",
        eventType: "submission_stale_heartbeat",
        details: JSON.stringify({
          latestEventAt: null,
          ageMs: null,
          thresholdMs: 90_000,
          submissionId: "sub-1",
        }),
        ipAddress: "203.0.113.7",
        userAgent: null,
        createdAt: "2026-06-11T00:00:00.000Z",
      },
    ]);

    render(<AntiCheatDashboard assignmentId="assignment-1" />);

    const labels = await screen.findAllByText("Submission while monitor inactive");
    expect(labels.length).toBeGreaterThan(0);
    // No raw key path may leak into the document.
    expect(
      screen.queryByText(/eventTypes\.submission_stale_heartbeat/)
    ).not.toBeInTheDocument();
    // The event-type badge (a non-filter badge renders the row) carries the
    // escalate red tone from the shared presentation module.
    expect(labels.some((el) => el.className.includes("bg-red-100"))).toBe(true);
  });

  // RPF cycle-6 AGG6-3: filter chips must be REAL buttons — reachable by
  // keyboard, exposing pressed state (WCAG 2.1.1 / 4.1.2).
  it("renders filter chips as keyboard-operable buttons with pressed semantics", async () => {
    mockEventResponses([
      {
        id: "evt-1",
        userId: "user-1",
        userName: "Alice",
        username: "alice",
        eventType: "tab_switch",
        details: null,
        ipAddress: null,
        userAgent: null,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
    ]);

    const { fireEvent } = await import("@testing-library/react");
    render(<AntiCheatDashboard assignmentId="assignment-1" />);

    const allChip = await screen.findByRole("button", { name: "contests.antiCheat.allTypes" });
    expect(allChip).toHaveAttribute("aria-pressed", "true");

    // Unknown-locale label falls back to the raw event type (shared helper).
    const typeChip = screen.getByRole("button", { name: "tab_switch" });
    expect(typeChip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(typeChip);
    expect(typeChip).toHaveAttribute("aria-pressed", "true");
    expect(allChip).toHaveAttribute("aria-pressed", "false");
  });
});
