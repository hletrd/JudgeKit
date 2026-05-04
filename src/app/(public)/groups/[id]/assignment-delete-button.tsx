"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

type AssignmentDeleteButtonProps = {
  groupId: string;
  assignmentId: string;
  assignmentTitle: string;
  redirectTo?: string;
};

type AssignmentDeleteResponse = {
  error?: string;
  details?: {
    submissionCount?: number;
  };
};

export function AssignmentDeleteButton({
  groupId,
  assignmentId,
  assignmentTitle,
  redirectTo,
}: AssignmentDeleteButtonProps) {
  const router = useRouter();
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");

  async function handleDelete() {
    try {
      const response = await apiFetch(`/api/v1/groups/${groupId}/assignments/${assignmentId}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as AssignmentDeleteResponse;

      if (!response.ok) {
        if (response.status === 409 && payload.error === "assignmentDeleteBlocked") {
          toast.error(
            t("assignmentDeleteBlocked", {
              submissions: payload.details?.submissionCount ?? 0,
            })
          );
          return false;
        }

        toast.error(t(payload.error === "assignmentDeleteFailed" ? payload.error : "assignmentDeleteFailed"));
        return false;
      }

      toast.success(t("assignmentDeleteSuccess"));

      if (redirectTo) {
        router.push(redirectTo);
      }

      router.refresh();
      return true;
    } catch {
      toast.error(t("assignmentDeleteFailed"));
      return false;
    }
  }

  return (
    <DestructiveActionDialog
      triggerLabel={tCommon("delete")}
      title={t("assignmentDeleteDialogTitle")}
      description={t("assignmentDeleteDialogDescription", { title: assignmentTitle })}
      confirmLabel={tCommon("delete")}
      cancelLabel={tCommon("cancel")}
      onConfirmAction={handleDelete}
      triggerVariant="destructive"
      triggerSize="sm"
      triggerTestId={`assignment-delete-${assignmentId}`}
      confirmTestId={`assignment-delete-confirm-${assignmentId}`}
    />
  );
}
