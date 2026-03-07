import { auth } from "./index";
import { db } from "@/lib/db";
import { enrollments, problemGroupAccess, problems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { UserRole } from "@/types";

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

  if (role === "super_admin" || role === "admin") return session;

  const enrollment = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.userId, session.user.id),
      eq(enrollments.groupId, groupId)
    ),
  });

  if (!enrollment) throw new Error("Forbidden");
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

  const access = await db.query.problemGroupAccess.findFirst({
    where: and(eq(problemGroupAccess.problemId, problemId)),
  });

  return !!access && groupIds.includes(access.groupId);
}
