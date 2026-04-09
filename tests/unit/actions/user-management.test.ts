import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    isTrustedServerActionOrigin: vi.fn<() => Promise<boolean>>(),
    auth: vi.fn<() => Promise<{ user: { id: string; role: string; username: string } } | null>>(),
    checkServerActionRateLimit: vi.fn<() => { error: string } | null>(),
    buildServerActionAuditContext: vi.fn<() => Promise<Record<string, string>>>(),
    recordAuditEvent: vi.fn(),
    isUsernameTaken: vi.fn<() => Promise<boolean>>(),
    isEmailTaken: vi.fn<() => Promise<boolean>>(),
    validateAndHashPassword: vi.fn<() => Promise<{ hash?: string; error?: string }>>(),
    validateRoleChange: vi.fn<() => string | null>(),
    isUserRole: vi.fn<(v: string) => boolean>(),
    generateSecurePassword: vi.fn<() => string>(),
    hashPassword: vi.fn<() => Promise<string>>(),
    nanoid: vi.fn<() => string>(),
    loggerError: vi.fn(),

    // db chain helpers
    dbQueryUsersFindFirst: vi.fn(),
    dbQueryGroupsFindMany: vi.fn(),
    dbUpdateSet: vi.fn(),
    dbUpdateWhere: vi.fn(),
    dbDeleteWhere: vi.fn(),
    dbInsertValues: vi.fn(),

    resolveCapabilitiesMock: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/security/server-actions", () => ({
  isTrustedServerActionOrigin: mocks.isTrustedServerActionOrigin,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: mocks.checkServerActionRateLimit,
}));

vi.mock("@/lib/audit/events", () => ({
  buildServerActionAuditContext: mocks.buildServerActionAuditContext,
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/users/core", () => ({
  isUsernameTaken: mocks.isUsernameTaken,
  isEmailTaken: mocks.isEmailTaken,
  validateAndHashPassword: mocks.validateAndHashPassword,
  validateRoleChange: mocks.validateRoleChange,
}));

vi.mock("@/lib/security/constants", () => ({
  isUserRole: mocks.isUserRole,
  USER_ROLES: ["student", "instructor", "admin", "super_admin"],
  canManageRole: vi.fn(),
  ROLE_LEVEL: {
    student: 1,
    instructor: 2,
    admin: 3,
    super_admin: 4,
  },
}));

vi.mock("@/lib/auth/generated-password", () => ({
  generateSecurePassword: mocks.generateSecurePassword,
}));

vi.mock("@/lib/security/password-hash", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoid,
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
    query: {
      users: {
        findFirst: (...args: unknown[]) => mocks.dbQueryUsersFindFirst(...args),
      },
      groups: {
        findMany: (...args: unknown[]) => mocks.dbQueryGroupsFindMany(...args),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn((...args: unknown[]) => {
        mocks.dbUpdateSet(...args);
        return {
          where: vi.fn((...wArgs: unknown[]) => {
            mocks.dbUpdateWhere(...wArgs);
            return Promise.resolve();
          }),
        };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn((...args: unknown[]) => {
        mocks.dbDeleteWhere(...args);
        return Promise.resolve();
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((...args: unknown[]) => {
        mocks.dbInsertValues(...args);
        return Promise.resolve();
      }),
    })),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: mocks.resolveCapabilitiesMock,
  invalidateRoleCache: vi.fn(),
  getRoleLevel: vi.fn().mockResolvedValue(0),
  isValidRole: vi.fn().mockResolvedValue(true),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupAuthorizedAdmin(role: "admin" | "super_admin" = "admin") {
  mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({
    user: { id: "actor-1", role, username: "admin-user" },
  });
  mocks.checkServerActionRateLimit.mockReturnValue(null);
  mocks.buildServerActionAuditContext.mockResolvedValue({
    ipAddress: "127.0.0.1",
    userAgent: "test",
    requestMethod: "SERVER_ACTION",
    requestPath: "/dashboard/admin/users",
  });
  mocks.isUserRole.mockReturnValue(true);
}

const defaultUserInput = {
  username: "newuser",
  name: "New User",
  email: "new@example.com",
  role: "student",
};

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.dbQueryGroupsFindMany.mockResolvedValue([]);
  mocks.resolveCapabilitiesMock.mockImplementation(async (role: string) => {
    const { DEFAULT_ROLE_CAPABILITIES } = await import("@/lib/capabilities/defaults");
    const caps = DEFAULT_ROLE_CAPABILITIES[role as keyof typeof DEFAULT_ROLE_CAPABILITIES];
    return new Set(caps ?? []);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleUserActive
// ─────────────────────────────────────────────────────────────────────────────

describe("toggleUserActive", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await toggleUserActive("user-1", false);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized when session has no admin role", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "u1", role: "student", username: "student1" },
    });

    const result = await toggleUserActive("user-1", false);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns rateLimited when rate limit is hit", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "actor-1", role: "admin", username: "admin1" },
    });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await toggleUserActive("user-1", false);
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("prevents deactivating yourself", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();

    const result = await toggleUserActive("actor-1", false);
    expect(result).toEqual({ success: false, error: "cannotDeactivateSelf" });
  });

  it("returns userNotFound for nonexistent user", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue(undefined);

    const result = await toggleUserActive("missing-user", false);
    expect(result).toEqual({ success: false, error: "userNotFound" });
  });

  it("prevents deactivating a super_admin", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "sa-1",
      username: "superadmin",
      role: "super_admin",
    });

    const result = await toggleUserActive("sa-1", false);
    expect(result).toEqual({ success: false, error: "cannotDeactivateSuperAdmin" });
  });

  it("allows reactivating a super_admin", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin("super_admin");
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "sa-1",
      username: "superadmin",
      role: "super_admin",
    });

    const result = await toggleUserActive("sa-1", true);
    expect(result).toEqual({ success: true });
  });

  it("deactivates a regular user successfully and records audit event", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-2",
      username: "targetuser",
      role: "student",
    });

    const result = await toggleUserActive("user-2", false);
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, tokenInvalidatedAt: expect.any(Date) })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.access_deactivated",
        resourceId: "user-2",
      })
    );
  });

  it("activates a user without setting tokenInvalidatedAt", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-2",
      username: "targetuser",
      role: "student",
    });

    const result = await toggleUserActive("user-2", true);
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
    // tokenInvalidatedAt should NOT be set on activation
    const setArg = mocks.dbUpdateSet.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("tokenInvalidatedAt");
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.access_restored",
      })
    );
  });

  it("returns updateUserStatusFailed when db throws", async () => {
    const { toggleUserActive } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-2",
      username: "targetuser",
      role: "student",
    });
    // Make the db.update chain throw
    const { db } = await import("@/lib/db");
    (db.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(new Error("db error"))),
      })),
    }));

    const result = await toggleUserActive("user-2", false);
    expect(result).toEqual({ success: false, error: "updateUserStatusFailed" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteUserPermanently
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteUserPermanently", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await deleteUserPermanently("user-1", "username");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("prevents self-deletion", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();

    const result = await deleteUserPermanently("actor-1", "admin-user");
    expect(result).toEqual({ success: false, error: "cannotDeleteSelf" });
  });

  it("returns userNotFound for nonexistent user", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue(undefined);

    const result = await deleteUserPermanently("other-user", "somebody");
    expect(result).toEqual({ success: false, error: "userNotFound" });
  });

  it("rejects mismatched confirmUsername", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-2",
      username: "targetuser",
      role: "student",
    });

    const result = await deleteUserPermanently("user-2", "wrong-name");
    expect(result).toEqual({ success: false, error: "confirmUsernameMismatch" });
  });

  it("prevents deleting a super_admin", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "sa-1",
      username: "superadmin",
      role: "super_admin",
    });

    const result = await deleteUserPermanently("sa-1", "superadmin");
    expect(result).toEqual({ success: false, error: "cannotDeleteSuperAdmin" });
  });

  it("deletes a user successfully and records audit before deletion", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-2",
      username: "targetuser",
      role: "student",
    });

    const result = await deleteUserPermanently("user-2", "targetuser");
    expect(result).toEqual({ success: true });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.permanently_deleted",
        resourceId: "user-2",
        resourceLabel: "targetuser",
      })
    );
    expect(mocks.dbDeleteWhere).toHaveBeenCalled();
  });

  it("returns deleteUserFailed when db throws", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-2",
      username: "targetuser",
      role: "student",
    });
    const { db } = await import("@/lib/db");
    (db.delete as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      where: vi.fn(() => Promise.reject(new Error("db error"))),
    }));

    const result = await deleteUserPermanently("user-2", "targetuser");
    expect(result).toEqual({ success: false, error: "deleteUserFailed" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { deleteUserPermanently } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "actor-1", role: "admin", username: "admin1" },
    });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await deleteUserPermanently("user-2", "targetuser");
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// editUser
// ─────────────────────────────────────────────────────────────────────────────

describe("editUser", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await editUser("user-1", defaultUserInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns usernameAndNameRequired when username is empty", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();

    const result = await editUser("user-1", { ...defaultUserInput, username: "" });
    expect(result).toEqual({ success: false, error: "updateUserFailed" });
  });

  it("returns usernameAndNameRequired when name is empty", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();

    const result = await editUser("user-1", { ...defaultUserInput, name: "" });
    expect(result).toEqual({ success: false, error: "updateUserFailed" });
  });

  it("returns error from validateRoleChange (invalidRole)", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue("invalidRole");
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });

    const result = await editUser("user-1", defaultUserInput);
    expect(result).toEqual({ success: false, error: "updateUserFailed" });
  });

  it("returns error from validateRoleChange (privilege error)", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue("onlySuperAdminCanChangeSuperAdminRole");
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });

    const result = await editUser("user-1", defaultUserInput);
    expect(result).toEqual({ success: false, error: "onlySuperAdminCanChangeSuperAdminRole" });
  });

  it("returns usernameInUse when username is taken", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });
    mocks.isUsernameTaken.mockResolvedValue(true);

    const result = await editUser("user-1", defaultUserInput);
    expect(result).toEqual({ success: false, error: "usernameInUse" });
  });

  it("returns emailInUse when email is taken", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(true);

    const result = await editUser("user-1", {
      ...defaultUserInput,
      email: "taken@example.com",
    });
    expect(result).toEqual({ success: false, error: "emailInUse" });
  });

  it("prevents password reset for users of equal or higher privilege", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin(); // actor is "admin"
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "admin", // same level as actor
    });
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);

    const result = await editUser("user-1", {
      ...defaultUserInput,
      password: "NewPass123",
    });
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns password validation error", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);
    mocks.validateAndHashPassword.mockResolvedValue({ error: "passwordTooShort" });

    const result = await editUser("user-1", {
      ...defaultUserInput,
      password: "short",
    });
    expect(result).toEqual({ success: false, error: "passwordTooShort" });
  });

  it("updates user successfully without password change", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);

    const result = await editUser("user-1", defaultUserInput);
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "newuser",
        name: "New User",
        role: "student",
      })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.updated",
        resourceId: "user-1",
      })
    );
  });

  it("updates user with password change and invalidates sessions", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);
    mocks.validateAndHashPassword.mockResolvedValue({ hash: "hashed-pw" });

    const result = await editUser("user-1", {
      ...defaultUserInput,
      password: "StrongPass1",
    });
    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: "hashed-pw",
        mustChangePassword: true,
        tokenInvalidatedAt: expect.any(Date),
      })
    );
  });

  it("returns updateUserFailed when isUserRole returns false for requestedRole", async () => {
    const { editUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    // isUserRole returns true for actor role check, false for requestedRole check
    mocks.isUserRole.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mocks.dbQueryUsersFindFirst.mockResolvedValue({
      id: "user-1",
      username: "target",
      role: "student",
    });

    const result = await editUser("user-1", {
      ...defaultUserInput,
      role: "bogus_role",
    });
    expect(result).toEqual({ success: false, error: "updateUserFailed" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createUser
// ─────────────────────────────────────────────────────────────────────────────

describe("createUser", () => {
  it("returns unauthorized when origin is untrusted", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(false);

    const result = await createUser(defaultUserInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns unauthorized for student session", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "u1", role: "student", username: "stu1" },
    });

    const result = await createUser(defaultUserInput);
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns usernameAndNameRequired for empty username", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();

    const result = await createUser({ ...defaultUserInput, username: "" });
    expect(result).toEqual({ success: false, error: "createUserFailed" });
  });

  it("returns usernameInUse for duplicate username", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.isUsernameTaken.mockResolvedValue(true);

    const result = await createUser(defaultUserInput);
    expect(result).toEqual({ success: false, error: "usernameInUse" });
  });

  it("returns emailInUse for duplicate email", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(true);

    const result = await createUser({
      ...defaultUserInput,
      email: "dup@example.com",
    });
    expect(result).toEqual({ success: false, error: "emailInUse" });
  });

  it("returns password validation error when provided password is too short", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);
    mocks.nanoid.mockReturnValue("new-id");
    mocks.validateAndHashPassword.mockResolvedValue({ error: "passwordTooShort" });

    const result = await createUser({
      ...defaultUserInput,
      password: "weak",
    });
    expect(result).toEqual({ success: false, error: "passwordTooShort" });
  });

  it("creates user with provided password", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);
    mocks.nanoid.mockReturnValue("new-id");
    mocks.validateAndHashPassword.mockResolvedValue({ hash: "hashed-password" });

    const result = await createUser({
      ...defaultUserInput,
      password: "StrongPass1",
    });
    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-id",
        username: "newuser",
        passwordHash: "hashed-password",
        mustChangePassword: true,
      })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.created",
        resourceId: "new-id",
      })
    );
  });

  it("creates user with generated password when none provided", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);
    mocks.nanoid.mockReturnValue("new-id");
    mocks.generateSecurePassword.mockReturnValue("gen-password-abc");
    mocks.hashPassword.mockResolvedValue("hashed-gen-password");

    const result = await createUser({
      ...defaultUserInput,
      password: undefined,
    });
    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: "hashed-gen-password",
      })
    );
  });

  it("returns createUserFailed when db throws", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue(null);
    mocks.isUsernameTaken.mockResolvedValue(false);
    mocks.isEmailTaken.mockResolvedValue(false);
    mocks.nanoid.mockReturnValue("new-id");
    mocks.generateSecurePassword.mockReturnValue("gen-pw");
    mocks.hashPassword.mockResolvedValue("hashed");
    const { db } = await import("@/lib/db");
    (db.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: vi.fn(() => Promise.reject(new Error("db error"))),
    }));

    const result = await createUser({ ...defaultUserInput, password: undefined });
    expect(result).toEqual({ success: false, error: "createUserFailed" });
  });

  it("returns rateLimited when rate limit is exceeded", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "actor-1", role: "admin", username: "admin1" },
    });
    mocks.checkServerActionRateLimit.mockReturnValue({ error: "rateLimited" });

    const result = await createUser(defaultUserInput);
    expect(result).toEqual({ success: false, error: "rateLimited" });
  });

  it("returns error from validateRoleChange", async () => {
    const { createUser } = await import("@/lib/actions/user-management");
    setupAuthorizedAdmin();
    mocks.validateRoleChange.mockReturnValue("onlySuperAdminCanChangeSuperAdminRole");

    const result = await createUser({
      ...defaultUserInput,
      role: "super_admin",
    });
    expect(result).toEqual({ success: false, error: "onlySuperAdminCanChangeSuperAdminRole" });
  });
});
