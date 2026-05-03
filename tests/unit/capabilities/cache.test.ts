import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  roles: {},
}));

describe("capabilities cache bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    });
  });

  it("bootstraps all built-in roles, including assistant, when the DB is empty", async () => {
    const {
      resolveCapabilities,
      getRoleLevel,
      getAllCachedRoles,
      isValidRole,
    } = await import("@/lib/capabilities/cache");

    const assistantCaps = await resolveCapabilities("assistant");
    const assistantLevel = await getRoleLevel("assistant");
    const allRoles = await getAllCachedRoles();

    // Assistants intentionally do NOT have submissions.view_all — the
    // group-scope filter at src/lib/assignments/submissions.ts:165-179 is
    // what restricts assistants to their assigned teaching groups when
    // assignments.view_status is granted (commit 246822fa). Pick a
    // representative cap that IS in the assistant set so the bootstrap
    // assertion still verifies "the assistant role got its capabilities
    // wired up" without re-introducing the over-permissive flag.
    expect(assistantCaps.has("assignments.view_status")).toBe(true);
    expect(assistantCaps.has("submissions.view_source")).toBe(true);
    expect(assistantCaps.has("submissions.view_all")).toBe(false);
    expect(assistantLevel).toBe(1);
    expect(await isValidRole("assistant")).toBe(true);
    expect(allRoles.map((role) => role.name)).toContain("assistant");
  });
});
