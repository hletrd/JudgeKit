import { auth } from "./index";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import { enrollments, groups, problemGroupAccess, problems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { UserRole } from "@/types";

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
  if (!roles.includes(session.user.role as UserRole)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function assertGroupAccess(groupId: string) {
  const session = await assertAuth();
  const role = session.user.role as UserRole;

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
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, problemId),
  });
  if (!problem) return false;
  if (problem.visibility === "public") return true;
  if (role === "super_admin" || role === "admin") return true;
  if (problem.authorId === userId) return true;

  const userEnrollments = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.userId, userId));
  const groupIds = userEnrollments.map((e) => e.groupId);

  if (groupIds.length === 0) return false;

  const accessRows = await db
    .select({ groupId: problemGroupAccess.groupId })
    .from(problemGroupAccess)
    .where(eq(problemGroupAccess.problemId, problemId));

  return accessRows.some((row) => groupIds.includes(row.groupId));
}

export async function canAccessSubmission(
  submission: { userId: string; assignmentId: string | null },
  userId: string,
  role: UserRole
): Promise<boolean> {
  if (role === "super_admin" || role === "admin") {
    return true;
  }

  if (submission.userId === userId) {
    return true;
  }

  return canViewAssignmentSubmissions(submission.assignmentId, userId, role);
}
