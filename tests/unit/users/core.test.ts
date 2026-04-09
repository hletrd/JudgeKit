import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    dbSelectMock: vi.fn(),
    hashPassword: vi.fn<() => Promise<string>>(),
    getPasswordValidationError: vi.fn<() => string | null>(),
    isUserRole: vi.fn<(v: string) => boolean>(),
    canManageRole: vi.fn<() => boolean>(),
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
  canManageRole: mocks.canManageRole,
}));

vi.mock("@/lib/security/password", () => ({
  getPasswordValidationError: mocks.getPasswordValidationError,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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

    const result = await validateAndHashPassword("StrongPass1!", { username: "alice" });
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

  it("passes context to getPasswordValidationError", async () => {
    const { validateAndHashPassword } = await import("@/lib/users/core");
    mocks.getPasswordValidationError.mockReturnValue(null);
    mocks.hashPassword.mockResolvedValue("hashed");

    const ctx = { username: "bob", email: "bob@example.com" };
    await validateAndHashPassword("Password1!", ctx);
    expect(mocks.getPasswordValidationError).toHaveBeenCalledWith("Password1!", ctx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateRoleChange
// ─────────────────────────────────────────────────────────────────────────────

describe("validateRoleChange", () => {
  it("returns null for a valid role change", async () => {
    const { validateRoleChange } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRole.mockReturnValue(true);

    const result = validateRoleChange("admin", "student");
    expect(result).toBeNull();
  });

  it("returns invalidRole for an invalid role string", async () => {
    const { validateRoleChange } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(false);

    const result = validateRoleChange("admin", "bogus_role");
    expect(result).toBe("invalidRole");
  });

  it("returns onlySuperAdminCanChangeSuperAdminRole when actor cannot manage role", async () => {
    const { validateRoleChange } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRole.mockReturnValue(false);

    const result = validateRoleChange("admin", "super_admin");
    expect(result).toBe("onlySuperAdminCanChangeSuperAdminRole");
  });

  it("returns cannotChangeSuperAdminRole when trying to demote a super_admin", async () => {
    const { validateRoleChange } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRole.mockReturnValue(true);

    const result = validateRoleChange("super_admin", "admin", "super_admin");
    expect(result).toBe("cannotChangeSuperAdminRole");
  });

  it("returns null when super_admin keeps super_admin role for a super_admin target", async () => {
    const { validateRoleChange } = await import("@/lib/users/core");
    mocks.isUserRole.mockReturnValue(true);
    mocks.canManageRole.mockReturnValue(true);

    const result = validateRoleChange("super_admin", "super_admin", "super_admin");
    expect(result).toBeNull();
  });
});
