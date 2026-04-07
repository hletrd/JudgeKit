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

export async function getRecruitingAccessContext(
  userId: string
): Promise<RecruitingAccessContext> {
  return loadRecruitingAccessContext(userId);
}

export async function isRecruitingCandidateUser(userId: string): Promise<boolean> {
  return (await loadRecruitingAccessContext(userId)).isRecruitingCandidate;
}
