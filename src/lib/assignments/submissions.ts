import { db } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  enrollments,
  problems,
  submissions,
  users,
} from "@/lib/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { SubmissionStatus, UserRole } from "@/types";

type AssignmentValidationError =
  | "invalidAssignmentId"
  | "assignmentNotFound"
  | "assignmentEnrollmentRequired"
  | "assignmentProblemMismatch";

type AssignmentAccessRecord = {
  id: string;
  groupId: string;
  instructorId: string | null;
};

type AssignmentValidationSuccess = {
  ok: true;
  assignment: {
    id: string;
    groupId: string;
    instructorId: string | null;
  };
};

type AssignmentValidationFailure = {
  ok: false;
  status: 400 | 403 | 404;
  error: AssignmentValidationError;
};

export type AssignmentSubmissionValidationResult =
  | AssignmentValidationSuccess
  | AssignmentValidationFailure;

export type AssignmentProblemStatusRow = {
  problemId: string;
  title: string;
  points: number;
  sortOrder: number;
  bestScore: number | null;
  attemptCount: number;
  latestSubmissionId: string | null;
  latestStatus: SubmissionStatus | null;
  latestSubmittedAt: Date | null;
};

export type AssignmentStudentStatusRow = {
  userId: string;
  username: string;
  name: string;
  className: string | null;
  bestTotalScore: number;
  attemptCount: number;
  latestSubmissionId: string | null;
  latestStatus: SubmissionStatus | null;
  latestSubmittedAt: Date | null;
  problems: AssignmentProblemStatusRow[];
};

export type AssignmentStatusRows = {
  assignment: {
    id: string;
    title: string;
    groupId: string;
    instructorId: string | null;
  };
  problems: Array<{
    problemId: string;
    title: string;
    points: number;
    sortOrder: number;
  }>;
  rows: AssignmentStudentStatusRow[];
};

function roundAssignmentScore(value: number) {
  return Math.round(value * 100) / 100;
}

function mapSubmissionPercentageToAssignmentPoints(score: number, points: number) {
  const normalizedPercentage = Math.min(Math.max(score, 0), 100);

  return roundAssignmentScore((normalizedPercentage / 100) * points);
}

function isAdminRole(role: UserRole) {
  return role === "super_admin" || role === "admin";
}

async function getAssignmentAccessRecord(
  assignmentId: string
): Promise<AssignmentAccessRecord | null> {
  const normalizedAssignmentId = assignmentId.trim();

  if (!normalizedAssignmentId) {
    return null;
  }

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, normalizedAssignmentId),
    columns: {
      id: true,
      groupId: true,
    },
    with: {
      group: {
        columns: {
          instructorId: true,
        },
      },
    },
  });

  if (!assignment) {
    return null;
  }

  return {
    id: assignment.id,
    groupId: assignment.groupId,
    instructorId: assignment.group?.instructorId ?? null,
  };
}

export async function validateAssignmentSubmission(
  assignmentId: string,
  problemId: string,
  userId: string,
  role: UserRole
): Promise<AssignmentSubmissionValidationResult> {
  const normalizedAssignmentId = assignmentId.trim();

  if (!normalizedAssignmentId) {
    return {
      ok: false,
      status: 400,
      error: "invalidAssignmentId",
    };
  }

  const assignment = await getAssignmentAccessRecord(normalizedAssignmentId);

  if (!assignment) {
    return {
      ok: false,
      status: 404,
      error: "assignmentNotFound",
    };
  }

  if (!isAdminRole(role)) {
    const enrollment = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.groupId, assignment.groupId), eq(enrollments.userId, userId)),
      columns: { id: true },
    });

    if (!enrollment) {
      return {
        ok: false,
        status: 403,
        error: "assignmentEnrollmentRequired",
      };
    }
  }

  const assignmentProblem = await db.query.assignmentProblems.findFirst({
    where: and(
      eq(assignmentProblems.assignmentId, normalizedAssignmentId),
      eq(assignmentProblems.problemId, problemId)
    ),
    columns: { id: true },
  });

  if (!assignmentProblem) {
    return {
      ok: false,
      status: 400,
      error: "assignmentProblemMismatch",
    };
  }

  return {
    ok: true,
    assignment: {
      id: assignment.id,
      groupId: assignment.groupId,
      instructorId: assignment.instructorId,
    },
  };
}

export async function canViewAssignmentSubmissions(
  assignmentId: string | null,
  userId: string,
  role: UserRole
): Promise<boolean> {
  if (!assignmentId) {
    return false;
  }

  if (!isAdminRole(role) && role !== "instructor") {
    return false;
  }

  const assignment = await getAssignmentAccessRecord(assignmentId);

  if (!assignment) {
    return false;
  }

  if (isAdminRole(role)) {
    return true;
  }

  return assignment.instructorId === userId;
}

export async function getAssignmentStatusRows(
  assignmentId: string
): Promise<AssignmentStatusRows | null> {
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: {
      id: true,
      title: true,
      groupId: true,
    },
    with: {
      group: {
        columns: {
          instructorId: true,
        },
      },
    },
  });

  if (!assignment) {
    return null;
  }

  const assignmentProblemRows = await db
    .select({
      problemId: assignmentProblems.problemId,
      title: problems.title,
      points: assignmentProblems.points,
      sortOrder: assignmentProblems.sortOrder,
    })
    .from(assignmentProblems)
    .innerJoin(problems, eq(problems.id, assignmentProblems.problemId))
    .where(eq(assignmentProblems.assignmentId, assignmentId))
    .orderBy(asc(assignmentProblems.sortOrder), asc(problems.title));

  const enrolledStudents = await db
    .select({
      userId: users.id,
      username: users.username,
      name: users.name,
      className: users.className,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(eq(enrollments.groupId, assignment.groupId))
    .orderBy(asc(users.name), asc(users.username));

  const assignmentSubmissions = await db
    .select({
      id: submissions.id,
      userId: submissions.userId,
      problemId: submissions.problemId,
      status: submissions.status,
      score: submissions.score,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .where(eq(submissions.assignmentId, assignmentId))
    .orderBy(desc(submissions.submittedAt), desc(submissions.id));

  const problemDefinitions = assignmentProblemRows.map((row) => ({
    problemId: row.problemId,
    title: row.title,
    points: row.points ?? 100,
    sortOrder: row.sortOrder ?? 0,
  }));

  const rows = enrolledStudents.map<AssignmentStudentStatusRow>((student) => ({
    userId: student.userId,
    username: student.username,
    name: student.name,
    className: student.className,
    bestTotalScore: 0,
    attemptCount: 0,
    latestSubmissionId: null,
    latestStatus: null,
    latestSubmittedAt: null,
    problems: problemDefinitions.map((problem) => ({
      ...problem,
      bestScore: null,
      attemptCount: 0,
      latestSubmissionId: null,
      latestStatus: null,
      latestSubmittedAt: null,
    })),
  }));

  const rowByUserId = new Map(rows.map((row) => [row.userId, row]));

  for (const submission of assignmentSubmissions) {
    const row = rowByUserId.get(submission.userId);

    if (!row) {
      continue;
    }

    const problem = row.problems.find((entry) => entry.problemId === submission.problemId);

    if (!problem) {
      continue;
    }

    row.attemptCount += 1;
    problem.attemptCount += 1;

    if (
      submission.submittedAt &&
      (!row.latestSubmittedAt || row.latestSubmittedAt < submission.submittedAt)
    ) {
      row.latestSubmittedAt = submission.submittedAt;
      row.latestSubmissionId = submission.id;
      row.latestStatus = submission.status as SubmissionStatus;
    }

    if (
      submission.submittedAt &&
      (!problem.latestSubmittedAt || problem.latestSubmittedAt < submission.submittedAt)
    ) {
      problem.latestSubmittedAt = submission.submittedAt;
      problem.latestSubmissionId = submission.id;
      problem.latestStatus = submission.status as SubmissionStatus;
    }

    if (typeof submission.score === "number") {
      const earnedPoints = mapSubmissionPercentageToAssignmentPoints(
        submission.score,
        problem.points
      );

      problem.bestScore =
        problem.bestScore === null
          ? earnedPoints
          : Math.max(problem.bestScore, earnedPoints);
    }
  }

  for (const row of rows) {
    row.bestTotalScore = row.problems.reduce(
      (total, problem) => total + (problem.bestScore ?? 0),
      0
    );
  }

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      groupId: assignment.groupId,
      instructorId: assignment.group?.instructorId ?? null,
    },
    problems: problemDefinitions,
    rows,
  };
}
