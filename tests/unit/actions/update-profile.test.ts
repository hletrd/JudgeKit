import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
    auth: vi.fn<() => Promise<{ user: { id: string; role: string; username?: string } } | null>>(),
    unstable_update: vi.fn<() => Promise<void>>(),
    checkServerActionRateLimit: vi.fn<() => { error: string } | null>(),
    buildServerActionAuditContext: vi.fn<() => Promise<Record<string, string>>>(),
    recordAuditEvent: vi.fn(),

    getRoleLevel: vi.fn<() => Promise<number>>(),
    dbQueryUsersFindFirst: vi.fn(),
    dbUpdateSetPayload: vi.fn(),
    dbUpdateSetWhereRun: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/security/server-actions", () => ({
  isTrustedServerActionOrigin: mocks.isTrustedServerActionOrigin,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
  unstable_update: mocks.unstable_update,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: mocks.checkServerActionRateLimit,
}));

vi.mock("@/lib/audit/events", () => ({
  buildServerActionAuditContext: mocks.buildServerActionAuditContext,
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  getRoleLevel: mocks.getRoleLevel,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn(() => Promise.resolve(new Date("2026-04-20T12:00:00Z"))),
}));

vi.mock("@/lib/validators/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/validators/profile")>(
    "@/lib/validators/profile"
  );
  return actual;
});

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "users.id",
    username: "users.username",
    name: "users.name",
    className: "users.className",
    shareAcceptedSolutions: "users.shareAcceptedSolutions",
    acceptedSolutionsAnonymous: "users.acceptedSolutionsAnonymous",
  },
}));

vi.mock("@/lib/db/helpers", () => ({
  withUpdatedAt: vi.fn(<T extends Record<string, unknown>>(data: T) => ({
    ...data,
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: (...args: unknown[]) => mocks.dbQueryUsersFindFirst(...args),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn((payload: unknown) => {
        mocks.dbUpdateSetPayload(payload);
        return ({
        where: vi.fn(() => ({
          run: vi.fn((...args: unknown[]) => {
            mocks.dbUpdateSetWhereRun(...args);
          }),
        })),
      });
      }),
    })),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const testUser = {
  id: "user-1",
  username: "alice",
  name: "Alice Smith",
  className: "CS101",
  preferredLanguage: null,
  preferredTheme: null,
  // Matches the post-privacy-backfill platform state: sharing is opt-in and
  // off for every account (migration 0039 turned it off platform-wide).
  shareAcceptedSolutions: false,
  acceptedSolutionsAnonymous: false,
  editorTheme: null,
  editorFontSize: null,
  editorFontFamily: null,
};

function setupAuthenticatedUser() {
  mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({
    user: { id: "user-1", role: "student", username: "alice" },
  });
  mocks.getRoleLevel.mockResolvedValue(0);
  mocks.checkServerActionRateLimit.mockReturnValue(null);
  mocks.dbQueryUsersFindFirst.mockResolvedValue({ ...testUser });
  mocks.unstable_update.mockResolvedValue(undefined);
  mocks.buildServerActionAuditContext.mockResolvedValue({
    ipAddress: "127.0.0.1",
    userAgent: "test",
    requestMethod: "SERVER_ACTION",
    requestPath: "/dashboard/profile",
  });
}

function setupStaffUser() {
  setupAuthenticatedUser();
  mocks.auth.mockResolvedValue({
    user: { id: "user-1", role: "assistant", username: "alice" },
  });
  mocks.getRoleLevel.mockResolvedValue(1);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateProfile", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await updateProfile({ name: "Alice" });
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns notAuthenticated when session has no user", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue(null);

    const result = await updateProfile({ name: "Alice" });
    expect(result).toEqual({ success: false, error: "notAuthenticated" });
  });

  it("returns notAuthenticated when session user has no id", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "", role: "student" } });

    const result = await updateProfile({ name: "Alice" });
    expect(result).toEqual({ success: false, error: "notAuthenticated" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "student" } });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await updateProfile({ name: "Alice" });
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("returns validation error when name is empty", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "student" } });
    mocks.checkServerActionRateLimit.mockReturnValue(null);

    const result = await updateProfile({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("nameRequired");
  });

  it("returns validation error when name exceeds max length", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "student" } });
    mocks.checkServerActionRateLimit.mockReturnValue(null);

    const result = await updateProfile({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error).toBe("nameTooLong");
  });

  it("returns notAuthenticated when current user is not found in DB", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "student" } });
    mocks.checkServerActionRateLimit.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue(undefined);

    const result = await updateProfile({ name: "Alice" });
    expect(result).toEqual({ success: false, error: "notAuthenticated" });
  });

  it("successfully updates name and returns success", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();

    const result = await updateProfile({ name: "Alice Updated" });
    expect(result).toEqual({ success: true });
    expect(mocks.unstable_update).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ name: "Alice Updated" }) })
    );
  });

  it("allows staff users to update name and className", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupStaffUser();

    const result = await updateProfile({ name: "Alice Updated", className: "CS202" });
    expect(result).toEqual({ success: true });
    expect(mocks.unstable_update).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ name: "Alice Updated", className: "CS202" }),
      })
    );
  });

  it("ignores className changes from student callers", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();

    const result = await updateProfile({ name: "Alice Updated", className: "CS202" });
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSetPayload).toHaveBeenCalledWith(
      expect.objectContaining({ className: "CS101" })
    );
    expect(mocks.unstable_update).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ className: "CS101" }),
      })
    );
  });

  it("updates accepted-solution sharing preferences", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();

    const result = await updateProfile({
      name: "Alice Smith",
      shareAcceptedSolutions: false,
      acceptedSolutionsAnonymous: true,
    });

    expect(result).toEqual({ success: true });
    // Preferences are persisted to the DB now (not the session token), so they
    // appear in the DB update payload rather than the unstable_update call.
    expect(mocks.dbUpdateSetPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        shareAcceptedSolutions: false,
        acceptedSolutionsAnonymous: true,
      })
    );
  });

  it("normalizes empty className to null for staff callers", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupStaffUser();

    await updateProfile({ name: "Alice", className: undefined });
    expect(mocks.unstable_update).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ className: null }),
      })
    );
  });

  it("records audit event on success", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();

    await updateProfile({ name: "Alice Updated", className: "CS202" });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        action: "user.profile_updated",
        resourceType: "user",
        resourceId: "user-1",
        resourceLabel: "alice",
      })
    );
  });

  it("records changed fields in audit event details when name changes", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();
    // testUser.name is "Alice Smith", new name is "Alice Updated"

    await updateProfile({ name: "Alice Updated", className: "CS101" });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          changedFields: expect.arrayContaining(["name"]),
        }),
      })
    );
  });

  it("records changed fields in audit event details when className changes", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupStaffUser();
    // testUser.className is "CS101", new className is "CS202"

    await updateProfile({ name: "Alice Smith", className: "CS202" });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          changedFields: expect.arrayContaining(["className"]),
        }),
      })
    );
  });

  it("records empty changedFields when nothing changed", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();
    // testUser has name="Alice Smith", className="CS101" — submit same values

    await updateProfile({ name: "Alice Smith", className: "CS101" });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          changedFields: [],
        }),
      })
    );
  });

  it("passes rate limit key using the session user id", async () => {
    const { updateProfile } = await import("@/lib/actions/update-profile");
    setupAuthenticatedUser();

    await updateProfile({ name: "Alice" });
    expect(mocks.checkServerActionRateLimit).toHaveBeenCalledWith(
      "user-1",
      "updateProfile",
      expect.any(Number),
      expect.any(Number)
    );
  });
});
