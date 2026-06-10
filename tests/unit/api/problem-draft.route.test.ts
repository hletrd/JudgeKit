import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  consumeUserApiRateLimitMock,
  canAccessProblemMock,
  upsertSourceDraftMock,
  getSourceDraftsForProblemMock,
  deleteSourceDraftMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  consumeUserApiRateLimitMock: vi.fn(),
  canAccessProblemMock: vi.fn(),
  upsertSourceDraftMock: vi.fn(),
  getSourceDraftsForProblemMock: vi.fn(),
  deleteSourceDraftMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  csrfForbidden: vi.fn(() => null),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
  consumeUserApiRateLimit: consumeUserApiRateLimitMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: canAccessProblemMock,
}));

vi.mock("@/lib/drafts/source-draft-store", () => ({
  upsertSourceDraft: upsertSourceDraftMock,
  getSourceDraftsForProblem: getSourceDraftsForProblemMock,
  deleteSourceDraft: deleteSourceDraftMock,
}));

const PARAMS = Promise.resolve({ id: "problem-1" });

function makeRequest(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problems/problem-1/draft", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const studentUser = {
  id: "student-1",
  role: "student",
  username: "student",
  email: "student@example.com",
  name: "Student",
  className: null,
  mustChangePassword: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  getApiUserMock.mockResolvedValue(studentUser);
  consumeApiRateLimitMock.mockResolvedValue(null);
  consumeUserApiRateLimitMock.mockResolvedValue(null);
  canAccessProblemMock.mockResolvedValue(true);
  upsertSourceDraftMock.mockResolvedValue(undefined);
  getSourceDraftsForProblemMock.mockResolvedValue([]);
  deleteSourceDraftMock.mockResolvedValue(undefined);
});

describe("GET /api/v1/problems/[id]/draft", () => {
  it("returns the caller's drafts for the problem", async () => {
    getSourceDraftsForProblemMock.mockResolvedValue([
      { language: "python", sourceCode: "print(1)", updatedAt: new Date("2026-05-01T00:00:00Z") },
    ]);
    const { GET } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await GET(makeRequest("GET"), { params: PARAMS });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getSourceDraftsForProblemMock).toHaveBeenCalledWith("student-1", "problem-1");
    expect(body.data.drafts).toHaveLength(1);
    expect(body.data.drafts[0].sourceCode).toBe("print(1)");
  });

  it("returns 403 when the caller cannot access the problem", async () => {
    canAccessProblemMock.mockResolvedValue(false);
    const { GET } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await GET(makeRequest("GET"), { params: PARAMS });

    expect(res.status).toBe(403);
    expect(getSourceDraftsForProblemMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/problems/[id]/draft", () => {
  it("upserts the draft for the caller + problem + language", async () => {
    const { PUT } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await PUT(
      makeRequest("PUT", { language: "python", sourceCode: "print(42)" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(200);
    expect(upsertSourceDraftMock).toHaveBeenCalledWith({
      userId: "student-1",
      problemId: "problem-1",
      language: "python",
      sourceCode: "print(42)",
    });
  });

  it("returns 403 (and does not write) when the caller cannot access the problem", async () => {
    canAccessProblemMock.mockResolvedValue(false);
    const { PUT } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await PUT(
      makeRequest("PUT", { language: "python", sourceCode: "x" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(403);
    expect(upsertSourceDraftMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown language with 400 (no write) — registry-gated like the submit route", async () => {
    // Every distinct language string is a NEW row of up to 64 KiB per
    // (user, problem); without this gate a hostile user can grow
    // source_drafts without bound by cycling junk 64-char strings.
    const { PUT } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await PUT(
      makeRequest("PUT", { language: "not-a-real-language", sourceCode: "x" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(400);
    expect(upsertSourceDraftMock).not.toHaveBeenCalled();
  });

  it("accepts a real judge language (registry happy path)", async () => {
    const { PUT } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await PUT(
      makeRequest("PUT", { language: "python", sourceCode: "print(1)" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(200);
    expect(upsertSourceDraftMock).toHaveBeenCalled();
  });

  it("respects the per-user rate limit (no write when limited)", async () => {
    consumeUserApiRateLimitMock.mockResolvedValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );
    const { PUT } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await PUT(
      makeRequest("PUT", { language: "python", sourceCode: "x" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(429);
    expect(upsertSourceDraftMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/problems/[id]/draft", () => {
  it("deletes the draft for the caller + problem + language", async () => {
    const { DELETE } = await import("@/app/api/v1/problems/[id]/draft/route");
    const res = await DELETE(
      makeRequest("DELETE", { language: "python" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(200);
    expect(deleteSourceDraftMock).toHaveBeenCalledWith({
      userId: "student-1",
      problemId: "problem-1",
      language: "python",
    });
  });
});
