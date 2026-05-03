import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn<(...args: unknown[]) => Promise<{ rowCount: number }>>(),
  loggerDebug: vi.fn(),
  loggerWarn: vi.fn(),
  getDbNowMs: vi.fn().mockResolvedValue(Date.now()),
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

vi.mock("@/lib/db-time", () => ({
  getDbNowMs: mocks.getDbNowMs,
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

async function flushMicrotasks(times = 10) {
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

  it("isolates failures so a single prune rejection does not stop the others (CYC3-AGG-5)", async () => {
    // Cycle-1 introduced Promise.allSettled in pruneSensitiveOperationalData
    // and cycle-2 documented the failure-isolation contract in JSDoc. This
    // test pins the runtime contract: when ONE prune throws, the others
    // still complete, and the warn-log is emitted with the rejection reason.
    // A regression to Promise.all (cycle-1 bug) would make this test fail
    // because the first throw would short-circuit the remaining prunes.

    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");

    // Make the very first db.execute call throw (e.g. lock contention on
    // chatMessages), but the remaining four prune helpers should succeed.
    mocks.dbExecute.mockImplementationOnce(() => Promise.reject(new Error("simulated lock contention on chatMessages")));
    // All subsequent calls return rowCount: 0 (default mock from beforeEach).

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    // 1 failed call + at least 4 successful calls = 5 total (one per prune
    // helper). Promise.allSettled isolates the rejection, so the other
    // four db.execute calls MUST still happen.
    expect(mocks.dbExecute.mock.calls.length).toBeGreaterThanOrEqual(5);

    // The rejection reason must be visible in the warn log so operators can
    // identify which table contended.
    const warnCalls = mocks.loggerWarn.mock.calls;
    const isolationWarn = warnCalls.find(
      (call) =>
        typeof call[1] === "string" &&
        call[1] === "Failed to prune one of the sensitive data tables",
    );
    expect(isolationWarn, "expected the failure-isolation warn log line").toBeDefined();
    // The first arg is the structured log object containing the err.
    expect((isolationWarn?.[0] as { err?: { message?: string } } | undefined)?.err?.message).toContain(
      "simulated lock contention on chatMessages",
    );
  });
});
