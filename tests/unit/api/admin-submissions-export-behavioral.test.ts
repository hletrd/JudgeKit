import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  selectMock,
  getSubmissionReviewGroupIdsMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  getSubmissionReviewGroupIdsMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: { id: "admin-1", role: "admin", username: "admin" },
      }),
}));

vi.mock("@/lib/assignments/submissions", () => ({
  getSubmissionReviewGroupIds: getSubmissionReviewGroupIdsMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  submissions: {
    id: "submissions.id",
    language: "submissions.language",
    status: "submissions.status",
    submittedAt: "submissions.submittedAt",
    score: "submissions.score",
    userId: "submissions.userId",
    assignmentId: "submissions.assignmentId",
    problemId: "submissions.problemId",
  },
  assignments: {
    id: "assignments.id",
    groupId: "assignments.groupId",
  },
  groups: {
    id: "groups.id",
    name: "groups.name",
  },
  users: {
    id: "users.id",
    name: "users.name",
  },
  problems: {
    id: "problems.id",
    title: "problems.title",
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
    and: vi.fn((...args: unknown[]) => ({ _and: args })),
    or: vi.fn((...args: unknown[]) => ({ _or: args })),
    gte: vi.fn((_field: unknown, value: unknown) => ({ _gte: value })),
    lte: vi.fn((_field: unknown, value: unknown) => ({ _lte: value })),
    inArray: vi.fn((_field: unknown, values: unknown) => ({ _inArray: values })),
    sql: Object.assign(
      (strings: TemplateStringsArray) => strings.join("?"),
      { raw: vi.fn((value: string) => value) }
    ),
  };
});

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

describe("GET /api/v1/admin/submissions/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubmissionReviewGroupIdsMock.mockResolvedValue(null);
  });

  it("returns a CSV response with correct Content-Type and data rows", async () => {
    const chain = buildSelectChain([
      {
        id: "sub-1",
        language: "python",
        status: "accepted",
        submittedAt: new Date("2026-04-12T10:00:00Z"),
        score: 100,
        userName: "Alice",
        groupName: "Group A",
        problemTitle: "Hello World",
      },
    ]);
    selectMock.mockReturnValue(chain);

    const { GET } = await import("@/app/api/v1/admin/submissions/export/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/submissions/export"), { params: Promise.resolve({}) });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(text).toContain("Submission ID");
    expect(text).toContain("sub-1");
    expect(text).toContain("Alice");
    expect(text).toContain("Hello World");
  });

  it("escapes CSV-injection vectors in field values", async () => {
    const chain = buildSelectChain([
      {
        id: "sub-malicious",
        language: "python",
        status: "accepted",
        submittedAt: new Date("2026-04-12T10:00:00Z"),
        score: 100,
        userName: "=CMD(inject)",
        groupName: "+formula",
        problemTitle: "-dash",
      },
    ]);
    selectMock.mockReturnValue(chain);

    const { GET } = await import("@/app/api/v1/admin/submissions/export/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/submissions/export"), { params: Promise.resolve({}) });
    const text = await res.text();

    // escapeCsvField prefixes dangerous leading chars with tab
    expect(text).toContain("\t=CMD(inject)");
    expect(text).toContain("\t+formula");
    expect(text).toContain("\t-dash");
  });

  it("limits export to 10000 rows maximum", async () => {
    const chain = buildSelectChain([]);
    selectMock.mockReturnValue(chain);

    const { GET } = await import("@/app/api/v1/admin/submissions/export/route");
    await GET(new NextRequest("http://localhost/api/v1/admin/submissions/export"), { params: Promise.resolve({}) });

    expect(chain.limit).toHaveBeenCalledWith(10_000);
  });

  it("uses Content-Disposition attachment header with RFC 5987 encoding", async () => {
    const chain = buildSelectChain([]);
    selectMock.mockReturnValue(chain);

    const { GET } = await import("@/app/api/v1/admin/submissions/export/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/submissions/export"), { params: Promise.resolve({}) });

    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("filename=");
    expect(disposition).toContain("filename*=UTF-8''");
  });
});
