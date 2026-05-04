"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";

export interface ScoreOverrideLabels {
  scoreOverride: string;
  overrideScore: string;
  overrideReason: string;
  automatedScore: string;
  saveOverride: string;
  removeOverride: string;
  overrideIndicator: string;
  overrideSaveSuccess: string;
  overrideSaveFailed: string;
  overrideRemoveSuccess: string;
  overrideRemoveFailed: string;
}

export interface ScoreOverrideDialogProps {
  groupId: string;
  assignmentId: string;
  problemId: string;
  userId: string;
  currentScore: number;
  maxPoints: number;
  isOverridden: boolean;
  labels: ScoreOverrideLabels;
}

export function ScoreOverrideDialog({
  groupId,
  assignmentId,
  problemId,
  userId,
  currentScore,
  maxPoints,
  isOverridden,
  labels,
}: ScoreOverrideDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [overrideScore, setOverrideScore] = useState(String(currentScore));
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOverrideScore(String(currentScore));
        setReason("");
      }
      setOpen(nextOpen);
    },
    [currentScore]
  );

  const handleSave = useCallback(() => {
    const scoreNum = Number(overrideScore);
    if (!Number.isFinite(scoreNum) || scoreNum < 0) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await apiFetch(
          `/api/v1/groups/${groupId}/assignments/${assignmentId}/overrides`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              problemId,
              userId,
              overrideScore: Math.round(scoreNum),
              reason: reason.trim() || undefined,
            }),
          }
        );

        if (!response.ok) {
          toast.error(labels.overrideSaveFailed);
          return;
        }

        toast.success(labels.overrideSaveSuccess);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error(labels.overrideSaveFailed);
      }
    });
  }, [overrideScore, reason, groupId, assignmentId, problemId, userId, labels, router]);

  const handleRemove = useCallback(() => {
    startTransition(async () => {
      try {
        const response = await apiFetch(
          `/api/v1/groups/${groupId}/assignments/${assignmentId}/overrides?problemId=${encodeURIComponent(problemId)}&userId=${encodeURIComponent(userId)}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          toast.error(labels.overrideRemoveFailed);
          return;
        }

        toast.success(labels.overrideRemoveSuccess);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error(labels.overrideRemoveFailed);
      }
    });
  }, [groupId, assignmentId, problemId, userId, labels, router]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title={labels.scoreOverride}
            aria-label={labels.scoreOverride}
          />
        }
      >
        <Pencil className="size-3" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.scoreOverride}</DialogTitle>
          <DialogDescription>
            {labels.automatedScore}: {currentScore}/{maxPoints}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="override-score">{labels.overrideScore}</Label>
            <Input
              id="override-score"
              type="number"
              min={0}
              value={overrideScore}
              onChange={(e) => setOverrideScore(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="override-reason">{labels.overrideReason}</Label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          {isOverridden && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={isPending}
            >
              {labels.removeOverride}
            </Button>
          )}
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {labels.saveOverride}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
