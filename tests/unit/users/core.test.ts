import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    dbSelectMock: vi.fn(),
    hashPassword: vi.fn<() => Promise<string>>(),
    getPasswordValidationError: vi.fn<() => string | null>(),
    isUserRole: vi.fn<(v: string) => boolean>(),
    isValidRole: vi.fn<() => Promise<boolean>>(),
    canManageRoleAsync: vi.fn<() => Promise<boolean>>(),
    isSuperAdminRole: vi.fn<(role: string) => Promise<boolean>>(),
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
    sql: vi.fn((...args: unknown[]) => ({ _sql: args })),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: mocks.eq,
    sql: mocks.sql,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "users.id",
    username: "users.username",
    email: "users.email",
  },
}));

vi.mock("@/lib/security/password-hash", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/security/constants", () => ({
  isUserRole: mocks.isUserRole,
  canManageRoleAsync: mocks.canManageRoleAsync,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  isValidRole: mocks.isValidRole,
  isSuperAdminRole: mocks.isSuperAdminRole,
}));

vi.mock("@/lib/security/password", () => ({
  getPasswordValidationError: mocks.getPasswordValidationError,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isValidRole.mockResolvedValue(false);
  mocks.dbSelectMock.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// isUsernameTaken
// ─────────────────────────────────────────────────────────────────────────────

describe("isUsernameTaken", () => {
  it("returns true when username exists", async () => {
    const { isUsernameTaken } = await import("@/lib/users/core");
    mocks.dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "user-1" }])),
        })),
      })),
    }));

    const result = await isUsernameTaken("alice");
    expect(result).toBe(true);
  });

  it("returns false when username does not exist", async () => {
    const { isUsernameTaken } = await import("@/lib/users/core");

    const result = await isUsernameTaken("alice");
    expect(result).toBe(false);
  });

  it("returns false when existing user id matches excludeId (self-check)", async () => {
    const { isUsernameTaken } = await import("@/lib/users/core");
    mocks.dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "user-1" }])),
        })),
      })),
    }));

    const result = await isUsernameTaken("alice", "user-1");
    expect(result).toBe(false);
  });

  it("returns true when existing user id does not match excludeId", async () => {
    const { isUsernameTaken } = await import("@/lib/users/core");
    mocks.dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "user-2" }])),
        })),
      })),
    }));

    const result = await isUsernameTaken("alice", "user-1");
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isEmailTaken
// ─────────────────────────────────────────────────────────────────────────────

describe("isEmailTaken", () => {
  it("returns true when email exists", async () => {
    const { isEmailTaken } = await import("@/lib/users/core");
    mocks.dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "user-1" }])),
        })),
      })),
    }));

    const result = await isEmailTaken("alice@example.com");
    expect(result).toBe(true);
  });

  it("returns false when email does not exist", async () => {
    const { isEmailTaken } = await import("@/lib/users/core");

    const result = await isEmailTaken("alice@example.com");
    expect(result).toBe(false);
  });

  it("returns false when existing user id matches excludeId", async () => {
    const { isEmailTaken } = await import("@/lib/users/core");
    mocks.dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "user-1" }])),
        })),
      })),
    }));

    const result = await isEmailTaken("alice@example.com", "user-1");
    expect(result).toBe(false);
  });

  it("returns true when existing user id does not match excludeId", async () => {
    const { isEmailTaken } = await import("@/lib/users/core");
    mocks.dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "user-2" }])),
        })),
      })),
    }));

    const result = await isEmailTaken("alice@example.com", "user-1");
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateAndHashPassword
// ─────────────────────────────────────────────────────────────────────────────

describe("validateAndHashPassword", () => {
  it("returns hash on valid password", async () => {
    const { validateAndHashPassword } = await import("@/lib/users/core");
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hashPassword.mockResolvedValue("hashed-password");

    // validateAndHashPassword takes a single password argument; the optional
    // context parameter was removed when the password policy was simplified
    // to "minimum length only" (see AGENTS.md / src/lib/security/password.ts).
    const result = await validateAndHashPassword("StrongPass1!");
    expect(result).toEqual({ hash: "hashed-password" });
    expect(mocks.hashPassword).toHaveBeenCalledWith("StrongPass1!");
  });

  it("returns error when validation fails", async () => {
    const { validateAndHashPassword } = await import("@/lib/users/core");
    mocks.getPasswordValidationError.mockReturnValue("passwordTooShort");

    const result = await validateAndHashPassword("weak");
    expect(result).toEqual({ error: "passwordTooShort" });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("calls getPasswordValidationError with just the password (no context arg)", async () => {
    const { validateAndHashPassword } = await import("@/lib/users/core");
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hashPassword.mockResolvedValue("hashed");

    // The legacy 2-arg form (password, ctx) was dropped along with the
    // simplified policy. Guard against accidental reintroduction.
    await validateAndHashPassword("Password1!");
    expect(mocks.getPasswordValidationError).toHaveBeenCalledWith("Password1!");
    expect(mocks.getPasswordValidationError).toHaveBeenCalledTimes(1);
  });
});

describe("validateRoleChangeAsync", () => {
  it("returns null for a valid built-in assignment", async () => {
    const { validateRoleChangeAsync } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRoleAsync.mockResolvedValue(true);

    const result = await validateRoleChangeAsync("custom_editor", "student");
    expect(result).toBeNull();
  });

  it("returns null for a valid custom-role assignment", async () => {
    const { validateRoleChangeAsync } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(false);
    mocks.isValidRole.mockResolvedValue(true);
    mocks.canManageRoleAsync.mockResolvedValue(true);

    const result = await validateRoleChangeAsync("super_admin", "custom_reviewer");
    expect(result).toBeNull();
  });

  it("returns invalidRole for an invalid role string", async () => {
    const { validateRoleChangeAsync } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(false);

    const result = await validateRoleChangeAsync("custom_editor", "bogus_role");
    expect(result).toBe("invalidRole");
  });

  it("returns roleAssignmentNotAllowed when actor level is too low for non-super-admin role", async () => {
    const { validateRoleChangeAsync } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRoleAsync.mockResolvedValue(false);
    mocks.isSuperAdminRole.mockResolvedValue(false);

    const result = await validateRoleChangeAsync("custom_editor", "admin");
    expect(result).toBe("roleAssignmentNotAllowed");
  });

  it("returns onlySuperAdminCanChangeSuperAdminRole when actor level is too low for super_admin role", async () => {
    const { validateRoleChangeAsync } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRoleAsync.mockResolvedValue(false);
    mocks.isSuperAdminRole.mockImplementation(async (role: string) => role === "super_admin");

    const result = await validateRoleChangeAsync("custom_editor", "super_admin");
    expect(result).toBe("onlySuperAdminCanChangeSuperAdminRole");
  });

  it("returns cannotChangeSuperAdminRole when trying to demote a super_admin target", async () => {
    const { validateRoleChangeAsync } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRoleAsync.mockResolvedValue(true);
    mocks.isSuperAdminRole.mockImplementation(async (role: string) => role === "super_admin");

    const result = await validateRoleChangeAsync("super_admin", "admin", "super_admin");
    expect(result).toBe("cannotChangeSuperAdminRole");
  });
});
