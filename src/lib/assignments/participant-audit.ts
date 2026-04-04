import { computeContestRanking, type LeaderboardEntry } from "./contest-scoring";
import type { ScoringModel } from "@/types";

export type ParticipantAuditData = {
  entry: LeaderboardEntry;
  scoringModel: ScoringModel;
};

export async function getParticipantAuditData(
  assignmentId: string,
  userId: string
): Promise<ParticipantAuditData | null> {
  const { scoringModel, entries } = await computeContestRanking(assignmentId);
  const entry = entries.find((e) => e.userId === userId);
  if (!entry) return null;
  return { entry, scoringModel };
}
