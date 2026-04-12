import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbDeleteWhere: vi.fn<(...args: unknown[]) => Promise<void>>(),
  loggerDebug: vi.fn(),
  loggerWarn: vi.fn(),
  lt: vi.fn((_field: unknown, value: unknown) => ({ _lt: value })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: vi.fn(() => ({
      where: mocks.dbDeleteWhere,
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  chatMessages: { createdAt: "chatMessages.createdAt" },
  antiCheatEvents: { createdAt: "antiCheatEvents.createdAt" },
  recruitingInvitations: { createdAt: "recruitingInvitations.createdAt", updatedAt: "recruitingInvitations.updatedAt", expiresAt: "recruitingInvitations.expiresAt", status: "recruitingInvitations.status" },
  submissions: { submittedAt: "submissions.submittedAt", status: "submissions.status" },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: mocks.loggerDebug,
    warn: mocks.loggerWarn,
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    lt: mocks.lt,
  };
});

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.dbDeleteWhere.mockResolvedValue(undefined);
});

afterEach(() => {
  delete (globalThis as { __sensitiveDataPruneTimer?: unknown }).__sensitiveDataPruneTimer;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startSensitiveDataPruning / stopSensitiveDataPruning", () => {
  it("sets up pruning and runs an initial pass for chat logs and anti-cheat events", async () => {
    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(4);
    expect(mocks.loggerDebug.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("does not create duplicate intervals when started twice", async () => {
    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    const initialPruneCalls = mocks.dbDeleteWhere.mock.calls.length;
    expect(initialPruneCalls).toBe(8);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(initialPruneCalls + 4);
    stopSensitiveDataPruning();
  });

  it("logs a warning if pruning fails", async () => {
    const { startSensitiveDataPruning, stopSensitiveDataPruning } = await import("@/lib/data-retention-maintenance");
    mocks.dbDeleteWhere.mockRejectedValueOnce(new Error("boom"));

    stopSensitiveDataPruning();
    startSensitiveDataPruning();
    await flushMicrotasks();

    expect(mocks.loggerWarn).toHaveBeenCalled();
  });
});
