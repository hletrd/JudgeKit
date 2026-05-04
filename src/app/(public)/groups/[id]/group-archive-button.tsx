"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

type GroupArchiveButtonProps = {
  groupId: string;
  groupName: string;
  isArchived: boolean;
};

export function GroupArchiveButton({ groupId, groupName, isArchived }: GroupArchiveButtonProps) {
  const router = useRouter();
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");

  async function handleToggle() {
    try {
      const response = await apiFetch(`/api/v1/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !isArchived }),
      });

      if (!response.ok) {
        toast.error(t(isArchived ? "unarchiveFailed" : "archiveFailed"));
        return false;
      }

      toast.success(t(isArchived ? "unarchiveSuccess" : "archiveSuccess"));
      router.refresh();
      return true;
    } catch {
      toast.error(t(isArchived ? "unarchiveFailed" : "archiveFailed"));
      return false;
    }
  }

  if (isArchived) {
    return (
      <DestructiveActionDialog
        triggerLabel={t("unarchive")}
        title={t("unarchiveConfirm")}
        description={t("unarchiveConfirmDescription", { name: groupName })}
        confirmLabel={t("unarchive")}
        cancelLabel={tCommon("cancel")}
        onConfirmAction={handleToggle}
        triggerVariant="outline"
        triggerSize="sm"
        triggerTestId={`group-unarchive-${groupId}`}
        confirmTestId={`group-unarchive-confirm-${groupId}`}
      />
    );
  }

  return (
    <DestructiveActionDialog
      triggerLabel={t("archive")}
      title={t("archiveConfirm")}
      description={t("archiveConfirmDescription", { name: groupName })}
      confirmLabel={t("archive")}
      cancelLabel={tCommon("cancel")}
      onConfirmAction={handleToggle}
      triggerVariant="outline"
      triggerSize="sm"
      triggerTestId={`group-archive-${groupId}`}
      confirmTestId={`group-archive-confirm-${groupId}`}
    />
  );
}
