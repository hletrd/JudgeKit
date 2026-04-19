import { computeContestRanking, type LeaderboardEntry } from "./contest-scoring";
import type { ScoringModel } from "@/types";

export type ParticipantAuditData = {
  entry: LeaderboardEntry;
  scoringModel: ScoringModel;
};

/**
 * Get audit data for a single participant.
 *
 * NOTE: This currently computes the full contest leaderboard via
 * `computeContestRanking` and then extracts the target user's entry.
 * The contest-scoring cache (15s fresh / 30s TTL) mitigates repeated
 * calls, but cold-cache performance is O(n) in the number of participants.
 * For very large contests, a dedicated single-user query would be more
 * efficient — see M2 in the cycle-21 review remediation plan.
 */
export async function getParticipantAuditData(
  assignmentId: string,
  userId: string
): Promise<ParticipantAuditData | null> {
  const { scoringModel, entries } = await computeContestRanking(assignmentId);
  const entry = entries.find((e) => e.userId === userId);
  if (!entry) return null;
  return { entry, scoringModel };
}
