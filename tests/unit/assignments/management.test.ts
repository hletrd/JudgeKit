import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, resolveCapabilitiesMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
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
  canManageGroupResources,
  canManageGroupResourcesAsync,
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

describe("group management helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCapabilitiesMock.mockResolvedValue(new Set<string>());
    mockGroupInstructorRow(undefined);
  });

  it("keeps built-in owner/admin behavior", async () => {
    expect(canManageGroupResources("owner-1", "owner-1", "instructor")).toBe(true);
    expect(canManageGroupResources("owner-1", "admin-1", "admin")).toBe(true);
    await expect(
      canManageGroupResourcesAsync("owner-1", "owner-1", "instructor", "group-1")
    ).resolves.toBe(true);
  });

  it("allows assignment editors through explicit capability", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set(["assignments.edit"]));

    await expect(
      canManageGroupResourcesAsync("owner-1", "custom-1", "custom_manager", "group-1")
    ).resolves.toBe(true);
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

  it("still reports TAs as having an instructional role for view access", async () => {
    mockGroupInstructorRow({ role: "ta" });

    await expect(isGroupTA("group-1", "ta-1")).resolves.toBe(true);
    await expect(hasGroupInstructorRole("group-1", "ta-1", "owner-1")).resolves.toBe(true);
  });
});
