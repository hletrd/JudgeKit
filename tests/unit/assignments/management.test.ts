import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, resolveCapabilitiesMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-id"),
}));

import {
  canManageGroupMembersAsync,
  canManageGroupResources,
  canManageGroupResourcesAsync,
  getManageableProblemsForGroup,
  hasGroupInstructorRole,
  isGroupTA,
} from "@/lib/assignments/management";

function mockGroupInstructorRow(row: { role: string } | undefined) {
  dbMock.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => (row ? [row] : [])),
      })),
    })),
  });
}

function mockProblemSelectRows(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    then: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockResolvedValue(rows);
  chain.then.mockImplementation((cb: (value: unknown[]) => unknown) => Promise.resolve(cb(rows)));
  dbMock.select.mockReturnValue(chain);
  dbMock.selectDistinct.mockReturnValue(chain);
}

describe("group management helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCapabilitiesMock.mockResolvedValue(new Set<string>());
    mockGroupInstructorRow(undefined);
  });

  it("treats group ownership as the built-in synchronous management baseline", async () => {
    expect(canManageGroupResources("owner-1", "owner-1")).toBe(true);
    expect(canManageGroupResources("owner-1", "admin-1")).toBe(false);
    await expect(
      canManageGroupResourcesAsync("owner-1", "owner-1", "instructor", "group-1")
    ).resolves.toBe(true);
  });

  it("allows global group managers through groups.view_all capability", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.view_all"]));

    await expect(
      canManageGroupResourcesAsync("owner-1", "custom-1", "custom_manager", "group-1")
    ).resolves.toBe(true);
  });

  it("does not let plain assignment editors manage arbitrary groups without scope", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set(["assignments.edit"]));

    await expect(
      canManageGroupResourcesAsync("owner-1", "custom-1", "custom_manager", "group-1")
    ).resolves.toBe(false);
  });

  it("allows co-instructors to manage group resources", async () => {
    mockGroupInstructorRow({ role: "co_instructor" });

    await expect(
      canManageGroupResourcesAsync("owner-1", "co-1", "instructor", "group-1")
    ).resolves.toBe(true);
  });

  it("does not allow TAs to manage group resources", async () => {
    mockGroupInstructorRow({ role: "ta" });

    await expect(
      canManageGroupResourcesAsync("owner-1", "ta-1", "instructor", "group-1")
    ).resolves.toBe(false);
  });

  it("allows TAs to manage group members only with the explicit groups.manage_members capability", async () => {
    mockGroupInstructorRow({ role: "ta" });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.manage_members"]));

    await expect(
      canManageGroupMembersAsync("owner-1", "ta-1", "custom_ta", "group-1")
    ).resolves.toBe(true);
  });

  it("does not allow unscoped roles to manage group members without the explicit capability", async () => {
    mockGroupInstructorRow({ role: "ta" });
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    await expect(
      canManageGroupMembersAsync("owner-1", "ta-1", "custom_ta", "group-1")
    ).resolves.toBe(false);
  });

  it("still reports TAs as having an instructional role for view access", async () => {
    mockGroupInstructorRow({ role: "ta" });

    await expect(isGroupTA("group-1", "ta-1")).resolves.toBe(true);
    await expect(hasGroupInstructorRole("group-1", "ta-1", "owner-1")).resolves.toBe(true);
  });

  it("lets roles with problems.view_all load the full problem list", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set(["problems.view_all"]));
    mockProblemSelectRows([{ id: "problem-1", title: "A + B", authorId: "author-1", visibility: "private" }]);

    await expect(
      getManageableProblemsForGroup("group-1", "custom-1", "custom_editor")
    ).resolves.toEqual([
      { id: "problem-1", title: "A + B", authorId: "author-1", visibility: "private" },
    ]);
    expect(dbMock.select).toHaveBeenCalled();
    expect(dbMock.selectDistinct).not.toHaveBeenCalled();
  });

  it("keeps scoped roles on the distinct filtered query when they lack problems.view_all", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set(["assignments.edit"]));
    mockProblemSelectRows([{ id: "problem-2", title: "Scoped", authorId: "custom-1", visibility: "hidden" }]);

    await expect(
      getManageableProblemsForGroup("group-1", "custom-1", "custom_editor")
    ).resolves.toEqual([
      { id: "problem-2", title: "Scoped", authorId: "custom-1", visibility: "hidden" },
    ]);
    expect(dbMock.selectDistinct).toHaveBeenCalled();
  });
});
