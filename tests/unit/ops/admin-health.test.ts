import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  rawQueryOneMock,
  getAuditEventHealthSnapshotMock,
  getConfiguredSettingsMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  rawQueryOneMock: vi.fn(),
  getAuditEventHealthSnapshotMock: vi.fn(),
  getConfiguredSettingsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/audit/events", () => ({
  getAuditEventHealthSnapshot: getAuditEventHealthSnapshotMock,
}));

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: getConfiguredSettingsMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

describe("getAdminHealthSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguredSettingsMock.mockReturnValue({
      submissionGlobalQueueLimit: 250,
    });
  });

  it("returns parsed worker and queue stats for a healthy system", async () => {
    getAuditEventHealthSnapshotMock.mockReturnValue({
      status: "ok",
      failedWrites: 0,
      lastFailureAt: null,
    });
    rawQueryOneMock
      .mockResolvedValueOnce({ one: 1 })
      .mockResolvedValueOnce({ online: "3", stale: "0", offline: "2" })
      .mockResolvedValueOnce({ pending: "17" });

    const { getAdminHealthSnapshot } = await import("@/lib/ops/admin-health");
    const snapshot = await getAdminHealthSnapshot();

    expect(snapshot).toMatchObject({
      checks: {
        database: "ok",
        auditEvents: "ok",
      },
      judgeWorkers: {
        online: 3,
        stale: 0,
        offline: 2,
      },
      submissionQueue: {
        pending: 17,
        limit: 250,
      },
      uptimeSeconds: expect.any(Number),
      responseTimeMs: expect.any(Number),
      appVersion: expect.any(String),
      status: "ok",
    });
  });

  it("degrades health when stale workers exist even if the database is reachable", async () => {
    getAuditEventHealthSnapshotMock.mockReturnValue({
      status: "ok",
      failedWrites: 0,
      lastFailureAt: null,
    });
    rawQueryOneMock
      .mockResolvedValueOnce({ one: 1 })
      .mockResolvedValueOnce({ online: "2", stale: "1", offline: "0" })
      .mockResolvedValueOnce({ pending: "0" });

    const { getAdminHealthSnapshot } = await import("@/lib/ops/admin-health");
    const snapshot = await getAdminHealthSnapshot();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.judgeWorkers.stale).toBe(1);
  });

  it("returns an error snapshot instead of throwing when the database probe fails", async () => {
    getAuditEventHealthSnapshotMock.mockReturnValue({
      status: "degraded",
      failedWrites: 2,
      lastFailureAt: "2026-04-17T00:00:00.000Z",
    });
    rawQueryOneMock.mockRejectedValueOnce(new Error("db unavailable"));

    const { getAdminHealthSnapshot } = await import("@/lib/ops/admin-health");
    const snapshot = await getAdminHealthSnapshot();

    expect(snapshot).toMatchObject({
      checks: {
        database: "error",
        auditEvents: "degraded",
      },
      submissionQueue: {
        pending: 0,
        limit: 250,
      },
      uptimeSeconds: expect.any(Number),
      responseTimeMs: expect.any(Number),
      appVersion: expect.any(String),
      status: "error",
      error: "healthCheckFailed",
    });
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});
