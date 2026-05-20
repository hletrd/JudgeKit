import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  selectMock,
  getContestAssignmentMock,
  canManageContestMock,
  canMonitorContestMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  getContestAssignmentMock: vi.fn(),
  canManageContestMock: vi.fn(),
  canMonitorContestMock: vi.fn(),
}));

const ASSIGNMENT_ID = "assign-1";

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; params: any }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: { id: "instructor-1", role: "instructor", username: "instructor" },
        params: { assignmentId: ASSIGNMENT_ID },
      }),
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: canManageContestMock,
  canMonitorContest: canMonitorContestMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  antiCheatEvents: {
    id: "antiCheatEvents.id",
    assignmentId: "antiCheatEvents.assignmentId",
    userId: "antiCheatEvents.userId",
    eventType: "antiCheatEvents.eventType",
    details: "antiCheatEvents.details",
    ipAddress: "antiCheatEvents.ipAddress",
    userAgent: "antiCheatEvents.userAgent",
    createdAt: "antiCheatEvents.createdAt",
  },
  users: {
    id: "users.id",
    name: "users.name",
    username: "users.username",
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
    and: vi.fn((...args: unknown[]) => ({ _and: args })),
    desc: vi.fn((value: unknown) => ({ _desc: value })),
    sql: Object.assign(
      (strings: TemplateStringsArray) => strings.join("?"),
      { raw: vi.fn((value: string) => value) }
    ),
  };
});

function buildSelectChain(events: unknown[], totalCount = 1) {
  let callIndex = 0;
  const eventsChain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(events),
  };
  const countChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: totalCount }]),
  };

  selectMock.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) return eventsChain;
    return countChain;
  });

  return { eventsChain, countChain };
}

describe("GET /api/v1/contests/[assignmentId]/anti-cheat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContestAssignmentMock.mockResolvedValue({
      id: ASSIGNMENT_ID,
      examMode: "exam",
      groupId: "group-1",
      enableAntiCheat: true,
    });
    canManageContestMock.mockResolvedValue(true);
    canMonitorContestMock.mockResolvedValue(true);
  });

  it("returns anti-cheat events with pagination metadata", async () => {
    const events = [
      {
        id: "evt-1",
        userId: "user-1",
        userName: "Alice",
        username: "alice",
        eventType: "tab_switch",
        details: null,
        ipAddress: "127.0.0.1",
        userAgent: "test",
        createdAt: new Date("2026-04-12T10:00:00Z"),
      },
    ];
    buildSelectChain(events, 1);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?limit=50&offset=0`
    );
    const res = await GET(req);
    const body = await res.json();

    expect(body.data.events).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.events[0].eventType).toBe("tab_switch");
  });

  it("defaults limit to 100 when not provided", async () => {
    const { eventsChain } = buildSelectChain([], 0);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat`
    );
    await GET(req);

    // parsePositiveInt(null, 100) returns 100
    expect(eventsChain.limit).toHaveBeenCalledWith(100);
  });

  it("caps limit at 500 even when a larger value is requested", async () => {
    const { eventsChain } = buildSelectChain([], 0);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?limit=9999`
    );
    await GET(req);

    // Math.min(parsePositiveInt("9999", 100), 500) = 500
    expect(eventsChain.limit).toHaveBeenCalledWith(500);
  });

  it("rejects callers who cannot manage the contest", async () => {
    canManageContestMock.mockResolvedValueOnce(false);
    canMonitorContestMock.mockResolvedValueOnce(false);
    buildSelectChain([], 0);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat`
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(403);
  });

  it("returns 404 when assignment does not exist or is not exam mode", async () => {
    getContestAssignmentMock.mockResolvedValueOnce(null);
    buildSelectChain([], 0);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/nonexistent/anti-cheat`
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
  });

  it("handles non-numeric limit and offset gracefully", async () => {
    const { eventsChain } = buildSelectChain([], 0);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?limit=abc&offset=xyz`
    );
    await GET(req);

    // parsePositiveInt("abc") returns default 100, parseInt("xyz") returns NaN → offset 0
    expect(eventsChain.limit).toHaveBeenCalledWith(100);
    expect(eventsChain.offset).toHaveBeenCalledWith(0);
  });
});
