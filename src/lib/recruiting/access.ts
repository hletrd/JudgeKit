import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import type { PlatformMode } from "@/types";
import { db } from "@/lib/db";
import { assignmentProblems, recruitingInvitations } from "@/lib/db/schema";
import { getResolvedPlatformMode } from "@/lib/system-settings";

export type RecruitingAccessContext = {
  assignmentIds: string[];
  problemIds: string[];
  isRecruitingCandidate: boolean;
  effectivePlatformMode: PlatformMode;
};

/**
 * Load the recruiting access context for a user.
 *
 * Wrapped with React `cache()` so that repeated calls within the same server
 * component render return the cached result without hitting the database again.
 * This eliminates the N+1 pattern where the dashboard layout AND individual page
 * components each call `getRecruitingAccessContext` for the same user.
 *
 * The cache is request-scoped (per React Server Component render) and does not
 * persist across requests, so stale data is not a concern.
 */
async function loadRecruitingAccessContext(
  userId: string
): Promise<RecruitingAccessContext> {
  const platformMode = await getResolvedPlatformMode();

  if (!userId) {
    return {
      assignmentIds: [],
      problemIds: [],
      isRecruitingCandidate: false,
      effectivePlatformMode: platformMode,
    };
  }

  const invitationRows = await db
    .select({ assignmentId: recruitingInvitations.assignmentId })
    .from(recruitingInvitations)
    .where(
      and(
        eq(recruitingInvitations.userId, userId),
        eq(recruitingInvitations.status, "redeemed")
      )
    );

  const assignmentIds = [...new Set(invitationRows.map((row) => row.assignmentId))];
  let problemIds: string[] = [];

  if (assignmentIds.length > 0) {
    const problemRows = await db
      .select({ problemId: assignmentProblems.problemId })
      .from(assignmentProblems)
      .where(inArray(assignmentProblems.assignmentId, assignmentIds));
    problemIds = [...new Set(problemRows.map((row) => row.problemId))];
  }

  const isRecruitingCandidate = assignmentIds.length > 0;

  return {
    assignmentIds,
    problemIds,
    isRecruitingCandidate,
    effectivePlatformMode:
      platformMode === "recruiting" || isRecruitingCandidate
        ? "recruiting"
        : platformMode,
  };
}

/**
 * Get the recruiting access context for a user, cached per-request.
 * Uses React `cache()` to deduplicate DB queries within a single server
 * component render. Call sites do not need any changes.
 */
export const getRecruitingAccessContext = cache(
  async function getRecruitingAccessContextInner(
    userId: string
  ): Promise<RecruitingAccessContext> {
    return loadRecruitingAccessContext(userId);
  }
);

export async function isRecruitingCandidateUser(userId: string): Promise<boolean> {
  return (await getRecruitingAccessContext(userId)).isRecruitingCandidate;
}
