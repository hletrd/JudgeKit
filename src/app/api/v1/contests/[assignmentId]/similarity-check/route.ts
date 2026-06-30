import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runAndStoreSimilarityCheck } from "@/lib/assignments/code-similarity";
import { getContestAssignment, canManageContest } from "@/lib/assignments/contests";
import { getAssignedTeachingGroupIds, isGroupTA } from "@/lib/assignments/management";
import { resolveCapabilities } from "@/lib/capabilities/cache";

async function canRunSimilarityCheck(
  user: { id: string; role: string },
  assignment: { groupId: string; instructorId: string | null },
) {
  if (await canManageContest(user, assignment)) return true;

  const caps = await resolveCapabilities(user.role);
  if (!caps.has("anti_cheat.run_similarity")) return false;
  if (await isGroupTA(assignment.groupId, user.id)) return true;

  const assignedGroupIds = await getAssignedTeachingGroupIds(user.id);
  return assignedGroupIds.includes(assignment.groupId);
}

export const POST = createApiHandler({
  rateLimit: "similarity-check",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canManage = await canRunSimilarityCheck(user, assignment);

    if (!canManage) {
      return apiError("forbidden", 403);
    }

    let result;
    const controller = new AbortController();
    // Cleared in `finally` (RPF cycle-5 AGG5-5): clearing inside the `try`
    // after the await leaked an armed timer whenever the check threw a
    // non-abort error.
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      result = await runAndStoreSimilarityCheck(assignmentId, undefined, controller.signal);
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
    } finally {
      clearTimeout(timeoutId);
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
