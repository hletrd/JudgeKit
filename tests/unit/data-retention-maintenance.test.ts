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

// Cycle-4 CYC4-AGG-3: pin the legal-hold escape hatch. Kept in a separate
// describe block (with its own beforeEach/afterEach) because the test
// uses vi.doMock to flip DATA_RETENTION_LEGAL_HOLD; that override
// persists across vi.resetModules within the same describe and would
// pollute the failure-isolation test above. Running this in its own
// describe block ensures the doMock is fully torn down before any
// other test sees the module again.
describe("pruneSensitiveOperationalData — legal hold", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.dbExecute.mockResolvedValue({ rowCount: 0 });
  });

  afterEach(() => {
    delete (globalThis as { __sensitiveDataPruneTimer?: unknown }).__sensitiveDataPruneTimer;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.doUnmock("@/lib/data-retention");
    vi.doUnmock("@/lib/logger");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("short-circuits all prunes when DATA_RETENTION_LEGAL_HOLD is true (CYC4-AGG-3)", async () => {
    // The legal-hold flag is the operator's litigation-hold override; a
    // regression that drops it (e.g., a refactor moving the check inside
    // the try-block where a thrown DB error can still emit warn logs) is
    // high-impact. Today the check is the first statement in
    // pruneSensitiveOperationalData, before any DB call.
    //
    // Override @/lib/data-retention via vi.doMock so the legal-hold flag
    // is true for the dynamic-imported module instance.
    vi.doMock("@/lib/data-retention", () => ({
      DATA_RETENTION_LEGAL_HOLD: true,
      DATA_RETENTION_DAYS: {
        auditEvents: 90,
        chatMessages: 30,
        antiCheatEvents: 180,
        recruitingRecords: 365,
        submissions: 365,
        loginEvents: 180,
      },
      getRetentionCutoff: (days: number, now: number) =>
        new Date(now - days * 24 * 60 * 60 * 1000),
    }));
    // Capture info-log calls separately for the legal-hold assertion;
    // mocks.loggerInfo from the global bag is not used by the source.
    const loggerInfo = vi.fn();
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: loggerInfo,
        debug: mocks.loggerDebug,
        warn: mocks.loggerWarn,
        error: vi.fn(),
      },
    }));

    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    // Legal-hold MUST short-circuit before any DB call.
    expect(mocks.dbExecute).not.toHaveBeenCalled();
    // The legal-hold info-log line must be emitted exactly so operators
    // can confirm the hold from the daily maintenance window logs.
    const legalHoldLogged = loggerInfo.mock.calls.some(
      (call) =>
        typeof call[0] === "string" &&
        call[0] === "Data retention legal hold is active — skipping all automatic pruning",
    );
    expect(legalHoldLogged, "expected the legal-hold info-log line").toBe(true);

    stopSensitiveDataPruning();
  });
});
