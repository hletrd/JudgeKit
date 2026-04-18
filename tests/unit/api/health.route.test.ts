import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  resolveCapabilitiesMock,
  getAdminHealthSnapshotMock,
  getPublicHealthStatusMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  getAdminHealthSnapshotMock: vi.fn(),
  getPublicHealthStatusMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/ops/admin-health", () => ({
  getAdminHealthSnapshot: getAdminHealthSnapshotMock,
  getPublicHealthStatus: getPublicHealthStatusMock,
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set());
    getPublicHealthStatusMock.mockResolvedValue("ok");
    getAdminHealthSnapshotMock.mockResolvedValue({
      checks: { database: "ok", auditEvents: "ok" },
      judgeWorkers: { online: 1, stale: 0, offline: 0 },
      submissionQueue: { pending: 0, limit: 250 },
      uptimeSeconds: 120,
      responseTimeMs: 5,
      appVersion: "test",
      status: "ok",
      timestamp: "2026-04-19T00:00:00.000Z",
    });
  });

  it("returns a coarse public status without computing the admin snapshot", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new NextRequest("http://localhost/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(getPublicHealthStatusMock).toHaveBeenCalledTimes(1);
    expect(getAdminHealthSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns the full snapshot for a custom role with system.settings", async () => {
    getApiUserMock.mockResolvedValueOnce({ id: "ops-1", role: "ops_admin" });
    resolveCapabilitiesMock.mockResolvedValueOnce(new Set(["system.settings"]));

    const { GET } = await import("@/app/api/health/route");
    const response = await GET(new NextRequest("http://localhost/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      checks: { database: "ok", auditEvents: "ok" },
    });
    expect(getAdminHealthSnapshotMock).toHaveBeenCalledTimes(1);
    expect(getPublicHealthStatusMock).not.toHaveBeenCalled();
  });
});
