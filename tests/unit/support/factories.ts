import { vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import type { UserRole, Language, SubmissionStatus, ProblemVisibility } from "@/types";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * Creates a NextRequest for use in route handler tests.
 *
 * @example
 * createMockRequest("http://localhost/api/v1/judge/claim", {
 *   method: "POST",
 *   headers: { Authorization: "Bearer token" },
 *   body: JSON.stringify({}),
 * })
 */
export function createMockRequest(
  url: string,
  options?: ConstructorParameters<typeof NextRequest>[1]
): NextRequest {
  return new NextRequest(url, options);
}

// ---------------------------------------------------------------------------
// Auth / Session
// ---------------------------------------------------------------------------

export type MockSessionUser = Session["user"];

/**
 * Creates a minimal next-auth Session object.
 *
 * @example
 * createMockSession({ role: "admin" })
 */
export function createMockSession(overrides?: Partial<MockSessionUser>): Session {
  return {
    user: {
      id: "user-1",
      username: "testuser",
      name: "Test User",
      role: "student" as UserRole,
      mustChangePassword: false,
      email: null,
      className: null,
      image: null,
      ...overrides,
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

/**
 * Convenience alias for the user portion of a session — mirrors the shape
 * used by `auth()` in permissions tests.
 *
 * @example
 * authMock.mockResolvedValue(createMockSession({ role: "instructor" }));
 */
export function createMockUser(overrides?: Partial<MockSessionUser>): MockSessionUser {
  return createMockSession(overrides).user;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/**
 * The raw row shape returned by SQLite queries for the `submissions` table.
 * Using plain primitives (numbers / strings / null) to match what the judge
 * claim endpoint and other routes expect from `db.prepare().get()`.
 */
export interface MockSubmissionRow {
  id: string;
  userId: string;
  problemId: string;
  assignmentId: string | null;
  claimToken: string | null;
  language: Language;
  sourceCode: string;
  status: SubmissionStatus;
  compileOutput: string | null;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  score: number | null;
  judgedAt: number | null;
  submittedAt: number;
}

/**
 * Creates a mock submission row (plain object, not a Drizzle model).
 *
 * @example
 * prepareGetMock.mockReturnValue(createMockSubmissionRow({ status: "judging" }));
 */
export function createMockSubmissionRow(
  overrides?: Partial<MockSubmissionRow>
): MockSubmissionRow {
  return {
    id: "submission-1",
    userId: "user-1",
    problemId: "problem-1",
    assignmentId: null,
    claimToken: null,
    language: "python",
    sourceCode: "print(1)",
    status: "queued",
    compileOutput: null,
    executionTimeMs: null,
    memoryUsedKb: null,
    score: null,
    judgedAt: null,
    submittedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

export interface MockProblemRow {
  id: string;
  title: string;
  description: string | null;
  visibility: ProblemVisibility;
  authorId: string | null;
  timeLimitMs: number;
  memoryLimitMb: number;
}

/**
 * Creates a mock problem row.
 *
 * @example
 * problemsFindFirstMock.mockResolvedValue(createMockProblemRow({ timeLimitMs: 2000 }));
 */
export function createMockProblemRow(overrides?: Partial<MockProblemRow>): MockProblemRow {
  return {
    id: "problem-1",
    title: "Test Problem",
    description: null,
    visibility: "public",
    authorId: "user-1",
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Database mock
// ---------------------------------------------------------------------------

/**
 * The shape of the Drizzle-ORM `query` property used in permissions and route tests.
 * Extend per test to add more tables as needed.
 */
export interface MockDbQuery {
  problems: { findFirst: ReturnType<typeof vi.fn> };
  groups: { findFirst: ReturnType<typeof vi.fn> };
  enrollments: { findFirst: ReturnType<typeof vi.fn> };
}

/**
 * Creates a fully-mocked db object with the same surface used across unit tests.
 *
 * The `select` mock returns a chainable `{ from: { where: { ... } } }` builder
 * that resolves to `[]` by default. Override per test with `.mockReturnValue()`.
 *
 * @example
 * const mockDb = createMockDb();
 * vi.mock("@/lib/db", () => ({ db: mockDb }));
 */
export function createMockDb() {
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const deleteFn = vi.fn();

  // Default chainable select that returns an empty array
  select.mockReturnValue(
    createSelectResult([])
  );

  return {
    select,
    insert,
    update,
    delete: deleteFn,
    query: {
      problems: {
        findFirst: vi.fn(),
      },
      groups: {
        findFirst: vi.fn(),
      },
      enrollments: {
        findFirst: vi.fn(),
      },
    } satisfies MockDbQuery,
  };
}

/**
 * Wraps an arbitrary value in the `{ from: { where: result } }` fluent builder
 * that Drizzle's `db.select().from().where()` returns.
 *
 * Mirrors the `createSelectResult` helper present in permissions.test.ts so
 * tests that import from this module do not need to define their own.
 *
 * @example
 * mockDb.select.mockReturnValue(createSelectResult([{ groupId: "g-1" }]));
 */
export function createSelectResult<T>(result: T): { from: ReturnType<typeof vi.fn> } {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => result),
    })),
  };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface MockWorkerRow {
  id: string;
  hostname: string;
  ipAddress: string | null;
  concurrency: number;
  version: string | null;
  labels: string[];
  status: "online" | "offline" | "stale";
  alias: string | null;
  secretToken: string | null;
  activeTasks: number;
  registeredAt: number;
  lastHeartbeatAt: number | null;
  deregisteredAt: number | null;
}

/**
 * Creates a mock judge worker row.
 *
 * @example
 * createMockWorkerRow({ status: "stale", concurrency: 8 });
 */
export function createMockWorkerRow(
  overrides?: Partial<MockWorkerRow>
): MockWorkerRow {
  return {
    id: "worker-1",
    hostname: "judge-worker-01",
    ipAddress: "192.168.1.100",
    concurrency: 4,
    version: "1.0.0",
    labels: [],
    status: "online",
    alias: null,
    secretToken: null,
    activeTasks: 0,
    registeredAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    deregisteredAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Contest
// ---------------------------------------------------------------------------

export interface MockContestRow {
  id: string;
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  scoringMode: "ioi" | "icpc";
  accessCode: string | null;
  isPublic: boolean;
  createdBy: string;
}

/**
 * Creates a mock contest row.
 *
 * @example
 * createMockContestRow({ scoringMode: "icpc", isPublic: false });
 */
export function createMockContestRow(
  overrides?: Partial<MockContestRow>
): MockContestRow {
  return {
    id: "contest-1",
    title: "Test Contest",
    description: null,
    startTime: Date.now(),
    endTime: Date.now() + 3_600_000,
    scoringMode: "ioi",
    accessCode: null,
    isPublic: true,
    createdBy: "user-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SQLite prepared-statement mock (used by judge claim route)
// ---------------------------------------------------------------------------

export interface MockPreparedStatement {
  get: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock for `sqlite.prepare()` return value.
 *
 * @example
 * prepareMock.mockReturnValue(createMockPreparedStatement());
 */
export function createMockPreparedStatement(
  overrides?: Partial<MockPreparedStatement>
): MockPreparedStatement {
  return {
    get: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
    ...overrides,
  };
}
