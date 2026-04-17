import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockUserRef,
  recordAuditEventMock,
  problemSetsFindFirstMock,
  updateProblemSetMock,
  deleteProblemSetMock,
  assignProblemSetToGroupsMock,
  removeProblemSetFromGroupMock,
  canManageProblemSetForUserMock,
  findInaccessibleProblemIdsForProblemSetUserMock,
  findInaccessibleGroupIdsForProblemSetUserMock,
} = vi.hoisted(() => ({
  mockUserRef: {
    current: { id: "inst-1", role: "instructor", username: "instructor" },
  },
  recordAuditEventMock: vi.fn(),
  problemSetsFindFirstMock: vi.fn(),
  updateProblemSetMock: vi.fn(),
  deleteProblemSetMock: vi.fn(),
  assignProblemSetToGroupsMock: vi.fn(),
  removeProblemSetFromGroupMock: vi.fn(),
  canManageProblemSetForUserMock: vi.fn(),
  findInaccessibleProblemIdsForProblemSetUserMock: vi.fn(),
  findInaccessibleGroupIdsForProblemSetUserMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: typeof mockUserRef.current; params: Record<string, string>; body?: unknown }) => Promise<Response> }) =>
    async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> }) => {
      const params = routeCtx?.params ? await routeCtx.params : {};
      return handler(req, {
        user: mockUserRef.current,
        params,
        body: undefined as never,
      });
    },
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) =>
    NextResponse.json({ error: "notFound", resource }, { status: 404 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/problem-sets/management", () => ({
  updateProblemSet: updateProblemSetMock,
  deleteProblemSet: deleteProblemSetMock,
  assignProblemSetToGroups: assignProblemSetToGroupsMock,
  removeProblemSetFromGroup: removeProblemSetFromGroupMock,
}));

vi.mock("@/lib/problem-sets/visibility", () => ({
  canManageProblemSetForUser: canManageProblemSetForUserMock,
  findInaccessibleProblemIdsForProblemSetUser:
    findInaccessibleProblemIdsForProblemSetUserMock,
  findInaccessibleGroupIdsForProblemSetUser:
    findInaccessibleGroupIdsForProblemSetUserMock,
  getVisibleProblemSetByIdForUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problemSets: {
        findFirst: problemSetsFindFirstMock,
      },
    },
  },
}));

import { PATCH, DELETE as DELETE_SET } from "@/app/api/v1/problem-sets/[id]/route";
import {
  POST as POST_GROUPS,
  DELETE as DELETE_GROUPS,
} from "@/app/api/v1/problem-sets/[id]/groups/route";

function makePatchRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problem-sets/ps-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problem-sets/ps-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makePostGroupRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problem-sets/ps-1/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXISTING_PROBLEM_SET = {
  id: "ps-1",
  name: "Exam Set",
  createdBy: "inst-1",
  problems: [],
  groupAccess: [{ groupId: "g-1" }],
};

const UPDATED_PROBLEM_SET = {
  id: "ps-1",
  name: "Updated Exam Set",
  createdBy: "inst-1",
  problems: [{ problem: { id: "p-1", title: "A + B" } }],
  groupAccess: [{ groupId: "g-1", group: { id: "g-1", name: "CS101" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUserRef.current = { id: "inst-1", role: "instructor", username: "instructor" };
  canManageProblemSetForUserMock.mockResolvedValue(true);
  findInaccessibleProblemIdsForProblemSetUserMock.mockResolvedValue([]);
  findInaccessibleGroupIdsForProblemSetUserMock.mockResolvedValue([]);
  updateProblemSetMock.mockResolvedValue(undefined);
  deleteProblemSetMock.mockResolvedValue(undefined);
  assignProblemSetToGroupsMock.mockResolvedValue(undefined);
  removeProblemSetFromGroupMock.mockResolvedValue(undefined);
});

describe("problem-set detail routes", () => {
  it("rejects PATCH when the actor cannot manage the target problem set", async () => {
    problemSetsFindFirstMock.mockResolvedValue(EXISTING_PROBLEM_SET);
    canManageProblemSetForUserMock.mockResolvedValue(false);

    const res = await PATCH(makePatchRequest({
      name: "Updated Exam Set",
      description: "Updated",
      isPublic: false,
      problemIds: ["p-1"],
    }), {
      params: Promise.resolve({ id: "ps-1" }),
    } as never);

    expect(res.status).toBe(403);
    expect(updateProblemSetMock).not.toHaveBeenCalled();
  });

  it("rejects PATCH when the payload includes inaccessible problems", async () => {
    problemSetsFindFirstMock
      .mockResolvedValueOnce(EXISTING_PROBLEM_SET)
      .mockResolvedValueOnce(UPDATED_PROBLEM_SET);
    findInaccessibleProblemIdsForProblemSetUserMock.mockResolvedValue(["p-9"]);

    const res = await PATCH(makePatchRequest({
      name: "Updated Exam Set",
      description: "Updated",
      isPublic: false,
      problemIds: ["p-9"],
    }), {
      params: Promise.resolve({ id: "ps-1" }),
    } as never);

    expect(res.status).toBe(403);
    expect(updateProblemSetMock).not.toHaveBeenCalled();
  });

  it("updates a manageable problem set with scoped problems", async () => {
    problemSetsFindFirstMock
      .mockResolvedValueOnce(EXISTING_PROBLEM_SET)
      .mockResolvedValueOnce(UPDATED_PROBLEM_SET);

    const res = await PATCH(makePatchRequest({
      name: "Updated Exam Set",
      description: "Updated",
      isPublic: false,
      problemIds: ["p-1"],
    }), {
      params: Promise.resolve({ id: "ps-1" }),
    } as never);

    expect(res.status).toBe(200);
    expect(canManageProblemSetForUserMock).toHaveBeenCalledWith(
      "inst-1",
      ["g-1"],
      "inst-1",
      "instructor"
    );
    expect(updateProblemSetMock).toHaveBeenCalledWith("ps-1", expect.objectContaining({
      name: "Updated Exam Set",
      problemIds: ["p-1"],
    }));
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("rejects DELETE when the actor cannot manage the target problem set", async () => {
    problemSetsFindFirstMock.mockResolvedValue(EXISTING_PROBLEM_SET);
    canManageProblemSetForUserMock.mockResolvedValue(false);

    const res = await DELETE_SET(makeDeleteRequest(), {
      params: Promise.resolve({ id: "ps-1" }),
    } as never);

    expect(res.status).toBe(403);
    expect(deleteProblemSetMock).not.toHaveBeenCalled();
  });
});

describe("problem-set group routes", () => {
  it("rejects group assignment when the target groups are outside the actor scope", async () => {
    problemSetsFindFirstMock.mockResolvedValue(EXISTING_PROBLEM_SET);
    findInaccessibleGroupIdsForProblemSetUserMock.mockResolvedValue(["g-9"]);

    const res = await POST_GROUPS(makePostGroupRequest({ groupIds: ["g-9"] }), {
      params: Promise.resolve({ id: "ps-1" }),
    } as never);

    expect(res.status).toBe(403);
    expect(assignProblemSetToGroupsMock).not.toHaveBeenCalled();
  });

  it("removes group access for a manageable problem set", async () => {
    problemSetsFindFirstMock.mockResolvedValue(EXISTING_PROBLEM_SET);

    const res = await DELETE_GROUPS(makeDeleteRequest({ groupId: "g-1" }), {
      params: Promise.resolve({ id: "ps-1" }),
    } as never);

    expect(res.status).toBe(200);
    expect(removeProblemSetFromGroupMock).toHaveBeenCalledWith("ps-1", "g-1");
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });
});
