"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type DiscussionVoteButtonsProps = {
  targetType: "thread" | "post";
  targetId: string;
  score: number;
  currentUserVote: "up" | "down" | null;
  canVote: boolean;
  upvoteLabel: string;
  downvoteLabel: string;
};

export function DiscussionVoteButtons({
  targetType,
  targetId,
  score: initialScore,
  currentUserVote: initialCurrentUserVote,
  canVote,
  upvoteLabel,
  downvoteLabel,
}: DiscussionVoteButtonsProps) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [currentUserVote, setCurrentUserVote] = useState<"up" | "down" | null>(initialCurrentUserVote);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleVote(voteType: "up" | "down") {
    if (!canVote || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/v1/community/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, voteType }),
      });
      const payload = await response.json() as {
        data?: {
          score?: number;
          currentUserVote?: "up" | "down" | null;
        };
      };
      if (!response.ok) {
        return;
      }
      setScore(typeof payload.data?.score === "number" ? payload.data.score : score);
      setCurrentUserVote(payload.data?.currentUserVote ?? null);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground">
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
      <span className="min-w-6 text-center font-medium">{score}</span>
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
    </div>
  );
}
