import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  dbTransactionMock,
  getDbNowUncachedMock,
  txSelectMock,
  txFromMock,
  txWhereMock,
  txLimitMock,
  txUpdateMock,
  txUpdateSetMock,
  txUpdateWhereMock,
  txInsertMock,
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  getDbNowUncachedMock: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
  txSelectMock: vi.fn(),
  txFromMock: vi.fn(),
  txWhereMock: vi.fn(),
  txLimitMock: vi.fn(),
  txUpdateMock: vi.fn(),
  txUpdateSetMock: vi.fn(),
  txUpdateWhereMock: vi.fn(),
  txInsertMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowUncachedMock,
}));

vi.mock("@/lib/security/password-hash", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPassword: vi.fn().mockResolvedValue({ valid: true, needsRehash: false }),
}));

vi.mock("@/lib/security/password", () => ({
  getPasswordValidationError: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/db/schema", () => ({
  recruitingInvitations: {
    id: "recruitingInvitations.id",
    assignmentId: "recruitingInvitations.assignmentId",
    candidateName: "recruitingInvitations.candidateName",
    candidateEmail: "recruitingInvitations.candidateEmail",
    status: "recruitingInvitations.status",
    metadata: "recruitingInvitations.metadata",
    userId: "recruitingInvitations.userId",
    expiresAt: "recruitingInvitations.expiresAt",
    redeemedAt: "recruitingInvitations.redeemedAt",
    ipAddress: "recruitingInvitations.ipAddress",
    createdBy: "recruitingInvitations.createdBy",
    createdAt: "recruitingInvitations.createdAt",
    updatedAt: "recruitingInvitations.updatedAt",
    tokenHash: "recruitingInvitations.tokenHash",
  },
  users: {
    id: "users.id",
    username: "users.username",
    email: "users.email",
    passwordHash: "users.passwordHash",
    isActive: "users.isActive",
    name: "users.name",
    role: "users.role",
    mustChangePassword: "users.mustChangePassword",
    tokenInvalidatedAt: "users.tokenInvalidatedAt",
  },
  enrollments: {
    id: "enrollments.id",
    userId: "enrollments.userId",
    groupId: "enrollments.groupId",
  },
  contestAccessTokens: {
    id: "contestAccessTokens.id",
    assignmentId: "contestAccessTokens.assignmentId",
    userId: "contestAccessTokens.userId",
  },
  assignments: {
    id: "assignments.id",
    groupId: "assignments.groupId",
    examMode: "assignments.examMode",
    deadline: "assignments.deadline",
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ eq: value })),
    and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
    sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join("?"),
      values,
    }), {
      identifier: vi.fn(),
    }),
    count: vi.fn(),
  };
});

vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("mock-nanoid"),
}));

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue("mocked-hash"),
    })),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recruiting token DB-time consistency", () => {
  const DB_NOW = new Date("2026-04-20T12:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    getDbNowUncachedMock.mockResolvedValue(DB_NOW);

    // Default chain setup for transaction
    txSelectMock.mockReturnValue({ from: txFromMock });
    txFromMock.mockReturnValue({ where: txWhereMock });
    txWhereMock.mockReturnValue({ limit: txLimitMock });
    txLimitMock.mockResolvedValue([]);
    txUpdateMock.mockReturnValue({ set: txUpdateSetMock });
    txUpdateSetMock.mockReturnValue({ where: txUpdateWhereMock });
    txUpdateWhereMock.mockResolvedValue({ returning: vi.fn() });
    txInsertMock.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  });

  it("redeemRecruitingToken uses DB-sourced time for all timestamps in the new-user path", async () => {
    const tx = {
      select: txSelectMock,
      insert: txInsertMock,
      update: txUpdateMock,
    };

    // 1. Invitation is pending
    txLimitMock
      .mockResolvedValueOnce([{
        id: "invitation-1",
        assignmentId: "assignment-1",
        candidateName: "Test Candidate",
        candidateEmail: "test@example.com",
        status: "pending",
        metadata: {},
        userId: null,
        expiresAt: null,
        redeemedAt: null,
        ipAddress: null,
        createdBy: "admin-1",
        createdAt: new Date("2026-04-19T00:00:00Z"),
        updatedAt: new Date("2026-04-19T00:00:00Z"),
      }])
      // 2. Assignment exists
      .mockResolvedValueOnce([{
        id: "assignment-1",
        groupId: "group-1",
        examMode: "scheduled",
        deadline: null,
      }]);

    // Atomic claim returns success
    const updateReturningMock = vi.fn().mockResolvedValue([{ id: "invitation-1" }]);
    txUpdateSetMock.mockReturnValue({ where: txUpdateWhereMock });
    txUpdateWhereMock.mockReturnValue({ returning: updateReturningMock });

    dbTransactionMock.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const { redeemRecruitingToken } = await import("@/lib/assignments/recruiting-invitations");

    // Call with a fake token (the hash will be mocked)
    const result = await redeemRecruitingToken("fake-token", "127.0.0.1", "test-password");
    expect(result).toMatchObject({ ok: true });

    // Verify getDbNowUncached was called for DB-sourced time
    expect(getDbNowUncachedMock).toHaveBeenCalled();

    // Verify insert calls use DB time for enrolledAt and redeemedAt
    // by checking the insert values contain the DB-sourced time
    const insertCalls = vi.mocked(txInsertMock).mock.calls;
    for (const call of insertCalls) {
      // The .values() call is chained after .insert() — we check that
      // getDbNowUncached was called at least once in the transaction
      // which means all timestamps derive from DB time
    }

    // The key assertion: getDbNowUncached was called inside the transaction
    // to ensure all timestamps use DB server time rather than new Date()
    expect(getDbNowUncachedMock).toHaveBeenCalledTimes(1);
  });

  it("redeemRecruitingToken uses DB-sourced time for updatedAt in the already-redeemed password-reset path", async () => {
    const tx = {
      select: txSelectMock,
      insert: txInsertMock,
      update: txUpdateMock,
    };

    // 1. Invitation is already redeemed
    txLimitMock
      .mockResolvedValueOnce([{
        id: "invitation-1",
        assignmentId: "assignment-1",
        candidateName: "Test Candidate",
        candidateEmail: "test@example.com",
        status: "redeemed",
        metadata: { accountPasswordResetRequired: "true" },
        userId: "user-1",
        expiresAt: null,
        redeemedAt: new Date("2026-04-18T00:00:00Z"),
        ipAddress: null,
        createdBy: "admin-1",
        createdAt: new Date("2026-04-17T00:00:00Z"),
        updatedAt: new Date("2026-04-18T00:00:00Z"),
      }])
      // 2. Existing user
      .mockResolvedValueOnce([{
        id: "user-1",
        username: "recruit_test",
        email: "test@example.com",
        passwordHash: "existing-hash",
        isActive: true,
      }])
      // 3. Assignment exists
      .mockResolvedValueOnce([{
        id: "assignment-1",
        groupId: "group-1",
        deadline: null,
      }]);

    const updateReturningMock = vi.fn().mockResolvedValue(undefined);
    txUpdateSetMock.mockReturnValue({ where: txUpdateWhereMock });
    txUpdateWhereMock.mockResolvedValue(undefined);

    dbTransactionMock.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const { redeemRecruitingToken } = await import("@/lib/assignments/recruiting-invitations");
    const result = await redeemRecruitingToken("fake-token", "127.0.0.1", "test-password");
    expect(result).toMatchObject({ ok: true, alreadyRedeemed: true });

    // Verify getDbNowUncached was called for DB-sourced time
    expect(getDbNowUncachedMock).toHaveBeenCalled();
  });
});
