"use client";

import { useTransition } from "react";
import { toggleUserActive, deleteUserPermanently } from "@/lib/actions/user-management";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

export default function UserActions({
  userId,
  username,
  isActive,
  isSelf,
  userLevel,
  actorCanEdit,
  actorCanDelete,
  triggerVariant,
}: {
  userId: string;
  username: string;
  isActive: boolean;
  isSelf: boolean;
  userLevel?: number;
  actorCanEdit?: boolean;
  actorCanDelete?: boolean;
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) {
  const [isPending, startTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations("admin.users");

  async function handleToggle() {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          const result = await toggleUserActive(userId, !isActive);

          if (result.success) {
            toast.success(t(isActive ? "deactivatedAccessSuccess" : "restoredAccessSuccess"));
            router.refresh();
            resolve(true);
            return;
          }

          toast.error(t(result.error));
          resolve(false);
        } catch {
          toast.error(t("updateUserStatusFailed"));
          resolve(false);
        }
      });
    });
  }

  async function handlePermanentDelete() {
    return new Promise<boolean>((resolve) => {
      startDeleteTransition(async () => {
        try {
          const result = await deleteUserPermanently(userId, username);

          if (result.success) {
            toast.success(t("deleteSuccess"));
            router.refresh();
            resolve(true);
            return;
          }

          toast.error(t(result.error));
          resolve(false);
        } catch {
          toast.error(t("deleteFailed"));
          resolve(false);
        }
      });
    });
  }

  if (isSelf || (userLevel != null && userLevel >= 4) || (!actorCanEdit && !actorCanDelete)) return null;

  return (
    <div className="flex items-center gap-2">
      {actorCanEdit ? (
        <DestructiveActionDialog
          triggerLabel={t(isActive ? "deactivateAccess" : "restoreAccess")}
          title={t(isActive ? "deactivateDialogTitle" : "restoreDialogTitle")}
          description={t(isActive ? "deactivateDialogDescription" : "restoreDialogDescription", {
            username,
          })}
          confirmLabel={t(isActive ? "deactivateAccess" : "restoreAccess")}
          cancelLabel={t("cancelAction")}
          onConfirmAction={handleToggle}
          disabled={isPending}
          triggerVariant={triggerVariant ?? (isActive ? "destructive" : "outline")}
          triggerTestId={`user-access-toggle-${userId}`}
          confirmTestId={`user-access-toggle-confirm-${userId}`}
        />
      ) : null}
      {actorCanDelete ? (
        <DestructiveActionDialog
          triggerLabel={t("deleteUser")}
          title={t("deleteDialogTitle")}
          description={t("deleteDialogDescription", { username })}
          confirmLabel={t("deleteUser")}
          cancelLabel={t("cancelAction")}
          onConfirmAction={handlePermanentDelete}
          disabled={isDeletePending}
          triggerVariant="destructive"
          triggerTestId={`user-delete-${userId}`}
          confirmTestId={`user-delete-confirm-${userId}`}
        />
      ) : null}
    </div>
  );
}
