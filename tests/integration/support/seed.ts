/**
 * Seed helpers for integration tests.
 *
 * These insert real rows via Drizzle ORM into the isolated PostgreSQL test
 * schema. Every function returns the inserted row so tests can reference IDs
 * and other generated values.
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

export async function seedUser(ctx: TestDb, opts: SeedUserOptions = {}) {
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
  await ctx.db.insert(users).values(row);
  return row;
}

export interface SeedProblemOptions {
  id?: string;
  title?: string;
  description?: string | null;
  authorId?: string | null;
  visibility?: ProblemVisibility;
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

export async function seedProblem(ctx: TestDb, opts: SeedProblemOptions = {}) {
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
  await ctx.db.insert(problems).values(row);
  return row;
}

export interface SeedTestCaseOptions {
  id?: string;
  problemId: string;
  input?: string;
  expectedOutput?: string;
  isVisible?: boolean;
  sortOrder?: number;
}

export async function seedTestCase(ctx: TestDb, opts: SeedTestCaseOptions) {
  const id = opts.id ?? nanoid();
  const row = {
    id,
    problemId: opts.problemId,
    input: opts.input ?? "1 2\n",
    expectedOutput: opts.expectedOutput ?? "3\n",
    isVisible: opts.isVisible ?? false,
    sortOrder: opts.sortOrder ?? 0,
  };
  await ctx.db.insert(testCases).values(row);
  return row;
}

export interface SeedSubmissionOptions {
  id?: string;
  userId: string;
  problemId: string;
  assignmentId?: string | null;
  language?: Language;
  sourceCode?: string;
  status?: SubmissionStatus;
}

export async function seedSubmission(ctx: TestDb, opts: SeedSubmissionOptions) {
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
  await ctx.db.insert(submissions).values(row);
  return row;
}

export interface SeedGroupOptions {
  id?: string;
  name?: string;
  description?: string | null;
  instructorId?: string | null;
}

export async function seedGroup(ctx: TestDb, opts: SeedGroupOptions = {}) {
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
  await ctx.db.insert(groups).values(row);
  return row;
}

export async function seedEnrollment(ctx: TestDb, opts: { userId: string; groupId: string }) {
  const id = nanoid();
  const row = {
    id,
    userId: opts.userId,
    groupId: opts.groupId,
    enrolledAt: new Date(),
  };
  await ctx.db.insert(enrollments).values(row);
  return row;
}

export interface SeedAssignmentOptions {
  id?: string;
  groupId: string;
  title?: string;
  description?: string | null;
  startsAt?: Date | null;
  deadline?: Date | null;
}

export async function seedAssignment(ctx: TestDb, opts: SeedAssignmentOptions) {
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
  await ctx.db.insert(assignments).values(row);
  return row;
}

export async function seedAssignmentProblem(
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
  await ctx.db.insert(assignmentProblems).values(row);
  return row;
}

export async function seedSubmissionResult(
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
  await ctx.db.insert(submissionResults).values(row);
  return row;
}

export async function seedSubmissionComment(
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
  await ctx.db.insert(submissionComments).values(row);
  return row;
}
