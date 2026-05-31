import { auth } from "./index";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import { enrollments, groupInstructors, groups, problemGroupAccess, problems } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { UserRole } from "@/types";
import { isUserRole } from "@/lib/security/constants";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { getAssignedTeachingGroupIds } from "@/lib/assignments/management";

export async function canAccessGroup(
  groupId: string,
  userId: string,
  role: string
): Promise<boolean> {
  // Check capability: groups.view_all bypasses enrollment check
  const caps = await resolveCapabilities(role);
  if (caps.has("groups.view_all")) {
    return true;
  }

  const recruitingAccess = await getRecruitingAccessContext(userId);
  if (recruitingAccess.isRecruitingCandidate) {
    const enrollment = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.userId, userId), eq(enrollments.groupId, groupId)),
    });
    return Boolean(enrollment);
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

  const instructionalRole = await db.query.groupInstructors.findFirst({
    where: and(eq(groupInstructors.userId, userId), eq(groupInstructors.groupId, groupId)),
    columns: { id: true },
  });

  if (instructionalRole) {
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

/**
 * Assert the user has a specific capability.
 */
export async function assertCapability(capability: string) {
  const session = await assertAuth();
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has(capability)) {
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
  role: string
): Promise<boolean> {
  const caps = await resolveCapabilities(role);
  // Org-wide admins (groups.view_all) can access any problem.
  if (caps.has("groups.view_all")) return true;
  const hasViewAll = caps.has("problems.view_all");

  if (!hasViewAll) {
    const recruitingAccess = await getRecruitingAccessContext(userId);
    if (recruitingAccess.isRecruitingCandidate) {
      return recruitingAccess.problemIds.includes(problemId);
    }
  }

  const problem = await db
    .select({ visibility: problems.visibility, authorId: problems.authorId })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!problem) return false;
  if (problem.visibility === "public") return true;
  if (problem.authorId === userId) return true;

  // Group-linked access. A problems.view_all holder is scoped to the groups
  // they TEACH (group_instructors / groups.instructorId); everyone else to the
  // groups they're ENROLLED in. This stops a teaching assistant who teaches one
  // class from reading private problems linked only to other groups.
  if (hasViewAll) {
    const teachingGroupIds = await getAssignedTeachingGroupIds(userId);
    if (teachingGroupIds.length === 0) return false;
    const accessRow = await db
      .select({ groupId: problemGroupAccess.groupId })
      .from(problemGroupAccess)
      .where(
        and(
          eq(problemGroupAccess.problemId, problemId),
          inArray(problemGroupAccess.groupId, teachingGroupIds)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
    return accessRow !== null;
  }

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
  role: string,
  problemList: Array<{ id: string; visibility: string; authorId: string | null }>
): Promise<Set<string>> {
  // Org-wide admins (groups.view_all) see every problem in the list.
  const caps = await resolveCapabilities(role);
  if (caps.has("groups.view_all")) {
    return new Set(problemList.map((p) => p.id));
  }
  const hasViewAll = caps.has("problems.view_all");

  if (!hasViewAll) {
    const recruitingAccess = await getRecruitingAccessContext(userId);
    if (recruitingAccess.isRecruitingCandidate) {
      const allowedProblemIds = new Set(recruitingAccess.problemIds);
      return new Set(problemList.map((p) => p.id).filter((id) => allowedProblemIds.has(id)));
    }
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

  // The set of groups whose linked problems this actor may see. A
  // problems.view_all holder (non-admin) is scoped to the groups they TEACH;
  // everyone else to the groups they're ENROLLED in.
  const groupIds = hasViewAll
    ? await getAssignedTeachingGroupIds(userId)
    : (
        await db
          .select({ groupId: enrollments.groupId })
          .from(enrollments)
          .where(eq(enrollments.userId, userId))
      ).map((e) => e.groupId);

  if (groupIds.length === 0) {
    return accessible;
  }

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
  role: string
): Promise<boolean> {
  // Check capability: submissions.view_all bypasses ownership
  const caps = await resolveCapabilities(role);
  if (caps.has("submissions.view_all")) {
    return true;
  }

  // Design decision: students retain access to their own submission history
  // even after being removed from a group. This is intentional — students
  // should always be able to review their own past work.
  // See: docs/plan/security-v2-plan.md SEC2-M7
  if (submission.userId === userId) {
    return true;
  }

  // SECURITY NOTE (Plan 006): When assignmentId is null (non-assignment
  // submissions), canViewAssignmentSubmissions returns false. This means
  // only the submission owner, admins, and users with submissions.view_all
  // can access non-assignment submissions. This is correct — without an
  // assignment there is no instructor relationship to check. The route
  // handler at src/app/api/v1/submissions/[id]/route.ts calls this function
  // before returning any submission data, so there is no IDOR gap.
  // Instructors: scoped to their own groups via canViewAssignmentSubmissions
  return canViewAssignmentSubmissions(submission.assignmentId, userId, role);
}
