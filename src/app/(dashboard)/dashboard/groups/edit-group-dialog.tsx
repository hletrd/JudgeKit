"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
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

type EditableGroup = {
  id: string;
  name: string;
  description: string | null;
};

export default function EditGroupDialog({ group }: { group: EditableGroup }) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");

  function resetState() {
    setName(group.name);
    setDescription(group.description ?? "");
  }

  function getErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return tCommon("error");
    }

    switch (error.message) {
      case "nameRequired":
        return t("nameRequired");
      case "nameTooLong":
        return t("nameTooLong");
      case "descriptionTooLong":
        return t("descriptionTooLong");
      case "updateError":
        return t("updateError");
      default:
        return error.message || tCommon("error");
    }
  }

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const response = await apiFetch(`/api/v1/groups/${group.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "updateError");
        }

        toast.success(t("updateSuccess"));
        await handleOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm">{tCommon("edit")}</Button>} />
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle")}</DialogTitle>
            <DialogDescription>{t("editDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`group-name-${group.id}`}>{t("nameLabel")}</Label>
            <Input
              id={`group-name-${group.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`group-description-${group.id}`}>{t("descriptionLabel")}</Label>
            <Textarea
              id={`group-description-${group.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[140px]"
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("loading") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
