import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  getRetentionCutoff: vi.fn((days: number, nowMs?: number) => new Date((nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000)),
  getDbNowMs: vi.fn().mockResolvedValue(Date.now()),
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

vi.mock("@/lib/data-retention", () => ({
  DATA_RETENTION_DAYS: {
    auditEvents: 90,
    loginEvents: 180,
  },
  isDataRetentionLegalHold: vi.fn(() => false),
  getRetentionCutoff: mocks.getRetentionCutoff,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowMs: mocks.getDbNowMs,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
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

  it("uses getRetentionCutoff with DATA_RETENTION_DAYS and DB server time for each event type", async () => {
    const fakeNowMs = 1736942400000; // Fixed timestamp
    mocks.getDbNowMs.mockResolvedValue(fakeNowMs);
    mocks.dbExecute
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 });

    const { cleanupOldEvents } = await import("@/lib/db/cleanup");
    await cleanupOldEvents();

    // getRetentionCutoff should be called with DB server time for each event type
    expect(mocks.getRetentionCutoff).toHaveBeenCalledWith(90, fakeNowMs);
    expect(mocks.getRetentionCutoff).toHaveBeenCalledWith(180, fakeNowMs);
  });
});
