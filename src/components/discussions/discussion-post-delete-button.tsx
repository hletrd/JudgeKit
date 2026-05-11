"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch, getApiError } from "@/lib/api/client";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

type DiscussionPostDeleteButtonProps = {
  postId: string;
  deleteLabel: string;
  deleteDescription: string;
  successLabel: string;
  errorLabel: string;
};

export function DiscussionPostDeleteButton({ postId, deleteLabel, deleteDescription, successLabel, errorLabel }: DiscussionPostDeleteButtonProps) {
  const router = useRouter();
  const tCommon = useTranslations("common");

  const handleDelete = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/v1/community/posts/${postId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        if (process.env.NODE_ENV === "development") {
          const errorBody = await response.json().catch(() => ({}));
          console.error("Discussion post deletion failed:", getApiError(errorBody));
        }
        toast.error(errorLabel);
        return false;
      }
      toast.success(successLabel);
      router.refresh();
      return true;
    } catch {
      toast.error(errorLabel);
      return false;
    }
  }, [postId, successLabel, errorLabel, router]);

  return (
    <DestructiveActionDialog
      triggerLabel={deleteLabel}
      title={deleteLabel}
      description={deleteDescription}
      confirmLabel={tCommon("delete")}
      cancelLabel={tCommon("cancel")}
      onConfirmAction={handleDelete}
      triggerVariant="ghost"
    />
  );
}
