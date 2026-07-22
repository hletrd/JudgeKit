import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  selectMock,
  getSubmissionReviewGroupIdsMock,
  enqueueReviewMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(() => null),
  resolveCapabilitiesMock: vi.fn(),
  selectMock: vi.fn(),
  getSubmissionReviewGroupIdsMock: vi.fn(),
  enqueueReviewMock: vi.fn(),
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
  enqueueReview: enqueueReviewMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

// Subquery chain for the notExists() dedup predicate — never awaited, so its
// methods just return the chain. (The query is never serialized because db is
// mocked.)
function subqueryChain() {
  const c: Record<string, unknown> = {};
  c.from = vi.fn(() => c);
  c.leftJoin = vi.fn(() => c);
  c.where = vi.fn(() => c);
  return c;
}
// Count chain — awaited at .where(), resolves to [{ total }].
function countChain(total: number) {
  const c: Record<string, unknown> = {};
  c.from = vi.fn(() => c);
  c.leftJoin = vi.fn(() => c);
  c.where = vi.fn(() => Promise.resolve([{ total }]));
  return c;
}
// Candidate chain — awaited at .limit(), resolves to the oldest-matching rows.
function candidateChain(rows: { id: string }[]) {
  const c: Record<string, unknown> = {};
  c.from = vi.fn(() => c);
  c.leftJoin = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.orderBy = vi.fn(() => c);
  c.limit = vi.fn(() => Promise.resolve(rows));
  return c;
}

function setupSelect(total: number, candidates: { id: string }[]) {
  selectMock
    .mockReturnValueOnce(subqueryChain())
    .mockReturnValueOnce(countChain(total))
    .mockReturnValueOnce(candidateChain(candidates));
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/admin/submissions/ai-review-backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
}

const VALID_RANGE = { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" };

describe("POST /api/v1/admin/submissions/ai-review-backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset clears the mockReturnValueOnce queue too (clearAllMocks does
    // not), so a test that consumes fewer queued values than it set up cannot
    // leak them into the next test.
    selectMock.mockReset();
    enqueueReviewMock.mockReset();
    getApiUserMock.mockResolvedValue({ id: "admin-1", role: "admin" });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["submissions.rejudge"]));
    getSubmissionReviewGroupIdsMock.mockResolvedValue(null);
    enqueueReviewMock.mockReturnValue(true);
  });

  it("enqueues up to the bounded batch of oldest matches and reports total remaining", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({ id: `sub-${i}` }));
    setupSelect(25, candidates);
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest(VALID_RANGE), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { enqueued: 10, remaining: 25 } });
    expect(enqueueReviewMock).toHaveBeenCalledTimes(10);
    expect(enqueueReviewMock).toHaveBeenNthCalledWith(1, "sub-0", { requireAccepted: true });
  });

  it("is resumable: returns remaining 0 and enqueues nothing when no matches remain", async () => {
    setupSelect(0, []);
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest(VALID_RANGE), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { enqueued: 0, remaining: 0 } });
    expect(enqueueReviewMock).not.toHaveBeenCalled();
  });

  it("backs off mid-batch when the shared review queue fills", async () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({ id: `sub-${i}` }));
    setupSelect(8, candidates);
    enqueueReviewMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false); // queue full — stop enqueuing
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest(VALID_RANGE), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { enqueued: 3, remaining: 8 } });
    expect(enqueueReviewMock).toHaveBeenCalledTimes(4); // 3 accepted + 1 rejected (break)
  });

  it("rejects an inverted date range (from > to) with 400", async () => {
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(
      makeRequest({ from: "2026-07-01T00:00:00.000Z", to: "2026-06-01T00:00:00.000Z" }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
    expect(enqueueReviewMock).not.toHaveBeenCalled();
  });

  it("rejects an over-large date window (> 180 days) with 400 before any DB work", async () => {
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    // Jan 1 → Dec 31 is ~364 days, well over the 180-day cap. Reject so a huge
    // range can't drive an expensive full-table count/scan.
    const res = await POST(
      makeRequest({ from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z" }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
    expect(enqueueReviewMock).not.toHaveBeenCalled();
  });

  it("accepts a window at the 180-day cap boundary", async () => {
    // 2026-01-01 → 2026-06-30 is exactly 180 days (<= cap), so it must pass.
    setupSelect(0, []);
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(
      makeRequest({ from: "2026-01-01T00:00:00.000Z", to: "2026-06-30T00:00:00.000Z" }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
  });

  it("builds the selection predicate: accepted + null-author dedup + group scope + window", async () => {
    // Faithfully assert the WHERE the route hands to the DB (the base mock
    // returns canned rows regardless of predicate). We capture the real Drizzle
    // SQL objects and serialize them with a real PgDialect.
    const dialect = new PgDialect();
    let dedupWhere: unknown; // WHERE of the notExists() dedup subquery
    let matchWhere: unknown; // outer count/candidate WHERE

    // notExists() subquery: capture its WHERE, then return a real serializable
    // SQL fragment so the OUTER filter (which embeds this subquery) serializes.
    const subFrom = {
      where: vi.fn((cond: unknown) => {
        dedupWhere = cond;
        return drizzleSql`select 1`;
      }),
    };
    const subSelect = { from: vi.fn(() => subFrom) };

    // Count query: capture the outer matchFilter, resolve remaining = 0 so the
    // route skips the candidate query (only two db.select() calls total).
    const countFrom: Record<string, unknown> = {};
    countFrom.leftJoin = vi.fn(() => countFrom);
    countFrom.where = vi.fn((cond: unknown) => {
      matchWhere = cond;
      return Promise.resolve([{ total: 0 }]);
    });
    const countSelect = { from: vi.fn(() => countFrom) };

    selectMock.mockReturnValueOnce(subSelect).mockReturnValueOnce(countSelect);
    getSubmissionReviewGroupIdsMock.mockResolvedValue(["g1", "g2"]);

    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest(VALID_RANGE), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    // Dedup predicate: at most one AI comment — correlated by submission id,
    // filtered to author_id IS NULL (the AI-authored rows).
    const dedupQ = dialect.sqlToQuery(dedupWhere as Parameters<typeof dialect.sqlToQuery>[0]);
    expect(dedupQ.sql).toContain('"author_id" is null');
    expect(dedupQ.sql).toContain('"submission_id"');

    // Outer selection: accepted status, submitted_at window, group scoping, and
    // the not-exists dedup. "accepted" + the scoped group ids are parameterized.
    const matchQ = dialect.sqlToQuery(matchWhere as Parameters<typeof dialect.sqlToQuery>[0]);
    expect(matchQ.sql).toContain('"status"');
    expect(matchQ.sql).toContain('"submitted_at"');
    expect(matchQ.sql).toContain('"group_id"');
    expect(matchQ.sql.toLowerCase()).toContain("not exists");
    expect(matchQ.params).toContain("accepted");
    expect(matchQ.params).toEqual(expect.arrayContaining(["g1", "g2"]));
  });

  it("rejects a missing date range with 400", async () => {
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(enqueueReviewMock).not.toHaveBeenCalled();
  });

  it("returns 403 without the submissions.rejudge capability", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set<string>());
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest(VALID_RANGE), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(enqueueReviewMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/admin/submissions/ai-review-backfill/route");
    const res = await POST(makeRequest(VALID_RANGE), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(enqueueReviewMock).not.toHaveBeenCalled();
  });
});
