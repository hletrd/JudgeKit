import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  user: { id: "inst-1", role: "instructor" },
  rawQueryOne: vi.fn(),
  canManageProblem: vi.fn(),
  canManageGroupResourcesAsync: vi.fn(),
  resolveCapabilities: vi.fn(),
  recordAuditEvent: vi.fn(),
  recomputeAll: vi.fn(),
  recomputeAssignment: vi.fn(),
  recomputeProblem: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler, schema }: { handler: (req: NextRequest, ctx: unknown) => Promise<Response>; schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } } }) =>
    async (req: NextRequest) => {
      const parsed = schema.safeParse(await req.json());
      if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
      return handler(req, { user: mocks.user, body: parsed.data, params: {} });
    },
}));
vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown) => NextResponse.json({ data }),
  apiError: (error: string, status: number) => NextResponse.json({ error }, { status }),
}));
vi.mock("@/lib/db/queries", () => ({ rawQueryOne: mocks.rawQueryOne }));
vi.mock("@/lib/auth/permissions", () => ({ canManageProblem: mocks.canManageProblem }));
vi.mock("@/lib/assignments/management", () => ({ canManageGroupResourcesAsync: mocks.canManageGroupResourcesAsync }));
vi.mock("@/lib/capabilities/cache", () => ({ resolveCapabilities: mocks.resolveCapabilities }));
vi.mock("@/lib/audit/events", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/submissions/ai-signature-flags", () => ({
  recomputeAllSignatureFlags: mocks.recomputeAll,
  recomputeSignatureFlagsForAssignment: mocks.recomputeAssignment,
  recomputeSignatureFlagsForProblem: mocks.recomputeProblem,
}));

import { POST } from "@/app/api/v1/admin/submissions/signature-flags/route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/admin/submissions/signature-flags", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) } as never,
  );
}

describe("POST /api/v1/admin/submissions/signature-flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCapabilities.mockResolvedValue(new Set());
    mocks.recomputeAll.mockResolvedValue({ scanned: 10, flagged: 2 });
    mocks.recomputeAssignment.mockResolvedValue({ scanned: 5, flagged: 1 });
    mocks.recomputeProblem.mockResolvedValue({ scanned: 3, flagged: 0 });
    mocks.rawQueryOne.mockResolvedValue({ groupId: "g-1", instructorId: "inst-1" });
  });

  it("requires exactly one scope", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ problemId: "p", assignmentId: "a" })).status).toBe(400);
  });

  it("allows `all` only for groups.view_all", async () => {
    expect((await post({ all: true })).status).toBe(403);
    expect(mocks.recomputeAll).not.toHaveBeenCalled();

    mocks.resolveCapabilities.mockResolvedValue(new Set(["groups.view_all"]));
    const res = await post({ all: true });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ scanned: 10, flagged: 2 });
  });

  it("checks group management for an assignment", async () => {
    mocks.canManageGroupResourcesAsync.mockResolvedValue(false);
    expect((await post({ assignmentId: "a-1" })).status).toBe(403);
    expect(mocks.recomputeAssignment).not.toHaveBeenCalled();

    mocks.canManageGroupResourcesAsync.mockResolvedValue(true);
    expect((await post({ assignmentId: "a-1" })).status).toBe(200);
    expect(mocks.recomputeAssignment).toHaveBeenCalledWith("a-1");
  });

  it("checks problem management for a problem", async () => {
    mocks.canManageProblem.mockResolvedValue(false);
    expect((await post({ problemId: "p-1" })).status).toBe(403);
    mocks.canManageProblem.mockResolvedValue(true);
    expect((await post({ problemId: "p-1" })).status).toBe(200);
    expect(mocks.recomputeProblem).toHaveBeenCalledWith("p-1");
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "submission.signature_flags_recomputed" }),
    );
  });
});
