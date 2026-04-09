import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  return {
    // db.delete chain helpers
    dbDeleteWhere: vi.fn(),

    // lt operator spy
    lt: vi.fn((_field: unknown, value: unknown) => ({ _lt: value })),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    lt: mocks.lt,
  };
});

vi.mock("@/lib/db/schema", () => ({
  auditEvents: {
    id: "auditEvents.id",
    createdAt: "auditEvents.createdAt",
  },
  loginEvents: {
    id: "loginEvents.id",
    createdAt: "loginEvents.createdAt",
  },
}));

// Track calls per table so we can assert independently
const deleteCallOrder: string[] = [];
const deleteReturningResults: Record<string, unknown[]> = {
  audit: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
  login: [{ id: "l1" }],
};

vi.mock("@/lib/db", () => ({
  db: {
    delete: vi.fn((table: unknown) => {
      const tableName = (table as { id: string }).id?.includes("audit")
        ? "audit"
        : "login";
      return {
        where: vi.fn((...args: unknown[]) => {
          deleteCallOrder.push(tableName);
          mocks.dbDeleteWhere(tableName, ...args);
          return {
            returning: vi.fn(() => Promise.resolve(deleteReturningResults[tableName] ?? [])),
          };
        }),
      };
    }),
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  deleteCallOrder.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanupOldEvents
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOldEvents", () => {
  it("returns the count of deleted audit and login events", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");

    const result = await cleanupOldEvents();
    expect(result).toEqual({ auditDeleted: 3, loginDeleted: 1 });
  });

  it("returns zero counts when no old events exist", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    deleteReturningResults.audit = [];
    deleteReturningResults.login = [];

    const result = await cleanupOldEvents();
    expect(result).toEqual({ auditDeleted: 0, loginDeleted: 0 });
  });

  it("calls db.delete with the auditEvents table reference", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    deleteReturningResults.audit = [];
    deleteReturningResults.login = [];

    await cleanupOldEvents();

    const { db } = await import("@/lib/db");
    const { auditEvents } = await import("@/lib/db/schema");
    expect(db.delete).toHaveBeenCalledWith(auditEvents);
  });

  it("calls db.delete with the loginEvents table reference", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    deleteReturningResults.audit = [];
    deleteReturningResults.login = [];

    await cleanupOldEvents();

    const { db } = await import("@/lib/db");
    const { loginEvents } = await import("@/lib/db/schema");
    expect(db.delete).toHaveBeenCalledWith(loginEvents);
  });

  it("uses a cutoff based on 90-day default retention", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    deleteReturningResults.audit = [];
    deleteReturningResults.login = [];

    const before = Date.now();
    await cleanupOldEvents();
    const after = Date.now();

    // lt is called for the 2 DELETE WHERE clauses
    expect(mocks.lt).toHaveBeenCalledTimes(2);

    const [, cutoff] = mocks.lt.mock.calls[0] as [unknown, Date];
    expect(cutoff).toBeInstanceOf(Date);

    const expectedMs90Days = 90 * 24 * 60 * 60 * 1000;
    const cutoffMs = cutoff.getTime();

    // The cutoff should be approximately (now - 90 days)
    expect(cutoffMs).toBeGreaterThanOrEqual(before - expectedMs90Days - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - expectedMs90Days + 1000);
  });

  it("deletes audit events before login events", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    deleteReturningResults.audit = [{ id: "a1" }];
    deleteReturningResults.login = [{ id: "l1" }];

    await cleanupOldEvents();

    expect(deleteCallOrder).toEqual(["audit", "login"]);
  });

  it("passes the same cutoff date to both audit and login deletes", async () => {
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    deleteReturningResults.audit = [];
    deleteReturningResults.login = [];

    await cleanupOldEvents();

    expect(mocks.lt).toHaveBeenCalledTimes(2);
    const [, auditDeleteCutoff] = mocks.lt.mock.calls[0] as [unknown, Date];
    const [, loginDeleteCutoff] = mocks.lt.mock.calls[1] as [unknown, Date];
    // Both calls reuse the same cutoff Date object (computed once)
    expect(auditDeleteCutoff).toBe(loginDeleteCutoff);
  });
});
