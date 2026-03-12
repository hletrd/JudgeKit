/**
 * Seed helpers for integration tests.
 *
 * These insert real rows via Drizzle ORM into the in-memory test database.
 * Every function returns the inserted row so tests can reference IDs and
 * other generated values.
 */
import { nanoid } from "nanoid";
import type { TestDb } from "./test-db";
import {
  users,
  problems,
  testCases,
  submissions,
  groups,
  enrollments,
  assignments,
  assignmentProblems,
  submissionResults,
  submissionComments,
} from "@/lib/db/schema";
import type { UserRole, Language, SubmissionStatus, ProblemVisibility } from "@/types";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface SeedUserOptions {
  id?: string;
  username?: string;
  name?: string;
  email?: string | null;
  role?: UserRole;
  passwordHash?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
  className?: string | null;
}

export function seedUser(ctx: TestDb, opts: SeedUserOptions = {}) {
  const id = opts.id ?? nanoid();
  const now = new Date();
  const row = {
    id,
    username: opts.username ?? `user-${id.slice(0, 6)}`,
    name: opts.name ?? `Test User ${id.slice(0, 6)}`,
    email: opts.email ?? null,
    role: opts.role ?? ("student" as UserRole),
    passwordHash: opts.passwordHash ?? null,
    isActive: opts.isActive ?? true,
    mustChangePassword: opts.mustChangePassword ?? false,
    className: opts.className ?? null,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert(users).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

export interface SeedProblemOptions {
  id?: string;
  title?: string;
  description?: string | null;
  authorId?: string | null;
  visibility?: ProblemVisibility;
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

export function seedProblem(ctx: TestDb, opts: SeedProblemOptions = {}) {
  const id = opts.id ?? nanoid();
  const now = new Date();
  const row = {
    id,
    title: opts.title ?? `Problem ${id.slice(0, 6)}`,
    description: opts.description ?? "A test problem.",
    authorId: opts.authorId ?? null,
    visibility: opts.visibility ?? ("public" as ProblemVisibility),
    timeLimitMs: opts.timeLimitMs ?? 2000,
    memoryLimitMb: opts.memoryLimitMb ?? 256,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert(problems).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Test Cases
// ---------------------------------------------------------------------------

export interface SeedTestCaseOptions {
  id?: string;
  problemId: string;
  input?: string;
  expectedOutput?: string;
  isVisible?: boolean;
  sortOrder?: number;
}

export function seedTestCase(ctx: TestDb, opts: SeedTestCaseOptions) {
  const id = opts.id ?? nanoid();
  const row = {
    id,
    problemId: opts.problemId,
    input: opts.input ?? "1 2\n",
    expectedOutput: opts.expectedOutput ?? "3\n",
    isVisible: opts.isVisible ?? false,
    sortOrder: opts.sortOrder ?? 0,
  };
  ctx.db.insert(testCases).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export interface SeedSubmissionOptions {
  id?: string;
  userId: string;
  problemId: string;
  assignmentId?: string | null;
  language?: Language;
  sourceCode?: string;
  status?: SubmissionStatus;
}

export function seedSubmission(ctx: TestDb, opts: SeedSubmissionOptions) {
  const id = opts.id ?? nanoid();
  const now = new Date();
  const row = {
    id,
    userId: opts.userId,
    problemId: opts.problemId,
    assignmentId: opts.assignmentId ?? null,
    language: opts.language ?? ("python" as Language),
    sourceCode: opts.sourceCode ?? 'print("hello")',
    status: opts.status ?? ("pending" as SubmissionStatus),
    submittedAt: now,
  };
  ctx.db.insert(submissions).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface SeedGroupOptions {
  id?: string;
  name?: string;
  description?: string | null;
  instructorId?: string | null;
}

export function seedGroup(ctx: TestDb, opts: SeedGroupOptions = {}) {
  const id = opts.id ?? nanoid();
  const now = new Date();
  const row = {
    id,
    name: opts.name ?? `Group ${id.slice(0, 6)}`,
    description: opts.description ?? null,
    instructorId: opts.instructorId ?? null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert(groups).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export function seedEnrollment(ctx: TestDb, opts: { userId: string; groupId: string }) {
  const id = nanoid();
  const row = {
    id,
    userId: opts.userId,
    groupId: opts.groupId,
    enrolledAt: new Date(),
  };
  ctx.db.insert(enrollments).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export interface SeedAssignmentOptions {
  id?: string;
  groupId: string;
  title?: string;
  description?: string | null;
  startsAt?: Date | null;
  deadline?: Date | null;
}

export function seedAssignment(ctx: TestDb, opts: SeedAssignmentOptions) {
  const id = opts.id ?? nanoid();
  const now = new Date();
  const row = {
    id,
    groupId: opts.groupId,
    title: opts.title ?? `Assignment ${id.slice(0, 6)}`,
    description: opts.description ?? null,
    startsAt: opts.startsAt ?? null,
    deadline: opts.deadline ?? null,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert(assignments).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Assignment Problems
// ---------------------------------------------------------------------------

export function seedAssignmentProblem(
  ctx: TestDb,
  opts: { assignmentId: string; problemId: string; points?: number; sortOrder?: number }
) {
  const id = nanoid();
  const row = {
    id,
    assignmentId: opts.assignmentId,
    problemId: opts.problemId,
    points: opts.points ?? 100,
    sortOrder: opts.sortOrder ?? 0,
  };
  ctx.db.insert(assignmentProblems).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Submission Results
// ---------------------------------------------------------------------------

export function seedSubmissionResult(
  ctx: TestDb,
  opts: {
    submissionId: string;
    testCaseId: string;
    status: string;
    actualOutput?: string | null;
    executionTimeMs?: number | null;
    memoryUsedKb?: number | null;
  }
) {
  const id = nanoid();
  const row = {
    id,
    submissionId: opts.submissionId,
    testCaseId: opts.testCaseId,
    status: opts.status,
    actualOutput: opts.actualOutput ?? null,
    executionTimeMs: opts.executionTimeMs ?? null,
    memoryUsedKb: opts.memoryUsedKb ?? null,
  };
  ctx.db.insert(submissionResults).values(row).run();
  return row;
}

// ---------------------------------------------------------------------------
// Submission Comments
// ---------------------------------------------------------------------------

export function seedSubmissionComment(
  ctx: TestDb,
  opts: { submissionId: string; authorId?: string | null; content: string }
) {
  const id = nanoid();
  const now = new Date();
  const row = {
    id,
    submissionId: opts.submissionId,
    authorId: opts.authorId ?? null,
    content: opts.content,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert(submissionComments).values(row).run();
  return row;
}
