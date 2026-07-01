import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getSubmissionReviewGroupIdsMock,
  recordAuditEventMock,
  invalidateRankingCacheMock,
  loggerMock,
  execTransactionMock,
} = vi.hoisted(() => ({
  getSubmissionReviewGroupIdsMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  invalidateRankingCacheMock: vi.fn(),
  loggerMock: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  execTransactionMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: unknown; body: unknown; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest) => {
      const body = await req.json().catch(() => undefined);
      return handler(req, {
        user: { id: "admin-1", role: "admin", username: "admin" },
        body,
        params: {},
      });
    },
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
}));

vi.mock("@/lib/assignments/submissions", () => ({
  getSubmissionReviewGroupIds: getSubmissionReviewGroupIdsMock,
}));

vi.mock("@/lib/audit/events", () => ({ recordAuditEvent: recordAuditEventMock }));
vi.mock("@/lib/assignments/contest-scoring", () => ({ invalidateRankingCache: invalidateRankingCacheMock }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

vi.mock("@/lib/db/schema", () => ({
  submissions: {
    id: "submissions.id",
    assignmentId: "submissions.assignmentId",
    judgeWorkerId: "submissions.judgeWorkerId",
    status: "submissions.status",
    score: "submissions.score",
    compileOutput: "submissions.compileOutput",
    executionTimeMs: "submissions.executionTimeMs",
    memoryUsedKb: "submissions.memoryUsedKb",
    judgeClaimToken: "submissions.judgeClaimToken",
    judgeClaimedAt: "submissions.judgeClaimedAt",
    judgedAt: "submissions.judgedAt",
  },
  assignments: { id: "assignments.id", groupId: "assignments.groupId" },
  submissionResults: { submissionId: "submissionResults.submissionId" },
  judgeWorkers: { id: "judgeWorkers.id", activeTasks: "judgeWorkers.activeTasks" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
    inArray: vi.fn((_field: unknown, values: unknown) => ({ _inArray: values })),
    and: vi.fn((...args: unknown[]) => ({ _and: args })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) =>
        values.reduce((acc, v, i) => acc + String(v) + strings[i + 1], strings[0]),
      { raw: vi.fn((value: string) => value) }
    ),
  };
});

vi.mock("@/lib/db", () => ({ execTransaction: execTransactionMock }));

import { POST } from "@/app/api/v1/admin/submissions/rejudge/route";

type SubmissionRow = { id: string; judgeWorkerId: string | null };

function buildTx(rows: SubmissionRow[], workers: Map<string, number>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(rows)),
        })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    update: vi.fn((table: unknown) => {
      const isWorkers =
        table === "judgeWorkers" ||
        (typeof table === "object" &&
          table !== null &&
          (table as Record<string, unknown>).id === "judgeWorkers.id");
      return {
        set: vi.fn((setObj: Record<string, unknown>) => ({
          where: vi.fn((whereCond: { _eq: string }) => {
            if (isWorkers) {
              const workerId = whereCond._eq;
              const expr = String(setObj.activeTasks);
              const match = expr.match(/-\s*(\d+)/);
              const count = match ? parseInt(match[1], 10) : 0;
              const current = workers.get(workerId) ?? 0;
              workers.set(workerId, Math.max(0, current - count));
            }
            return Promise.resolve(undefined);
          }),
        })),
      };
    }),
  };
}

function makeRequest(body: { submissionIds: string[] }) {
  return new NextRequest("http://localhost/api/v1/admin/submissions/rejudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callRejudge(
  body: { submissionIds: string[] },
  rows: SubmissionRow[],
  initialWorkers: Map<string, number>
) {
  const workers = new Map(initialWorkers);
  const tx = buildTx(rows, workers);
  execTransactionMock.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(tx)
  );
  getSubmissionReviewGroupIdsMock.mockResolvedValue(null);
  const res = await POST(makeRequest(body), { params: Promise.resolve({}) });
  return { res, tx, workers };
}

describe("POST /api/v1/admin/submissions/rejudge activeTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decrements each worker's activeTasks by the number of rejudged submissions they owned", async () => {
    const rows = [
      { id: "sub-1", judgeWorkerId: "worker-1" },
      { id: "sub-2", judgeWorkerId: "worker-1" },
      { id: "sub-3", judgeWorkerId: "worker-2" },
      { id: "sub-4", judgeWorkerId: null },
    ];
    const { res, tx, workers } = await callRejudge(
      { submissionIds: ["sub-1", "sub-2", "sub-3", "sub-4"] },
      rows,
      new Map([
        ["worker-1", 5],
        ["worker-2", 1],
      ])
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rejudged).toBe(4);
    expect(body.data.rejudged).toBe(4);
    expect(workers.get("worker-1")).toBe(3);
    expect(workers.get("worker-2")).toBe(0);
  });

  it("never decrements activeTasks below zero", async () => {
    const rows = [{ id: "sub-1", judgeWorkerId: "worker-1" }];
    const { res, workers } = await callRejudge(
      { submissionIds: ["sub-1"] },
      rows,
      new Map([["worker-1", 0]])
    );

    expect(res.status).toBe(200);
    expect(workers.get("worker-1")).toBe(0);
  });

  it("does not touch workers when the permission check fails", async () => {
    const rows = [{ id: "sub-1", judgeWorkerId: "worker-1" }];
    const workers = new Map([["worker-1", 3]]);
    const tx = buildTx(rows, workers);
    execTransactionMock.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(tx)
    );
    getSubmissionReviewGroupIdsMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ submissionIds: ["sub-1", "sub-2"] }), { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
    expect(workers.get("worker-1")).toBe(3);
  });
});
