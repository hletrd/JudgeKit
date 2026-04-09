import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelectFromLimit: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  dbQueryUsersFindFirst: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.dbSelectFromLimit,
        })),
      })),
    })),
    query: {
      users: {
        findFirst: mocks.dbQueryUsersFindFirst,
      },
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "users.id",
    username: "users.username",
  },
}));

vi.mock("@/lib/db/selects", () => ({
  authUserSelect: {
    id: "users.id",
    role: "users.role",
    username: "users.username",
    email: "users.email",
    name: "users.name",
    className: "users.className",
    isActive: "users.isActive",
    mustChangePassword: "users.mustChangePassword",
    tokenInvalidatedAt: "users.tokenInvalidatedAt",
  },
}));

import {
  hasSessionIdentity,
  findSessionUser,
  findSessionUserWithPassword,
} from "@/lib/auth/find-session-user";

// ---------------------------------------------------------------------------
// hasSessionIdentity
// ---------------------------------------------------------------------------

describe("hasSessionIdentity", () => {
  it("returns true when session has user.id", () => {
    expect(hasSessionIdentity({ user: { id: "user-1" } } as any)).toBe(true);
  });

  it("returns true when session has user.username", () => {
    expect(hasSessionIdentity({ user: { username: "alice" } } as any)).toBe(true);
  });

  it("returns true when session has both id and username", () => {
    expect(
      hasSessionIdentity({ user: { id: "user-1", username: "alice" } } as any)
    ).toBe(true);
  });

  it("returns false for null session", () => {
    expect(hasSessionIdentity(null)).toBe(false);
  });

  it("returns false for session with empty user object", () => {
    expect(hasSessionIdentity({ user: {} } as any)).toBe(false);
  });

  it("returns false for session with null user", () => {
    expect(hasSessionIdentity({ user: null } as any)).toBe(false);
  });

  it("returns false for session with undefined user", () => {
    expect(hasSessionIdentity({ user: undefined } as any)).toBe(false);
  });

  it("returns false for empty session object (no user key)", () => {
    expect(hasSessionIdentity({} as any)).toBe(false);
  });

  it("returns false when id is empty string", () => {
    expect(hasSessionIdentity({ user: { id: "" } } as any)).toBe(false);
  });

  it("returns false when username is empty string", () => {
    expect(hasSessionIdentity({ user: { username: "" } } as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findSessionUser
// ---------------------------------------------------------------------------

describe("findSessionUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for null session", async () => {
    const result = await findSessionUser(null);
    expect(result).toBeNull();
    expect(mocks.dbSelectFromLimit).not.toHaveBeenCalled();
  });

  it("returns null for session with no identity", async () => {
    const result = await findSessionUser({ user: {} } as any);
    expect(result).toBeNull();
    expect(mocks.dbSelectFromLimit).not.toHaveBeenCalled();
  });

  it("returns null for session with empty user", async () => {
    const result = await findSessionUser({ user: null } as any);
    expect(result).toBeNull();
    expect(mocks.dbSelectFromLimit).not.toHaveBeenCalled();
  });

  it("looks up user by id when session has id", async () => {
    const mockUser = { id: "user-1", username: "alice" };
    mocks.dbSelectFromLimit.mockResolvedValueOnce([mockUser]);

    const result = await findSessionUser({ user: { id: "user-1" } } as any);

    expect(result).toBe(mockUser);
    expect(mocks.dbSelectFromLimit).toHaveBeenCalled();
  });

  it("returns null when id lookup finds no user", async () => {
    mocks.dbSelectFromLimit.mockResolvedValueOnce([]);

    const result = await findSessionUser({ user: { id: "nonexistent" } } as any);

    expect(result).toBeUndefined();
  });

  it("falls back to username lookup when id is absent", async () => {
    const mockUser = { id: "user-2", username: "bob" };
    mocks.dbSelectFromLimit.mockResolvedValueOnce([mockUser]);

    const result = await findSessionUser({ user: { username: "bob" } } as any);

    expect(result).toBe(mockUser);
    expect(mocks.dbSelectFromLimit).toHaveBeenCalled();
  });

  it("returns null when username lookup finds no user", async () => {
    mocks.dbSelectFromLimit.mockResolvedValueOnce([]);

    const result = await findSessionUser({ user: { username: "nobody" } } as any);

    expect(result).toBeUndefined();
  });

  it("prefers id over username when both are present", async () => {
    const mockUser = { id: "user-1", username: "alice" };
    mocks.dbSelectFromLimit.mockResolvedValueOnce([mockUser]);

    const result = await findSessionUser({
      user: { id: "user-1", username: "alice" },
    } as any);

    expect(result).toBe(mockUser);
    // Only one call should be made (the id-based lookup)
    expect(mocks.dbSelectFromLimit).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// findSessionUserWithPassword
// ---------------------------------------------------------------------------

describe("findSessionUserWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for null session", async () => {
    const result = await findSessionUserWithPassword(null);
    expect(result).toBeNull();
    expect(mocks.dbQueryUsersFindFirst).not.toHaveBeenCalled();
  });

  it("returns null for session with no identity", async () => {
    const result = await findSessionUserWithPassword({ user: {} } as any);
    expect(result).toBeNull();
    expect(mocks.dbQueryUsersFindFirst).not.toHaveBeenCalled();
  });

  it("returns null for session with null user", async () => {
    const result = await findSessionUserWithPassword({ user: null } as any);
    expect(result).toBeNull();
    expect(mocks.dbQueryUsersFindFirst).not.toHaveBeenCalled();
  });

  it("looks up user by id using db.query.users.findFirst", async () => {
    const mockUser = { id: "user-1", username: "alice", passwordHash: "hash" };
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);

    const result = await findSessionUserWithPassword({
      user: { id: "user-1" },
    } as any);

    expect(result).toBe(mockUser);
    expect(mocks.dbQueryUsersFindFirst).toHaveBeenCalledTimes(1);
  });

  it("returns null when id lookup via findFirst finds no user", async () => {
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(undefined);

    const result = await findSessionUserWithPassword({
      user: { id: "nonexistent" },
    } as any);

    expect(result).toBeUndefined();
  });

  it("falls back to username lookup when id is absent", async () => {
    const mockUser = { id: "user-2", username: "bob", passwordHash: "hash" };
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);

    const result = await findSessionUserWithPassword({
      user: { username: "bob" },
    } as any);

    expect(result).toBe(mockUser);
    expect(mocks.dbQueryUsersFindFirst).toHaveBeenCalledTimes(1);
  });

  it("returns null when username lookup via findFirst finds no user", async () => {
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(undefined);

    const result = await findSessionUserWithPassword({
      user: { username: "nobody" },
    } as any);

    expect(result).toBeUndefined();
  });

  it("prefers id over username when both are present", async () => {
    const mockUser = { id: "user-1", username: "alice", passwordHash: "hash" };
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);

    const result = await findSessionUserWithPassword({
      user: { id: "user-1", username: "alice" },
    } as any);

    expect(result).toBe(mockUser);
    expect(mocks.dbQueryUsersFindFirst).toHaveBeenCalledTimes(1);
  });
});
