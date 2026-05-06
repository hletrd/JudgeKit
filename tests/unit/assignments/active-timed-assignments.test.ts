import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestEntry } from "@/lib/assignments/contests";

const { getContestsForUserMock, getContestStatusMock } = vi.hoisted(() => ({
  getContestsForUserMock: vi.fn(),
  getContestStatusMock: vi.fn(),
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestsForUser: getContestsForUserMock,
  getContestStatus: getContestStatusMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNow: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

import {
  getActiveTimedAssignments,
  selectActiveTimedAssignments,
} from "@/lib/assignments/active-timed-assignments";

function createContest(overrides: Partial<ContestEntry>): ContestEntry {
  return {
    id: overrides.id ?? "contest-1",
    title: overrides.title ?? "Contest 1",
    description: null,
    groupId: overrides.groupId ?? "group-1",
    groupName: overrides.groupName ?? "Group 1",
    examMode: overrides.examMode ?? "scheduled",
    examDurationMinutes: overrides.examDurationMinutes ?? 60,
    scoringModel: overrides.scoringModel ?? "ioi",
    startsAt: overrides.startsAt === undefined ? new Date("2026-04-15T01:00:00.000Z") : overrides.startsAt,
    deadline: overrides.deadline === undefined ? new Date("2026-04-15T03:00:00.000Z") : overrides.deadline,
    freezeLeaderboardAt: null,
    enableAntiCheat: false,
    problemCount: 3,
    startedAt: overrides.startedAt === undefined ? null : overrides.startedAt,
    personalDeadline: overrides.personalDeadline === undefined ? null : overrides.personalDeadline,
  };
}

describe("selectActiveTimedAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps only contests that are actively being taken and sorts by deadline", () => {
    const contests = [
      createContest({
        id: "scheduled-open",
        title: "Scheduled Open",
        deadline: new Date("2026-04-15T05:30:00.000Z"),
      }),
      createContest({
        id: "windowed-running",
        title: "Windowed Running",
        examMode: "windowed",
        startedAt: new Date("2026-04-15T04:10:00.000Z"),
        personalDeadline: new Date("2026-04-15T05:10:00.000Z"),
      }),
      createContest({
        id: "windowed-open",
        title: "Windowed Not Started",
        examMode: "windowed",
        startedAt: null,
        personalDeadline: null,
      }),
      createContest({
        id: "scheduled-closed",
        title: "Scheduled Closed",
        deadline: new Date("2026-04-15T04:00:00.000Z"),
      }),
    ];

    getContestStatusMock.mockImplementation((contest: ContestEntry) => {
      if (contest.id === "scheduled-open") return "open";
      if (contest.id === "windowed-running") return "in_progress";
      if (contest.id === "windowed-open") return "open";
      return "closed";
    });

    expect(selectActiveTimedAssignments(contests, new Date("2026-04-15T04:30:00.000Z"))).toEqual([
      {
        assignmentId: "windowed-running",
        title: "Windowed Running",
        groupName: "Group 1",
        href: "/contests/windowed-running",
        mode: "windowed",
        startedAt: "2026-04-15T04:10:00.000Z",
        deadline: "2026-04-15T05:10:00.000Z",
      },
      {
        assignmentId: "scheduled-open",
        title: "Scheduled Open",
        groupName: "Group 1",
        href: "/contests/scheduled-open",
        mode: "scheduled",
        startedAt: "2026-04-15T01:00:00.000Z",
        deadline: "2026-04-15T05:30:00.000Z",
      },
    ]);
  });

  it("drops entries missing a valid startedAt or deadline source", () => {
    getContestStatusMock.mockReturnValue("open");

    expect(
      selectActiveTimedAssignments([
        createContest({ id: "missing-start", startsAt: null, deadline: new Date("2026-04-15T05:30:00.000Z") }),
      ], new Date())
    ).toEqual([]);
  });
});

describe("getActiveTimedAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads contests for the user and maps them through the selector", async () => {
    const contests = [createContest({ id: "scheduled-open" })];
    getContestsForUserMock.mockResolvedValue(contests);
    getContestStatusMock.mockReturnValue("open");

    await expect(
      getActiveTimedAssignments("user-1", "student", new Date("2026-04-15T04:30:00.000Z"))
    ).resolves.toEqual([
      {
        assignmentId: "scheduled-open",
        title: "Contest 1",
        groupName: "Group 1",
        href: "/contests/scheduled-open",
        mode: "scheduled",
        startedAt: "2026-04-15T01:00:00.000Z",
        deadline: "2026-04-15T03:00:00.000Z",
      },
    ]);

    expect(getContestsForUserMock).toHaveBeenCalledWith("user-1", "student");
  });
});
