import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock, dbUpdateMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  // limit() must return a thenable so `await db.select()...limit(1)` resolves
  chain.limit.mockReturnValue(chain);
  chain.then.mockImplementation((cb: (value: unknown) => unknown) => Promise.resolve(cb(rows)));
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

vi.mock("@/lib/db/selects", () => ({
  authUserSelect: {},
}));

vi.mock("@/lib/capabilities/cache", () => ({
  getRoleLevel: vi.fn(async (role: string) => {
    const defaultLevels: Record<string, number> = {
      student: 0,
      instructor: 1,
      admin: 2,
      super_admin: 3,
      custom_reviewer: 1,
      custom_admin: 2,
    };
    return defaultLevels[role] ?? -1;
  }),
}));

describe("api-key-auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes generated API keys consistently", async () => {
    const { API_KEY_PREFIX, generateApiKey, hashApiKey } = await import("@/lib/api/api-key-auth");

    const generated = generateApiKey();

    expect(generated.rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(generated.keyPrefix).toBe(generated.rawKey.slice(0, 8));
    expect(generated.keyHash).toBe(hashApiKey(generated.rawKey));
  });

  it("authenticates using the stored key hash and updates lastUsedAt", async () => {
    const { generateApiKey, authenticateApiKey } = await import("@/lib/api/api-key-auth");
    const generated = generateApiKey();

    const candidateChain = makeSelectChain([
      {
        id: "api-key-1",
        createdById: "user-1",
        role: "admin",
        expiresAt: null,
        isActive: true,
      },
    ]);
    const userChain = makeSelectChain([
      {
        id: "user-1",
        username: "admin",
        email: "admin@example.com",
        name: "Admin",
        className: null,
        role: "admin",
        isActive: true,
      },
    ]);

    dbSelectMock
      .mockReturnValueOnce(candidateChain)
      .mockReturnValueOnce(userChain);

    const updateWhereMock = vi.fn().mockReturnValue(Promise.resolve());
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
    dbUpdateMock.mockReturnValue({ set: updateSetMock });

    const user = await authenticateApiKey(`Bearer ${generated.rawKey}`);

    expect(user).toMatchObject({
      id: "user-1",
      username: "admin",
      role: "admin",
      _apiKeyAuth: true,
    });
    expect(candidateChain.where).toHaveBeenCalledOnce();
    expect(updateSetMock).toHaveBeenCalledOnce();
    expect(updateWhereMock).toHaveBeenCalledOnce();
  });

  it("rejects malformed bearer tokens before querying the database", async () => {
    const { authenticateApiKey } = await import("@/lib/api/api-key-auth");

    await expect(authenticateApiKey("Bearer invalid")).resolves.toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("uses custom-role levels when clamping API key privileges", async () => {
    const { generateApiKey, authenticateApiKey } = await import("@/lib/api/api-key-auth");
    const generated = generateApiKey();

    const candidateChain = makeSelectChain([
      {
        id: "api-key-2",
        createdById: "user-2",
        role: "custom_admin",
        expiresAt: null,
        isActive: true,
      },
    ]);
    const userChain = makeSelectChain([
      {
        id: "user-2",
        username: "reviewer",
        email: "reviewer@example.com",
        name: "Reviewer",
        className: null,
        role: "custom_reviewer",
        isActive: true,
      },
    ]);

    dbSelectMock
      .mockReturnValueOnce(candidateChain)
      .mockReturnValueOnce(userChain);

    const updateWhereMock = vi.fn().mockReturnValue(Promise.resolve());
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
    dbUpdateMock.mockReturnValue({ set: updateSetMock });

    const user = await authenticateApiKey(`Bearer ${generated.rawKey}`);

    expect(user).toMatchObject({
      id: "user-2",
      role: "custom_reviewer",
      _apiKeyAuth: true,
    });
  });
});
