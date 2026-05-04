import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
    auth: vi.fn<() => Promise<{ user: { id: string; role: string; username: string } } | null>>(),
    hasSessionIdentity: vi.fn<() => boolean>(),
    findSessionUserWithPassword: vi.fn<() => Promise<Record<string, unknown> | null>>(),
    buildServerActionAuditContext: vi.fn<() => Promise<Record<string, string>>>(),
    recordAuditEvent: vi.fn(),
    consumeRateLimitAttemptMulti: vi.fn<() => boolean>(),
    clearRateLimit: vi.fn(),
    getPasswordValidationError: vi.fn<() => string | null>(),
    verifyPassword: vi.fn<() => Promise<{ valid: boolean; needsRehash: boolean }>>(),
    hashPassword: vi.fn<() => Promise<string>>(),
    loggerError: vi.fn(),

    dbUpdateWhere: vi.fn(),
  };
});

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
  consumeRateLimitAttemptMulti: mocks.consumeRateLimitAttemptMulti,
  clearRateLimit: mocks.clearRateLimit,
}));

vi.mock("@/lib/security/password", () => ({
  getPasswordValidationError: mocks.getPasswordValidationError,
}));

vi.mock("@/lib/security/password-hash", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
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
        where: mocks.dbUpdateWhere,
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

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

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
  mocks.consumeRateLimitAttemptMulti.mockResolvedValue(false);
  mocks.buildServerActionAuditContext.mockResolvedValue({
    ipAddress: "127.0.0.1",
    userAgent: "test",
    requestMethod: "SERVER_ACTION",
    requestPath: "/change-password",
  });
  mocks.dbUpdateWhere.mockResolvedValue(undefined);
}

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
    mocks.consumeRateLimitAttemptMulti.mockResolvedValue(true);

    const result = await changePassword("oldpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "changePasswordRateLimited" });
  });

  it("returns currentPasswordIncorrect for wrong password (rate limit already consumed atomically)", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });

    const result = await changePassword("wrongpass", "NewPass123");
    expect(result).toEqual({ success: false, error: "currentPasswordIncorrect" });
    // Rate limit was consumed atomically by consumeRateLimitAttemptMulti before
    // the password check — no separate recordRateLimitFailure call needed.
    expect(mocks.consumeRateLimitAttemptMulti).toHaveBeenCalledWith("change-password:user:user-1");
  });

  it("returns password validation error for weak new password", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    mocks.getPasswordValidationError.mockReturnValue("passwordTooShort");

    const result = await changePassword("correctpass", "short");
    expect(result).toEqual({ success: false, error: "passwordTooShort" });
  });

  it("changes password successfully, clears rate limit, and records audit", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hashPassword.mockResolvedValue("new-hashed-password");

    const result = await changePassword("correctpass", "StrongNewPass1");
    expect(result).toEqual({ success: true });
    expect(mocks.hashPassword).toHaveBeenCalledWith("StrongNewPass1");
    expect(mocks.clearRateLimit).toHaveBeenCalledWith("change-password:user:user-1");
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
    mocks.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hashPassword.mockResolvedValue("new-hashed-password");
    mocks.dbUpdateWhere.mockRejectedValue(new Error("db error"));

    const result = await changePassword("correctpass", "StrongNewPass1");
    expect(result).toEqual({ success: false, error: "error" });
    expect(mocks.loggerError).toHaveBeenCalled();
    // Rate limit is cleared after successful current-password verification,
    // even if the subsequent DB update fails. The user already proved they
    // know their password, so they should not accumulate toward lockout.
    // See C9-5 (cycle 9 review).
    expect(mocks.clearRateLimit).toHaveBeenCalledWith("change-password:user:user-1");
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("calls getPasswordValidationError with just the new password (no context arg)", async () => {
    const { changePassword } = await import("@/lib/actions/change-password");
    setupAuthenticatedUser();
    mocks.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hashPassword.mockResolvedValue("hashed");

    await changePassword("correctpass", "StrongNewPass1");

    // The optional context arg (username, email) was removed when the policy
    // simplified to minimum-length-only — see AGENTS.md / password.ts. Guard
    // against accidental reintroduction.
    expect(mocks.getPasswordValidationError).toHaveBeenCalledWith("StrongNewPass1");
    expect(mocks.getPasswordValidationError).toHaveBeenCalledTimes(1);
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
