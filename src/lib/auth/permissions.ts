import { auth } from "./index";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import { enrollments, groups, problemGroupAccess, problems } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { UserRole } from "@/types";
import { isUserRole } from "@/lib/security/constants";

export async function canAccessGroup(
  groupId: string,
  userId: string,
  role: UserRole
): Promise<boolean> {
  if (role === "super_admin" || role === "admin") {
    return true;
  }

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    columns: {
      instructorId: true,
    },
  });

  if (!group) {
    return false;
  }

  if (group.instructorId === userId) {
    return true;
  }

  const enrollment = await db.query.enrollments.findFirst({
    where: and(eq(enrollments.userId, userId), eq(enrollments.groupId, groupId)),
  });

  return Boolean(enrollment);
}

export async function getSession() {
  const session = await auth();
  if (!session?.user) return null;
  return session;
}

export async function assertAuth() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function assertRole(...roles: UserRole[]) {
  const session = await assertAuth();
  if (!isUserRole(session.user.role) || !roles.includes(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function assertGroupAccess(groupId: string) {
  const session = await assertAuth();
  if (!isUserRole(session.user.role)) {
    throw new Error("Forbidden");
  }
  const role = session.user.role;

  if (!(await canAccessGroup(groupId, session.user.id, role))) {
    throw new Error("Forbidden");
  }

  return session;
}

export async function canAccessProblem(
  problemId: string,
  userId: string,
  role: UserRole
): Promise<boolean> {
  const problem = await db
    .select({ visibility: problems.visibility, authorId: problems.authorId })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!problem) return false;
  if (problem.visibility === "public") return true;
  if (role === "super_admin" || role === "admin") return true;
  if (problem.authorId === userId) return true;

  const accessRow = await db
    .select({ groupId: problemGroupAccess.groupId })
    .from(problemGroupAccess)
    .innerJoin(enrollments, eq(enrollments.groupId, problemGroupAccess.groupId))
    .where(
      and(
        eq(problemGroupAccess.problemId, problemId),
        eq(enrollments.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return accessRow !== null;
}

export async function getAccessibleProblemIds(
  userId: string,
  role: UserRole,
  problemList: Array<{ id: string; visibility: string; authorId: string | null }>
): Promise<Set<string>> {
  if (role === "super_admin" || role === "admin") {
    return new Set(problemList.map((p) => p.id));
  }

  // Public problems and authored problems are always accessible
  const accessible = new Set<string>();
  const needsGroupCheck: string[] = [];

  for (const problem of problemList) {
    if (problem.visibility === "public") {
      accessible.add(problem.id);
    } else if (problem.authorId === userId) {
      accessible.add(problem.id);
    } else {
      needsGroupCheck.push(problem.id);
    }
  }

  if (needsGroupCheck.length === 0) {
    return accessible;
  }

  // Fetch user enrollments once
  const userEnrollments = await db
    .select({ groupId: enrollments.groupId })
    .from(enrollments)
    .where(eq(enrollments.userId, userId));

  if (userEnrollments.length === 0) {
    return accessible;
  }

  const groupIds = userEnrollments.map((e) => e.groupId);

  // Fetch all problemGroupAccess rows for the non-public problems in one query
  const accessRows = await db
    .select({
      problemId: problemGroupAccess.problemId,
      groupId: problemGroupAccess.groupId,
    })
    .from(problemGroupAccess)
    .where(inArray(problemGroupAccess.problemId, needsGroupCheck));

  const groupIdSet = new Set(groupIds);
  for (const row of accessRows) {
    if (groupIdSet.has(row.groupId)) {
      accessible.add(row.problemId);
    }
  }

  return accessible;
}

export async function canAccessSubmission(
  submission: { userId: string; assignmentId: string | null },
  userId: string,
  role: UserRole
): Promise<boolean> {
  if (role === "super_admin" || role === "admin") {
    return true;
  }

  // Design decision: students retain access to their own submission history
  // even after being removed from a group. This is intentional — students
  // should always be able to review their own past work.
  // See: docs/plan/security-v2-plan.md SEC2-M7
  if (submission.userId === userId) {
    return true;
  }

  return canViewAssignmentSubmissions(submission.assignmentId, userId, role);
}
