import { beforeEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { hash as bcryptHash } from "bcryptjs";

const {
  dbUpdateMock,
  dbSetMock,
  dbWhereMock,
  loggerInfoMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  dbSetMock: vi.fn(),
  dbWhereMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

// Mock the DB to avoid real database calls in verifyAndRehashPassword
vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id" },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

import { verifyAndRehashPassword, verifyPassword, hashPassword } from "@/lib/security/password-hash";

beforeEach(() => {
  vi.clearAllMocks();
  dbWhereMock.mockResolvedValue(undefined);
  dbSetMock.mockReturnValue({ where: dbWhereMock });
  dbUpdateMock.mockReturnValue({ set: dbSetMock });
});

describe("verifyPassword", () => {
  it("returns needsRehash=true for a correct bcrypt password", async () => {
    const hash = await bcryptHash("testpassword123", 10);

    const result = await verifyPassword("testpassword123", hash);

    expect(result).toEqual({ valid: true, needsRehash: true });
  });

  it("returns needsRehash=false for an argon2 hash with current parameters", async () => {
    const password = "test-password-for-rehash-check";
    const hash = await hashPassword(password);

    const result = await verifyPassword(password, hash);

    expect(result.valid).toBe(true);
    // Hash was just created with current ARGON2_OPTIONS, so needsRehash should be false
    expect(result.needsRehash).toBe(false);
  });

  it("returns needsRehash=true for an argon2 hash with different parameters", async () => {
    const password = "test-password-for-rehash-check";
    // Hash with lower memory cost than the current default
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 4096, // Lower than the default 19456
      timeCost: 1,       // Lower than the default 2
      parallelism: 1,
    });

    // Verify the hash was created with different parameters
    expect(argon2.needsRehash(hash, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    })).toBe(true);

    const result = await verifyPassword(password, hash);

    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  it("returns valid=false for an incorrect password", async () => {
    const password = "correct-password";
    const hash = await hashPassword(password);

    const result = await verifyPassword("wrong-password", hash);

    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it("returns valid=false for incorrect password even with mismatched parameters", async () => {
    const hash = await argon2.hash("real-password", {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 1,
      parallelism: 1,
    });

    const result = await verifyPassword("wrong-password", hash);

    expect(result.valid).toBe(false);
    // needsRehash should be false when valid is false, even if parameters differ
    expect(result.needsRehash).toBe(false);
  });
});

describe("verifyAndRehashPassword", () => {
  it("persists a fresh argon2 hash when a valid legacy bcrypt password is used", async () => {
    const hash = await bcryptHash("testpassword123", 10);

    const result = await verifyAndRehashPassword("testpassword123", "user-1", hash);

    expect(result).toEqual({ valid: true });
    expect(dbUpdateMock).toHaveBeenCalled();
    expect(dbSetMock).toHaveBeenCalledWith({
      passwordHash: expect.stringMatching(/^\$argon2id\$/),
    });
    expect(dbWhereMock).toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { userId: "user-1", reason: "bcrypt to argon2id" },
      "[password-rehash] Transparently rehashed password (%s)",
      "bcrypt to argon2id"
    );
  });

  it("does not rehash invalid passwords", async () => {
    const hash = await bcryptHash("real-password", 10);

    const result = await verifyAndRehashPassword("wrong-password", "user-1", hash);

    expect(result).toEqual({ valid: false });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("logs but does not fail login when rehash persistence fails", async () => {
    const hash = await bcryptHash("testpassword123", 10);
    dbWhereMock.mockRejectedValueOnce(new Error("db down"));

    const result = await verifyAndRehashPassword("testpassword123", "user-1", hash);

    expect(result).toEqual({ valid: true });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "user-1" },
      "[password-rehash] Failed to rehash password"
    );
  });
});
