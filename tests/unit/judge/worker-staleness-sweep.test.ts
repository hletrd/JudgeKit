import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, loggerMock } = vi.hoisted(() => ({
  dbMock: { update: vi.fn() },
  loggerMock: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/db/schema", () => ({
  judgeWorkers: { id: "id", status: "status", lastHeartbeatAt: "last_heartbeat_at" },
}));
vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn(async () => new Date("2026-05-31T00:00:00Z")),
}));
vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({ staleClaimTimeoutMs: 120_000 }),
}));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import { sweepStaleWorkers } from "@/lib/judge/worker-staleness-sweep";

// db.update(...).set(...).where(...).returning(...) resolves to the given rows.
function updateChain(rows: Array<{ id: string }>) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sweepStaleWorkers alert signals", () => {
  const NOW = new Date("2026-05-31T00:00:00Z");

  it("WARNs and returns counts when unresponsive workers are reaped to offline", async () => {
    dbMock.update
      .mockReturnValueOnce(updateChain([{ id: "w1" }])) // online -> stale
      .mockReturnValueOnce(updateChain([{ id: "w2" }, { id: "w3" }])); // stale -> offline

    const result = await sweepStaleWorkers(NOW);

    expect(result).toEqual({ markedStale: 1, reapedOffline: 2 });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reaped: 2, workerIds: ["w2", "w3"] }),
      expect.stringContaining("reaped"),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ markedStale: 1, workerIds: ["w1"] }),
      expect.stringContaining("stale"),
    );
  });

  it("stays silent and returns zero counts when no worker changes state", async () => {
    dbMock.update
      .mockReturnValueOnce(updateChain([]))
      .mockReturnValueOnce(updateChain([]));

    const result = await sweepStaleWorkers(NOW);

    expect(result).toEqual({ markedStale: 0, reapedOffline: 0 });
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it("does not WARN when only a stale transition occurs (no terminal reap)", async () => {
    dbMock.update
      .mockReturnValueOnce(updateChain([{ id: "w1" }])) // online -> stale
      .mockReturnValueOnce(updateChain([])); // nothing reaped

    const result = await sweepStaleWorkers(NOW);

    expect(result).toEqual({ markedStale: 1, reapedOffline: 0 });
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
  });
});
