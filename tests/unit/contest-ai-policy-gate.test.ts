import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate hook for the per-contest AI override (aiAssistantPolicy). Exercises
// isAiAssistantEnabledForContext across the three policy states plus the staff
// bypass, mocking the DB / settings / capability layers it resolves through.
const {
  rawQueryOneMock,
  assignmentsFindFirstMock,
  recruitingFindFirstMock,
  getResolvedPlatformModeMock,
  getSystemSettingsMock,
  getEffectiveModeRestrictionsMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  rawQueryOneMock: vi.fn(),
  assignmentsFindFirstMock: vi.fn(),
  recruitingFindFirstMock: vi.fn(),
  getResolvedPlatformModeMock: vi.fn(),
  getSystemSettingsMock: vi.fn(),
  getEffectiveModeRestrictionsMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      recruitingInvitations: { findFirst: recruitingFindFirstMock },
      assignments: { findFirst: assignmentsFindFirstMock },
    },
  },
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedPlatformMode: getResolvedPlatformModeMock,
  getSystemSettings: getSystemSettingsMock,
  getEffectiveModeRestrictions: getEffectiveModeRestrictionsMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

const CONTEST_ASSIGNMENT_ID = "contest-1";

async function importGate() {
  return (await import("@/lib/platform-mode-context")).isAiAssistantEnabledForContext;
}

describe("isAiAssistantEnabledForContext — per-contest AI override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Participant with an active restricted contest in scope.
    rawQueryOneMock.mockResolvedValue({ assignmentId: CONTEST_ASSIGNMENT_ID });
    recruitingFindFirstMock.mockResolvedValue(null);
    getResolvedPlatformModeMock.mockResolvedValue("homework");
    getSystemSettingsMock.mockResolvedValue({ aiAssistantEnabled: true });
    // Default: no admin opt-out, so a restricted mode forces AI off. The
    // per-contest allow override must win over this.
    getEffectiveModeRestrictionsMock.mockResolvedValue({
      restrictAiByDefault: true,
      restrictStandaloneCompiler: true,
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set<string>());
  });

  it("returns false for a forbid contest (participant), overriding the global allow", async () => {
    assignmentsFindFirstMock.mockResolvedValue({
      examMode: "windowed",
      aiAssistantPolicy: "forbid",
    });
    // Even if the admin opted OUT of the restricted-mode restriction, forbid wins.
    getEffectiveModeRestrictionsMock.mockResolvedValue({
      restrictAiByDefault: false,
      restrictStandaloneCompiler: false,
    });

    const isAiAssistantEnabledForContext = await importGate();
    await expect(
      isAiAssistantEnabledForContext({
        userId: "student-1",
        assignmentId: CONTEST_ASSIGNMENT_ID,
      })
    ).resolves.toBe(false);
    // forbid short-circuits before the mode-restriction fall-through.
    expect(getEffectiveModeRestrictionsMock).not.toHaveBeenCalled();
  });

  it("returns true for an allow contest even when restricted mode forbids AI by default", async () => {
    assignmentsFindFirstMock.mockResolvedValue({
      examMode: "windowed",
      aiAssistantPolicy: "allow",
    });
    // restrictAiByDefault stays true (admin did NOT opt out); allow must win.

    const isAiAssistantEnabledForContext = await importGate();
    await expect(
      isAiAssistantEnabledForContext({
        userId: "student-1",
        assignmentId: CONTEST_ASSIGNMENT_ID,
      })
    ).resolves.toBe(true);
    expect(getEffectiveModeRestrictionsMock).not.toHaveBeenCalled();
  });

  it("still honours the master aiAssistantEnabled kill switch under an allow contest", async () => {
    assignmentsFindFirstMock.mockResolvedValue({
      examMode: "windowed",
      aiAssistantPolicy: "allow",
    });
    getSystemSettingsMock.mockResolvedValue({ aiAssistantEnabled: false });

    const isAiAssistantEnabledForContext = await importGate();
    await expect(
      isAiAssistantEnabledForContext({
        userId: "student-1",
        assignmentId: CONTEST_ASSIGNMENT_ID,
      })
    ).resolves.toBe(false);
  });

  it("falls through to the mode restriction for an inherit contest", async () => {
    assignmentsFindFirstMock.mockResolvedValue({
      examMode: "windowed",
      aiAssistantPolicy: "inherit",
    });
    // restrictAiByDefault true → restricted mode forces AI off via the shared
    // getEffectiveModeRestrictions path (proving the inherit fall-through).

    const isAiAssistantEnabledForContext = await importGate();
    await expect(
      isAiAssistantEnabledForContext({
        userId: "student-1",
        assignmentId: CONTEST_ASSIGNMENT_ID,
      })
    ).resolves.toBe(false);
    expect(getEffectiveModeRestrictionsMock).toHaveBeenCalledWith("contest", expect.anything());
  });

  it("enables AI for an inherit contest when the mode does not restrict by default", async () => {
    assignmentsFindFirstMock.mockResolvedValue({
      examMode: "windowed",
      aiAssistantPolicy: "inherit",
    });
    getEffectiveModeRestrictionsMock.mockResolvedValue({
      restrictAiByDefault: false,
      restrictStandaloneCompiler: false,
    });

    const isAiAssistantEnabledForContext = await importGate();
    await expect(
      isAiAssistantEnabledForContext({
        userId: "student-1",
        assignmentId: CONTEST_ASSIGNMENT_ID,
      })
    ).resolves.toBe(true);
  });

  it("keeps the staff bypass winning over a forbid contest", async () => {
    // Staff hold submissions.view_all → bypass returns before any policy read.
    resolveCapabilitiesMock.mockResolvedValue(new Set(["submissions.view_all"]));
    assignmentsFindFirstMock.mockResolvedValue({
      examMode: "windowed",
      aiAssistantPolicy: "forbid",
    });

    const isAiAssistantEnabledForContext = await importGate();
    await expect(
      isAiAssistantEnabledForContext({
        userId: "instructor-1",
        userRole: "instructor",
        assignmentId: CONTEST_ASSIGNMENT_ID,
      })
    ).resolves.toBe(true);
    // The bypass short-circuits before resolving the contest or its policy.
    expect(rawQueryOneMock).not.toHaveBeenCalled();
    expect(assignmentsFindFirstMock).not.toHaveBeenCalled();
  });
});
