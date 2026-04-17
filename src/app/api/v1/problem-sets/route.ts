import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/events";
import { createProblemSet } from "@/lib/problem-sets/management";
import {
  findInaccessibleProblemIdsForProblemSetUser,
  listVisibleProblemSetsForUser,
} from "@/lib/problem-sets/visibility";
import { problemSetMutationSchema } from "@/lib/validators/problem-sets";
import { createApiHandler, forbidden } from "@/lib/api/handler";

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
  handler: async (_req, { user }) => {
    const allSets = await listVisibleProblemSetsForUser(user.id, user.role, {});

    return apiSuccess(allSets);
  },
});

export const POST = createApiHandler({
  auth: { capabilities: ["problem_sets.create"] },
  rateLimit: "problem-sets:create",
  handler: async (req: NextRequest, { user }) => {
    const body = await req.json();
    const parsed = problemSetMutationSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "problemSetCreateFailed", 400);
    }

    const inaccessibleProblemIds = await findInaccessibleProblemIdsForProblemSetUser(
      parsed.data.problemIds,
      user.id,
      user.role
    );
    if (inaccessibleProblemIds.length > 0) return forbidden();

    const id = await createProblemSet(parsed.data, user.id);

    const created = await db.query.problemSets.findFirst({
      where: (ps, { eq }) => eq(ps.id, id),
      with: {
        problems: {
          with: {
            problem: {
              columns: { id: true, title: true },
            },
          },
        },
        groupAccess: true,
      },
    });

    if (created) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "problem_set.created",
        resourceType: "problem_set",
        resourceId: created.id,
        resourceLabel: created.name,
        summary: `Created problem set "${created.name}"`,
        details: {
          problemCount: created.problems.length,
        },
        request: req,
      });
    }

    return apiSuccess(created, { status: 201 });
  },
});
