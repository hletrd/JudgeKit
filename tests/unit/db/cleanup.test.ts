import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    sql: mocks.sql,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    execute: mocks.dbExecute,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  auditEvents: { createdAt: "auditEvents.createdAt" },
  loginEvents: { createdAt: "loginEvents.createdAt" },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.AUDIT_RETENTION_DAYS;
  vi.restoreAllMocks();
});

describe("cleanupOldEvents", () => {
  it("returns the rowCount from raw delete statements", async () => {
    mocks.dbExecute
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    const result = await cleanupOldEvents();

    expect(result).toEqual({ auditDeleted: 3, loginDeleted: 1 });
  });

  it("issues two raw delete statements using the same cutoff date", async () => {
    mocks.dbExecute
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 });

    const before = Date.now();
    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    await cleanupOldEvents();
    const after = Date.now();

    expect(mocks.dbExecute).toHaveBeenCalledTimes(2);
    const firstQuery = mocks.dbExecute.mock.calls[0]?.[0] as { values: unknown[] };
    const secondQuery = mocks.dbExecute.mock.calls[1]?.[0] as { values: unknown[] };
    const firstCutoff = firstQuery.values.find((value) => value instanceof Date) as Date;
    const secondCutoff = secondQuery.values.find((value) => value instanceof Date) as Date;

    expect(firstCutoff).toBeInstanceOf(Date);
    expect(secondCutoff).toBe(firstCutoff);

    const expectedMs90Days = 90 * 24 * 60 * 60 * 1000;
    const cutoffMs = firstCutoff.getTime();
    expect(cutoffMs).toBeGreaterThanOrEqual(before - expectedMs90Days - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - expectedMs90Days + 1000);
  });
});
