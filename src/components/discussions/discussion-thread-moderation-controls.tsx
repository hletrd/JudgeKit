"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type DiscussionThreadModerationControlsProps = {
  threadId: string;
  isLocked: boolean;
  isPinned: boolean;
  lockLabel: string;
  unlockLabel: string;
  pinLabel: string;
  unpinLabel: string;
  deleteLabel: string;
  deleteConfirmTitle: string;
  deleteConfirmDescription: string;
  cancelLabel: string;
  successLabel: string;
  deleteSuccessLabel: string;
  errorLabel: string;
  deleteErrorLabel: string;
};

export function DiscussionThreadModerationControls({
  threadId,
  isLocked: isLockedProp,
  isPinned: isPinnedProp,
  lockLabel,
  unlockLabel,
  pinLabel,
  unpinLabel,
  deleteLabel,
  deleteConfirmTitle,
  deleteConfirmDescription,
  cancelLabel,
  successLabel,
  deleteSuccessLabel,
  errorLabel,
  deleteErrorLabel,
}: DiscussionThreadModerationControlsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(isLockedProp);
  const [isPinned, setIsPinned] = useState(isPinnedProp);

  async function updateModeration(payload: { locked?: boolean; pinned?: boolean }) {
    // Optimistic update
    if (payload.pinned !== undefined) setIsPinned(payload.pinned);
    if (payload.locked !== undefined) setIsLocked(payload.locked);

    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/community/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        // Revert on failure
        if (payload.pinned !== undefined) setIsPinned(!payload.pinned);
        if (payload.locked !== undefined) setIsLocked(!payload.locked);
        const errorBody = await response.json().catch(() => ({}));
        console.error("Discussion moderation failed:", (errorBody as { error?: string }).error);
        throw new Error(errorLabel);
      }
      toast.success(successLabel);
      router.refresh();
    } catch (error) {
      console.error("Discussion moderation failed:", error);
      toast.error(errorLabel);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteThread() {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/community/threads/${threadId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error("Discussion thread deletion failed:", (errorBody as { error?: string }).error);
        throw new Error(deleteErrorLabel);
      }
      toast.success(deleteSuccessLabel);
      router.push("/community");
      router.refresh();
    } catch (error) {
      console.error("Discussion thread deletion failed:", error);
      toast.error(deleteErrorLabel);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/30 p-3">
      <Button type="button" variant="outline" size="sm" onClick={() => void updateModeration({ pinned: !isPinned })} disabled={isSubmitting}>
        {isPinned ? unpinLabel : pinLabel}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void updateModeration({ locked: !isLocked })} disabled={isSubmitting}>
        {isLocked ? unlockLabel : lockLabel}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={
          <Button type="button" variant="destructive" size="sm" disabled={isSubmitting}>
            {deleteLabel}
          </Button>
        } />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteThread()}>
              {deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
