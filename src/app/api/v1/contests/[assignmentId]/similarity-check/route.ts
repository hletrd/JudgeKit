import { NextRequest } from "next/server";
import { createApiHandler, isAdmin, isInstructor } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { runAndStoreSimilarityCheck } from "@/lib/assignments/code-similarity";
import { getContestAssignment } from "@/lib/assignments/contests";

export const POST = createApiHandler({
  rateLimit: "similarity-check",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canManage =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!canManage) {
      return apiError("forbidden", 403);
    }

    let flaggedCount: number;
    try {
      flaggedCount = await Promise.race([
        new Promise<number>((resolve) => {
          resolve(runAndStoreSimilarityCheck(assignmentId));
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Similarity check timed out")), 30_000)
        ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("timed out")) {
        return apiError("similarityCheckTimeout", 504);
      }
      throw error;
    }

    return apiSuccess({ flaggedPairs: flaggedCount });
  },
});
