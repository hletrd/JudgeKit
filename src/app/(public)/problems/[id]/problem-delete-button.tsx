"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { DestructiveActionDialog } from "@/components/destructive-action-dialog";

type ProblemDeleteButtonProps = {
  problemId: string;
  problemTitle: string;
  isAdmin?: boolean;
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
};

type ProblemDeleteResponse = {
  error?: string;
  details?: {
    submissionCount?: number;
    assignmentLinkCount?: number;
  };
};

export function ProblemDeleteButton({
  problemId,
  problemTitle,
  isAdmin = false,
  triggerVariant = "destructive",
}: ProblemDeleteButtonProps) {
  const router = useRouter();
  const t = useTranslations("problems");
  const tCommon = useTranslations("common");
  const [forceMode, setForceMode] = useState(false);
  const [blockedDetails, setBlockedDetails] = useState<{ submissions: number; assignments: number } | null>(null);

  const handleDelete = useCallback(async () => {
    try {
      const url = forceMode
        ? `/api/v1/problems/${problemId}?force=true`
        : `/api/v1/problems/${problemId}`;

      const response = await apiFetch(url, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as ProblemDeleteResponse;

      if (!response.ok) {
        if (response.status === 409 && payload.error === "problemDeleteBlocked") {
          const submissions = payload.details?.submissionCount ?? 0;
          const assignments = payload.details?.assignmentLinkCount ?? 0;

          if (isAdmin) {
            setBlockedDetails({ submissions, assignments });
            setForceMode(true);
            return false;
          }

          toast.error(t("deleteBlocked", { submissions, assignments }));
          return false;
        }

        toast.error(t(payload.error === "problemDeleteFailed" ? payload.error : "problemDeleteFailed"));
        return false;
      }

      toast.success(t("deleteSuccess"));
      router.push("/problems");
      router.refresh();
      return true;
    } catch {
      toast.error(t("problemDeleteFailed"));
      return false;
    }
  }, [forceMode, problemId, isAdmin, t, router]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setForceMode(false);
      setBlockedDetails(null);
    }
  }, []);

  const description = forceMode && blockedDetails
    ? t("forceDeleteDescription", {
        title: problemTitle,
        submissions: blockedDetails.submissions,
        assignments: blockedDetails.assignments,
      })
    : t("deleteDialogDescription", { title: problemTitle });

  return (
    <DestructiveActionDialog
      triggerLabel={t("deleteProblem")}
      title={forceMode ? t("forceDeleteTitle") : t("deleteDialogTitle")}
      description={description}
      confirmLabel={forceMode ? t("forceDeleteConfirm") : tCommon("delete")}
      cancelLabel={tCommon("cancel")}
      onConfirmAction={handleDelete}
      onOpenChange={handleOpenChange}
      triggerVariant={triggerVariant}
      triggerTestId={`problem-delete-${problemId}`}
      confirmTestId={`problem-delete-confirm-${problemId}`}
    />
  );
}
