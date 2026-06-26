import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral coverage for updateRecruitingInvitation's metadata-merge path.
 *
 * C3-AGG-3: the metadata merge must run inside a transaction with
 * SELECT ... FOR UPDATE so the read-modify-write serializes against the
 * atomic jsonb_set brute-force counter increments. These tests assert the
 * row lock is acquired (`.for("update")`) and the `_sys.*` internal keys
 * are preserved across the merge.
 */

const { dbTransactionMock, dbUpdateMock, getDbNowUncachedMock } = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  getDbNowUncachedMock: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: dbTransactionMock,
    update: dbUpdateMock,
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
    status: "recruitingInvitations.status",
    metadata: "recruitingInvitations.metadata",
    expiresAt: "recruitingInvitations.expiresAt",
    updatedAt: "recruitingInvitations.updatedAt",
  },
  users: { id: "users.id" },
  enrollments: { id: "enrollments.id" },
  contestAccessTokens: { id: "contestAccessTokens.id" },
  assignments: { id: "assignments.id" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ eq: value })),
    and: vi.fn((...clauses: unknown[]) => ({ and: clauses })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join("?"), values }),
      { identifier: vi.fn() }
    ),
    count: vi.fn(),
  };
});

vi.mock("nanoid", () => ({ nanoid: vi.fn().mockReturnValue("mock-nanoid") }));

function buildTx(existingMetadata: Record<string, string> | null) {
  const forMock = vi.fn();
  const limitMock = vi.fn().mockResolvedValue(
    existingMetadata === null ? [] : [{ metadata: existingMetadata }]
  );
  const whereMock = vi.fn().mockReturnValue({ for: forMock, limit: limitMock });
  // `for` must also chain into `limit` (drizzle: where().for().limit()).
  forMock.mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const updateWhereMock = vi.fn().mockResolvedValue({ rowCount: 1 });
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  return {
    tx: { select: selectMock, update: updateMock },
    forMock,
    limitMock,
    updateMock,
    updateSetMock,
  };
}

describe("updateRecruitingInvitation metadata-merge row lock (C3-AGG-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-04-20T12:00:00Z"));
  });

  it("acquires FOR UPDATE before merging metadata (serializes vs brute-force counter)", async () => {
    const harness = buildTx({ "_sys.failedRedeemAttempts": "3" });
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(harness.tx)
    );

    const { updateRecruitingInvitation } = await import(
      "@/lib/assignments/recruiting-invitations"
    );
    await updateRecruitingInvitation("inv-1", { metadata: { note: "edited" } });

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    // The SELECT must take a row lock so concurrent jsonb_set increments
    // cannot be clobbered by this read-modify-write.
    expect(harness.forMock).toHaveBeenCalledWith("update");
  });

  it("preserves _sys.* internal keys through the merge", async () => {
    const harness = buildTx({
      "_sys.failedRedeemAttempts": "4",
      "_sys.accountPasswordResetRequired": "true",
    });
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(harness.tx)
    );

    const { updateRecruitingInvitation } = await import(
      "@/lib/assignments/recruiting-invitations"
    );
    await updateRecruitingInvitation("inv-1", { metadata: { note: "edited" } });

    // The UPDATE set call should carry the merged metadata including both _sys keys.
    expect(harness.updateSetMock).toHaveBeenCalledTimes(1);
    const setArg = harness.updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.metadata).toMatchObject({
      note: "edited",
      "_sys.failedRedeemAttempts": "4",
      "_sys.accountPasswordResetRequired": "true",
    });
  });

  it("does not open a transaction when only expiresAt changes (no metadata)", async () => {
    // Non-metadata edits keep the legacy plain-UPDATE path (the status branch
    // is already atomic). Only the metadata read-modify-write needs the lock.
    const harness = buildTx(null);
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(harness.tx)
    );
    const dbUpdateWhereMock = vi.fn().mockResolvedValue({ rowCount: 1 });
    const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

    const { updateRecruitingInvitation } = await import(
      "@/lib/assignments/recruiting-invitations"
    );
    await updateRecruitingInvitation("inv-1", { expiresAt: new Date("2026-05-01T00:00:00Z") });

    expect(dbTransactionMock).not.toHaveBeenCalled();
    // Plain UPDATE path used.
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
  });
});
