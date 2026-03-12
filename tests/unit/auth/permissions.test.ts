import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/types";

const { authMock, canViewAssignmentSubmissionsMock, dbMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewAssignmentSubmissionsMock: vi.fn(),
  dbMock: {
    query: {
      groups: {
        findFirst: vi.fn(),
      },
      enrollments: {
        findFirst: vi.fn(),
      },
      problems: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
  },
}));

vi.mock("@/lib/auth/index", () => ({
  auth: authMock,
}));

vi.mock("@/lib/assignments/submissions", () => ({
  canViewAssignmentSubmissions: canViewAssignmentSubmissionsMock,
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

import {
  assertRole,
  canAccessGroup,
  canAccessProblem,
  canAccessSubmission,
  getAccessibleProblemIds,
} from "@/lib/auth/permissions";

function createSelectResult<T>(result: T[]) {
  // Build a "thenable array" that can be awaited directly (resolves to result[])
  // AND has .limit().then() chaining for canAccessProblem's pattern.
  function makeLimitChain() {
    return {
      limit: vi.fn(() => ({
        then: vi.fn((resolve: (rows: T[]) => unknown) => Promise.resolve(resolve(result))),
      })),
    };
  }

  function makeWhereResult(): ReturnType<typeof makeLimitChain> & Promise<T[]> {
    const limitChain = makeLimitChain();
    const promise = Promise.resolve(result);
    return Object.assign(promise, limitChain) as ReturnType<typeof makeLimitChain> & Promise<T[]>;
  }

  return {
    from: vi.fn(() => ({
      where: vi.fn(() => makeWhereResult()),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => makeWhereResult()),
      })),
    })),
  };
}

function createSession(role: UserRole) {
  return {
    user: {
      id: "user-1",
      role,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.select.mockReset();
});

describe("assertRole", () => {
  it("returns the active session when the role is allowed", async () => {
    authMock.mockResolvedValue(createSession("admin"));

    await expect(assertRole("admin", "super_admin")).resolves.toMatchObject({
      user: { role: "admin" },
    });
  });

  it("rejects authenticated users outside the allowed role set", async () => {
    authMock.mockResolvedValue(createSession("student"));

    await expect(assertRole("admin")).rejects.toThrow("Forbidden");
  });
});

describe("canAccessGroup", () => {
  it("allows the owning instructor to access the group", async () => {
    dbMock.query.groups.findFirst.mockResolvedValue({ instructorId: "user-1" });

    await expect(canAccessGroup("group-1", "user-1", "instructor")).resolves.toBe(true);
  });

  it("falls back to enrollment membership for non-owners", async () => {
    dbMock.query.groups.findFirst.mockResolvedValue({ instructorId: "instructor-2" });
    dbMock.query.enrollments.findFirst.mockResolvedValue({ id: "enrollment-1" });

    await expect(canAccessGroup("group-1", "user-1", "student")).resolves.toBe(true);
  });

  it("returns false when the group does not exist", async () => {
    dbMock.query.groups.findFirst.mockResolvedValue(null);

    await expect(canAccessGroup("missing-group", "user-1", "student")).resolves.toBe(false);
  });
});

describe("canAccessProblem", () => {
  it("allows public problems without group lookups", async () => {
    // First select: problem lookup returns public problem
    dbMock.select.mockReturnValueOnce(
      createSelectResult([{ visibility: "public", authorId: "author-2" }])
    );

    await expect(canAccessProblem("problem-1", "user-1", "student")).resolves.toBe(true);
    // Only one select call (the problem lookup) — no group lookup needed
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("allows shared hidden problems through enrolled groups", async () => {
    // First select: problem lookup
    dbMock.select.mockReturnValueOnce(
      createSelectResult([{ visibility: "hidden", authorId: "author-2" }])
    );
    // Second select: JOIN query for group access returns a row
    dbMock.select.mockReturnValueOnce(
      createSelectResult([{ groupId: "group-1" }])
    );

    await expect(canAccessProblem("problem-1", "user-1", "student")).resolves.toBe(true);
  });

  it("returns false for restricted problems without a matching group", async () => {
    // First select: problem lookup
    dbMock.select.mockReturnValueOnce(
      createSelectResult([{ visibility: "private", authorId: "author-2" }])
    );
    // Second select: JOIN query returns no rows
    dbMock.select.mockReturnValueOnce(createSelectResult([]));

    await expect(canAccessProblem("problem-1", "user-1", "student")).resolves.toBe(false);
  });

  it("allows authors to access their own restricted problems", async () => {
    // First select: problem lookup — author matches userId
    dbMock.select.mockReturnValueOnce(
      createSelectResult([{ visibility: "private", authorId: "user-1" }])
    );

    await expect(canAccessProblem("problem-1", "user-1", "student")).resolves.toBe(true);
    // Only one select call (the problem lookup) — no group lookup needed for author
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });
});

describe("getAccessibleProblemIds", () => {
  it("collects public, authored, and group-shared problems in one batch", async () => {
    dbMock.select
      .mockReturnValueOnce(createSelectResult([{ groupId: "group-1" }]))
      .mockReturnValueOnce(
        createSelectResult([
          { problemId: "shared-problem", groupId: "group-1" },
          { problemId: "blocked-problem", groupId: "group-2" },
        ])
      );

    const accessible = await getAccessibleProblemIds("user-1", "student", [
      { id: "public-problem", visibility: "public", authorId: "author-2" },
      { id: "authored-problem", visibility: "hidden", authorId: "user-1" },
      { id: "shared-problem", visibility: "private", authorId: "author-2" },
      { id: "blocked-problem", visibility: "private", authorId: "author-2" },
    ]);

    expect(accessible).toEqual(
      new Set(["public-problem", "authored-problem", "shared-problem"])
    );
  });
});

describe("canAccessSubmission", () => {
  it("allows admins and submission owners without assignment lookups", async () => {
    await expect(
      canAccessSubmission({ userId: "student-1", assignmentId: null }, "admin-1", "admin")
    ).resolves.toBe(true);
    await expect(
      canAccessSubmission(
        { userId: "student-1", assignmentId: "assignment-1" },
        "student-1",
        "student"
      )
    ).resolves.toBe(true);
    expect(canViewAssignmentSubmissionsMock).not.toHaveBeenCalled();
  });

  it("defers to assignment visibility for non-owner submissions", async () => {
    canViewAssignmentSubmissionsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      canAccessSubmission(
        { userId: "student-2", assignmentId: "assignment-1" },
        "instructor-1",
        "instructor"
      )
    ).resolves.toBe(true);

    await expect(
      canAccessSubmission(
        { userId: "student-2", assignmentId: "assignment-1" },
        "instructor-1",
        "instructor"
      )
    ).resolves.toBe(false);
  });
});
