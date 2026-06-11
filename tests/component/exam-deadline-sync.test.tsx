import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExamDeadlineSync } from "@/components/exam/exam-deadline-sync";

const { apiFetchMock, toastInfoMock, routerRefreshMock, countdownPropsSpy } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastInfoMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  countdownPropsSpy: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("sonner", () => ({
  toast: { info: toastInfoMock },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Spy on the deadline the wrapper passes down; the real CountdownTimer's
// behavior on a deadline-prop change is covered by countdown-timer.test.tsx.
vi.mock("@/components/exam/countdown-timer", () => ({
  CountdownTimer: (props: { deadline: number; label?: string }) => {
    countdownPropsSpy(props);
    return <span data-testid="countdown" data-deadline={props.deadline} />;
  },
}));

const INITIAL_DEADLINE = new Date("2026-01-01T01:00:00.000Z").getTime();
const EXTENDED_ISO = "2026-01-01T01:20:00.000Z";
const EXTENDED_MS = new Date(EXTENDED_ISO).getTime();

function mockSessionResponse(personalDeadline: string | null) {
  apiFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: personalDeadline ? { personalDeadline } : null }),
  });
}

function renderSync() {
  return render(
    <ExamDeadlineSync
      groupId="group-1"
      assignmentId="assignment-1"
      initialDeadline={INITIAL_DEADLINE}
      label="examTimeRemaining"
    />
  );
}

describe("ExamDeadlineSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the countdown with the initial deadline and no extension note", () => {
    mockSessionResponse(null);
    renderSync();

    expect(screen.getByTestId("countdown").getAttribute("data-deadline")).toBe(
      String(INITIAL_DEADLINE)
    );
    expect(screen.queryByRole("status")).toBeNull();
    // No refetch storm: nothing is fetched before the first interval tick.
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("extends the countdown, announces, and refreshes when the server returns a LATER deadline", async () => {
    mockSessionResponse(EXTENDED_ISO);
    renderSync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/groups/group-1/assignments/assignment-1/exam-session"
    );
    expect(screen.getByTestId("countdown").getAttribute("data-deadline")).toBe(
      String(EXTENDED_MS)
    );
    expect(screen.getByRole("status").textContent).toBe("examDeadlineExtended");
    expect(toastInfoMock).toHaveBeenCalledWith("examDeadlineExtended");
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("ignores an EARLIER deadline from a refetch (extension-only contract)", async () => {
    mockSessionResponse("2026-01-01T00:30:00.000Z");
    renderSync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByTestId("countdown").getAttribute("data-deadline")).toBe(
      String(INITIAL_DEADLINE)
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(toastInfoMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("refetches on visibilitychange to visible", async () => {
    mockSessionResponse(EXTENDED_ISO);
    renderSync();

    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      // Let the in-flight refresh promise settle.
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("countdown").getAttribute("data-deadline")).toBe(
      String(EXTENDED_MS)
    );
  });

  it("keeps the current deadline when the refetch fails (offline-safe)", async () => {
    apiFetchMock.mockRejectedValue(new Error("offline"));
    renderSync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByTestId("countdown").getAttribute("data-deadline")).toBe(
      String(INITIAL_DEADLINE)
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("polls on a slow interval (one fetch per 60s tick, no storm)", async () => {
    mockSessionResponse(null);
    renderSync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });
});
