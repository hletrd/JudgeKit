import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  resolveCapabilitiesMock,
  hasGroupInstructorRoleMock,
  getDbNowUncachedMock,
  antiCheatLatestEventLimitMock,
  antiCheatSelectWhereMock,
  antiCheatInsertMock,
  antiCheatInsertValuesMock,
} = vi.hoisted(() => {
  // Chainable mock for the anti-cheat freshness probe:
  //   db.select({...}).from(...).where(...).orderBy(...).limit(1)
  const antiCheatLatestEventLimitMock = vi.fn();
  const antiCheatSelectWhereMock = vi.fn(() => ({
    orderBy: vi.fn(() => ({ limit: antiCheatLatestEventLimitMock })),
  }));
  // db.insert(antiCheatEvents).values({...}).catch(...) — values must return
  // a real Promise so the production .catch() attaches.
  const antiCheatInsertValuesMock = vi.fn();
  const antiCheatInsertMock = vi.fn(() => ({ values: antiCheatInsertValuesMock }));
  return {
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
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: antiCheatSelectWhereMock })),
      })),
      insert: antiCheatInsertMock,
    },
    resolveCapabilitiesMock: vi.fn(),
    hasGroupInstructorRoleMock: vi.fn(),
    getDbNowUncachedMock: vi.fn(),
    antiCheatLatestEventLimitMock,
    antiCheatSelectWhereMock,
    antiCheatInsertMock,
    antiCheatInsertValuesMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNow: vi.fn(),
  getDbNowUncached: getDbNowUncachedMock,
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
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-03-10T00:00:00.000Z"));
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
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-03-10T03:00:00.000Z"));
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
      staleHeartbeat: null,
    });
    expect(dbMock.query.enrollments.findFirst).not.toHaveBeenCalled();
  });

  it("allows a windowed-exam participant with an EXTENDED personal window to submit past the assignment close (RPF cycle-1 AGG-5)", async () => {
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-03-10T03:00:00.000Z"));
    dbMock.query.assignments.findFirst.mockResolvedValue({
      ...createAssignmentRecord({
        deadline: new Date("2026-03-10T01:00:00.000Z"),
      }),
      examMode: "windowed",
      enableAntiCheat: false,
    });
    // Staff granted an extension: personal window runs to 04:00, past the close.
    dbMock.query.examSessions.findFirst.mockResolvedValue({
      personalDeadline: new Date("2026-03-10T04:00:00.000Z"),
    });
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
      staleHeartbeat: null,
    });
  });

  it("still rejects past the close when the personal exam window ALSO expired", async () => {
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-03-10T03:00:00.000Z"));
    dbMock.query.assignments.findFirst.mockResolvedValue({
      ...createAssignmentRecord({
        deadline: new Date("2026-03-10T01:00:00.000Z"),
      }),
      examMode: "windowed",
      enableAntiCheat: false,
    });
    dbMock.query.examSessions.findFirst.mockResolvedValue({
      personalDeadline: new Date("2026-03-10T02:00:00.000Z"),
    });
    dbMock.query.enrollments.findFirst.mockResolvedValue({ id: "enrollment-1" });
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue({ id: "assignment-problem-1" });

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "assignmentClosed",
    });
  });

  it("does not let a NON-exam assignment slip past the close via the exam-session path", async () => {
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-03-10T03:00:00.000Z"));
    dbMock.query.assignments.findFirst.mockResolvedValue({
      ...createAssignmentRecord({
        deadline: new Date("2026-03-10T01:00:00.000Z"),
      }),
      examMode: "none",
      enableAntiCheat: false,
    });
    // Even if a stray session row existed, examMode none must never consult it.
    dbMock.query.examSessions.findFirst.mockResolvedValue({
      personalDeadline: new Date("2026-03-10T04:00:00.000Z"),
    });

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "assignmentClosed",
    });
    expect(dbMock.query.examSessions.findFirst).not.toHaveBeenCalled();
  });

  it("accepts enrolled students on linked problems during the active window", async () => {
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-03-10T01:30:00.000Z"));
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
      staleHeartbeat: null,
    });
  });
});

// RPF cycle-6 AGG6-1: the token-as-enrollment gate must enforce the shared
// validity rule — an expired token previously passed THIS gate while every
// raw-SQL surface (catalog, platform mode, anti-cheat ingest) rejected it.
describe("validateAssignmentSubmission — contest access-token validity (AGG6-1)", () => {
  const NOW = new Date("2026-03-10T00:00:00.000Z");

  function setupUnenrolledActiveAssignment() {
    getDbNowUncachedMock.mockResolvedValue(NOW);
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({ deadline: new Date("2026-03-10T02:00:00.000Z") })
    );
    dbMock.query.enrollments.findFirst.mockResolvedValue(undefined);
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue({ id: "ap-1" });
  }

  it("denies an EXPIRED contest access token (enrollment required)", async () => {
    setupUnenrolledActiveAssignment();
    dbMock.query.contestAccessTokens.findFirst.mockResolvedValue({
      id: "token-1",
      expiresAt: new Date(NOW.getTime() - 1_000),
    });

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "assignmentEnrollmentRequired",
    });
  });

  it("accepts a VALID (unexpired) token as the enrollment alternative", async () => {
    setupUnenrolledActiveAssignment();
    dbMock.query.contestAccessTokens.findFirst.mockResolvedValue({
      id: "token-1",
      expiresAt: new Date(NOW.getTime() + 60_000),
    });

    await expect(
      validateAssignmentSubmission("assignment-1", "problem-1", "student-1", "student")
    ).resolves.toEqual({
      ok: true,
      assignment: {
        id: "assignment-1",
        groupId: "group-1",
        instructorId: "instructor-1",
      },
      staleHeartbeat: null,
    });
  });

  it("accepts a token without expiry (open-ended grant)", async () => {
    setupUnenrolledActiveAssignment();
    dbMock.query.contestAccessTokens.findFirst.mockResolvedValue({
      id: "token-1",
      expiresAt: null,
    });

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-1", "student-1", "student"
    );
    expect(result.ok).toBe(true);
  });
});

describe("canViewAssignmentSubmissions", () => {
  it("rejects null assignment IDs and roles without submission-review capabilities", async () => {
    await expect(canViewAssignmentSubmissions(null, "student-1", "student")).resolves.toBe(
      false
    );
    await expect(
      canViewAssignmentSubmissions("assignment-1", "student-1", "student")
    ).resolves.toBe(false);
  });

  it("allows roles with submissions.view_all without needing assignment ownership", async () => {
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
    expect(hasGroupInstructorRoleMock).not.toHaveBeenCalled();
  });

  it("rejects assignment-status reviewers who do not actually instruct the group", async () => {
    dbMock.query.assignments.findFirst.mockResolvedValue(
      createAssignmentRecord({ instructorId: "instructor-2" })
    );
    hasGroupInstructorRoleMock.mockResolvedValue(false);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["assignments.view_status"]));

    await expect(
      canViewAssignmentSubmissions("assignment-1", "reviewer-1", "custom_reviewer")
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

// RPF cycle-4 AGG4-1/AGG4-2 → cycle-5 AGG5-1: the freshness probe runs for
// the SUBMIT path only (explicit opt-in), consults client-emitted events
// only, and is READ-ONLY — the validator returns the staleness verdict and
// NEVER inserts the escalate flag itself (recording is the submit route's
// job after the submission is accepted, so rejected attempts cannot
// fabricate evidence). The probe's event-type filter itself is pinned
// structurally in tests/unit/api/anti-cheat-public-event-types.test.ts.
describe("validateAssignmentSubmission — anti-cheat heartbeat correlation (AGG4-1/AGG5-1)", () => {
  const NOW = new Date("2026-03-10T00:00:00.000Z");

  function createExamAssignmentRecord() {
    return {
      id: "assignment-1",
      groupId: "group-1",
      startsAt: null,
      deadline: new Date("2026-03-10T02:00:00.000Z"),
      lateDeadline: null,
      examMode: "scheduled",
      enableAntiCheat: true,
      examDurationMinutes: null,
      group: { instructorId: "instructor-1" },
    };
  }

  function setupActiveExam() {
    getDbNowUncachedMock.mockResolvedValue(NOW);
    dbMock.query.assignments.findFirst.mockResolvedValue(createExamAssignmentRecord());
    dbMock.query.enrollments.findFirst.mockResolvedValue({ id: "enrollment-1" });
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue({ id: "ap-1" });
    antiCheatInsertValuesMock.mockResolvedValue(undefined);
  }

  it("probe with NO client event at all returns a stale verdict, accepts, and NEVER writes", async () => {
    setupActiveExam();
    antiCheatLatestEventLimitMock.mockResolvedValue([]);

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-1", "student-1", "student",
      { probeStaleHeartbeat: true }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.staleHeartbeat).toEqual({
        latestEventAt: null,
        ageMs: null,
        thresholdMs: 90_000,
      });
    }
    // AGG5-1 pin: the validator must not insert the escalate flag — that is
    // the submit route's job AFTER the submission is accepted.
    expect(antiCheatInsertMock).not.toHaveBeenCalled();
  });

  it("probe with an event older than the threshold returns its age in the verdict", async () => {
    setupActiveExam();
    antiCheatLatestEventLimitMock.mockResolvedValue([
      { createdAt: new Date(NOW.getTime() - 300_000) },
    ]);

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-1", "student-1", "student",
      { probeStaleHeartbeat: true }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.staleHeartbeat).toEqual({
        latestEventAt: NOW.getTime() - 300_000,
        ageMs: 300_000,
        thresholdMs: 90_000,
      });
    }
    expect(antiCheatInsertMock).not.toHaveBeenCalled();
  });

  it("probe with a fresh client event returns a null verdict", async () => {
    setupActiveExam();
    antiCheatLatestEventLimitMock.mockResolvedValue([
      { createdAt: new Date(NOW.getTime() - 30_000) },
    ]);

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-1", "student-1", "student",
      { probeStaleHeartbeat: true }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.staleHeartbeat).toBeNull();
    }
    expect(antiCheatInsertMock).not.toHaveBeenCalled();
  });

  it("validation-only callers (page render, autosave snapshot) never probe nor flag", async () => {
    setupActiveExam();

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-1", "student-1", "student"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.staleHeartbeat ?? null).toBeNull();
    }
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(antiCheatInsertMock).not.toHaveBeenCalled();
  });

  it("a problem-mismatch rejection after a stale probe yields NO flag and NO verdict to act on (AGG5-1)", async () => {
    setupActiveExam();
    antiCheatLatestEventLimitMock.mockResolvedValue([]);
    // The submitted problem does not belong to the assignment.
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue(undefined);

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-bogus", "student-1", "student",
      { probeStaleHeartbeat: true }
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "assignmentProblemMismatch",
    });
    // The rejected attempt must not fabricate escalate-tier evidence.
    expect(antiCheatInsertMock).not.toHaveBeenCalled();
  });

  it("probe stays off entirely when anti-cheat is disabled, even on the submit path", async () => {
    getDbNowUncachedMock.mockResolvedValue(NOW);
    dbMock.query.assignments.findFirst.mockResolvedValue({
      ...createExamAssignmentRecord(),
      enableAntiCheat: false,
    });
    dbMock.query.enrollments.findFirst.mockResolvedValue({ id: "enrollment-1" });
    dbMock.query.assignmentProblems.findFirst.mockResolvedValue({ id: "ap-1" });

    const result = await validateAssignmentSubmission(
      "assignment-1", "problem-1", "student-1", "student",
      { probeStaleHeartbeat: true }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.staleHeartbeat).toBeNull();
    }
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(antiCheatInsertMock).not.toHaveBeenCalled();
  });
});
