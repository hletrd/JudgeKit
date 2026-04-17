import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { problemSets } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  assignProblemSetToGroups,
  removeProblemSetFromGroup,
} from "@/lib/problem-sets/management";
import {
  canManageProblemSetForUser,
  findInaccessibleGroupIdsForProblemSetUser,
} from "@/lib/problem-sets/visibility";
import { problemSetGroupAssignSchema } from "@/lib/validators/problem-sets";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";

export const POST = createApiHandler({
  auth: { capabilities: ["problem_sets.assign_groups"] },
  rateLimit: "problem-sets:assign",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const existing = await db.query.problemSets.findFirst({
      where: eq(problemSets.id, id),
      columns: { id: true, name: true, createdBy: true },
      with: {
        groupAccess: {
          columns: { groupId: true },
        },
      },
    });

    if (!existing) return notFound("ProblemSet");
    if (
      !(await canManageProblemSetForUser(
        existing.createdBy,
        existing.groupAccess.map((groupAccess) => groupAccess.groupId),
        user.id,
        user.role
      ))
    ) {
      return forbidden();
    }

    const body = await req.json();
    const parsed = problemSetGroupAssignSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "problemSetAssignFailed", 400);
    }

    const inaccessibleGroupIds = await findInaccessibleGroupIdsForProblemSetUser(
      parsed.data.groupIds,
      user.id,
      user.role
    );
    if (inaccessibleGroupIds.length > 0) return forbidden();

    await assignProblemSetToGroups(id, parsed.data.groupIds);

    const updated = await db.query.problemSets.findFirst({
      where: eq(problemSets.id, id),
      with: {
        groupAccess: {
          with: {
            group: {
              columns: { id: true, name: true },
            },
          },
        },
      },
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "problem_set.groups_assigned",
      resourceType: "problem_set",
      resourceId: existing.id,
      resourceLabel: existing.name,
      summary: `Assigned problem set "${existing.name}" to ${parsed.data.groupIds.length} group(s)`,
      details: {
        groupIds: parsed.data.groupIds,
      },
      request: req,
    });

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  auth: { capabilities: ["problem_sets.assign_groups"] },
  rateLimit: "problem-sets:unassign",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const existing = await db.query.problemSets.findFirst({
      where: eq(problemSets.id, id),
      columns: { id: true, name: true, createdBy: true },
      with: {
        groupAccess: {
          columns: { groupId: true },
        },
      },
    });

    if (!existing) return notFound("ProblemSet");
    if (
      !(await canManageProblemSetForUser(
        existing.createdBy,
        existing.groupAccess.map((groupAccess) => groupAccess.groupId),
        user.id,
        user.role
      ))
    ) {
      return forbidden();
    }

    const body = await req.json();
    const groupId = body?.groupId;

    if (!groupId || typeof groupId !== "string") {
      return apiError("problemSetGroupRequired", 400);
    }

    const inaccessibleGroupIds = await findInaccessibleGroupIdsForProblemSetUser(
      [groupId],
      user.id,
      user.role
    );
    if (inaccessibleGroupIds.length > 0) return forbidden();

    await removeProblemSetFromGroup(id, groupId);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "problem_set.group_removed",
      resourceType: "problem_set",
      resourceId: existing.id,
      resourceLabel: existing.name,
      summary: `Removed group from problem set "${existing.name}"`,
      details: { groupId },
      request: req,
    });

    return apiSuccess({ id, groupId });
  },
});
