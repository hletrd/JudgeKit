import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, resolveCapabilitiesMock, hasGroupInstructorRoleMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      assignments: {
        findFirst: vi.fn(),
      },
      enrollments: {
        findFirst: vi.fn(),
      },
      assignmentProblems: {
        findFirst: vi.fn(),
      },
      contestAccessTokens: {
        findFirst: vi.fn(),
      },
      examSessions: {
        findFirst: vi.fn(),
      },
    },
  },
  resolveCapabilitiesMock: vi.fn(),
  hasGroupInstructorRoleMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
  invalidateRoleCache: vi.fn(),
  getRoleLevel: vi.fn().mockResolvedValue(0),
  isValidRole: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/assignments/management", () => ({
  hasGroupInstructorRole: hasGroupInstructorRoleMock,
}));

import {
  canViewAssignmentSubmissions,
  validateAssignmentSubmission,
} from "@/lib/assignments/submissions";

function createAssignmentRecord(overrides?: {
  instructorId?: string | null;
  startsAt?: Date | null;
  deadline?: Date | null;
  lateDeadline?: Date | null;
}) {
  return {
    id: "assignment-1",
    groupId: "group-1",
    startsAt: overrides?.startsAt ?? null,
    deadline: overrides?.deadline ?? null,
    lateDeadline: overrides?.lateDeadline ?? null,
    group: {
      instructorId: overrides?.instructorId ?? "instructor-1",
    },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  resolveCapabilitiesMock.mockImplementation(async (role: string) => {
    const { DEFAULT_ROLE_CAPABILITIES } = await import("@/lib/capabilities/defaults");
    const caps = DEFAULT_ROLE_CAPABILITIES[role as keyof typeof DEFAULT_ROLE_CAPABILITIES];
    return new Set(caps ?? []);
  });
  hasGroupInstructorRoleMock.mockResolvedValue(false);
});

describe("validateAssignmentSubmission", () => {
  it("rejects blank assignment IDs before hitting the database", async () => {
    await expect(
      validateAssignmentSubmission("   ", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalidAssignmentId",
    });
  });

  it("rejects students before the assignment start time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-10T00:00:00.000Z").valueOf());
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({
        startsAt: new Date("2026-03-10T01:00:00.000Z"),
      })
    );

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "assignmentNotStarted",
    });
  });

  it("returns assignmentNotFound when the assignment lookup misses", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(null);

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: "assignmentNotFound",
    });
  });

  it("rejects students after the late deadline closes", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-10T03:00:00.000Z").valueOf());
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({
        deadline: new Date("2026-03-10T01:00:00.000Z"),
        lateDeadline: new Date("2026-03-10T02:00:00.000Z"),
      })
    );

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "assignmentClosed",
    });
  });

  it("requires group enrollment for non-admin submissions", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(createAssignmentRecord());
    dbMock.query.enrollments.findFirst.mockResolvedValue(null);

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "assignmentEnrollmentRequired",
    });
  });

  it("rejects assignment problems that are not linked to the assignment", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(createAssignmentRecord());
    dbMock.query.enrollments.findFirst.mockResolvedValue({ id: "enrollment-1" });
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue(null);

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "assignmentProblemMismatch",
    });
  });

  it("lets admins bypass schedule and enrollment checks for linked problems", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({
        startsAt: new Date("2026-03-10T05:00:00.000Z"),
        deadline: new Date("2026-03-10T06:00:00.000Z"),
      })
    );
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue({ id: "assignment-problem-1" });

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "admin-1", "admin")
    ).resolves.toEqual({
      ok: true,
      assignment: {
        id: "assignment-1",
        groupId: "group-1",
        instructorId: "instructor-1",
      },
    });
    expect(dbMock.query.enrollments.findFirst).not.toHaveBeenCalled();
  });

  it("accepts enrolled students on linked problems during the active window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-10T01:30:00.000Z").valueOf());
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({
        startsAt: new Date("2026-03-10T01:00:00.000Z"),
        deadline: new Date("2026-03-10T02:00:00.000Z"),
      })
    );
    dbMock.query.enrollments.findFirst.mockResolvedValue({ id: "enrollment-1" });
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue({ id: "assignment-problem-1" });

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: true,
      assignment: {
        id: "assignment-1",
        groupId: "group-1",
        instructorId: "instructor-1",
      },
    });
  });
});

describe("canViewAssignmentSubmissions", () => {
  it("rejects null assignment IDs and non-instructor roles", async () => {
    await expect(canViewAssignmentSubmissions(null, "student-1", "student")).resolves.toBe(
      false
    );
    await expect(
      canViewAssignmentSubmissions("assignment-1", "student-1", "student")
    ).resolves.toBe(false);
  });

  it("allows admins and the owning instructor", async () => {
    dbMock.query.assignments.findFirst
      .mockResolvedValueOnce(createAssignmentRecord({ instructorId: "instructor-1" }))
      .mockResolvedValueOnce(createAssignmentRecord({ instructorId: "instructor-1" }));
    hasGroupInstructorRoleMock.mockResolvedValue(true);

    await expect(
      canViewAssignmentSubmissions("assignment-1", "admin-1", "admin")
    ).resolves.toBe(true);
    await expect(
      canViewAssignmentSubmissions("assignment-1", "instructor-1", "instructor")
    ).resolves.toBe(true);
  });

  it("rejects instructors who do not own the assignment", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({ instructorId: "instructor-2" })
    );
    hasGroupInstructorRoleMock.mockResolvedValue(false);

    await expect(
      canViewAssignmentSubmissions("assignment-1", "instructor-1", "instructor")
    ).resolves.toBe(false);
  });

  it("allows co-instructors or TAs with assignment visibility capability", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({ instructorId: "instructor-2" })
    );
    resolveCapabilitiesMock.mockResolvedValue(new Set(["assignments.view_status"]));
    hasGroupInstructorRoleMock.mockResolvedValue(true);

    await expect(
      canViewAssignmentSubmissions("assignment-1", "ta-1", "custom_ta")
    ).resolves.toBe(true);
  });
});
