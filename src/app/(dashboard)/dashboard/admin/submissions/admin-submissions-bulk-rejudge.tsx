"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

export function AdminSubmissionsBulkRejudge({
  submissionIds,
}: {
  submissionIds: string[];
}) {
  const t = useTranslations("admin.submissions");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (submissionIds.length === 0) {
    return null;
  }

  async function handleBulkRejudge() {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          const response = await apiFetch("/api/v1/admin/submissions/rejudge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionIds }),
          });
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(payload.error || "bulkRejudgeFailed");
          }

          toast.success(t("bulkRejudgeSuccess", { count: payload.data?.rejudged ?? submissionIds.length }));
          router.refresh();
          resolve(true);
        } catch {
          toast.error(t("bulkRejudgeFailed"));
          resolve(false);
        }
      });
    });
  }

  return (
    <DestructiveActionDialog
      triggerLabel={t("bulkRejudge")}
      title={t("bulkRejudgeDialogTitle")}
      description={t("bulkRejudgeDialogDescription", { count: submissionIds.length })}
      confirmLabel={t("bulkRejudge")}
      cancelLabel={tCommon("cancel")}
      onConfirmAction={handleBulkRejudge}
      disabled={isPending}
      triggerVariant="outline"
      triggerSize="sm"
      triggerTestId="admin-submissions-bulk-rejudge"
      confirmTestId="admin-submissions-bulk-rejudge-confirm"
    />
  );
}
