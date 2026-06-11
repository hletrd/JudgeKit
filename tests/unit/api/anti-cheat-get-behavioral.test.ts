import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  selectMock,
  getContestAssignmentMock,
  canManageContestMock,
  canMonitorContestMock,
  rawQueryAllMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  getContestAssignmentMock: vi.fn(),
  canManageContestMock: vi.fn(),
  canMonitorContestMock: vi.fn(),
  rawQueryAllMock: vi.fn(),
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
  rawQueryAll: rawQueryAllMock,
}));

// DB-clock source for the ongoing-gap boundary (RPF cycle-5 AGG5-4).
const DB_NOW = new Date("2026-04-12T12:00:00Z");
vi.mock("@/lib/db-time", () => ({
  getDbNow: vi.fn(async () => DB_NOW),
  getDbNowUncached: vi.fn(async () => DB_NOW),
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

  it("returns the IP-overlap report (shared IPs + multi-IP users) without touching the events query", async () => {
    buildSelectChain([], 0);
    const sharedIps = [
      { ip: "10.0.0.7", users: [{ id: "u1", name: "Alice", username: "alice" }, { id: "u2", name: "Bob", username: "bob" }] },
    ];
    const multiIpUsers = [
      { userId: "u3", name: "Carol", username: "carol", ipCount: 4, ips: ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"] },
    ];
    rawQueryAllMock.mockResolvedValueOnce(sharedIps).mockResolvedValueOnce(multiIpUsers);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?report=ipOverlap`
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.sharedIps).toEqual(sharedIps);
    expect(body.data.multiIpUsers).toEqual(multiIpUsers);
    // Aggregation must scope to THIS assignment (named param on both queries).
    expect(rawQueryAllMock).toHaveBeenCalledTimes(2);
    for (const call of rawQueryAllMock.mock.calls) {
      expect(call[1]).toEqual({ assignmentId: ASSIGNMENT_ID });
      expect(String(call[0])).toContain("assignment_id = @assignmentId");
    }
    // The report branch must not fall through to the events listing.
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("denies the IP-overlap report to callers without monitor access", async () => {
    canManageContestMock.mockResolvedValueOnce(false);
    canMonitorContestMock.mockResolvedValueOnce(false);

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
    const req = new NextRequest(
      `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?report=ipOverlap`
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(rawQueryAllMock).not.toHaveBeenCalled();
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

  // RPF cycle-5 AGG5-3/AGG5-4 (resolving deferred AGG4-5): the heartbeat-gap
  // scan is OPT-IN via includeGaps=1, and the ongoing absence (last heartbeat
  // → DB now) is emitted as a synthetic boundary gap.
  describe("heartbeat gaps (includeGaps)", () => {
    function buildGapSelectChain(events: unknown[], heartbeats: Array<{ createdAt: Date }>) {
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
        where: vi.fn().mockResolvedValue([{ count: events.length }]),
      };
      const gapChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(heartbeats),
      };
      selectMock.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return eventsChain;
        if (callIndex === 2) return countChain;
        return gapChain;
      });
      return { eventsChain, countChain, gapChain };
    }

    it("does NOT run the gap scan without includeGaps=1 (no heartbeatGaps field)", async () => {
      buildGapSelectChain([], []);

      const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
      const req = new NextRequest(
        `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?userId=user-1`
      );
      const res = await GET(req);
      const body = await res.json();

      expect(body.data.heartbeatGaps).toBeUndefined();
      // Only the events + count selects ran — no third (gap) query.
      expect(selectMock).toHaveBeenCalledTimes(2);
    });

    it("emits recorded gaps AND the ongoing boundary gap with includeGaps=1", async () => {
      // 10:00 → 10:01 (fine), 10:01 → 10:30 (29 min recorded gap),
      // 10:30 → DB now 12:00 (90 min ONGOING gap).
      buildGapSelectChain([], [
        { createdAt: new Date("2026-04-12T10:30:00Z") },
        { createdAt: new Date("2026-04-12T10:01:00Z") },
        { createdAt: new Date("2026-04-12T10:00:00Z") },
      ]);

      const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
      const req = new NextRequest(
        `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?userId=user-1&includeGaps=1`
      );
      const res = await GET(req);
      const body = await res.json();

      expect(body.data.heartbeatGaps).toEqual([
        {
          userId: "user-1",
          gapStartedAt: "2026-04-12T10:01:00.000Z",
          gapEndedAt: "2026-04-12T10:30:00.000Z",
          gapSeconds: 1740,
        },
        {
          userId: "user-1",
          gapStartedAt: "2026-04-12T10:30:00.000Z",
          gapEndedAt: "2026-04-12T12:00:00.000Z",
          gapSeconds: 5400,
          ongoing: true,
        },
      ]);
    });

    it("emits no ongoing gap when the last heartbeat is fresh", async () => {
      buildGapSelectChain([], [
        { createdAt: new Date("2026-04-12T11:59:30Z") },
        { createdAt: new Date("2026-04-12T11:59:00Z") },
      ]);

      const { GET } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
      const req = new NextRequest(
        `http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat?userId=user-1&includeGaps=1`
      );
      const res = await GET(req);
      const body = await res.json();

      expect(body.data.heartbeatGaps).toBeUndefined();
    });
  });
});
