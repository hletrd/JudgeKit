import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  dbSelectMock,
  buildDockerImageMock,
  recordAuditEventMock,
  existsSyncMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  dbSelectMock: vi.fn(),
  buildDockerImageMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; body: any; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: await getApiUserMock(),
        body: await req.json(),
        params: {},
      }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  languageConfigs: { language: "languageConfigs.language" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
  };
});

vi.mock("@/lib/docker/client", () => ({
  buildDockerImage: buildDockerImageMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("fs", () => ({
  existsSync: existsSyncMock,
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/admin/docker/images/build", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/admin/docker/images/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
    });
  });

  it("rejects non-judge image tags from language configs", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            { language: "python", dockerImage: "alpine:3.18" },
          ]),
        })),
      })),
    });

    const { POST } = await import("@/app/api/v1/admin/docker/images/build/route");
    const res = await POST(makeRequest({ language: "python" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("imageTagMustStartWithJudge");
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the expected Dockerfile is missing", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            { language: "python", dockerImage: "judge-python:latest" },
          ]),
        })),
      })),
    });
    existsSyncMock.mockReturnValue(false);

    const { POST } = await import("@/app/api/v1/admin/docker/images/build/route");
    const res = await POST(makeRequest({ language: "python" }));

    expect(res.status).toBe(404);
  });

  it("builds judge images from the matching Dockerfile and records an audit event", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            { language: "python", dockerImage: "judge-python:latest" },
          ]),
        })),
      })),
    });
    existsSyncMock.mockReturnValue(true);
    buildDockerImageMock.mockResolvedValue({ success: true, logs: "built" });

    const { POST } = await import("@/app/api/v1/admin/docker/images/build/route");
    const res = await POST(makeRequest({ language: "python" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ built: "judge-python:latest", logs: "built" });
    expect(buildDockerImageMock).toHaveBeenCalledWith(
      "judge-python:latest",
      "docker/Dockerfile.judge-python"
    );
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "docker_image.built",
        resourceId: "judge-python:latest",
      })
    );
  });
});
