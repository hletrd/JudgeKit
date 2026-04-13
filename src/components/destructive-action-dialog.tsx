"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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

type DestructiveActionDialogProps = {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirmAction: () => Promise<boolean>;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  triggerSize?: "default" | "sm" | "lg" | "icon" | "icon-sm";
  triggerTestId?: string;
  confirmTestId?: string;
};

export function DestructiveActionDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirmAction,
  onOpenChange,
  disabled = false,
  triggerVariant = "destructive",
  triggerSize = "sm",
  triggerTestId,
  confirmTestId,
}: DestructiveActionDialogProps) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  async function handleConfirm() {
    setIsPending(true);

    try {
      const shouldClose = await onConfirmAction();

      if (shouldClose) {
        handleOpenChange(false);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant={triggerVariant}
            size={triggerSize}
            disabled={disabled}
            data-testid={triggerTestId}
          >
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
            data-testid={confirmTestId}
          >
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
          {isPending && <span className="sr-only" role="status" aria-live="polite">{tCommon("loading")}</span>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
