import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  canAccessSubmissionMock,
  resolveCapabilitiesMock,
  submissionsFindFirstMock,
} = vi.hoisted(() => ({
  canAccessSubmissionMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  submissionsFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: vi.fn().mockResolvedValue({
    id: "student-1",
    role: "student",
    username: "student",
    email: "student@example.com",
    name: "Student",
    className: null,
    mustChangePassword: false,
  }),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: () => NextResponse.json({ error: "notFound" }, { status: 404 }),
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessSubmission: canAccessSubmissionMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      submissions: {
        findFirst: submissionsFindFirstMock,
      },
    },
  },
}));

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/v1/submissions/sub-1", {
    method: "GET",
  });
}

describe("GET /api/v1/submissions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessSubmissionMock.mockResolvedValue(true);
  });

  it("removes source code and hidden test outputs for non-privileged viewers", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set());
    submissionsFindFirstMock
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "student-2",
        assignmentId: "assignment-1",
      })
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "student-2",
        assignmentId: "assignment-1",
        sourceCode: 'print("secret")',
        results: [
          {
            status: "accepted",
            actualOutput: "42\n",
            testCase: { sortOrder: 1, isVisible: true },
          },
          {
            status: "wrong_answer",
            actualOutput: "hidden answer\n",
            testCase: { sortOrder: 2, isVisible: false },
          },
        ],
      });

    const { GET } = await import("@/app/api/v1/submissions/[id]/route");
    const response = await GET(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.sourceCode).toBeUndefined();
    expect(body.data.results).toEqual([
      {
        status: "accepted",
        actualOutput: "42\n",
        testCase: { sortOrder: 1, isVisible: true },
      },
      {
        status: "wrong_answer",
        actualOutput: null,
        testCase: { sortOrder: 2, isVisible: false },
      },
    ]);
  });

  it("preserves hidden test outputs for reviewers with submissions.view_all", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set(["submissions.view_all", "submissions.view_source"]));
    submissionsFindFirstMock
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "student-2",
        assignmentId: "assignment-1",
      })
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "student-2",
        assignmentId: "assignment-1",
        sourceCode: 'print("secret")',
        results: [
          {
            status: "wrong_answer",
            actualOutput: "hidden answer\n",
            testCase: { sortOrder: 2, isVisible: false },
          },
        ],
      });

    const { GET } = await import("@/app/api/v1/submissions/[id]/route");
    const response = await GET(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.sourceCode).toBe('print("secret")');
    expect(body.data.results[0].actualOutput).toBe("hidden answer\n");
    expect(body.data.results[0].testCase).toEqual({ sortOrder: 2, isVisible: false });
  });
});
