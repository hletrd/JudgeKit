import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbUpdateMock,
  updateSetMock,
  updateWhereMock,
  dbTransactionMock,
  dbSelectMock,
  txSelectMock,
  txFromMock,
  txWhereMock,
  txLimitMock,
  txInsertMock,
  randomBytesMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  txSelectMock: vi.fn(),
  txFromMock: vi.fn(),
  txWhereMock: vi.fn(),
  txLimitMock: vi.fn(),
  txInsertMock: vi.fn(),
  randomBytesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
    transaction: dbTransactionMock,
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: vi.fn().mockResolvedValue({ now: new Date("2026-04-20T12:00:00Z") }),
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/db/helpers", () => ({
  withUpdatedAt: <T extends Record<string, unknown>>(value: T, _now?: Date) => value,
}));

vi.mock("@/lib/db/schema", () => ({
  assignments: {
    id: "assignments.id",
    accessCode: "assignments.accessCode",
    groupId: "assignments.groupId",
    examMode: "assignments.examMode",
    deadline: "assignments.deadline",
    lateDeadline: "assignments.lateDeadline",
  },
  contestAccessTokens: {
    id: "contestAccessTokens.id",
    assignmentId: "contestAccessTokens.assignmentId",
    userId: "contestAccessTokens.userId",
  },
  enrollments: {
    id: "enrollments.id",
    groupId: "enrollments.groupId",
    userId: "enrollments.userId",
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ eq: value })),
    and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
  };
});

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomBytes: randomBytesMock,
  };
});

describe("access code helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    updateWhereMock.mockResolvedValue(undefined);
    updateSetMock.mockReturnValue({ where: updateWhereMock });
    dbUpdateMock.mockReturnValue({ set: updateSetMock });

    dbSelectMock.mockReturnValue({ from: txFromMock });
    txLimitMock.mockResolvedValue([]);
    txWhereMock.mockReturnValue({ limit: txLimitMock });
    txFromMock.mockReturnValue({ where: txWhereMock });
    txSelectMock.mockReturnValue({ from: txFromMock });

    txInsertMock.mockImplementation(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    randomBytesMock.mockReset();
  });

  it("retries generated access codes when the unique constraint collides", async () => {
    const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
    updateWhereMock
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce(undefined);

    randomBytesMock
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([0]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]))
      .mockReturnValueOnce(Buffer.from([1]));

    const accessCodesModule = await import("@/lib/assignments/access-codes");

    await expect(accessCodesModule.setAccessCode("assignment-1")).resolves.toBe("BBBBBBBB");
    expect(updateSetMock).toHaveBeenNthCalledWith(1, { accessCode: "AAAAAAAA" });
    expect(updateSetMock).toHaveBeenNthCalledWith(2, { accessCode: "BBBBBBBB" });
  });

  it("repairs a missing enrollment when a contest token already exists", async () => {
    const tx = {
      select: txSelectMock,
      insert: txInsertMock,
    };

    txLimitMock
      .mockResolvedValueOnce([{
        id: "assignment-1",
        groupId: "group-1",
        accessCode: "ABCDEFGH",
        examMode: "scheduled",
        deadline: null,
        lateDeadline: null,
      }])
      .mockResolvedValueOnce([{ id: "token-1" }])
      .mockResolvedValueOnce([]);

    dbTransactionMock.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const accessCodesModule = await import("@/lib/assignments/access-codes");
    await expect(accessCodesModule.redeemAccessCode("ABCDEFGH", "user-1")).resolves.toMatchObject({
      ok: true,
      alreadyEnrolled: true,
      assignmentId: "assignment-1",
      groupId: "group-1",
    });

    expect(txInsertMock).toHaveBeenCalledWith({
      id: "enrollments.id",
      groupId: "enrollments.groupId",
      userId: "enrollments.userId",
    });
  });

  it("treats concurrent contest token redemption as already enrolled", async () => {
    const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
    dbTransactionMock.mockRejectedValueOnce(duplicateError);

    const selectChain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.limit.mockResolvedValue([{ id: "assignment-1", groupId: "group-1" }]);
    dbSelectMock.mockReturnValueOnce({ from: selectChain.from });

    const accessCodesModule = await import("@/lib/assignments/access-codes");
    await expect(accessCodesModule.redeemAccessCode("ABCDEFGH", "user-1")).resolves.toMatchObject({
      ok: true,
      alreadyEnrolled: true,
      assignmentId: "assignment-1",
      groupId: "group-1",
    });
  });

  it("uses DB-sourced time for enrolledAt and redeemedAt in redeemAccessCode", async () => {
    const tx = {
      select: txSelectMock,
      insert: txInsertMock,
    };

    // Assignment exists, no existing token, no existing enrollment
    txLimitMock
      .mockResolvedValueOnce([{
        id: "assignment-1",
        groupId: "group-1",
        accessCode: "TESTCODE",
        examMode: "scheduled",
        deadline: null,
        lateDeadline: null,
      }])
      .mockResolvedValueOnce([]) // no existing token
      .mockResolvedValueOnce([]); // no existing enrollment

    dbTransactionMock.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const accessCodesModule = await import("@/lib/assignments/access-codes");
    const result = await accessCodesModule.redeemAccessCode("TESTCODE", "user-1");
    expect(result).toMatchObject({ ok: true, assignmentId: "assignment-1", groupId: "group-1" });

    // Verify getDbNowUncached was called for DB-sourced time
    const { getDbNowUncached } = await import("@/lib/db-time");
    expect(getDbNowUncached).toHaveBeenCalled();
  });

  it("stamps the redeemed token's expiry at the effective close (lateDeadline ?? deadline)", async () => {
    // AGG8-1 (cycle-8): the access-code redeem path must derive token expiry
    // from the canonical effective close, identical to the invite path and the
    // schedule-edit sync — NOT bare `deadline`. With a late window configured,
    // a deadline-stamped token expires early and drops token-keyed catalog /
    // platform-mode visibility during the window the instructor opened.
    const deadline = new Date("2026-05-01T17:00:00Z");
    const lateDeadline = new Date("2026-05-01T18:00:00Z");

    // Capture the values passed to each tx.insert(...).values(...) call so we
    // can pick out the contest-access-token insert (the one without an
    // onConflict clause).
    // The contest-access-token insert is the one carrying `expiresAt`
    // (awaited directly, no onConflict chain); the enrollment insert carries
    // `enrolledAt` and chains onConflictDoNothing.
    const tokenInsertValues: Array<Record<string, unknown>> = [];
    const insertMock = vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if ("expiresAt" in vals) {
          tokenInsertValues.push(vals);
          return Promise.resolve(undefined);
        }
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    }));

    const tx = { select: txSelectMock, insert: insertMock };

    txLimitMock
      .mockResolvedValueOnce([{
        id: "assignment-1",
        groupId: "group-1",
        accessCode: "LATEWNDW",
        examMode: "scheduled",
        deadline,
        lateDeadline,
      }])
      .mockResolvedValueOnce([]) // no existing token
      .mockResolvedValueOnce([]); // no existing enrollment

    // Redeem must succeed (now=2026-04-20, well before the close).
    dbTransactionMock.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const accessCodesModule = await import("@/lib/assignments/access-codes");
    const result = await accessCodesModule.redeemAccessCode("LATEWNDW", "user-1");
    expect(result).toMatchObject({ ok: true, assignmentId: "assignment-1" });

    expect(tokenInsertValues).toHaveLength(1);
    expect(tokenInsertValues[0].expiresAt).toEqual(lateDeadline);
  });

  it("stamps the redeemed token's expiry at deadline when no late window is set", async () => {
    const deadline = new Date("2026-05-01T17:00:00Z");

    const tokenInsertValues: Array<Record<string, unknown>> = [];
    const insertMock = vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if ("expiresAt" in vals) {
          tokenInsertValues.push(vals);
          return Promise.resolve(undefined);
        }
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    }));

    const tx = { select: txSelectMock, insert: insertMock };

    txLimitMock
      .mockResolvedValueOnce([{
        id: "assignment-1",
        groupId: "group-1",
        accessCode: "NOLATEWN",
        examMode: "scheduled",
        deadline,
        lateDeadline: null,
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    dbTransactionMock.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const accessCodesModule = await import("@/lib/assignments/access-codes");
    await accessCodesModule.redeemAccessCode("NOLATEWN", "user-1");

    expect(tokenInsertValues).toHaveLength(1);
    expect(tokenInsertValues[0].expiresAt).toEqual(deadline);
  });

  it("uses DB-sourced time for setAccessCode and revokeAccessCode", async () => {
    const { getDbNowUncached } = await import("@/lib/db-time");

    updateWhereMock.mockResolvedValue(undefined);
    updateSetMock.mockReturnValue({ where: updateWhereMock });
    dbUpdateMock.mockReturnValue({ set: updateSetMock });

    const accessCodesModule = await import("@/lib/assignments/access-codes");

    // setAccessCode should call getDbNowUncached
    vi.mocked(getDbNowUncached).mockClear();
    randomBytesMock
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]))
      .mockReturnValue(Buffer.from([0]));
    await accessCodesModule.setAccessCode("assignment-1", "FIXEDCODE");
    expect(getDbNowUncached).toHaveBeenCalled();

    // revokeAccessCode should call getDbNowUncached
    vi.mocked(getDbNowUncached).mockClear();
    await accessCodesModule.revokeAccessCode("assignment-1");
    expect(getDbNowUncached).toHaveBeenCalled();
  });
});
