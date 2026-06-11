"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Timer } from "lucide-react";
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
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";

export interface ExamExtendDialogProps {
  groupId: string;
  assignmentId: string;
  userId: string;
  studentName: string;
  personalDeadline: string;
}

/**
 * Staff control to extend one participant's windowed-exam session
 * (RPF cycle-1 AGG-5): accommodations (extra-time entitlements) and incident
 * recovery (a network outage ate part of the window). Extension only — the
 * server never shrinks a deadline through this path, and every grant is
 * durably audited.
 */
export function ExamExtendDialog({
  groupId,
  assignmentId,
  userId,
  studentName,
  personalDeadline,
}: ExamExtendDialogProps) {
  const t = useTranslations("groups.assignmentDetail.examExtend");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("15");
  const [isPending, startTransition] = useTransition();

  const handleOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen) setMinutes("15");
    setOpen(nextOpen);
  }, []);

  const handleSave = useCallback(() => {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 600) {
      toast.error(t("invalidMinutes"));
      return;
    }

    startTransition(async () => {
      try {
        const response = await apiFetch(
          `/api/v1/groups/${groupId}/assignments/${assignmentId}/exam-sessions/${userId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extendMinutes: value }),
          }
        );

        if (!response.ok) {
          toast.error(t("failed"));
          return;
        }

        toast.success(t("success", { minutes: value, name: studentName }));
        setOpen(false);
        router.refresh();
      } catch {
        toast.error(t("failed"));
      }
    });
  }, [minutes, groupId, assignmentId, userId, studentName, t, router]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title={t("title")}
            aria-label={t("title")}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <Timer className="size-3" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", {
              name: studentName,
              deadline: new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(personalDeadline)),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="exam-extend-minutes">{t("minutesLabel")}</Label>
          <Input
            id="exam-extend-minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              // Proctors work this dialog under time pressure: Enter submits
              // (RPF cycle-2 AGG2-6) without reaching for the mouse.
              if (e.key === "Enter" && !isPending) {
                e.preventDefault();
                handleSave();
              }
            }}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
