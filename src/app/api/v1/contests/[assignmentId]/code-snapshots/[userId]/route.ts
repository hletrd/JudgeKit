import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { codeSnapshots, problems } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";

export const GET = createApiHandler({
  auth: { capabilities: ["contests.view_analytics"] },
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId, userId } = params;
    const canView = await canViewAssignmentSubmissions(assignmentId, user.id, user.role);
    if (!canView) {
      return apiError("forbidden", 403);
    }

    const url = new URL(req.url);
    const problemId = url.searchParams.get("problemId");

    const conditions = [
      eq(codeSnapshots.userId, userId),
      eq(codeSnapshots.assignmentId, assignmentId),
    ];
    if (problemId) {
      conditions.push(eq(codeSnapshots.problemId, problemId));
    }

    const snapshots = await db
      .select({
        id: codeSnapshots.id,
        problemId: codeSnapshots.problemId,
        problemTitle: problems.title,
        language: codeSnapshots.language,
        sourceCode: codeSnapshots.sourceCode,
        charCount: codeSnapshots.charCount,
        createdAt: codeSnapshots.createdAt,
      })
      .from(codeSnapshots)
      .leftJoin(problems, eq(problems.id, codeSnapshots.problemId))
      .where(and(...conditions))
      .orderBy(asc(codeSnapshots.createdAt));

    return apiSuccess(snapshots);
  },
});
