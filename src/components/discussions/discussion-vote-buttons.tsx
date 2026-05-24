"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type DiscussionVoteButtonsProps = {
  targetType: "thread" | "post";
  targetId: string;
  score: number;
  currentUserVote: "up" | "down" | null;
  canVote: boolean;
  /** When false the upvote button is hidden entirely (operator-disabled). */
  upvoteEnabled?: boolean;
  /** When false the downvote button is hidden entirely (operator-disabled). */
  downvoteEnabled?: boolean;
  upvoteLabel: string;
  downvoteLabel: string;
  voteFailedLabel: string;
};

export function DiscussionVoteButtons({
  targetType,
  targetId,
  score: initialScore,
  currentUserVote: initialCurrentUserVote,
  canVote,
  upvoteEnabled = true,
  downvoteEnabled = true,
  upvoteLabel,
  downvoteLabel,
  voteFailedLabel,
}: DiscussionVoteButtonsProps) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [currentUserVote, setCurrentUserVote] = useState<"up" | "down" | null>(initialCurrentUserVote);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleVote(voteType: "up" | "down") {
    if (!canVote || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { ok, data } = await apiFetchJson<{
        data?: {
          score?: number;
          currentUserVote?: "up" | "down" | null;
        };
      }>(
        "/api/v1/community/votes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType, targetId, voteType }),
        },
        { data: { score: undefined, currentUserVote: undefined } }
      );
      if (!ok) {
        toast.error(voteFailedLabel);
        return;
      }
      setScore(typeof data.data?.score === "number" ? data.data.score : score);
      setCurrentUserVote(data.data?.currentUserVote ?? null);
      router.refresh();
    } catch {
      toast.error(voteFailedLabel);
    } finally {
      setIsSubmitting(false);
    }
  }

  // When both directions are operator-disabled, render nothing — the score
  // would otherwise sit alone in an empty pill. Existing scores from past
  // votes stay visible if at least one direction is still on.
  if (!upvoteEnabled && !downvoteEnabled) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground">
      {upvoteEnabled ? (
        <Button
          type="button"
          variant={currentUserVote === "up" ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={!canVote || isSubmitting}
          onClick={() => void handleVote("up")}
        >
          ▲ {upvoteLabel}
        </Button>
      ) : null}
      <span className="min-w-6 text-center font-medium">{score}</span>
      {downvoteEnabled ? (
        <Button
          type="button"
          variant={currentUserVote === "down" ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={!canVote || isSubmitting}
          onClick={() => void handleVote("down")}
        >
          ▼ {downvoteLabel}
        </Button>
      ) : null}
    </div>
  );
}
