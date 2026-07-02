import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  getAccessibleProblemIdsMock,
  dbSelectMock,
  dbDeleteMock,
  readUploadedFileMock,
  deleteUploadedFileMock,
  resolveStoredPathMock,
  getUploadedFileStatsMock,
  createUploadedFileReadStreamMock,
  verifyFileMagicBytesAtPathMock,
  recordAuditEventMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  getAccessibleProblemIdsMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  readUploadedFileMock: vi.fn(),
  deleteUploadedFileMock: vi.fn(),
  resolveStoredPathMock: vi.fn(),
  getUploadedFileStatsMock: vi.fn(),
  createUploadedFileReadStreamMock: vi.fn(),
  verifyFileMagicBytesAtPathMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  loggerWarnMock: vi.fn(),
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

vi.mock("@/lib/files/validation", () => ({
  verifyFileMagicBytesAtPath: verifyFileMagicBytesAtPathMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAccessibleProblemIds: getAccessibleProblemIdsMock,
}));

vi.mock("@/lib/files/storage", () => ({
  readUploadedFile: readUploadedFileMock,
  deleteUploadedFile: deleteUploadedFileMock,
  resolveStoredPath: resolveStoredPathMock,
  getUploadedFileStats: getUploadedFileStatsMock,
  createUploadedFileReadStream: createUploadedFileReadStreamMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: loggerWarnMock },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    delete: dbDeleteMock,
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

function makeDeleteRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/v1/files/${id}`, {
    method: "DELETE",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

describe("GET /api/v1/files/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockReset();
    csrfForbiddenMock.mockReset();
    consumeApiRateLimitMock.mockReset();
    resolveCapabilitiesMock.mockReset();
    getAccessibleProblemIdsMock.mockReset();
    dbSelectMock.mockReset();
    readUploadedFileMock.mockReset();
    resolveStoredPathMock.mockReset();
    getUploadedFileStatsMock.mockReset();
    createUploadedFileReadStreamMock.mockReset();
    verifyFileMagicBytesAtPathMock.mockReset();

    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    readUploadedFileMock.mockReturnValue(Buffer.from("hello"));
    resolveStoredPathMock.mockImplementation((storedName: string) => `/tmp/uploads/${storedName}`);
    getUploadedFileStatsMock.mockResolvedValue({ size: 5 } as import("node:fs").Stats);
    createUploadedFileReadStreamMock.mockImplementation(() => Readable.from([Buffer.from("hello")]));
    verifyFileMagicBytesAtPathMock.mockResolvedValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(401);
    expect(consumeApiRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "files:download",
    );
  });

  it("returns 429 when the IP-keyed download rate limit is exhausted", async () => {
    consumeApiRateLimitMock.mockResolvedValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(429);
    expect(getApiUserMock).not.toHaveBeenCalled();
    expect(consumeApiRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "files:download",
    );
  });

  it("streams the file response instead of loading it into memory", async () => {
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
    expect(res.headers.get("Content-Length")).toBe("5");
    expect(getAccessibleProblemIdsMock).not.toHaveBeenCalled();
    expect(createUploadedFileReadStreamMock).toHaveBeenCalledWith("stored.bin");
  });

  it("allows access when the file is explicitly linked to an accessible problem", async () => {
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
            problemId: "problem-1",
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

  it("does not scan problem descriptions when the file has no explicit problem link", async () => {
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
            problemId: null,
          },
        ])
      );

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-2"), { params: Promise.resolve({ id: "file-2" }) });

    expect(res.status).toBe(403);
    expect(getAccessibleProblemIdsMock).not.toHaveBeenCalled();
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

  it("does not authorize a file based on legacy description matching", async () => {
    getApiUserMock.mockResolvedValue({
      ...ownerUser,
      id: "student-5",
      username: "student5",
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
            problemId: null,
          },
        ])
      );

    const { GET } = await import("@/app/api/v1/files/[id]/route");
    const res = await GET(makeRequest("file-1"), { params: Promise.resolve({ id: "file-1" }) });

    expect(res.status).toBe(403);
    expect(getAccessibleProblemIdsMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/files/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      ...ownerUser,
      id: "admin-1",
      role: "admin",
      username: "admin",
    });
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["files.manage"]));
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          id: "file-1",
          storedName: "stored.bin",
          originalName: "secret.txt",
          mimeType: "text/plain",
          uploadedBy: "user-2",
        },
      ])
    );
    dbDeleteMock.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("returns success after deleting the DB row even when disk cleanup fails", async () => {
    deleteUploadedFileMock.mockRejectedValue(new Error("disk failure"));

    const { DELETE } = await import("@/app/api/v1/files/[id]/route");
    const res = await DELETE(makeDeleteRequest("file-1"), {
      params: Promise.resolve({ id: "file-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ deleted: true });
    expect(dbDeleteMock).toHaveBeenCalled();
    expect(deleteUploadedFileMock).toHaveBeenCalledWith("stored.bin");
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.deleted",
        resourceId: "file-1",
      })
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ storedName: "stored.bin" }),
      "Failed to delete file from disk after DB delete"
    );
  });
});
