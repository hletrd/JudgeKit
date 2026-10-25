import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { rawQueryOne } from "@/lib/db/queries";
import { canManageProblem } from "@/lib/auth/permissions";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  recomputeAllSignatureFlags,
  recomputeSignatureFlagsForAssignment,
  recomputeSignatureFlagsForProblem,
} from "@/lib/submissions/ai-signature-flags";

const recomputeSchema = z
  .object({
    problemId: z.string().min(1).max(64).optional(),
    assignmentId: z.string().min(1).max(64).optional(),
    all: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (value) => [value.problemId, value.assignmentId, value.all].filter((entry) => entry !== undefined).length === 1,
    { message: "exactlyOneScopeRequired" },
  );

/**
 * POST /api/v1/admin/submissions/signature-flags
 *
 * Re-compute the AI-use signature flags ({{signature: token}}, see
 * src/lib/problem-signatures.ts) of existing submissions. Exactly one scope:
 *
 * - `{ "problemId": "..." }` — the problem's submissions plus every
 *   submission of the contests that include it (problem managers);
 * - `{ "assignmentId": "..." }` — every submission of the assignment
 *   (group owner, co_instructor, groups.view_all);
 * - `{ "all": true }` — every submission that can carry a flag
 *   (groups.view_all only).
 *
 * Returns `{ scanned, flagged }`.
 */
export const POST = createApiHandler({
  rateLimit: "submissions:signature-flags",
  schema: recomputeSchema,
  handler: async (req: NextRequest, { user, body }) => {
    if (body.all) {
      const caps = await resolveCapabilities(user.role);
      if (!caps.has("groups.view_all")) return apiError("forbidden", 403);
    } else if (body.assignmentId) {
      const assignment = await rawQueryOne<{ groupId: string; instructorId: string | null }>(
        `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId"
         FROM assignments a INNER JOIN groups g ON g.id = a.group_id
         WHERE a.id = @assignmentId`,
        { assignmentId: body.assignmentId },
      );
      if (!assignment) return apiError("notFound", 404);
      const canManage = await canManageGroupResourcesAsync(
        assignment.instructorId,
        user.id,
        user.role,
        assignment.groupId,
      );
      if (!canManage) return apiError("forbidden", 403);
    } else if (body.problemId) {
      if (!(await canManageProblem(body.problemId, user.id, user.role))) {
        return apiError("forbidden", 403);
      }
    }

    const result = body.all
      ? await recomputeAllSignatureFlags()
      : body.assignmentId
        ? await recomputeSignatureFlagsForAssignment(body.assignmentId)
        : await recomputeSignatureFlagsForProblem(body.problemId as string);

    const scope = body.all ? "all" : body.assignmentId ? `assignment:${body.assignmentId}` : `problem:${body.problemId}`;
    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.signature_flags_recomputed",
      resourceType: "submission",
      resourceId: scope,
      resourceLabel: scope,
      summary: `Recomputed AI signature flags (${scope}): scanned ${result.scanned}, flagged ${result.flagged}`,
      details: { scope, ...result },
      request: req,
    });

    return apiSuccess(result);
  },
});
