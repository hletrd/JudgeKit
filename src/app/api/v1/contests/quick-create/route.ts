import { NextRequest } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { groups, assignments, assignmentProblems, problems } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";

const quickCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  problemIds: z.array(z.string()).min(1).max(50),
  problemPoints: z.array(z.number().int().min(1)).optional(),
  enableAntiCheat: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  deadline: z.string().datetime().optional(),
}).refine(
  (data) => !data.problemPoints || data.problemPoints.length === data.problemIds.length,
  { message: "problemPoints length must match problemIds length", path: ["problemPoints"] }
);

export const POST = createApiHandler({
  auth: { capabilities: ["contests.create"] },
  schema: quickCreateSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const groupId = nanoid();
    const assignmentId = nanoid();
    // Use DB server time for scheduling defaults to avoid clock skew
    const now = await getDbNowUncached();
    const startsAt = body.startsAt ? new Date(body.startsAt) : now;
    // Defense-in-depth: reject Invalid Date construction even though the
    // Zod schema enforces .datetime() format. If the schema is ever
    // loosened or reused without the regex guard, NaN comparisons would
    // silently bypass the schedule check below.
    if (!Number.isFinite(startsAt.getTime())) {
      return apiError("invalidStartsAt", 400);
    }
    const deadline = body.deadline
      ? new Date(body.deadline)
      : new Date(now.getTime() + 30 * 24 * 3600000); // default 30 days
    if (!Number.isFinite(deadline.getTime())) {
      return apiError("invalidDeadline", 400);
    }

    if (startsAt.getTime() >= deadline.getTime()) {
      return apiError("assignmentScheduleInvalid", 400);
    }

    // Verify all problem IDs exist in the database
    const existingProblems = await db
      .select({ id: problems.id })
      .from(problems)
      .where(inArray(problems.id, body.problemIds));
    if (existingProblems.length !== body.problemIds.length) {
      return apiError("invalidProblemIds", 400);
    }

    await db.transaction(async (tx) => {
      // Auto-create a hidden group for this contest
      await tx.insert(groups).values({
        id: groupId,
        name: body.title,
        description: body.description ?? null,
        instructorId: user.id,
      });

      // Create windowed assignment
      await tx.insert(assignments).values({
        id: assignmentId,
        groupId,
        title: body.title,
        description: body.description ?? null,
        startsAt,
        deadline,
        examMode: "windowed",
        examDurationMinutes: body.durationMinutes,
        scoringModel: "ioi",
        enableAntiCheat: body.enableAntiCheat,
        showResultsToCandidate: false,
      });

      // Add problems
      const problemValues = body.problemIds.map((problemId, i) => ({
        id: nanoid(),
        assignmentId,
        problemId,
        sortOrder: i,
        points: body.problemPoints?.[i] ?? DEFAULT_PROBLEM_POINTS,
      }));
      if (problemValues.length > 0) {
        await tx.insert(assignmentProblems).values(problemValues);
      }
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "contest.quick_created",
      resourceType: "assignment",
      resourceId: assignmentId,
      resourceLabel: body.title,
      summary: `Quick-created recruiting contest "${body.title}"`,
      details: { groupId, durationMinutes: body.durationMinutes, problemCount: body.problemIds.length },
      request: req,
    });

    return apiSuccess({ assignmentId, groupId }, { status: 201 });
  },
});
