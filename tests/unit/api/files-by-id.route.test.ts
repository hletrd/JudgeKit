import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  getAccessibleProblemIdsMock,
  dbSelectMock,
  dbUpdateMock,
  readUploadedFileMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  getAccessibleProblemIdsMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  readUploadedFileMock: vi.fn(),
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(rows);
  return chain;
}

function makeWhereTerminalChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(rows);
  return chain;
}

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAccessibleProblemIds: getAccessibleProblemIdsMock,
}));

vi.mock("@/lib/files/storage", () => ({
  readUploadedFile: readUploadedFileMock,
  deleteUploadedFile: vi.fn(),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    delete: vi.fn(),
  },
}));

const ownerUser = {
  id: "user-1",
  role: "student",
  username: "owner",
  email: "owner@example.com",
  name: "Owner",
  className: null,
  mustChangePassword: false,
};

function makeRequest(id: string, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/v1/files/${id}`, {
    headers,
  });
}

describe("GET /api/v1/files/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    readUploadedFileMock.mockReturnValue(Buffer.from("hello"));
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    });
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(401);
  });

  it("allows the uploading owner to fetch the file with private cache headers", async () => {
    getApiUserMock.mockResolvedValue(ownerUser);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["files.upload"]));
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          id: "file-1",
          storedName: "stored.bin",
          originalName: "secret.txt",
          mimeType: "text/plain",
          uploadedBy: "user-1",
        },
      ])
    );

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("Vary")).toBe("Cookie, Authorization");
    expect(getAccessibleProblemIdsMock).not.toHaveBeenCalled();
  });

  it("allows access when the file is referenced by an accessible problem", async () => {
    getApiUserMock.mockResolvedValue({
      ...ownerUser,
      id: "student-2",
      username: "student2",
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["files.upload"]));
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: "file-1",
            storedName: "stored.bin",
            originalName: "diagram.png",
            mimeType: "image/webp",
            uploadedBy: "instructor-1",
          },
        ])
      )
      .mockReturnValueOnce(
        makeWhereTerminalChain([
          {
            id: "problem-1",
            visibility: "private",
            authorId: "instructor-1",
          },
        ])
      );
    getAccessibleProblemIdsMock.mockResolvedValue(new Set(["problem-1"]));

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(200);
    const problemArg = getAccessibleProblemIdsMock.mock.calls[0]?.[2];
    expect(problemArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "problem-1" }),
      ])
    );
  });

  it("prefers explicit problem linkage without scanning descriptions", async () => {
    getApiUserMock.mockResolvedValue({
      ...ownerUser,
      id: "student-4",
      username: "student4",
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["files.upload"]));
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: "file-2",
            storedName: "stored.bin",
            originalName: "linked.png",
            mimeType: "image/webp",
            uploadedBy: "instructor-1",
            problemId: "problem-2",
          },
        ])
      )
      .mockReturnValueOnce(
        makeWhereTerminalChain([
          {
            id: "problem-2",
            visibility: "private",
            authorId: "instructor-1",
          },
        ])
      );
    getAccessibleProblemIdsMock.mockResolvedValue(new Set(["problem-2"]));

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-2"), { params: Promise.resolve({ id: "file-2" }) });

    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 403 for unrelated users when the file is not accessible via ownership or problem access", async () => {
    getApiUserMock.mockResolvedValue({
      ...ownerUser,
      id: "student-3",
      username: "student3",
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["files.upload"]));
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: "file-1",
            storedName: "stored.bin",
            originalName: "secret.txt",
            mimeType: "text/plain",
            uploadedBy: "other-user",
          },
        ])
      )
      .mockReturnValueOnce(makeWhereTerminalChain([]));

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(403);
  });
});
