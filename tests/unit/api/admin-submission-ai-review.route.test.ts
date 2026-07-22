import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  selectMock,
  getSubmissionReviewGroupIdsMock,
  generateAndStoreReviewMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(() => null),
  resolveCapabilitiesMock: vi.fn(),
  selectMock: vi.fn(),
  getSubmissionReviewGroupIdsMock: vi.fn(),
  generateAndStoreReviewMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  isAdminAsync: vi.fn(async () => true),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, init?: ResponseInit) => NextResponse.json({ data }, init),
  apiError: (error: string, status: number) => NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/db", () => ({
  db: { select: selectMock },
}));

vi.mock("@/lib/assignments/submissions", () => ({
  getSubmissionReviewGroupIds: getSubmissionReviewGroupIdsMock,
}));

vi.mock("@/lib/judge/auto-review", () => ({
  generateAndStoreReview: generateAndStoreReviewMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

function selectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  return chain;
}

function makeRequest(body: unknown = {}) {
  return new NextRequest("http://localhost:3000/api/v1/admin/submissions/sub-1/ai-review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/admin/submissions/[id]/ai-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "admin-1", role: "admin" });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["submissions.rejudge"]));
    getSubmissionReviewGroupIdsMock.mockResolvedValue(null); // super-admin scope
    selectMock.mockReturnValue(selectChain([{ id: "sub-1" }]));
    generateAndStoreReviewMock.mockResolvedValue({ status: "created" });
  });

  it("generates a review on any status (requireAccepted: false) for a permitted submission", async () => {
    const { POST } = await import("@/app/api/v1/admin/submissions/[id]/ai-review/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { status: "created" } });
    expect(generateAndStoreReviewMock).toHaveBeenCalledWith("sub-1", { requireAccepted: false });
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
  });

  it("reports skipped without duplicating when a review already exists", async () => {
    generateAndStoreReviewMock.mockResolvedValue({ status: "skipped", reason: "alreadyExists" });
    const { POST } = await import("@/app/api/v1/admin/submissions/[id]/ai-review/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { status: "skipped", reason: "alreadyExists" } });
    expect(generateAndStoreReviewMock).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when the submission is outside the reviewer's group scope", async () => {
    getSubmissionReviewGroupIdsMock.mockResolvedValue(["group-a"]);
    selectMock.mockReturnValue(selectChain([])); // scoped query finds nothing
    const { POST } = await import("@/app/api/v1/admin/submissions/[id]/ai-review/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(403);
    expect(generateAndStoreReviewMock).not.toHaveBeenCalled();
  });

  it("returns 403 without the submissions.rejudge capability", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set<string>());
    const { POST } = await import("@/app/api/v1/admin/submissions/[id]/ai-review/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(403);
    expect(generateAndStoreReviewMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/admin/submissions/[id]/ai-review/route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(401);
    expect(generateAndStoreReviewMock).not.toHaveBeenCalled();
  });
});
