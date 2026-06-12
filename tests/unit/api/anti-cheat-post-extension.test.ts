/**
 * RPF cycle-3 AGG3-1 (red-first): the anti-cheat ingest must honor a
 * staff-extended `exam_sessions.personal_deadline` past the assignment close
 * for windowed exams — otherwise the accommodation window is a telemetry
 * blackout and every submission in it accrues a false
 * `submission_stale_heartbeat` flag.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  insertMock,
  valuesMock,
  getContestAssignmentMock,
  rawQueryOneMock,
  getExamSessionMock,
} = vi.hoisted(() => {
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  return {
    valuesMock,
    insertMock: vi.fn(() => ({ values: valuesMock })),
    getContestAssignmentMock: vi.fn(),
    rawQueryOneMock: vi.fn(),
    getExamSessionMock: vi.fn(),
  };
});

const ASSIGNMENT_ID = "assign-1";
const USER_ID = "student-1";

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: unknown; params: unknown; body: unknown }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: { id: USER_ID, role: "student", username: "student" },
        params: { assignmentId: ASSIGNMENT_ID },
        body: await req.clone().json(),
      }),
  forbidden: () => Response.json({ error: "forbidden" }, { status: 403 }),
  notFound: (what: string) => Response.json({ error: `${what} not found` }, { status: 404 }),
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: vi.fn(),
  canMonitorContest: vi.fn(),
}));

vi.mock("@/lib/assignments/exam-sessions", () => ({
  getExamSession: getExamSessionMock,
}));

vi.mock("@/lib/db", () => ({
  db: { insert: insertMock, select: vi.fn() },
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
  rawQueryAll: vi.fn(),
}));

vi.mock("@/lib/realtime/realtime-coordination", () => ({
  getUnsupportedRealtimeGuard: vi.fn(() => null),
  shouldRecordSharedHeartbeat: vi.fn(),
  usesSharedRealtimeCoordination: vi.fn(() => false),
}));

vi.mock("@/lib/security/ip", () => ({
  extractClientIp: vi.fn(() => "127.0.0.1"),
}));

const NOW = new Date("2026-06-11T12:00:00Z");
const PAST = new Date("2026-06-11T11:00:00Z"); // assignment close already passed
const FUTURE = new Date("2026-06-11T13:00:00Z"); // extension target

function setupAssignment(examMode: string, deadline: Date | null) {
  getContestAssignmentMock.mockResolvedValue({
    id: ASSIGNMENT_ID,
    groupId: "group-1",
    examMode,
    enableAntiCheat: true,
    startsAt: null,
    deadline,
  });
  // call 1: access check (enrollment/token) → truthy row; call 2: SELECT NOW()
  rawQueryOneMock
    .mockResolvedValueOnce({ exists: 1 })
    .mockResolvedValueOnce({ now: NOW });
}

async function postEvent(eventType = "tab_switch") {
  const { POST } = await import("@/app/api/v1/contests/[assignmentId]/anti-cheat/route");
  const req = new NextRequest(`http://localhost/api/v1/contests/${ASSIGNMENT_ID}/anti-cheat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType }),
  });
  return POST(req);
}

describe("POST anti-cheat — extended personal deadline (AGG3-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockImplementation(() => ({ values: valuesMock }));
  });

  it("accepts events past the assignment close while the participant's extended personal deadline is in the future", async () => {
    setupAssignment("windowed", PAST);
    getExamSessionMock.mockResolvedValue({ personalDeadline: FUTURE });

    const res = await postEvent("tab_switch");

    expect(res.status).toBe(200);
    expect(getExamSessionMock).toHaveBeenCalledWith(ASSIGNMENT_ID, USER_ID);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: "tab_switch" }));
  });

  it("accepts heartbeats in the extended window too (the submission-correlation signal)", async () => {
    setupAssignment("windowed", PAST);
    getExamSessionMock.mockResolvedValue({ personalDeadline: FUTURE });

    const res = await postEvent("heartbeat");

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: "heartbeat" }));
  });

  it("still rejects with contestEnded when the personal deadline has ALSO passed", async () => {
    setupAssignment("windowed", PAST);
    getExamSessionMock.mockResolvedValue({ personalDeadline: new Date("2026-06-11T11:30:00Z") });

    const res = await postEvent();

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("contestEnded");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("still rejects when the participant never started a session (no window to honor)", async () => {
    setupAssignment("windowed", PAST);
    getExamSessionMock.mockResolvedValue(null);

    const res = await postEvent();

    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("scheduled mode past the close stays rejected and never consults exam sessions", async () => {
    setupAssignment("scheduled", PAST);

    const res = await postEvent();

    expect(res.status).toBe(403);
    expect(getExamSessionMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("hot path before the close never pays the session lookup", async () => {
    setupAssignment("windowed", FUTURE);

    const res = await postEvent();

    expect(res.status).toBe(200);
    expect(getExamSessionMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});

// RPF cycle-6 AGG6-4: the LRU marks the heartbeat-dedup window BEFORE the
// insert commits — a failed insert must evict the key, or this instance
// suppresses heartbeats for the rest of the 60 s window and silently shrinks
// the 90 s submit-freshness margin.
describe("POST anti-cheat — heartbeat LRU eviction on insert failure (AGG6-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockImplementation(() => ({ values: valuesMock }));
  });

  it("evicts the dedup key when the insert fails so the client's retry re-records immediately", async () => {
    // A time bucket >60 s past anything earlier tests recorded, so the LRU
    // (module-level, shared across this file) starts fresh for this window.
    const windowNow = new Date(NOW.getTime() + 10 * 60_000);

    // Attempt 1: insert blows up — the request fails AND the key must be evicted.
    getContestAssignmentMock.mockResolvedValue({
      id: ASSIGNMENT_ID,
      groupId: "group-1",
      examMode: "windowed",
      enableAntiCheat: true,
      startsAt: null,
      deadline: null,
    });
    rawQueryOneMock
      .mockResolvedValueOnce({ exists: 1 })
      .mockResolvedValueOnce({ now: windowNow });
    valuesMock.mockRejectedValueOnce(new Error("db down"));

    await expect(postEvent("heartbeat")).rejects.toThrow("db down");
    expect(insertMock).toHaveBeenCalledTimes(1);

    // Attempt 2 (same 60 s window): without eviction the dedup would swallow
    // this heartbeat (logged:true, no insert) — the row must be recorded.
    rawQueryOneMock
      .mockResolvedValueOnce({ exists: 1 })
      .mockResolvedValueOnce({ now: windowNow });
    valuesMock.mockResolvedValueOnce(undefined);

    const res = await postEvent("heartbeat");

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventType: "heartbeat" })
    );
  });
});
