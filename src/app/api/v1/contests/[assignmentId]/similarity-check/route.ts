import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { createApiHandler, isAdmin, isInstructor } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runAndStoreSimilarityCheck } from "@/lib/assignments/code-similarity";
import { getContestAssignment } from "@/lib/assignments/contests";

export const POST = createApiHandler({
  rateLimit: "similarity-check",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canManage =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!canManage) {
      return apiError("forbidden", 403);
    }

    let result;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      result = await runAndStoreSimilarityCheck(assignmentId, undefined, controller.signal);

      clearTimeout(timeoutId);
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.message.includes("timed out"))) {
        return apiSuccess({
          status: "timed_out",
          reason: "timeout",
          flaggedPairs: 0,
          submissionCount: null,
          maxSupportedSubmissions: null,
          pairs: [],
        });
      }
      throw error;
    }

    const pairs = result.pairs ?? [];

    // Enrich pairs with usernames
    const allUserIds = [...new Set(pairs.flatMap((p) => [p.userId1, p.userId2]))];
    const userMap = new Map<string, string>();
    if (allUserIds.length > 0) {
      const userRows = await db
        .select({ id: users.id, username: users.username, name: users.name })
        .from(users)
        .where(inArray(users.id, allUserIds));
      for (const u of userRows) {
        userMap.set(u.id, `${u.name} (${u.username})`);
      }
    }

    const enrichedPairs = pairs.map((p) => ({
      ...p,
      user1Name: userMap.get(p.userId1) ?? p.userId1,
      user2Name: userMap.get(p.userId2) ?? p.userId2,
      similarity: Math.round(p.similarity * 100),
    }));

    return apiSuccess({
      ...result,
      pairs: enrichedPairs,
    });
  },
});
