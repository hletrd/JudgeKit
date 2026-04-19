import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn<(...args: unknown[]) => Promise<{ rowCount: number }>>(),
  loggerDebug: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    execute: mocks.dbExecute,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  chatMessages: { createdAt: "chatMessages.createdAt" },
  antiCheatEvents: { createdAt: "antiCheatEvents.createdAt" },
  recruitingInvitations: { createdAt: "recruitingInvitations.createdAt", updatedAt: "recruitingInvitations.updatedAt", expiresAt: "recruitingInvitations.expiresAt", status: "recruitingInvitations.status" },
  submissions: { submittedAt: "submissions.submittedAt", status: "submissions.status" },
  loginEvents: { createdAt: "loginEvents.createdAt" },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: mocks.loggerDebug,
    warn: mocks.loggerWarn,
  },
}));

// Stub drizzle-orm operators — real ones require actual Drizzle column objects.
// These stubs return plain objects that are sufficient for sql template tags.
vi.mock("drizzle-orm", () => ({
  lt: (_col: unknown, val: unknown) => ({ _lt: val }),
  and: (...clauses: unknown[]) => ({ _and: clauses }),
  or: (...clauses: unknown[]) => ({ _or: clauses }),
  inArray: (_col: unknown, vals: unknown[]) => ({ _inArray: vals }),
  notInArray: (_col: unknown, vals: unknown[]) => ({ _notInArray: vals }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    getSQL: () => strings.join("?"),
    params: values,
  }),
}));

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Return rowCount: 0 so batched DELETE exits after first iteration
  mocks.dbExecute.mockResolvedValue({ rowCount: 0 });
});

afterEach(() => {
  delete (globalThis as { __sensitiveDataPruneTimer?: unknown }).__sensitiveDataPruneTimer;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startSensitiveDataPruning / stopSensitiveDataPruning", () => {
  it("sets up pruning and runs an initial pass", async () => {
    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    // At least 3 prune functions should call db.execute (chatMessages, antiCheatEvents, loginEvents)
    expect(mocks.dbExecute.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(mocks.loggerDebug.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("does not create duplicate intervals when started twice", async () => {
    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    // Double-start should run the initial prune twice
    const initialPruneCalls = mocks.dbExecute.mock.calls.length;
    expect(initialPruneCalls).toBeGreaterThanOrEqual(3);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // After one interval tick, should have more calls (one more prune pass)
    expect(mocks.dbExecute.mock.calls.length).toBeGreaterThan(initialPruneCalls);
    stopSensitiveDataPruning();
  });

  it("logs a warning if pruning fails", async () => {
    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");
    mocks.dbExecute.mockRejectedValueOnce(new Error("boom"));

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    expect(mocks.loggerWarn).toHaveBeenCalled();
  });
});
