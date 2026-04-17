import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { problemSets } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import { updateProblemSet, deleteProblemSet } from "@/lib/problem-sets/management";
import {
  canManageProblemSetForUser,
  findInaccessibleProblemIdsForProblemSetUser,
  getVisibleProblemSetByIdForUser,
} from "@/lib/problem-sets/visibility";
import { problemSetMutationSchema } from "@/lib/validators/problem-sets";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";

export const GET = createApiHandler({
  auth: {
    capabilities: [
      "problem_sets.create",
      "problem_sets.edit",
      "problem_sets.delete",
      "problem_sets.assign_groups",
    ],
    requireAllCapabilities: false,
  },
  handler: async (_req: NextRequest, { user, params }) => {
    const { id } = params;
    const ps = await getVisibleProblemSetByIdForUser(id, user.id, user.role);

    if (!ps) return notFound("ProblemSet");
    return apiSuccess(ps);
  },
});

export const PATCH = createApiHandler({
  auth: { capabilities: ["problem_sets.edit"] },
  rateLimit: "problem-sets:update",
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
    const parsed = problemSetMutationSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "problemSetUpdateFailed", 400);
    }

    const inaccessibleProblemIds = await findInaccessibleProblemIdsForProblemSetUser(
      parsed.data.problemIds,
      user.id,
      user.role
    );
    if (inaccessibleProblemIds.length > 0) return forbidden();

    await updateProblemSet(id, parsed.data);

    const updated = await db.query.problemSets.findFirst({
      where: eq(problemSets.id, id),
      with: {
        problems: {
          with: {
            problem: {
              columns: { id: true, title: true },
            },
          },
        },
        groupAccess: {
          with: {
            group: {
              columns: { id: true, name: true },
            },
          },
        },
      },
    });

    if (updated) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "problem_set.updated",
        resourceType: "problem_set",
        resourceId: updated.id,
        resourceLabel: updated.name,
        summary: `Updated problem set "${updated.name}"`,
        details: {
          problemCount: updated.problems.length,
        },
        request: req,
      });
    }

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  auth: { capabilities: ["problem_sets.delete"] },
  rateLimit: "problem-sets:delete",
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

    await deleteProblemSet(id);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "problem_set.deleted",
      resourceType: "problem_set",
      resourceId: existing.id,
      resourceLabel: existing.name,
      summary: `Deleted problem set "${existing.name}"`,
      request: req,
    });

    return apiSuccess({ id });
  },
});
