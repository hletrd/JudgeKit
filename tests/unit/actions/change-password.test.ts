import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
    auth: vi.fn<() => Promise<{ user: { id: string; role: string; username: string } } | null>>(),
    hasSessionIdentity: vi.fn<() => boolean>(),
    findSessionUserWithPassword: vi.fn<() => Promise<Record<string, unknown> | null>>(),
    buildServerActionAuditContext: vi.fn<() => Promise<Record<string, string>>>(),
    recordAuditEvent: vi.fn(),
    isRateLimited: vi.fn<() => boolean>(),
    recordRateLimitFailure: vi.fn(),
    clearRateLimit: vi.fn(),
    getPasswordValidationError: vi.fn<() => string | null>(),
    compare: vi.fn<() => Promise<boolean>>(),
    hash: vi.fn<() => Promise<string>>(),
    loggerError: vi.fn(),

    dbUpdateSetWhereRun: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/security/server-actions", () => ({
  isTrustedServerActionOrigin: mocks.isTrustedServerActionOrigin,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/auth/find-session-user", () => ({
  hasSessionIdentity: mocks.hasSessionIdentity,
  findSessionUserWithPassword: mocks.findSessionUserWithPassword,
}));

vi.mock("@/lib/audit/events", () => ({
  buildServerActionAuditContext: mocks.buildServerActionAuditContext,
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  isRateLimited: mocks.isRateLimited,
  recordRateLimitFailure: mocks.recordRateLimitFailure,
  clearRateLimit: mocks.clearRateLimit,
}));

vi.mock("@/lib/security/password", () => ({
  getPasswordValidationError: mocks.getPasswordValidationError,
}));

vi.mock("bcryptjs", () => ({
  compare: mocks.compare,
  hash: mocks.hash,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: vi.fn((...args: unknown[]) => {
            mocks.dbUpdateSetWhereRun(...args);
          }),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id" },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const testUser = {
  id: "user-1",
  username: "testuser",
  email: "test@example.com",
  role: "student",
  passwordHash: "$2a$12$existinghash",
};

function setupAuthenticatedUser() {
  mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({
    user: { id: "user-1", role: "student", username: "testuser" },
  });
  mocks.hasSessionIdentity.mockReturnValue(true);
  mocks.findSessionUserWithPassword.mockResolvedValue({ ...testUser });
  mocks.isRateLimited.mockReturnValue(false);
  mocks.buildServerActionAuditContext.mockResolvedValue({
    ipAddress: "127.0.0.1",
    userAgent: "test",
    requestMethod: "SERVER_ACTION",
    requestPath: "/change-password",
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("changePassword", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await changePassword("oldpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns sessionExpired when session has no identity", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue(null);
    mocks.hasSessionIdentity.mockReturnValue(false);

    const result = await changePassword("oldpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "sessionExpired" });
  });

  it("returns sessionExpired when user has no passwordHash", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "student", username: "testuser" },
    });
    mocks.hasSessionIdentity.mockReturnValue(true);
    mocks.findSessionUserWithPassword.mockResolvedValue({
      ...testUser,
      passwordHash: null,
    });

    const result = await changePassword("oldpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "sessionExpired" });
  });

  it("returns changePasswordRateLimited when rate limited", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "student", username: "testuser" },
    });
    mocks.hasSessionIdentity.mockReturnValue(true);
    mocks.findSessionUserWithPassword.mockResolvedValue({ ...testUser });
    mocks.isRateLimited.mockReturnValue(true);

    const result = await changePassword("oldpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "changePasswordRateLimited" });
  });

  it("returns currentPasswordIncorrect and records rate limit failure for wrong password", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.compare.mockResolvedValue(false);

    const result = await changePassword("wrongpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "currentPasswordIncorrect" });
    expect(mocks.recordRateLimitFailure).toHaveBeenCalledWith("change-password:user:user-1");
  });

  it("returns password validation error for weak new password", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.compare.mockResolvedValue(true);
    mocks.getPasswordValidationError.mockReturnValue("passwordTooShort");

    const result = await changePassword("correctpass", "short");
    expect(result).toEqual({ success: false, error: "passwordTooShort" });
  });

  it("changes password successfully, clears rate limit, and records audit", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.compare.mockResolvedValue(true);
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hash.mockResolvedValue("new-hashed-password");

    const result = await changePassword("correctpass", "StrongNewPass1");
    expect(result).toEqual({ success: true });

    // Verify bcrypt hash was called with new password
    expect(mocks.hash).toHaveBeenCalledWith("StrongNewPass1", 12);

    // Verify rate limit was cleared on success
    expect(mocks.clearRateLimit).toHaveBeenCalledWith("change-password:user:user-1");

    // Verify audit event was recorded
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        action: "user.password_changed",
        resourceType: "user",
        resourceId: "user-1",
        details: expect.objectContaining({
          invalidatedExistingSessions: true,
          mustChangePassword: false,
        }),
      })
    );
  });

  it("returns error when db update throws", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.compare.mockResolvedValue(true);
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hash.mockResolvedValue("new-hashed-password");

    // Make db.update chain throw
    const { db } = await import("@/lib/db");
    (db.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: vi.fn(() => {
            throw new Error("db error");
          }),
        })),
      })),
    }));

    const result = await changePassword("correctpass", "StrongNewPass1");
    expect(result).toEqual({ success: false, error: "error" });
    expect(mocks.loggerError).toHaveBeenCalled();

    // Rate limit should NOT be cleared on failure
    expect(mocks.clearRateLimit).not.toHaveBeenCalled();
    // Audit event should NOT be recorded on failure
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("passes correct context to getPasswordValidationError", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.compare.mockResolvedValue(true);
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hash.mockResolvedValue("hashed");

    await changePassword("correctpass", "StrongNewPass1");

    expect(mocks.getPasswordValidationError).toHaveBeenCalledWith(
      "StrongNewPass1",
      {
        username: "testuser",
        email: "test@example.com",
      }
    );
  });

  it("returns sessionExpired when findSessionUserWithPassword returns null", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "student", username: "testuser" },
    });
    mocks.hasSessionIdentity.mockReturnValue(true);
    mocks.findSessionUserWithPassword.mockResolvedValue(null);

    const result = await changePassword("oldpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "sessionExpired" });
  });
});
