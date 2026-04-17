import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  getAdminHealthSnapshotMock,
  safeTokenCompareMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  getAdminHealthSnapshotMock: vi.fn(),
  safeTokenCompareMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/ops/admin-health", () => ({
  getAdminHealthSnapshot: getAdminHealthSnapshotMock,
}));

vi.mock("@/lib/security/timing", () => ({
  safeTokenCompare: safeTokenCompareMock,
}));

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    getApiUserMock.mockResolvedValue(null);
    getAdminHealthSnapshotMock.mockResolvedValue({
      checks: { database: "ok", auditEvents: "ok" },
      judgeWorkers: { online: 2, stale: 0, offline: 1 },
      submissionQueue: { pending: 4, limit: 250 },
      uptimeSeconds: 180,
      responseTimeMs: 8,
      appVersion: "test",
      status: "ok",
      timestamp: "2026-04-17T00:00:00.000Z",
    });
    safeTokenCompareMock.mockReturnValue(true);
  });

  it("returns Prometheus metrics for an authenticated admin session", async () => {
    getApiUserMock.mockResolvedValueOnce({ id: "admin-1", role: "admin" });

    const { GET } = await import("@/app/api/metrics/route");
    const response = await GET(new NextRequest("http://localhost/api/metrics"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain; version=0.0.4");
    await expect(response.text()).resolves.toContain("judgekit_submission_queue_pending 4");
  });

  it("allows CRON_SECRET bearer auth for scraping when no admin session is present", async () => {
    process.env.CRON_SECRET = "cron-secret";
    safeTokenCompareMock.mockReturnValueOnce(true);

    const { GET } = await import("@/app/api/metrics/route");
    const response = await GET(
      new NextRequest("http://localhost/api/metrics", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("judgekit_health_status 1");
  });

  it("returns 401 when no admin session or valid bearer secret is present", async () => {
    process.env.CRON_SECRET = "cron-secret";
    safeTokenCompareMock.mockReturnValueOnce(false);

    const { GET } = await import("@/app/api/metrics/route");
    const response = await GET(
      new NextRequest("http://localhost/api/metrics", {
        headers: { Authorization: "Bearer wrong" },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
