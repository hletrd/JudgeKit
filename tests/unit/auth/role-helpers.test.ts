import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getRoleLevel: vi.fn<(role: string) => Promise<number>>(),
  resolveCapabilities: vi.fn<(role: string) => Promise<Set<string>>>(),
}));

vi.mock("@/lib/security/constants", () => ({
  ROLE_LEVEL: {
    student: 0,
    instructor: 1,
    admin: 2,
    super_admin: 3,
  },
}));

vi.mock("@/lib/capabilities/cache", () => ({
  getRoleLevel: mocks.getRoleLevel,
  resolveCapabilities: mocks.resolveCapabilities,
}));

import {
  isAtLeastRole,
  isAtLeastRoleAsync,
  canManageUsers,
  canManageUsersAsync,
  isInstructorOrAbove,
  isInstructorOrAboveAsync,
} from "@/lib/auth/role-helpers";

// ---------------------------------------------------------------------------
// isAtLeastRole
// ---------------------------------------------------------------------------

describe("isAtLeastRole", () => {
  it("returns true when user role equals required role", () => {
    expect(isAtLeastRole("instructor", "instructor")).toBe(true);
  });

  it("returns true when user role exceeds required role (admin >= instructor)", () => {
    expect(isAtLeastRole("admin", "instructor")).toBe(true);
  });

  it("returns true for super_admin >= admin", () => {
    expect(isAtLeastRole("super_admin", "admin")).toBe(true);
  });

  it("returns true for super_admin >= student", () => {
    expect(isAtLeastRole("super_admin", "student")).toBe(true);
  });

  it("returns false when user role is below required role (student < instructor)", () => {
    expect(isAtLeastRole("student", "instructor")).toBe(false);
  });

  it("returns false when student < admin", () => {
    expect(isAtLeastRole("student", "admin")).toBe(false);
  });

  it("returns false when instructor < admin", () => {
    expect(isAtLeastRole("instructor", "admin")).toBe(false);
  });

  it("returns false when instructor < super_admin", () => {
    expect(isAtLeastRole("instructor", "super_admin")).toBe(false);
  });

  it("returns false for unknown role vs known role", () => {
    expect(isAtLeastRole("guest", "student")).toBe(false);
  });

  it("returns true when comparing two unknown roles (both -1)", () => {
    expect(isAtLeastRole("guest", "visitor")).toBe(true);
  });

  it("returns true when known role >= unknown role (student is 0, unknown is -1)", () => {
    expect(isAtLeastRole("student", "unknown_role")).toBe(true);
  });

  it("returns false when unknown role < known role (unknown is -1, student is 0)", () => {
    expect(isAtLeastRole("unknown_role", "student")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAtLeastRoleAsync
// ---------------------------------------------------------------------------

describe("isAtLeastRoleAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when user level >= required level", async () => {
    mocks.getRoleLevel
      .mockResolvedValueOnce(2) // userRole = "admin"
      .mockResolvedValueOnce(1); // requiredRole = "instructor"

    expect(await isAtLeastRoleAsync("admin", "instructor")).toBe(true);
  });

  it("returns false when user level < required level", async () => {
    mocks.getRoleLevel
      .mockResolvedValueOnce(0) // userRole = "student"
      .mockResolvedValueOnce(2); // requiredRole = "admin"

    expect(await isAtLeastRoleAsync("student", "admin")).toBe(false);
  });

  it("returns true when levels are equal", async () => {
    mocks.getRoleLevel
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    expect(await isAtLeastRoleAsync("instructor", "instructor")).toBe(true);
  });

  it("delegates to getRoleLevel for both roles", async () => {
    mocks.getRoleLevel
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);

    await isAtLeastRoleAsync("super_admin", "student");

    expect(mocks.getRoleLevel).toHaveBeenCalledWith("super_admin");
    expect(mocks.getRoleLevel).toHaveBeenCalledWith("student");
  });
});

// ---------------------------------------------------------------------------
// canManageUsers
// ---------------------------------------------------------------------------

describe("canManageUsers", () => {
  it("returns true for admin", () => {
    expect(canManageUsers("admin")).toBe(true);
  });

  it("returns true for super_admin", () => {
    expect(canManageUsers("super_admin")).toBe(true);
  });

  it("returns false for student", () => {
    expect(canManageUsers("student")).toBe(false);
  });

  it("returns false for instructor", () => {
    expect(canManageUsers("instructor")).toBe(false);
  });

  it("returns false for unknown role", () => {
    expect(canManageUsers("guest")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canManageUsersAsync
// ---------------------------------------------------------------------------

describe("canManageUsersAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when capabilities include both users.view and users.edit", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["users.view", "users.edit", "users.delete"])
    );

    expect(await canManageUsersAsync("admin")).toBe(true);
  });

  it("returns false when capabilities are missing users.edit", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["users.view"])
    );

    expect(await canManageUsersAsync("instructor")).toBe(false);
  });

  it("returns false when capabilities are missing users.view", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["users.edit"])
    );

    expect(await canManageUsersAsync("custom_role")).toBe(false);
  });

  it("returns false when capabilities are empty", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(new Set());

    expect(await canManageUsersAsync("student")).toBe(false);
  });

  it("returns false when capabilities have unrelated permissions", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["content.submit_solutions", "problems.create"])
    );

    expect(await canManageUsersAsync("student")).toBe(false);
  });

  it("delegates to resolveCapabilities with the role name", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(new Set());

    await canManageUsersAsync("custom_role");

    expect(mocks.resolveCapabilities).toHaveBeenCalledWith("custom_role");
  });
});

// ---------------------------------------------------------------------------
// isInstructorOrAbove
// ---------------------------------------------------------------------------

describe("isInstructorOrAbove", () => {
  it("returns true for instructor", () => {
    expect(isInstructorOrAbove("instructor")).toBe(true);
  });

  it("returns true for admin", () => {
    expect(isInstructorOrAbove("admin")).toBe(true);
  });

  it("returns true for super_admin", () => {
    expect(isInstructorOrAbove("super_admin")).toBe(true);
  });

  it("returns false for student", () => {
    expect(isInstructorOrAbove("student")).toBe(false);
  });

  it("returns false for unknown role", () => {
    expect(isInstructorOrAbove("guest")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInstructorOrAboveAsync
// ---------------------------------------------------------------------------

describe("isInstructorOrAboveAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when capabilities include problems.create", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["problems.create", "content.submit_solutions"])
    );

    expect(await isInstructorOrAboveAsync("instructor")).toBe(true);
  });

  it("returns true when capabilities include submissions.view_all", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["submissions.view_all"])
    );

    expect(await isInstructorOrAboveAsync("instructor")).toBe(true);
  });

  it("returns true when capabilities include both problems.create and submissions.view_all", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["problems.create", "submissions.view_all"])
    );

    expect(await isInstructorOrAboveAsync("admin")).toBe(true);
  });

  it("returns false when capabilities lack both required permissions", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(
      new Set(["content.submit_solutions", "content.view_own_submissions"])
    );

    expect(await isInstructorOrAboveAsync("student")).toBe(false);
  });

  it("returns false when capabilities are empty", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(new Set());

    expect(await isInstructorOrAboveAsync("unknown")).toBe(false);
  });

  it("delegates to resolveCapabilities with the role name", async () => {
    mocks.resolveCapabilities.mockResolvedValueOnce(new Set());

    await isInstructorOrAboveAsync("custom_role");

    expect(mocks.resolveCapabilities).toHaveBeenCalledWith("custom_role");
  });
});
