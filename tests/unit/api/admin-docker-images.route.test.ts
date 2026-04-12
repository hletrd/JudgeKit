import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  pullDockerImageMock,
  removeDockerImageMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  pullDockerImageMock: vi.fn(),
  removeDockerImageMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; body: any; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: await getApiUserMock(),
        body: req.method === "GET" ? undefined : await req.json(),
        params: {},
      }),
}));

vi.mock("@/lib/docker/client", () => ({
  listDockerImages: vi.fn(),
  inspectDockerImage: vi.fn(),
  getDiskUsage: vi.fn(),
  pullDockerImage: pullDockerImageMock,
  removeDockerImage: removeDockerImageMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

function makeRequest(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/admin/docker/images", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

describe("admin docker image mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
    });
  });

  it("rejects untrusted registry-qualified pull targets", async () => {
    const { POST } = await import("@/app/api/v1/admin/docker/images/route");
    const res = await POST(
      makeRequest("POST", { imageTag: "evil.example.com/team/judge-python:latest" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("imageTagMustStartWithJudge");
    expect(pullDockerImageMock).not.toHaveBeenCalled();
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "docker_image.pull_rejected",
        resourceId: "evil.example.com/team/judge-python:latest",
      })
    );
  });

  it("records a failure audit event when an allowed pull fails", async () => {
    pullDockerImageMock.mockResolvedValue({ success: false, error: "registry timeout" });

    const { POST } = await import("@/app/api/v1/admin/docker/images/route");
    const res = await POST(makeRequest("POST", { imageTag: "judge-python:latest" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("registry timeout");
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "docker_image.pull_failed",
        resourceId: "judge-python:latest",
      })
    );
  });

  it("records an audit event after a successful pull", async () => {
    pullDockerImageMock.mockResolvedValue({ success: true });

    const { POST } = await import("@/app/api/v1/admin/docker/images/route");
    const res = await POST(makeRequest("POST", { imageTag: "judge-python:latest" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ pulled: "judge-python:latest" });
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "docker_image.pulled",
        resourceId: "judge-python:latest",
      })
    );
  });

  it("rejects untrusted registry-qualified remove targets", async () => {
    const { DELETE } = await import("@/app/api/v1/admin/docker/images/route");
    const res = await DELETE(
      makeRequest("DELETE", { imageTag: "evil.example.com/team/judge-python:latest" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("imageTagMustStartWithJudge");
    expect(removeDockerImageMock).not.toHaveBeenCalled();
  });

  it("removes allowed images and records the audit event", async () => {
    removeDockerImageMock.mockResolvedValue({ success: true });

    const { DELETE } = await import("@/app/api/v1/admin/docker/images/route");
    const res = await DELETE(makeRequest("DELETE", { imageTag: "judge-python:latest" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ removed: "judge-python:latest" });
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "docker_image.removed",
        resourceId: "judge-python:latest",
      })
    );
  });
});
