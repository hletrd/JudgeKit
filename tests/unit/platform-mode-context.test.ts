import { beforeEach, describe, expect, it, vi } from "vitest";

const { rawQueryOneMock, getResolvedPlatformModeMock, getSystemSettingsMock } = vi.hoisted(
  () => ({
    rawQueryOneMock: vi.fn(),
    getResolvedPlatformModeMock: vi.fn(),
    getSystemSettingsMock: vi.fn(),
  })
);

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      recruitingInvitations: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      assignments: {
        findFirst: vi.fn().mockResolvedValue({ examMode: "windowed" }),
      },
    },
  },
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedPlatformMode: getResolvedPlatformModeMock,
  getSystemSettings: getSystemSettingsMock,
}));

describe("platform mode context derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResolvedPlatformModeMock.mockResolvedValue("homework");
    getSystemSettingsMock.mockResolvedValue({ aiAssistantEnabled: true });
  });

  it("derives a restricted assignment from problem context when assignmentId is omitted", async () => {
    rawQueryOneMock.mockResolvedValueOnce({ assignmentId: "assignment-1" });

    const { getEffectivePlatformMode } = await import("@/lib/platform-mode-context");
    await expect(
      getEffectivePlatformMode({
        userId: "student-1",
        assignmentId: null,
        problemId: "problem-1",
      })
    ).resolves.toBe("contest");
  });

  it("derives an active restricted assignment for a user when compiler context omits assignmentId", async () => {
    rawQueryOneMock.mockResolvedValueOnce({ assignmentId: "assignment-2" });

    const { getEffectivePlatformMode } = await import("@/lib/platform-mode-context");
    await expect(
      getEffectivePlatformMode({
        userId: "student-1",
        assignmentId: null,
      })
    ).resolves.toBe("contest");
  });
});
